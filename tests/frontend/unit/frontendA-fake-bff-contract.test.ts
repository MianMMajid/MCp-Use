import { describe, expect, it } from 'vitest'

import { handleFakeRequest } from '../../../frontend/frontendA-it-console/template-runtime/src/lib/fake-mode/handlers.js'
import { createFakeState } from '../../../frontend/frontendA-it-console/template-runtime/src/lib/fake-mode/state.js'

async function request(pathname: string, method = 'GET', body: unknown = null) {
  const state = createFakeState('frontendA-fake-bff-contract')
  state.sessionActive = true
  const response = await handleFakeRequest({
    method,
    pathname,
    searchParams: new URLSearchParams(),
    body: body as any,
    state,
  })
  const payload = await response.json().catch(() => ({}))
  return { response, payload, state }
}

describe('frontendA fake mode bff contract parity', () => {
  it('returns backend-shaped bootstrap payload', async () => {
    const { response, payload } = await request('/api/ui/bootstrap')
    expect(response.ok).toBe(true)
    expect(Array.isArray(payload.firewallRules)).toBe(true)
    expect(Array.isArray(payload.contextLeakageDocuments)).toBe(true)
  })

  it('returns users payload with orgId + users', async () => {
    const { response, payload } = await request('/api/ui/users')
    expect(response.ok).toBe(true)
    expect(typeof payload.orgId).toBe('string')
    expect(Array.isArray(payload.users)).toBe(true)
  })

  it('returns backend-like runtime feature capabilities shape', async () => {
    const { response, payload } = await request('/api/runtime/feature-capabilities')
    expect(response.ok).toBe(true)
    expect(payload.ok).toBe(true)
    expect(payload.service).toBe('gateway-api')
    expect(Array.isArray(payload.capabilities)).toBe(true)
  })

  it('supports context leakage upload/readback with backend-compatible document fields', async () => {
    const state = createFakeState('frontendA-fake-bff-contract-leakage')
    state.sessionActive = true

    const upload = await handleFakeRequest({
      method: 'POST',
      pathname: '/api/ui/firewall/context-leakage/documents',
      searchParams: new URLSearchParams(),
      body: {
        policyMode: 'strict',
        documents: [{ name: 'incident.txt', type: 'text/plain', size: 42, content: 'alert payload' }],
      } as any,
      state,
    })
    const uploadPayload = await upload.json()
    expect(upload.status).toBe(201)
    expect(Array.isArray(uploadPayload.documents)).toBe(true)
    expect(uploadPayload.documents[0]).toMatchObject({
      name: 'incident.txt',
      mimeType: 'text/plain',
    })
    expect(typeof uploadPayload.firewallObjectId).toBe('string')

    const readback = await handleFakeRequest({
      method: 'GET',
      pathname: '/api/ui/firewall/context-leakage/documents',
      searchParams: new URLSearchParams(),
      body: null,
      state,
    })
    const readbackPayload = await readback.json()
    expect(readback.ok).toBe(true)
    expect(Array.isArray(readbackPayload.documents)).toBe(true)
    expect(readbackPayload.documents[0]).toHaveProperty('sizeBytes')
  })

  it('returns backend-like users mutation response fields', async () => {
    const state = createFakeState('frontendA-fake-bff-contract-users')
    state.sessionActive = true

    const createdRes = await handleFakeRequest({
      method: 'POST',
      pathname: '/api/ui/users',
      searchParams: new URLSearchParams(),
      body: { name: 'Ops Analyst', email: 'ops-analyst@mayple.dev', role: 'operator' } as any,
      state,
    })
    const created = await createdRes.json()
    expect(createdRes.ok).toBe(true)
    expect(created).toHaveProperty('orgId')
    expect(created.user).toHaveProperty('userId')

    const userId = String(created.user.userId)
    const patchRes = await handleFakeRequest({
      method: 'PATCH',
      pathname: `/api/ui/users/${encodeURIComponent(userId)}/role`,
      searchParams: new URLSearchParams(),
      body: { role: 'admin' } as any,
      state,
    })
    const patched = await patchRes.json()
    expect(patchRes.ok).toBe(true)
    expect(patched).toMatchObject({ ok: true, userId, role: 'admin' })
    expect(typeof patched.orgId).toBe('string')

    const deleteRes = await handleFakeRequest({
      method: 'DELETE',
      pathname: `/api/ui/users/${encodeURIComponent(userId)}`,
      searchParams: new URLSearchParams(),
      body: null,
      state,
    })
    const deleted = await deleteRes.json()
    expect(deleteRes.ok).toBe(true)
    expect(deleted).toMatchObject({ ok: true, userId })
    expect(typeof deleted.orgId).toBe('string')
  })

  it('supports firewall rules CRUD at backend route shape', async () => {
    const state = createFakeState('frontendA-fake-bff-contract-rules')
    state.sessionActive = true

    const created = await handleFakeRequest({
      method: 'POST',
      pathname: '/api/firewall/rules',
      searchParams: new URLSearchParams(),
      body: { condition: 'target equals github.com', decision: 'block' } as any,
      state,
    })
    const createdPayload = await created.json()
    expect(created.status).toBe(201)
    expect(createdPayload.rule).toMatchObject({ condition: 'target equals github.com', decision: 'block' })
    const ruleId = String(createdPayload.rule.id)

    const listed = await handleFakeRequest({
      method: 'GET',
      pathname: '/api/firewall/rules',
      searchParams: new URLSearchParams(),
      body: null,
      state,
    })
    const listedPayload = await listed.json()
    expect(listed.ok).toBe(true)
    expect(Array.isArray(listedPayload.rules)).toBe(true)
    expect(typeof listedPayload.count).toBe('number')

    const patched = await handleFakeRequest({
      method: 'PATCH',
      pathname: `/api/firewall/rules/${encodeURIComponent(ruleId)}`,
      searchParams: new URLSearchParams(),
      body: { decision: 'review' } as any,
      state,
    })
    const patchedPayload = await patched.json()
    expect(patched.ok).toBe(true)
    expect(patchedPayload.rule.decision).toBe('review')

    const deleted = await handleFakeRequest({
      method: 'DELETE',
      pathname: `/api/firewall/rules/${encodeURIComponent(ruleId)}`,
      searchParams: new URLSearchParams(),
      body: null,
      state,
    })
    expect(deleted.ok).toBe(true)
  })

  it('applies analyst filter server-side in bootstrap and analysts endpoints', async () => {
    const state = createFakeState('frontendA-fake-bff-contract-analysts')
    state.sessionActive = true

    state.observability.auditLog = [
      { id: 'evt-a', actor: 'alice@mayple.dev', eventType: 'tool_call' } as any,
      { id: 'evt-b', actor: 'bob@mayple.dev', eventType: 'tool_call' } as any,
    ]
    state.orchestrationExecutions = [
      { executionId: 'exec-a', requestedBy: 'alice@mayple.dev' } as any,
      { executionId: 'exec-b', requestedBy: 'bob@mayple.dev' } as any,
    ]
    state.hitl.gatewayApprovals = [
      { approvalId: 'appr-a', user: 'alice@mayple.dev' } as any,
      { approvalId: 'appr-b', user: 'bob@mayple.dev' } as any,
    ]

    const params = new URLSearchParams()
    params.append('analysts', 'alice@mayple.dev')

    const filteredBootstrap = await handleFakeRequest({
      method: 'GET',
      pathname: '/api/ui/bootstrap',
      searchParams: params,
      body: null,
      state,
    })
    const bootstrapPayload = await filteredBootstrap.json()
    expect(filteredBootstrap.ok).toBe(true)
    expect(bootstrapPayload.auditEvents).toHaveLength(1)
    expect(bootstrapPayload.executions).toHaveLength(1)
    expect(bootstrapPayload.approvals).toHaveLength(1)
    expect(bootstrapPayload.auditEvents[0].actor).toBe('alice@mayple.dev')

    const filteredAnalysts = await handleFakeRequest({
      method: 'GET',
      pathname: '/api/ui/analysts',
      searchParams: params,
      body: null,
      state,
    })
    const analystsPayload = await filteredAnalysts.json()
    expect(filteredAnalysts.ok).toBe(true)
    expect(analystsPayload.analysts).toContain('alice@mayple.dev')
    expect(analystsPayload.analysts).not.toContain('bob@mayple.dev')
  })
})
