/**
 * Convert raw API error messages into user-friendly text.
 * Raw errors like "/api/firewalls -> 503" become actionable descriptions.
 */
export function humanizeError(raw) {
  if (!raw) return ''
  const s = String(raw)

  // Match patterns like "/api/xxx -> 5xx" or "/api/xxx -> 4xx"
  const apiMatch = s.match(/\/api\/\S+\s*->\s*(\d{3})/)
  if (apiMatch) {
    const status = Number(apiMatch[1])
    if (status === 401 || status === 403) return 'Authentication required. Please sign in and try again.'
    if (status === 404) return 'The requested resource was not found.'
    if (status === 429) return 'Too many requests. Please wait a moment and try again.'
    if (status >= 500) return 'The service is temporarily unavailable. Check your connection and try again.'
    if (status >= 400) return 'The request could not be completed. Please check your input and try again.'
  }

  // Match "Request timed out: /api/xxx"
  if (s.includes('timed out')) return 'The request timed out. The service may be busy — please try again.'

  // Match fetch/network errors
  if (s.includes('Failed to fetch') || s.includes('NetworkError') || s.includes('network'))
    return 'Unable to connect. Please check your network and try again.'

  // Pass through already human-readable messages
  return s
}
