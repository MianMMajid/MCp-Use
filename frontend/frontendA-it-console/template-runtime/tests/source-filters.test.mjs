import test from 'node:test'
import assert from 'node:assert/strict'

import { filterRecordsBySource, getAuditRecordSource, getSourceFilterIds } from '../src/lib/maple-workspace/origin-filter.js'

test('source filters are explicit and include Maple service sources', () => {
  assert.deepEqual(getSourceFilterIds(), [
    'all',
    'frontend-b',
    'frontend-a',
    'gateway-api',
    'context-wall',
    'cyber-proxy',
    'openclaw',
  ])
})

test('getAuditRecordSource maps service-origin records without frontend-b-only heuristics', () => {
  assert.equal(getAuditRecordSource({ sourceService: 'context-wall' }), 'context-wall')
  assert.equal(getAuditRecordSource({ source: 'gateway-api' }), 'gateway-api')
  assert.equal(getAuditRecordSource({ source: 'frontend-a' }), 'frontend-a')
  assert.equal(getAuditRecordSource({ origin: 'orchestration-runtime' }), 'frontend-b')
})

test('filterRecordsBySource does not drop records when all sources are requested', () => {
  const records = [
    { sourceService: 'context-wall' },
    { source: 'frontend-a' },
    { origin: 'orchestration-runtime' },
  ]
  assert.equal(filterRecordsBySource(records, 'all').length, 3)
  assert.equal(filterRecordsBySource(records, 'context-wall').length, 1)
})
