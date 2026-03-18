/**
 * Shared error classification and user-friendly formatting.
 */

/**
 * Classify an error into a type and retryability.
 * @param {unknown} err
 * @returns {{ type: 'network'|'timeout'|'auth'|'validation'|'server'|'rate_limit'|'unknown', retryable: boolean }}
 */
export function classifyError(err) {
  if (!err) return { type: 'unknown', retryable: false }

  const message = err instanceof Error ? err.message : String(err)
  const status = err?.status ?? 0

  // Auth errors
  if (status === 401 || status === 403 || message.includes('401') || message.includes('403')) {
    return { type: 'auth', retryable: false }
  }

  // Rate limiting
  if (status === 429 || message.includes('429') || message.includes('rate')) {
    return { type: 'rate_limit', retryable: true }
  }

  // Timeout
  if (err?.name === 'AbortError' || message.includes('timed out') || message.includes('timeout')) {
    return { type: 'timeout', retryable: true }
  }

  // Network errors
  if (message.includes('Failed to fetch') || message.includes('NetworkError') || message.includes('network') || message.includes('ECONNREFUSED')) {
    return { type: 'network', retryable: true }
  }

  // Validation / client errors (4xx except 429)
  if ((status >= 400 && status < 500) || message.match(/-> 4\d{2}/)) {
    return { type: 'validation', retryable: false }
  }

  // Server errors (5xx)
  if ((status >= 500 && status < 600) || message.match(/-> 5\d{2}/)) {
    return { type: 'server', retryable: true }
  }

  return { type: 'unknown', retryable: false }
}

/**
 * Convert an error into a user-friendly message based on its classification.
 * @param {unknown} err
 * @returns {string}
 */
export function formatUserMessage(err) {
  const { type } = classifyError(err)

  switch (type) {
    case 'network':
      return 'Unable to connect. Please check your network and try again.'
    case 'timeout':
      return 'The request timed out. The service may be busy — please try again.'
    case 'auth':
      return 'Authentication required. Please sign in and try again.'
    case 'validation':
      return 'The request could not be completed. Please check your input and try again.'
    case 'rate_limit':
      return 'Too many requests. Please wait a moment and try again.'
    case 'server':
      return 'The service is temporarily unavailable. Please try again shortly.'
    default:
      return err instanceof Error ? err.message : String(err || 'An unexpected error occurred.')
  }
}
