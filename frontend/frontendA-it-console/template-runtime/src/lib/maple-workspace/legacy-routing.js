import {
  MAPLE_WORKSPACE_DEFAULT_ROUTE,
  getMaplePrimaryRouteForCategory,
  getMapleRoute,
  getMapleRouteForLegacyPath,
} from './route-registry.js'

export function normalizeMaplePath(pathname) {
  if (typeof pathname !== 'string' || pathname.trim().length === 0) {
    return '/maple'
  }
  const withoutQuery = pathname.split('?')[0].split('#')[0]
  if (withoutQuery.length > 1 && withoutQuery.endsWith('/')) {
    return withoutQuery.slice(0, -1)
  }
  return withoutQuery
}

export function resolveMapleRedirect(pathname, searchParams) {
  const normalizedPath = normalizeMaplePath(pathname)
  const requestedRoute = searchParams?.get('route') ?? ''
  const requestedCategory = searchParams?.get('category') ?? ''

  if (normalizedPath === '/maple') {
    if (requestedRoute && getMapleRoute(requestedRoute)) {
      return requestedRoute
    }
    if (requestedCategory) {
      const categoryTarget = getMaplePrimaryRouteForCategory(requestedCategory)
      if (categoryTarget) {
        return categoryTarget.path
      }
    }
    return MAPLE_WORKSPACE_DEFAULT_ROUTE
  }

  const directRoute = getMapleRoute(normalizedPath)
  if (directRoute) {
    return directRoute.path
  }

  const legacyRoute = getMapleRouteForLegacyPath(normalizedPath)
  if (legacyRoute) {
    return legacyRoute.path
  }

  return MAPLE_WORKSPACE_DEFAULT_ROUTE
}
