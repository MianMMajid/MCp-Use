export function formatDate(dateStr) {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return String(dateStr)
  }
}

export function formatDateShort(dateStr) {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return String(dateStr)
  }
}

const GREEN_KEYWORDS = new Set([
  'active', 'approved', 'allow', 'allowed', 'success', 'pass', 'passed',
  'compliant', 'valid', 'enabled', 'completed', 'connected', 'healthy',
  'running', 'resolved', 'verified',
])
const RED_KEYWORDS = new Set([
  'error', 'failed', 'denied', 'block', 'blocked', 'rejected', 'disabled',
  'expired', 'revoked', 'critical', 'unhealthy', 'broken', 'disconnected',
])
const ORANGE_KEYWORDS = new Set([
  'pending', 'draft', 'review', 'warning', 'partial', 'suspended',
  'queued', 'waiting', 'paused',
])

export function statusColor(status) {
  if (!status) return 'zinc'
  const s = String(status).toLowerCase()
  if (GREEN_KEYWORDS.has(s)) return 'green'
  if (RED_KEYWORDS.has(s)) return 'red'
  if (ORANGE_KEYWORDS.has(s)) return 'orange'
  return 'zinc'
}

export function severityColor(severity) {
  if (!severity) return 'zinc'
  const s = String(severity).toLowerCase()
  if (s === 'critical' || s === 'high') return 'red'
  if (s === 'medium' || s === 'warning') return 'orange'
  if (s === 'low' || s === 'info') return 'sky'
  return 'zinc'
}

export function riskColor(risk) {
  if (risk == null) return 'zinc'
  // Handle numeric scores (0–1)
  if (typeof risk === 'number') {
    if (risk >= 0.7) return 'red'
    if (risk >= 0.4) return 'orange'
    return 'green'
  }
  const s = String(risk).toLowerCase()
  if (s === 'critical' || s === 'high') return 'red'
  if (s === 'medium') return 'orange'
  if (s === 'low') return 'green'
  return 'zinc'
}
