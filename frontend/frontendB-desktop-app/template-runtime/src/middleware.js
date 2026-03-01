import { NextResponse } from 'next/server'

// Routes that do not require authentication
const publicPaths = ['/login', '/register', '/forgot-password', '/reset-password']

export function middleware(request) {
  const { pathname } = request.nextUrl

  // Allow Next.js internals and API routes through
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/favicon') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.jpg') ||
    pathname.endsWith('.ico')
  ) {
    return NextResponse.next()
  }

  // Allow public auth routes without session
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Check for session cookie
  const sessionCookie = request.cookies.get('maple_session')

  if (!sessionCookie?.value) {
    const loginUrl = new URL('/login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files.
     * This ensures middleware runs on page navigations but not on
     * static asset requests that are already handled above.
     */
    '/((?!_next/static|_next/image).*)',
  ],
}
