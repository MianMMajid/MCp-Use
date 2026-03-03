import { NextResponse } from 'next/server'

export function proxy(request) {
  const { pathname } = request.nextUrl

  // Marketing site is mostly public - only protect dashboard routes if added later
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
  matcher: ['/dashboard/:path*'],
}
