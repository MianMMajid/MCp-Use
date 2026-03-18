import { getAdminOrigin } from '../../../../lib/server/origins.js'
import { proxyRequest } from '../../../../lib/server/proxy.js'

function sanitizePath(raw) {
  const segments = String(raw ?? '').split('/').filter(Boolean)
  if (segments.some((s) => s === '..')) {
    return null
  }
  return segments.join('/')
}

async function handler({ params, url, request, fetch }) {
  const path = sanitizePath(params.path)
  if (path === null) {
    return new Response(JSON.stringify({ error: 'Invalid path' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const targetUrl = `${getAdminOrigin()}/admin/api/${path}${url.search}`
  return proxyRequest({ request, fetch, targetUrl })
}

export const GET = handler
export const POST = handler
export const PUT = handler
export const PATCH = handler
export const DELETE = handler
export const OPTIONS = handler
