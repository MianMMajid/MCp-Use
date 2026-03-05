import { handleFakeRequest } from './handlers.js'
import { createFakeState } from './state.js'
import { createFakeEventSource, isFakeSsePath, FakeEventSource } from './sse.js'

const STORAGE_ENABLED_KEY = 'maple_fake_mode_enabled'
const STORAGE_SEED_KEY = 'maple_fake_mode_seed'
const STORAGE_MUTATIONS_KEY = 'maple_fake_mode_mutations_v1'
const CHANGE_EVENT = 'maple:fake-mode-changed'
const RUNTIME_KEY = '__mapleFakeModeRuntime__'

function randomSeed() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function normalizePathname(pathname) {
  if (!pathname) return '/'
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1)
  return pathname
}

function hasFakeSessionCookie() {
  if (typeof document === 'undefined') return false
  return document.cookie
    .split(';')
    .map((part) => part.trim())
    .some((part) => part.startsWith('maple_session='))
}

function readSeed() {
  if (typeof window === 'undefined') return randomSeed()
  return window.localStorage.getItem(STORAGE_SEED_KEY) || randomSeed()
}

function setEnabledStorage(enabled) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_ENABLED_KEY, enabled ? '1' : '0')
}

function setSeedStorage(seed) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_SEED_KEY, seed)
}

function readMutationSnapshot() {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(STORAGE_MUTATIONS_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

function persistMutationSnapshot(state, seed) {
  if (typeof window === 'undefined' || !state) return
  const snapshot = {
    seed,
    rules: Array.isArray(state.firewall?.rules) ? state.firewall.rules : [],
    users: Array.isArray(state.ui?.users) ? state.ui.users : [],
    dispatchEvents: Array.isArray(state.ui?.dispatchEvents) ? state.ui.dispatchEvents : [],
    leakageUploads: Array.isArray(state.ui?.leakageUploads) ? state.ui.leakageUploads : [],
    updatedAt: new Date().toISOString(),
  }
  window.localStorage.setItem(STORAGE_MUTATIONS_KEY, JSON.stringify(snapshot))
}

function applyMutationSnapshot(state, snapshot) {
  if (!state || !snapshot || typeof snapshot !== 'object') return
  if (!state.ui || typeof state.ui !== 'object') {
    state.ui = {
      users: [],
      dispatchEvents: [],
      leakageUploads: [],
    }
  }
  if (Array.isArray(snapshot.rules)) {
    state.firewall.rules = snapshot.rules
  }
  if (Array.isArray(snapshot.users)) {
    state.ui.users = snapshot.users
  }
  if (Array.isArray(snapshot.dispatchEvents)) {
    state.ui.dispatchEvents = snapshot.dispatchEvents
  }
  if (Array.isArray(snapshot.leakageUploads)) {
    state.ui.leakageUploads = snapshot.leakageUploads
  }
}

function emitChange(runtime) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent(CHANGE_EVENT, {
      detail: {
        enabled: runtime.enabled,
        seed: runtime.seed,
      },
    }),
  )
}

function shouldHandlePath(pathname) {
  const path = normalizePathname(pathname)
  return path.startsWith('/api/') || path.startsWith('/admin/api/')
}

function toUrl(input) {
  if (typeof window === 'undefined') return null

  if (typeof input === 'string') {
    return new URL(input, window.location.origin)
  }

  if (input instanceof URL) {
    return input
  }

  if (input instanceof Request) {
    return new URL(input.url)
  }

  return null
}

function isRelativeInput(input) {
  return typeof input === 'string' && input.startsWith('/')
}

function parseMethod(input, init) {
  if (init?.method) return String(init.method).toUpperCase()
  if (input instanceof Request && input.method) return String(input.method).toUpperCase()
  return 'GET'
}

async function readBody(input, init, method) {
  if (method === 'GET' || method === 'HEAD') return null

    if (init && Object.prototype.hasOwnProperty.call(init, 'body')) {
      const body = init.body
      if (typeof body === 'string') return body
      if (body == null) return null
      if (typeof FormData !== 'undefined' && body instanceof FormData) {
        const form = {}
        for (const [key, value] of body.entries()) {
          if (Object.prototype.hasOwnProperty.call(form, key)) {
            const prev = form[key]
            if (Array.isArray(prev)) {
              prev.push(value)
              form[key] = prev
            } else {
              form[key] = [prev, value]
            }
          } else {
            form[key] = value
          }
        }
        return form
      }
      return body
  }

  if (input instanceof Request) {
    try {
      return await input.clone().text()
    } catch {
      return null
    }
  }

  return null
}

function ensureState(runtime, { forceRegenerate = false, seed } = {}) {
  const nextSeed = seed || runtime.seed || readSeed()
  if (!runtime.state || forceRegenerate || runtime.seed !== nextSeed) {
    runtime.seed = nextSeed
    runtime.state = createFakeState(nextSeed)
    applyMutationSnapshot(runtime.state, readMutationSnapshot())
  }
  runtime.state.sessionActive = hasFakeSessionCookie()
  return runtime.state
}

