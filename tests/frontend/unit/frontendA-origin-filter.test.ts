import { describe, expect, it } from 'vitest'

import {
  getAuditRecordSource,
  filterRecordsBySource,
  getSourceFilterIds,
} from '../../../frontend/frontendA-it-console/template-runtime/src/lib/maple-workspace/origin-filter.js'

describe('frontend A origin filter', () => {
  it('classifies frontend-b orchestration records', () => {
    expect(
      getAuditRecordSource({ source: 'frontend-b/orchestrate' }),
    ).toBe('frontend-b')
  })

  it('classifies frontend-a and gateway records', () => {
    expect(
      getAuditRecordSource({ source: 'frontend-a/it-console' }),
    ).toBe('frontend-a')
    expect(
      getAuditRecordSource({ source: 'gateway-api' }),
    ).toBe('gateway-api')
  })

  it('classifies openclaw as its own source', () => {
    expect(
      getAuditRecordSource({ origin: 'openclaw-runtime' }),
    ).toBe('openclaw')
  })

  it('filters arrays by source', () => {
    const records = [
      { source: 'frontend-b', executionId: 'exec-a' },
      { source: 'frontend-a', executionId: 'exec-b' },
      { origin: 'openclaw-runtime', sessionId: 'sess-1' },
    ]
    expect(filterRecordsBySource(records, 'frontend-b')).toHaveLength(1)
    expect(filterRecordsBySource(records, 'all')).toHaveLength(3)
    expect(filterRecordsBySource(records, 'openclaw')).toHaveLength(1)
  })

  it('getSourceFilterIds returns a frozen list', () => {
    const ids = getSourceFilterIds()
    expect(ids).toContain('all')
    expect(ids).toContain('frontend-b')
    expect(ids).toContain('openclaw')
  })
})
