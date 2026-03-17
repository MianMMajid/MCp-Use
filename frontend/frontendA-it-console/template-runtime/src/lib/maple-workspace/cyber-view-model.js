export function scanColor(scan) {
  const verdict = String(scan?.verdict || '').toLowerCase()
  const status = String(scan?.status || '').toLowerCase()
  const stage = String(scan?.stage || '').toLowerCase()
  if (status === 'pending' || stage === 'analysis_pending') return 'amber'
  if (scan?.quarantined) return 'amber'
  if (scan?.blocked || verdict === 'malicious') return 'rose'
  if (verdict === 'safe') return 'orange'
  return 'zinc'
}

export function incidentColor(item) {
  const severity = String(item?.severity || '').toLowerCase()
  const state = String(item?.state || '').toLowerCase()
  if (state === 'closed' || state === 'resolved') return 'zinc'
  if (severity.includes('high') || severity.includes('critical')) return 'rose'
  if (severity.includes('medium')) return 'amber'
  return 'orange'
}

export function scanLabel(scan) {
  const stage = String(scan?.stage || '').toLowerCase()
  const verdict = String(scan?.verdict || '').toLowerCase()
  const status = String(scan?.status || '').toLowerCase()
  if (stage === 'analysis_pending' || status === 'pending') return 'analysis pending'
  if (stage === 'reputation_enriched' && verdict) return `${verdict} (reputation)`
  if (verdict) return verdict
  if (status) return status
  return 'unknown'
}

export function degradedSecurityMessage(status) {
  if (!status) return ''
  const blockers = []
  if (status?.providers?.contextWall?.reachable === false) blockers.push('context policy unavailable')
  if (status?.providers?.cyberProxy?.reachable === false) blockers.push('cyber scan unavailable')
  if (status?.scanning?.degraded === true) blockers.push('reputation enrichment degraded')
  if (status?.security?.evidenceStore?.available === false) blockers.push('evidence store unavailable')
  if (status?.security?.quarantineStore?.available === false) blockers.push('quarantine store unavailable')
  return blockers.join(', ')
}
