import { describe, expect, it } from 'vitest'

import {
  filterFrontendBOrigin,
  isFrontendBOriginRecord,
} from '../../../frontend/frontendA-it-console/template-runtime/src/lib/maple-workspace/origin-filter.js'

describe('frontend A origin filter', () => {
  it('accepts orchestration runtime records from Frontend B hints', () => {
    expect(
      isFrontendBOriginRecord({
        source: 'frontend-b/orchestrate',
        executionId: 'exec-1',
      }),
    ).toBe(true)
  })

  it('rejects Frontend A and local/manual records', () => {
    expect(
      isFrontendBOriginRecord({
        source: 'frontend-a/it-console',
        executionId: 'exec-2',
      }),
    ).toBe(false)
    expect(
      isFrontendBOriginRecord({
        source: 'manual-local',
        traceId: 'trace-1',
      }),
    ).toBe(false)
  })

  it('filters arrays while preserving only B-origin entries', () => {
    const filtered = filterFrontendBOrigin([
      { source: 'frontend-b', executionId: 'exec-a' },
      { source: 'frontend-a', executionId: 'exec-b' },
      { origin: 'openclaw-runtime', sessionId: 'sess-1' },
    ])
    expect(filtered).toHaveLength(2)
  })
})
