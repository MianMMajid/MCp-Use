import { formatUserMessage } from '$lib/error-utils.js'

const DEFAULT_TIMEOUT_MS = 15_000
const MAX_RETRIES = 2
const RETRY_BASE_MS = 500
const RETRY_CAP_MS = 5_000

// ── Toast integration ──
// Lazy-imported to avoid circular deps during SSR
let _toastStore = null
function getToastStore() {
  if (!_toastStore) {
    try {
      // Dynamic import resolved at build time by bundler
      _toastStore = import('$lib/stores/toast-store.js').then((m) => m.toastStore)
    } catch { _toastStore = null }
  }
  return _toastStore
}

async function notifyError(err) {
  try {
    const store = await getToastStore()
    store?.error(formatUserMessage(err))
  } catch {}
}

// ── Circuit breaker ──
const _circuitState = {
  failures: 0,
  openUntil: 0,
  halfOpen: false,
}
const CIRCUIT_FAILURE_THRESHOLD = 5
const CIRCUIT_OPEN_DURATION_MS = 30_000

function checkCircuit() {
  const now = Date.now()
  if (_circuitState.openUntil > now) {
    if (!_circuitState.halfOpen) {
      // Allow one probe request in half-open state
      _circuitState.halfOpen = true
      return
    }
    throw new Error('Service temporarily unavailable. Please try again shortly.')
  }
  // Circuit is closed or open period expired
  if (_circuitState.openUntil > 0 && _circuitState.openUntil <= now) {
    // Transition to half-open: allow the request through as a probe
    _circuitState.halfOpen = true
  }
}

function recordSuccess() {
  _circuitState.failures = 0
  _circuitState.openUntil = 0
  _circuitState.halfOpen = false
}

function recordFailure() {
  _circuitState.failures += 1
  _circuitState.halfOpen = false
  if (_circuitState.failures >= CIRCUIT_FAILURE_THRESHOLD) {
    _circuitState.openUntil = Date.now() + CIRCUIT_OPEN_DURATION_MS
  }
}

// ── Core fetch ──

function fetchWithTimeout(path, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(path, { ...options, signal: controller.signal })
    .then((res) => { clearTimeout(id); return res })
    .catch((err) => {
      clearTimeout(id)
      if (err.name === 'AbortError') throw new Error(`Request timed out: ${path}`)
      throw err
    })
}

function isRetryable(err) {
  if (err.name === 'AbortError') return false
  const msg = err.message || ''
  // Don't retry client errors (4xx) except 429
  if (msg.includes('-> 4') && !msg.includes('-> 429')) return false
  return true
}

async function withRetry(fn, retries = MAX_RETRIES) {
  let lastErr
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (attempt >= retries || !isRetryable(err)) throw err
      // Full jitter: random delay between 0 and exponential cap
      const maxDelay = Math.min(RETRY_CAP_MS, RETRY_BASE_MS * 2 ** attempt)
      await new Promise((r) => setTimeout(r, Math.random() * maxDelay))
    }
  }
  throw lastErr
}

// ── Cache ──

const _cache = new Map()
const FRESH_MS   = 30_000
const STALE_MS   = 5 * 60_000
const MAX_ENTRIES = 200

function _evict() {
  if (_cache.size <= MAX_ENTRIES) return
  _cache.delete(_cache.keys().next().value)
}

function safeJson(res, path) {
  try {
    return res.json()
  } catch {
    throw new Error(`${path} -> ${res.status}: response is not valid JSON`)
  }
}

function attachResponseMeta(data, res) {
  if (data && typeof data === 'object') {
    if (!Object.prototype.hasOwnProperty.call(data, 'ok')) {
      Object.defineProperty(data, 'ok', { value: res.ok, enumerable: false, configurable: true })
    }
    Object.defineProperty(data, 'status', { value: res.status, enumerable: false, configurable: true })
    Object.defineProperty(data, 'json', { value: async () => data, enumerable: false, configurable: true })
    return data
  }
  return {
    value: data,
    ok: res.ok,
    status: res.status,
    json: async () => data,
  }
}

async function _fetchAndCache(path) {
  checkCircuit()
  try {
    const res = await fetchWithTimeout(path, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`${path} -> ${res.status}`)
    const data = await safeJson(res, path)
    _cache.set(path, { data, ts: Date.now() })
    _evict()
    recordSuccess()
    return data
  } catch (err) {
    recordFailure()
    throw err
  }
}

/**
 * Load JSON with stale-while-revalidate caching and retry with exponential backoff.
 * @param {string} path
 * @param {{ silent?: boolean }} [options]
 */
