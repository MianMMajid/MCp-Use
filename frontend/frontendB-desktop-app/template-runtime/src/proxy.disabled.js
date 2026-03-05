import { NextResponse } from 'next/server'

// Routes that do not require authentication
const publicPaths = ['/login', '/register', '/forgot-password', '/reset-password']

export function proxy(request) {
  const { pathname } = request.nextUrl

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
    '/((?!_next/static|_next/image|api/|favicon|.*\\.(?:svg|png|jpg|ico|webp)$).*)',
  ],
}
