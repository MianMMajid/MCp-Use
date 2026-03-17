const B_ORIGIN_HINTS = ['frontend-b', 'frontendb', 'orchestrate', 'orchestration', 'openclaw', 'runtime']
const EXCLUDED_HINTS = ['frontend-a', 'frontenda', 'it-console', 'manual', 'local', 'docs']

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

export function isFrontendBOriginRecord(record) {
  const candidates = collectOriginCandidates(record)
  if (candidates.some((value) => hasHint(value, EXCLUDED_HINTS))) {
    return false
  }

  if (candidates.some((value) => hasHint(value, B_ORIGIN_HINTS))) {
    return true
  }

  if (record && typeof record === 'object') {
    const hasOrchestrationIdentity =
      typeof record.executionId === 'string' ||
      typeof record.orchestrationId === 'string' ||
      typeof record.traceId === 'string' ||
      typeof record.sessionId === 'string'
    return Boolean(hasOrchestrationIdentity)
  }

  return false
}

export function filterFrontendBOrigin(records) {
  if (!Array.isArray(records)) {
    return []
  }
  return records.filter((record) => isFrontendBOriginRecord(record))
}

export function getAuditRecordSource(record) {
  const event = record?.event && typeof record.event === 'object' ? record.event : null
  return String(
    event?.sourceService ||
    record?.sourceService ||
    record?.source ||
    record?.origin ||
    record?.producer ||
    record?.client ||
    ''
  ).trim()
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
