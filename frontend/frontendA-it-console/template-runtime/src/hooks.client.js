/** @type {import('@sveltejs/kit').HandleClientError} */
export function handleError({ error, status, message }) {
  const id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  if (typeof window !== 'undefined' && window.__MAPLE_ERROR_SINK__) {
    window.__MAPLE_ERROR_SINK__({ id, status, message, stack: error?.stack })
  }
  return { message: message || 'An unexpected error occurred.', id }
}
