import { NextResponse } from 'next/server'

const inKubernetes = Boolean(process.env.KUBERNETES_SERVICE_HOST)

const mapleGatewayOrigin =
  process.env.MAPLE_GATEWAY_ORIGIN ||
  (inKubernetes ? 'https://gateway-api:3000' : 'http://127.0.0.1:3000')

function resolveAdminConsoleOrigin() {
  if (process.env.MAPLE_ADMIN_CONSOLE_ORIGIN) return process.env.MAPLE_ADMIN_CONSOLE_ORIGIN
  if (inKubernetes) return 'https://admin-console-api:9443'
  try {
    const parsed = new URL(mapleGatewayOrigin)
    return `${parsed.protocol}//${parsed.hostname}:4001`
  } catch {
    return 'http://127.0.0.1:4001'
  }
}

const mapleAdminConsoleOrigin = resolveAdminConsoleOrigin()

export function proxy(request) {
  const { pathname } = request.nextUrl

  // Proxy /api/* to gateway with trace ID injection
  if (pathname.startsWith('/api/') || pathname === '/api') {
    const target = new URL(pathname + request.nextUrl.search, mapleGatewayOrigin)
    const headers = new Headers(request.headers)
    headers.set('x-maple-trace-id', crypto.randomUUID())
    return NextResponse.rewrite(target, { request: { headers } })
  }

  // Proxy /admin/api/* to admin console with trace ID injection
  if (pathname.startsWith('/admin/api/') || pathname === '/admin/api') {
    const target = new URL(pathname + request.nextUrl.search, mapleAdminConsoleOrigin)
    const headers = new Headers(request.headers)
    headers.set('x-maple-trace-id', crypto.randomUUID())
    return NextResponse.rewrite(target, { request: { headers } })
  }

  // Marketing site is mostly public - only protect dashboard routes
  const protectedPaths = ['/dashboard']
  const isProtected = protectedPaths.some((p) => pathname.startsWith(p))

  if (!isProtected) {
    return NextResponse.next()
  }

  const session = request.cookies.get('maple_session')
  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
}
