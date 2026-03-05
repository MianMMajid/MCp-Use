import {
  MAPLE_WORKSPACE_DEFAULT_ROUTE,
  MAPLE_WORKSPACE_PATH_PREFIX,
  MAPLE_ROUTE_REGISTRY,
  getMapleRoute,
} from './route-registry.js'

function normalizePathname(pathname) {
  if (typeof pathname !== 'string' || pathname.trim().length === 0) {
    return '/'
  }

  const withoutQuery = pathname.split('?')[0].split('#')[0]
  if (withoutQuery.length > 1 && withoutQuery.endsWith('/')) {
    return withoutQuery.slice(0, -1)
  }

  return withoutQuery
}

export function isMapleWorkspacePath(pathname) {
  const normalized = normalizePathname(pathname)
  return (
    normalized === MAPLE_WORKSPACE_PATH_PREFIX ||
    normalized.startsWith(`${MAPLE_WORKSPACE_PATH_PREFIX}/`)
  )
}

export function resolveActiveMapleRoute(pathname) {
  const normalizedPathname = normalizePathname(pathname)
  const directRoute = getMapleRoute(normalizedPathname)
  if (directRoute) {
    return directRoute
  }

  const byPrefix = MAPLE_ROUTE_REGISTRY.filter((route) =>
    normalizedPathname.startsWith(`${route.path}/`),
  ).sort((a, b) => b.path.length - a.path.length)

  if (byPrefix.length > 0) {
    return byPrefix[0]
  }

  if (!isMapleWorkspacePath(normalizedPathname)) {
    return null
  }

  return getMapleRoute(MAPLE_WORKSPACE_DEFAULT_ROUTE)
}
