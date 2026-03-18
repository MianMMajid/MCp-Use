import { redirect } from '@sveltejs/kit'
import { getGatewayOrigin } from '$lib/server/origins.js'

// SvelteKit's built-in checkOrigin (enabled by default) + backend SameSite=Lax
// cookies provide adequate CSRF protection. No additional CSRF handling needed.

const PUBLIC_PATH_PREFIXES = ['/login', '/health', '/api', '/admin/api']
const SESSION_CHECK_TIMEOUT_MS = 3000

const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
}

const CSP = [
  "default-src 'self'",
  "script-src 'self' https://accounts.google.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
].join('; ')

async function resolveWithHeaders(event, resolve, authStatus) {
  const response = await resolve(event)
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value)
  }
  response.headers.set('Content-Security-Policy', CSP)
  response.headers.set('X-Maple-Auth-Status', authStatus)
  if (event.url.protocol === 'https:') {
    response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains')
  }
  return response
}

function isStaticAsset(pathname) {
  return (
    pathname.startsWith('/_app/') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.jpg') ||
    pathname.endsWith('.ico') ||
    pathname.endsWith('.css') ||
    pathname.endsWith('.js') ||
    pathname.endsWith('.woff2')
  )
}

export async function handle({ event, resolve }) {
  const { pathname } = event.url

  if (PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix)) || isStaticAsset(pathname)) {
    return resolveWithHeaders(event, resolve, 'none')
  }

  if (!pathname.startsWith('/maple')) {
    return resolveWithHeaders(event, resolve, 'none')
  }

  const sessionCookie = event.cookies.get('maple_session')
  if (!sessionCookie) {
    throw redirect(307, '/login')
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), SESSION_CHECK_TIMEOUT_MS)
    const res = await fetch(`${getGatewayOrigin()}/api/auth/me`, {
      headers: new Headers([['cookie', `maple_session=${sessionCookie}`]]),
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (res.ok) {
      let body
      try {
        body = await res.json()
      } catch {
        // JSON parse failure: fail open
        return resolveWithHeaders(event, resolve, 'degraded')
      }
      if (!body.authenticated) {
        event.cookies.delete('maple_session', { path: '/' })
        throw redirect(307, '/login')
      }
      event.locals.user = body.user ?? null
      return resolveWithHeaders(event, resolve, 'verified')
    } else if (res.status === 401) {
      event.cookies.delete('maple_session', { path: '/' })
      throw redirect(307, '/login')
    }
    // 5xx: fail open — let client-side handle
    return resolveWithHeaders(event, resolve, 'degraded')
  } catch (err) {
    if (err?.status === 307) throw err // re-throw redirects
    // Network/timeout: fail open
  }

  return resolveWithHeaders(event, resolve, 'degraded')
}