export async function loadJson(path, { silent = false } = {}) {
  const entry = _cache.get(path)
  const now = Date.now()
  if (entry) {
    const age = now - entry.ts
    if (age < FRESH_MS) return entry.data
    if (age < STALE_MS) {
      if (!entry.promise) {
        entry.promise = withRetry(() => _fetchAndCache(path))
          .catch(() => {})
          .finally(() => { const e = _cache.get(path); if (e) e.promise = null })
      }
      return entry.data
    }
  }
  try {
    return await withRetry(() => _fetchAndCache(path))
  } catch (err) {
    if (!silent) notifyError(err)
    throw err
  }
}

export function getCached(path) {
  const entry = _cache.get(path)
  if (!entry) return null
  const age = Date.now() - entry.ts
  if (age < STALE_MS) return entry.data
  return null
}

export function invalidateCache(pathOrPrefix) {
  if (!pathOrPrefix) { _cache.clear(); return }
  for (const key of _cache.keys()) {
    if (key === pathOrPrefix || key.startsWith(pathOrPrefix)) _cache.delete(key)
  }
}

const LONG_TIMEOUT_PATTERNS = ['/run', '/execute', '/smoke-test', '/simulate']

function timeoutForPath(path) {
  if (LONG_TIMEOUT_PATTERNS.some((p) => path.includes(p))) return 120_000
  return DEFAULT_TIMEOUT_MS
}

/**
 * POST JSON with circuit breaker. Not retried by default.
 */
export async function postJson(path, body, { silent = false } = {}) {
  checkCircuit()
  try {
    const res = await fetchWithTimeout(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, timeoutForPath(path))
    if (!res.ok) throw new Error(`${path} -> ${res.status}`)
    recordSuccess()
    return attachResponseMeta(await safeJson(res, path), res)
  } catch (err) {
    recordFailure()
    if (!silent) notifyError(err)
    throw err
  }
}

export async function patchJson(path, body, { silent = false } = {}) {
  checkCircuit()
  try {
    const res = await fetchWithTimeout(path, {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`${path} -> ${res.status}`)
    recordSuccess()
    return attachResponseMeta(await safeJson(res, path), res)
  } catch (err) {
    recordFailure()
    if (!silent) notifyError(err)
    throw err
  }
}

export async function postForm(path, formData, { silent = false } = {}) {
  checkCircuit()
  try {
    const res = await fetchWithTimeout(path, {
      method: 'POST',
      credentials: 'same-origin',
      body: formData,
    })
    if (!res.ok) throw new Error(`${path} -> ${res.status}`)
    recordSuccess()
    return attachResponseMeta(await safeJson(res, path), res)
  } catch (err) {
    recordFailure()
    if (!silent) notifyError(err)
    throw err
  }
}

export async function deleteJson(path, { silent = false } = {}) {
  checkCircuit()
  try {
    const res = await fetchWithTimeout(path, { method: 'DELETE', credentials: 'same-origin' })
    if (!res.ok) throw new Error(`${path} -> ${res.status}`)
    recordSuccess()
    return safeJson(res, path)
  } catch (err) {
    recordFailure()
    if (!silent) notifyError(err)
    throw err
  }
}

// ── SSE with auto-reconnect ──

const SSE_MAX_RETRIES = 10
const SSE_BASE_DELAY_MS = 1_000
const SSE_MAX_DELAY_MS = 30_000

export function connectSSE(url, { onEvent, onError, onDone }) {
  let retryCount = 0
  let retryTimer = null
  let lastEventId = ''
  let closed = false
  let es = null

  function connect() {
    const connectUrl = lastEventId
      ? `${url}${url.includes('?') ? '&' : '?'}lastEventId=${encodeURIComponent(lastEventId)}`
      : url
    es = new EventSource(connectUrl)

    es.onmessage = (e) => {
      retryCount = 0 // Reset backoff on successful message
      if (e.lastEventId) lastEventId = e.lastEventId
      try {
        const data = JSON.parse(e.data)
        if (data.eventType === 'done' || data.type === 'done') {
          onDone?.(data)
          close()
        } else {
          onEvent?.(data)
        }
      } catch {
        onEvent?.({ raw: e.data })
      }
    }

    es.addEventListener('done', () => { onDone?.(); close() })

    es.onerror = () => {
      if (closed) return
      es.close()
      es = null

      if (retryCount >= SSE_MAX_RETRIES) {
        onError?.()
        notifyError(new Error('Live connection lost. Please refresh the page.'))
        return
      }

      // Exponential backoff with jitter
      const delay = Math.min(SSE_MAX_DELAY_MS, SSE_BASE_DELAY_MS * 2 ** retryCount) * (0.5 + Math.random() * 0.5)
      retryCount++
      retryTimer = setTimeout(connect, delay)
    }
  }

  function close() {
    closed = true
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
    if (es) { es.close(); es = null }
  }

  connect()

  return { get eventSource() { return es }, close }
}