function patchFetch(runtime) {
  if (runtime.fetchPatched) return

  runtime.originalFetch = window.fetch.bind(window)

  window.fetch = async function mapleFakeFetch(input, init) {
    if (!runtime.enabled) {
      return runtime.originalFetch(input, init)
    }

    const url = toUrl(input)
    if (!url) {
      return runtime.originalFetch(input, init)
    }

    const pathname = normalizePathname(url.pathname)

    const isRelativeApi =
      (isRelativeInput(input) || (input instanceof Request && url.origin === window.location.origin)) &&
      shouldHandlePath(pathname)

    if (!isRelativeApi) {
      return runtime.originalFetch(input, init)
    }

    const method = parseMethod(input, init)
    const body = await readBody(input, init, method)
    const state = ensureState(runtime)

    const response = await handleFakeRequest({
      method,
      pathname,
      searchParams: new URLSearchParams(url.search),
      body,
      state,
    })

    if (method !== 'GET' && method !== 'HEAD') {
      persistMutationSnapshot(state, runtime.seed)
    }

    return response
  }

  runtime.fetchPatched = true
}

function patchEventSource(runtime) {
  if (runtime.eventSourcePatched) return

  const OriginalEventSource = window.EventSource
  runtime.originalEventSource = OriginalEventSource

  function MapleFakeAwareEventSource(url, options) {
    const resolved = toUrl(url)
    const pathname = normalizePathname(resolved?.pathname || '')

    const shouldIntercept =
      runtime.enabled &&
      isRelativeInput(url) &&
      shouldHandlePath(pathname) &&
      isFakeSsePath(pathname)

    if (shouldIntercept) {
      const state = ensureState(runtime)
      const fake = createFakeEventSource({
        url: resolved.toString(),
        pathname,
        state,
      })
      if (options?.withCredentials) {
        fake.withCredentials = true
      }
      return fake
    }

    return new OriginalEventSource(url, options)
  }

  MapleFakeAwareEventSource.CONNECTING = FakeEventSource.CONNECTING
  MapleFakeAwareEventSource.OPEN = FakeEventSource.OPEN
  MapleFakeAwareEventSource.CLOSED = FakeEventSource.CLOSED
  MapleFakeAwareEventSource.prototype = OriginalEventSource?.prototype || {}

  window.EventSource = MapleFakeAwareEventSource
  runtime.eventSourcePatched = true
}

function setRuntimeState(runtime, enabled, { seed, forceRegenerate = false } = {}) {
  runtime.enabled = Boolean(enabled)

  if (runtime.enabled) {
    const nextSeed = seed || runtime.seed || readSeed()
    setSeedStorage(nextSeed)
    ensureState(runtime, { forceRegenerate, seed: nextSeed })
  }

  setEnabledStorage(runtime.enabled)
  emitChange(runtime)
}

function ensureRuntime() {
  if (typeof window === 'undefined') {
    return {
      enableFakeMode() {},
      disableFakeMode() {},
      regenerateFakeData() {},
      isFakeModeEnabled() {
        return false
      },
    }
  }

  if (window[RUNTIME_KEY]) {
    return window[RUNTIME_KEY]
  }

  const runtime = {
    enabled: false,
    seed: null,
    state: null,
    initialized: false,
    fetchPatched: false,
    eventSourcePatched: false,
    originalFetch: null,
    originalEventSource: null,

    enableFakeMode(seed) {
      setRuntimeState(runtime, true, { seed })
    },

    disableFakeMode() {
      setRuntimeState(runtime, false)
    },

    regenerateFakeData() {
      const seed = randomSeed()
      setRuntimeState(runtime, true, { seed, forceRegenerate: true })
    },

    resetFakeMutations() {
      if (typeof window === 'undefined') return
      window.localStorage.removeItem(STORAGE_MUTATIONS_KEY)
      if (runtime.enabled) {
        ensureState(runtime, { forceRegenerate: true, seed: runtime.seed || readSeed() })
      }
    },

    isFakeModeEnabled() {
      return runtime.enabled
    },
  }

  patchFetch(runtime)
  patchEventSource(runtime)

  window[RUNTIME_KEY] = runtime
  return runtime
}

export function initializeFakeModeRuntime() {
  const runtime = ensureRuntime()

  if (typeof window === 'undefined') return runtime
  if (runtime.initialized) return runtime

  runtime.seed = readSeed()
  runtime.enabled = window.localStorage.getItem(STORAGE_ENABLED_KEY) === '1'

  if (runtime.enabled) {
    ensureState(runtime, { seed: runtime.seed, forceRegenerate: true })
  }

  runtime.initialized = true
  emitChange(runtime)

  return runtime
}

export function enableFakeMode(seed) {
  const runtime = initializeFakeModeRuntime()
  runtime.enableFakeMode(seed)
}

export function disableFakeMode() {
  const runtime = initializeFakeModeRuntime()
  runtime.disableFakeMode()
}

export function regenerateFakeData() {
  const runtime = initializeFakeModeRuntime()
  runtime.regenerateFakeData()
}

export function isFakeModeEnabled() {
  const runtime = initializeFakeModeRuntime()
  return runtime.isFakeModeEnabled()
}

export function resetFakeMutations() {
  const runtime = initializeFakeModeRuntime()
  runtime.resetFakeMutations()
}

export const fakeModeRuntime = {
  enableFakeMode,
  disableFakeMode,
  regenerateFakeData,
  resetFakeMutations,
  isFakeModeEnabled,
}

export { STORAGE_ENABLED_KEY, STORAGE_SEED_KEY, STORAGE_MUTATIONS_KEY, CHANGE_EVENT }
