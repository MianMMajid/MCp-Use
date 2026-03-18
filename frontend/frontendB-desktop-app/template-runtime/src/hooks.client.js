/** @type {import('@sveltejs/kit').HandleClientError} */
export function handleError({ error, status, message }) {
  const id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  console.error(`[client-error:${id}] ${status}`, error)
  return { message: message || 'An unexpected error occurred.', id }
}
