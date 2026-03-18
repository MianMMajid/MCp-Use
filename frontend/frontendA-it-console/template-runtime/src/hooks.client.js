import { formatUserMessage } from '$lib/error-utils.js'

/** @type {import('@sveltejs/kit').HandleClientError} */
export function handleError({ error, status, message }) {
  const id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  if (typeof window !== 'undefined' && window.__MAPLE_ERROR_SINK__) {
    window.__MAPLE_ERROR_SINK__({ id, status, message, stack: error?.stack })
  }
  return { message: message || 'An unexpected error occurred.', id }
}

// ── Unhandled promise rejection handler ──
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const err = event.reason
    console.error('[unhandled-rejection]', err)
    if (window.__MAPLE_ERROR_SINK__) {
      window.__MAPLE_ERROR_SINK__({
        id: crypto.randomUUID?.() ?? `${Date.now()}`,
        status: 0,
        message: formatUserMessage(err),
        stack: err?.stack,
      })
    }
  })

  // ── Offline / online detection ──
  window.addEventListener('offline', () => {
    document.dispatchEvent(new CustomEvent('maple:connectivity', { detail: { online: false } }))
  })

  window.addEventListener('online', () => {
    document.dispatchEvent(new CustomEvent('maple:connectivity', { detail: { online: true } }))
  })
}
