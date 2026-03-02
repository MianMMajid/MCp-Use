import { NextResponse } from 'next/server'

const publicPaths = ['/login', '/health']

export function middleware(request) {
  const { pathname } = request.nextUrl

  // Allow Next.js internals, API routes, and static assets through
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

  // Allow public routes without session
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
  matcher: ['/((?!_next/static|_next/image).*)'],
}
