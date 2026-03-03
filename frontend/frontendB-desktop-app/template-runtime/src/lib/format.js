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
  'running', 'resolved', 'verified', 'integrity_ok',
])
const RED_KEYWORDS = new Set([
  'error', 'failed', 'denied', 'block', 'blocked', 'rejected', 'disabled',
  'expired', 'revoked', 'critical', 'unhealthy', 'broken', 'disconnected', 'archived',
  'tampered', 'integrity_failed', 'break_glass',
])
const ORANGE_KEYWORDS = new Set([
  'pending', 'draft', 'review', 'warning', 'partial', 'suspended',
  'queued', 'waiting', 'paused', 'escalated', 'step_up_required',
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

export function riskLabel(score) {
  if (score == null) return 'unknown'
  if (typeof score === 'number') {
    if (score < 0.3) return 'low'
    if (score < 0.6) return 'medium'
    if (score < 0.8) return 'high'
    return 'critical'
  }
  return String(score).toLowerCase()
}

export function groupByDate(items, dateField = 'createdAt') {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfYesterday = new Date(startOfToday)
  startOfYesterday.setDate(startOfYesterday.getDate() - 1)
  const sevenDaysAgo = new Date(startOfToday)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const thirtyDaysAgo = new Date(startOfToday)
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const groups = { Today: [], Yesterday: [], 'Previous 7 Days': [], 'Previous 30 Days': [], Older: [] }

  for (const item of items) {
    const d = new Date(item[dateField] ?? 0)
    if (d >= startOfToday) groups.Today.push(item)
    else if (d >= startOfYesterday) groups.Yesterday.push(item)
    else if (d >= sevenDaysAgo) groups['Previous 7 Days'].push(item)
    else if (d >= thirtyDaysAgo) groups['Previous 30 Days'].push(item)
    else groups.Older.push(item)
  }

  return Object.entries(groups).filter(([, items]) => items.length > 0)
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
