import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  disableFakeMode,
  enableFakeMode,
  initializeFakeModeRuntime,
  regenerateFakeData,
  STORAGE_ENABLED_KEY,
  STORAGE_MUTATIONS_KEY,
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

  it('persists api/ui fake mutations across runtime reinitialization', async () => {
    initializeFakeModeRuntime()
    enableFakeMode('seed-ui-persist')

    const createRes = await fetch('/api/ui/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Persisted Analyst', email: 'persisted@mayple.dev', role: 'operator' }),
    })
    expect(createRes.ok).toBe(true)

    const before = await fetch('/api/ui/users')
    const beforePayload = await before.json()
    expect(beforePayload.users.some((user: { email?: string }) => user.email === 'persisted@mayple.dev')).toBe(
      true,
    )
    expect(localStorage.getItem(STORAGE_MUTATIONS_KEY)).toBeTruthy()

    Reflect.deleteProperty(window as Record<string, unknown>, RUNTIME_KEY)
    initializeFakeModeRuntime()
    enableFakeMode('seed-ui-persist')

    const after = await fetch('/api/ui/users')
    const afterPayload = await after.json()
    expect(afterPayload.users.some((user: { email?: string }) => user.email === 'persisted@mayple.dev')).toBe(
      true,
    )
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

  it('supports Frontend B orchestration templates, objective conversation, and timed reassignments', async () => {
    Reflect.deleteProperty(window as Record<string, unknown>, RUNTIME_KEY)
    initializeFakeModeRuntimeB()
    enableFakeModeB('orchestration-seed')

    const templatesRes = await fetch('/api/orchestrations/templates')
    expect(templatesRes.ok).toBe(true)
    const templatesJson = await templatesRes.json()
    const templateId = templatesJson.items[0]?.id
    expect(templateId).toBeTruthy()

    const createRes = await fetch(`/api/orchestrations/templates/${templateId}/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Template Runtime Test' }),
    })
    const createJson = await createRes.json()
    const orchestrationId = createJson.orchestration?.id || createJson.id
    expect(orchestrationId).toBeTruthy()

    const conversationRes = await fetch(`/api/orchestrations/${orchestrationId}/conversation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Please run a coding sprint loop.',
        objectivePackage: {
          goal: 'Deliver sprint objective',
          successCriteria: 'All stories done',
          runtimeLimitMinutes: 90,
          budgetUsd: 200,
          riskCeiling: 'high',
          contextUrls: ['https://docs.internal/sprint'],
          outputContract: 'Markdown summary',
          escalationPolicy: 'Escalate after two failures',
        },
      }),
    })
    expect(conversationRes.ok).toBe(true)
    const conversationJson = await conversationRes.json()
    expect(Array.isArray(conversationJson.items)).toBe(true)
    expect(conversationJson.items.length).toBeGreaterThan(1)

    const executeRes = await fetch(`/api/orchestrations/${orchestrationId}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'live',
        objectivePackage: conversationJson.objectivePackage,
        conversationContext: conversationJson.items.slice(-5),
      }),
    })
    expect(executeRes.ok).toBe(true)
    const executeJson = await executeRes.json()
    const executionId = executeJson.executionId
    expect(executionId).toBeTruthy()

    const tasksRes = await fetch(`/api/orchestrations/executions/${executionId}/tasks`)
    const tasksJson = await tasksRes.json()
    const taskId = tasksJson.items[0]?.id
    expect(taskId).toBeTruthy()

    const dueAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()
    const reassignRes = await fetch(`/api/orchestrations/executions/${executionId}/tasks/${taskId}/reassign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dueAt,
        repeatIntervalMinutes: 10,
        maxRepeats: 2,
        targetRole: 'manager',
      }),
    })
    expect(reassignRes.ok).toBe(true)
    const reassignJson = await reassignRes.json()
    const reassignmentId = reassignJson.reassignment?.id
    expect(reassignmentId).toBeTruthy()

    const queueRes = await fetch(`/api/orchestrations/executions/${executionId}/reassignments`)
    const queueJson = await queueRes.json()
    expect(queueJson.items.some((item: { id: string }) => item.id === reassignmentId)).toBe(true)

    const cancelRes = await fetch(`/api/orchestrations/executions/${executionId}/reassignments/${reassignmentId}`, { method: 'DELETE' })
    expect(cancelRes.ok).toBe(true)

    const queueAfterCancel = await fetch(`/api/orchestrations/executions/${executionId}/reassignments`)
    const queueAfterCancelJson = await queueAfterCancel.json()
    const canceled = queueAfterCancelJson.items.find((item: { id: string; status: string }) => item.id === reassignmentId)
    expect(canceled?.status).toBe('canceled')
  })
})
