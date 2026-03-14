import { getAdminOrigin } from '../../../../lib/server/origins.js'
import { proxyRequest } from '../../../../lib/server/proxy.js'

async function handler({ params, url, request, fetch }) {
  const joined = params.path ?? ''
  const targetUrl = `${getAdminOrigin()}/admin/api/${joined}${url.search}`
  return proxyRequest({ request, fetch, targetUrl })
}

export const GET = handler
export const POST = handler
export const PUT = handler
export const PATCH = handler
export const DELETE = handler
export const OPTIONS = handler
