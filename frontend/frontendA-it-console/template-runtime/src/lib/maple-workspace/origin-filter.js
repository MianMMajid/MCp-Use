export const SOURCE_FILTER_IDS = Object.freeze([
  'all',
  'frontend-b',
  'frontend-a',
  'gateway-api',
  'context-wall',
  'cyber-proxy',
  'openclaw',
])

const SOURCE_HINTS = Object.freeze({
  'frontend-b': ['frontend-b', 'frontendb', 'orchestrate', 'orchestration'],
  'frontend-a': ['frontend-a', 'frontenda', 'it-console'],
  'gateway-api': ['gateway-api', 'gateway api', 'gateway'],
  'context-wall': ['context-wall', 'context wall'],
  'cyber-proxy': ['cyber-proxy', 'cyber proxy'],
  openclaw: ['openclaw', 'agent-runtime', 'agent runtime'],
})

function hasHint(value, hints) {
  const normalized = String(value ?? '').toLowerCase()
  return hints.some((hint) => normalized.includes(hint))
}

function collectOriginCandidates(record) {
  if (!record || typeof record !== 'object') {
    return []
  }

  const fields = [
    record.source,
    record.origin,
    record.producer,
    record.channel,
    record.client,
    record.app,
    record.metadata?.source,
    record.metadata?.origin,
    record.trace?.source,
    record.trace?.origin,
  ]

  return fields.filter((value) => typeof value === 'string' && value.trim().length > 0)
}

export function getAuditRecordSource(record) {
  const event = record?.event && typeof record.event === 'object' ? record.event : null
  const rawSource = String(
    event?.sourceService ||
    record?.sourceService ||
    record?.source ||
    record?.origin ||
    record?.producer ||
    record?.client ||
    ''
  ).trim()
  if (!rawSource) {
    return 'unknown'
  }
  const normalized = rawSource.toLowerCase()
  for (const [sourceId, hints] of Object.entries(SOURCE_HINTS)) {
    if (hints.some((hint) => normalized.includes(hint))) {
      return sourceId
    }
  }
  return rawSource
}

export function filterRecordsBySource(records, source = 'all') {
  if (!Array.isArray(records)) {
    return []
  }
  if (!source || source === 'all') {
    return records
  }
  return records.filter((record) => getAuditRecordSource(record) === source)
}

export function getSourceFilterIds() {
  return SOURCE_FILTER_IDS
}
