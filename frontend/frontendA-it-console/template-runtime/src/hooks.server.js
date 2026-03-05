import { redirect } from '@sveltejs/kit'

const PUBLIC_PATH_PREFIXES = ['/login', '/health', '/api', '/admin/api']

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
    return resolve(event)
  }

  if (!pathname.startsWith('/maple')) {
    return resolve(event)
  }

  const hasSession = Boolean(event.cookies.get('maple_session'))
  if (!hasSession) {
    throw redirect(307, '/login')
  }

  return resolve(event)
}
