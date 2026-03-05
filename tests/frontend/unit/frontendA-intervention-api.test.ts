import { afterEach, describe, expect, it, vi } from 'vitest'

import { interventionActionCatalog } from '../../../frontend/frontendA-it-console/template-runtime/src/lib/maple-workspace/intervention-api.js'

describe('frontend A intervention api', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls pause endpoint with execution id', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    const actions = interventionActionCatalog()

    await actions.pauseExecution.execute({ executionId: 'exec-1' })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ui/intervention/pause',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('sends destructive reason for cancel action', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    const actions = interventionActionCatalog()

    await actions.cancelExecution.execute({ executionId: 'exec-2', reason: 'safety-stop' })

    const request = fetchMock.mock.calls[0][1]
    expect(request.method).toBe('POST')
    expect(String(request.body)).toContain('safety-stop')
  })

  it('marks error with stepUpRequired when backend signals step-up', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ stepUpRequired: true, message: 'Step-up required' }), {
        status: 403,
      }),
    )
    const actions = interventionActionCatalog()

    await expect(
      actions.cancelExecution.execute({ executionId: 'exec-3', reason: 'critical' }),
    ).rejects.toMatchObject({ stepUpRequired: true })
  })
})
