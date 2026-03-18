import { formatUserMessage } from '$lib/error-utils.js'
import { toastStore } from '$lib/stores/toast-store.js'

/** @type {import('@sveltejs/kit').HandleClientError} */
export function handleError({ error, status, message }) {
  const id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  console.error(`[client-error:${id}] ${status}`, error)
  return { message: message || 'An unexpected error occurred.', id }
}

// ── Unhandled promise rejection handler ──
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const err = event.reason
    console.error('[unhandled-rejection]', err)
    toastStore.error(formatUserMessage(err))
  })

  // ── Offline / online detection ──
  window.addEventListener('offline', () => {
    toastStore.warning('You are offline. Some features may be unavailable.')
  })

  window.addEventListener('online', () => {
    toastStore.success('Back online.')
  })
}
