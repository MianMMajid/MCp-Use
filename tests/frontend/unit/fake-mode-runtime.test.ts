import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  disableFakeMode,
  enableFakeMode,
  initializeFakeModeRuntime,
  regenerateFakeData,
  STORAGE_ENABLED_KEY,
  STORAGE_SEED_KEY,
} from '../../../frontend/frontendA-it-console/template-runtime/src/lib/fake-mode/runtime.js'
import {
  enableFakeMode as enableFakeModeB,
  initializeFakeModeRuntime as initializeFakeModeRuntimeB,
} from '../../../frontend/frontendB-desktop-app/template-runtime/src/lib/fake-mode/runtime.js'

const RUNTIME_KEY = '__mapleFakeModeRuntime__'

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('fake mode runtime', () => {
  beforeEach(() => {
    document.cookie = 'maple_session=; path=/; Max-Age=0; SameSite=Lax'
    Reflect.deleteProperty(window as Record<string, unknown>, RUNTIME_KEY)

    const realFetch = vi.fn(async () => jsonResponse({ real: true }))
    vi.stubGlobal('fetch', realFetch)

    class RealEventSource {
      url: string
      readyState = 1
      withCredentials = false

      constructor(url: string) {
        this.url = url
      }

      close() {
        this.readyState = 2
      }
    }

    vi.stubGlobal('EventSource', RealEventSource)
  })

  it('intercepts fake fetch when enabled and falls back when disabled', async () => {
    const realFetch = globalThis.fetch as unknown as ReturnType<typeof vi.fn>

    initializeFakeModeRuntime()

    const realRes = await fetch('/api/firewall/state')
    expect(await realRes.json()).toEqual({ real: true })
    expect(realFetch).toHaveBeenCalledTimes(1)

    enableFakeMode()

    const fakeRes = await fetch('/api/firewall/state')
    const fakePayload = await fakeRes.json()
    expect(fakeRes.ok).toBe(true)
    expect(fakePayload.ok).toBe(true)
    expect(fakePayload).toHaveProperty('mode')
    expect(realFetch).toHaveBeenCalledTimes(1)

    disableFakeMode()

    const backToReal = await fetch('/api/firewall/state')
    expect(await backToReal.json()).toEqual({ real: true })
    expect(realFetch).toHaveBeenCalledTimes(2)
  })

  it('mutations update in-memory state for subsequent reads', async () => {
    initializeFakeModeRuntime()
    enableFakeMode()

    const before = await fetch('/api/user/api-keys')
    const beforeJson = await before.json()
    const beforeCount = beforeJson.items.length

    const createRes = await fetch('/api/user/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'runtime-test-key' }),
    })
    const createJson = await createRes.json()
    const keyId = createJson.key.id || createJson.key.keyId

    const afterCreate = await fetch('/api/user/api-keys')
    const afterCreateJson = await afterCreate.json()
    expect(afterCreateJson.items.length).toBe(beforeCount + 1)

    await fetch(`/api/user/api-keys/${keyId}`, { method: 'DELETE' })

    const afterDelete = await fetch('/api/user/api-keys')
    const afterDeleteJson = await afterDelete.json()
    expect(afterDeleteJson.items.length).toBe(beforeCount)
  })

  it('applies auth cookie semantics for /api/auth/me login/logout', async () => {
    initializeFakeModeRuntime()
    enableFakeMode()

    let me = await fetch('/api/auth/me')
    expect(me.status).toBe(401)

    const login = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'demo@mayple.dev', password: 'secret' }),
    })
    expect(login.ok).toBe(true)
    expect(document.cookie).toContain('maple_session=')

    me = await fetch('/api/auth/me')
    expect(me.ok).toBe(true)
    const mePayload = await me.json()
    expect(mePayload.authenticated).toBe(true)

    const logout = await fetch('/api/auth/logout', { method: 'POST' })
    expect(logout.ok).toBe(true)

    me = await fetch('/api/auth/me')
    expect(me.status).toBe(401)
  })

  it('streams fetch SSE for /api/chat/stream with done terminator', async () => {
    initializeFakeModeRuntime()
    enableFakeMode()

    const response = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hello runtime stream' }),
    })

    expect(response.ok).toBe(true)
    expect(response.headers.get('Content-Type')).toContain('text/event-stream')

    const body = await response.text()
    expect(body).toContain('data:')
    expect(body).toContain('[DONE]')
  })

  it('emits EventSource open/message/done lifecycle for fake session streams', async () => {
    vi.useFakeTimers()

    initializeFakeModeRuntime()
    enableFakeMode()

    const messages: Array<{ eventType?: string; type?: string }> = []
    const donePromise = new Promise<void>((resolve) => {
      const stream = new EventSource('/api/openclaw/agent/sessions/session-1/stream')
      stream.onmessage = (event) => {
        const payload = JSON.parse(event.data)
        messages.push(payload)
      }
      stream.addEventListener('done', () => {
        resolve()
      })
    })

    await vi.advanceTimersByTimeAsync(10_000)
    await donePromise

    expect(messages.some((item) => item.eventType === 'progress' || item.type === 'progress')).toBe(true)
    expect(messages.some((item) => item.eventType === 'done' || item.type === 'done')).toBe(true)
  })

  it('regenerates seed and persists fake mode keys', () => {
    initializeFakeModeRuntime()
    enableFakeMode('seed-one')

    const firstSeed = localStorage.getItem(STORAGE_SEED_KEY)
    expect(localStorage.getItem(STORAGE_ENABLED_KEY)).toBe('1')
    expect(firstSeed).toBe('seed-one')

    regenerateFakeData()

    const secondSeed = localStorage.getItem(STORAGE_SEED_KEY)
    expect(secondSeed).toBeTruthy()
    expect(secondSeed).not.toBe(firstSeed)
    expect(localStorage.getItem(STORAGE_ENABLED_KEY)).toBe('1')
  })

  it('frontend B runtime exposes the same fake fetch behavior', async () => {
    Reflect.deleteProperty(window as Record<string, unknown>, RUNTIME_KEY)
    const realFetch = vi.fn(async () => jsonResponse({ real: true }))
    vi.stubGlobal('fetch', realFetch)

    initializeFakeModeRuntimeB()

    const realBefore = await fetch('/api/firewall/state')
    expect(await realBefore.json()).toEqual({ real: true })

    enableFakeModeB()

    const fakeAfter = await fetch('/api/firewall/state')
    expect(fakeAfter.ok).toBe(true)
    const payload = await fakeAfter.json()
    expect(payload).toHaveProperty('mode')
  })
})
