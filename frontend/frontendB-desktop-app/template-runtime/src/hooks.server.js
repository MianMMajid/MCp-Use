import { redirect } from '@sveltejs/kit';

/** @type {import('@sveltejs/kit').HandleServerError} */
export function handleError({ error, event, status, message }) {
  const id = crypto.randomUUID();
  if (status !== 404) {
    console.error(`[error:${id}] ${event.request.method} ${event.url.pathname} -> ${status}`, error);
  }
  return { message, id };
}

const AUTH_ROUTES = new Set(['/login', '/register', '/forgot-password', '/reset-password', '/verify-email']);
const PUBLIC_PREFIXES = ['/api/', '/admin/api/', '/health'];

function hasSessionCookie(cookieHeader) {
  if (!cookieHeader) return false;
  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .some((part) => part.startsWith('maple_session='));
}

function isPublicPath(pathname) {
  if (AUTH_ROUTES.has(pathname)) return true;
  if (pathname === '/favicon.ico') return true;
  if (pathname.startsWith('/_app/')) return true;
  if (pathname.startsWith('/static/')) return true;
  if (pathname.startsWith('/events/') || pathname.startsWith('/flags/') || pathname.startsWith('/teams/') || pathname.startsWith('/users/')) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function legacyRedirect(url) {
  const pathname = url.pathname;

  if (pathname === '/runs') {
    return '/?mode=orchestration';
  }

  const runMatch = pathname.match(/^\/runs\/([^/]+)$/);
  if (runMatch) {
    const target = new URL('/?mode=orchestration', url.origin);
    target.searchParams.set('executionId', runMatch[1]);
    target.searchParams.set('panel', 'timeline');
    return `${target.pathname}?${target.searchParams.toString()}`;
  }

  return null;
}

export async function handle({ event, resolve }) {
  const redirectTarget = legacyRedirect(event.url);
  if (redirectTarget) {
    throw redirect(307, redirectTarget);
  }

  const pathname = event.url.pathname;
  const hasSession = hasSessionCookie(event.request.headers.get('cookie'));

  if (AUTH_ROUTES.has(pathname) && hasSession) {
    throw redirect(307, '/');
  }

  if (!isPublicPath(pathname) && !hasSession) {
    throw redirect(307, '/login');
  }

  const response = await resolve(event);

  // Security headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  if (event.url.protocol === 'https:') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // Skip CSP and frame options on streaming/SSE paths to avoid buffering issues
  const isStreaming = pathname.startsWith('/api/') && (
    pathname.includes('/stream') || pathname.includes('/sse') || pathname.includes('/events')
  );
  if (!isStreaming) {
    response.headers.set('X-Frame-Options', 'SAMEORIGIN');
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    response.headers.set(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self' data:; frame-ancestors 'self'"
    );
  }

  return response;
}
