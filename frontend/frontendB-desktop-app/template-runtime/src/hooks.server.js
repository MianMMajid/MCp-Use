import { redirect } from '@sveltejs/kit';

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

  return resolve(event);
}
