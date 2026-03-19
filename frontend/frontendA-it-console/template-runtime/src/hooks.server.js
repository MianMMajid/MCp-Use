import { redirect } from '@sveltejs/kit'
import { getGatewayOrigin } from '$lib/server/origins.js'

/** @type {import('@sveltejs/kit').HandleServerError} */
export function handleError({ error, event, status, message }) {
  const id = crypto.randomUUID()
  if (status !== 404) {
    console.error(`[error:${id}] ${event.request.method} ${event.url.pathname} -> ${status}`, error)
  }
  return { message, id }
}

// SvelteKit's built-in checkOrigin (enabled by default) + backend SameSite=Lax
// cookies provide adequate CSRF protection. No additional CSRF handling needed.

const PUBLIC_PATH_PREFIXES = ['/login', '/forgot-password', '/reset-password', '/health', '/api', '/admin/api']
const SESSION_CHECK_TIMEOUT_MS = 3000
const SESSION_CACHE_TTL_MS = 30_000

// Cache validated sessions so we don't hit the gateway on every single request.
// Key: session cookie value, Value: { user, expiresAt }
const sessionCache = new Map()

function getCachedSession(cookie) {
  const entry = sessionCache.get(cookie)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    sessionCache.delete(cookie)
    return null
  }
  return entry.user
}

function setCachedSession(cookie, user) {
  sessionCache.set(cookie, { user, expiresAt: Date.now() + SESSION_CACHE_TTL_MS })
  // Evict stale entries periodically
  if (sessionCache.size > 100) {
    const now = Date.now()
    for (const [key, val] of sessionCache) {
      if (now > val.expiresAt) sessionCache.delete(key)
    }
  }
}

const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
}

// CSP is now managed by SvelteKit's built-in csp config in svelte.config.js,
// which auto-generates nonces for inline hydration scripts. Do NOT set a manual
// Content-Security-Policy header here — it would override SvelteKit's nonces.

async function resolveWithHeaders(event, resolve, authStatus) {
  const response = await resolve(event)
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value)
  }
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

  // Use cached session to avoid blocking the dev server with gateway round-trips
  const cachedUser = getCachedSession(sessionCookie)
  if (cachedUser) {
    console.log(`[hooks] session cache HIT for ${pathname}`)
    event.locals.user = cachedUser
    return resolveWithHeaders(event, resolve, 'verified')
  }
  console.log(`[hooks] session cache MISS for ${pathname} — checking gateway`)

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
        return resolveWithHeaders(event, resolve, 'degraded')
      }
      if (!body.authenticated) {
        event.cookies.delete('maple_session', { path: '/' })
        sessionCache.delete(sessionCookie)
        throw redirect(307, '/login')
      }
      event.locals.user = body.user ?? null
      setCachedSession(sessionCookie, body.user ?? null)
      return resolveWithHeaders(event, resolve, 'verified')
    } else if (res.status === 401) {
      event.cookies.delete('maple_session', { path: '/' })
      sessionCache.delete(sessionCookie)
      throw redirect(307, '/login')
    }
    return resolveWithHeaders(event, resolve, 'degraded')
  } catch (err) {
    if (err?.status === 307) throw err
  }

  return resolveWithHeaders(event, resolve, 'degraded')
}
