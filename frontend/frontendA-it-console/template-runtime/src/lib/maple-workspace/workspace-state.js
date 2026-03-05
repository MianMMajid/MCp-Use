import {
  MAPLE_WORKSPACE_DEFAULT_ROUTE,
  MAPLE_WORKSPACE_PATH_PREFIX,
  getMapleRoute,
} from './route-registry.js'

export const MAPLE_WORKSPACE_DEFAULT_CATEGORY = 'observe'
export const MAPLE_WORKSPACE_DEFAULT_VIEW = 'live'

export const MAPLE_WORKSPACE_CATEGORY_VIEWS = Object.freeze({
  observe: Object.freeze(['live', 'timeline']),
  analyze: Object.freeze(['control', 'topology']),
  govern: Object.freeze(['guard', 'fork']),
  admin: Object.freeze(['settings', 'policy', 'marketplace']),
  docs: Object.freeze(['overview', 'api', 'runbooks', 'route-help']),
})

const SPECIAL_LEGACY_ROUTE_TARGETS = Object.freeze({
  '/maple/policies': '/maple/audit',
  '/maple/runtime': '/maple/observability',
  '/maple/tenants': '/maple/audit',
})

export function normalizeWorkspacePath(pathname) {
  if (typeof pathname !== 'string' || pathname.trim().length === 0) {
    return '/'
  }

  const withoutQuery = pathname.split('?')[0].split('#')[0]
  if (withoutQuery.length > 1 && withoutQuery.endsWith('/')) {
    return withoutQuery.slice(0, -1)
  }
  return withoutQuery
}

export function normalizeWorkspaceCategory(value) {
  if (typeof value !== 'string') {
    return MAPLE_WORKSPACE_DEFAULT_CATEGORY
  }
  return value in MAPLE_WORKSPACE_CATEGORY_VIEWS
    ? value
    : MAPLE_WORKSPACE_DEFAULT_CATEGORY
}

export function normalizeWorkspaceView(category, value) {
  const normalizedCategory = normalizeWorkspaceCategory(category)
  const views = MAPLE_WORKSPACE_CATEGORY_VIEWS[normalizedCategory]
  if (typeof value === 'string' && views.includes(value)) {
    return value
  }
  return views[0]
}

export function resolveLegacyRoute(pathname) {
  const normalizedPathname = normalizeWorkspacePath(pathname)
  if (SPECIAL_LEGACY_ROUTE_TARGETS[normalizedPathname]) {
    return SPECIAL_LEGACY_ROUTE_TARGETS[normalizedPathname]
  }
  if (getMapleRoute(normalizedPathname)) {
    return normalizedPathname
  }
  return MAPLE_WORKSPACE_DEFAULT_ROUTE
}

export function getWorkspaceCategoryForRoute(routeRecord) {
  if (!routeRecord) {
    return MAPLE_WORKSPACE_DEFAULT_CATEGORY
  }
  return routeRecord.category
}

export function getWorkspaceViewForRoute(routeRecord) {
  if (!routeRecord) {
    return MAPLE_WORKSPACE_DEFAULT_VIEW
  }
  return normalizeWorkspaceView(
    routeRecord.category,
    routeRecord.preferredView ?? MAPLE_WORKSPACE_DEFAULT_VIEW,
  )
}

/**
 * @param {{ pathname: string, searchParams?: URLSearchParams | null }} params
 */
export function resolveWorkspaceState({ pathname, searchParams }) {
  const normalizedPathname = normalizeWorkspacePath(pathname)
  const isCanonicalPath = normalizedPathname === MAPLE_WORKSPACE_PATH_PREFIX
  const resolvedRoutePath = isCanonicalPath
    ? searchParams?.get('route') ?? MAPLE_WORKSPACE_DEFAULT_ROUTE
    : resolveLegacyRoute(normalizedPathname)
  const routeRecord = getMapleRoute(resolvedRoutePath) ?? getMapleRoute(MAPLE_WORKSPACE_DEFAULT_ROUTE)

  const categoryFromQuery = searchParams?.get('category')
  const viewFromQuery = searchParams?.get('view')
  const executionId = searchParams?.get('executionId') ?? ''
  const sessionId = searchParams?.get('sessionId') ?? ''

  const category = categoryFromQuery
    ? normalizeWorkspaceCategory(categoryFromQuery)
    : getWorkspaceCategoryForRoute(routeRecord)
  const view = viewFromQuery
    ? normalizeWorkspaceView(category, viewFromQuery)
    : category === 'docs'
      ? 'route-help'
      : getWorkspaceViewForRoute(routeRecord)

  return {
    category,
    view,
    routePath: routeRecord?.path ?? MAPLE_WORKSPACE_DEFAULT_ROUTE,
    routeRecord,
    executionId,
    sessionId,
    isCanonicalPath,
    normalizedPathname,
  }
}

/**
 * @param {{
 *  category: string
 *  view: string
 *  routePath: string
 *  executionId?: string
 *  sessionId?: string
 * }} state
 */
export function buildWorkspaceHref(state) {
  const params = new URLSearchParams()
  params.set('category', normalizeWorkspaceCategory(state.category))
  params.set('view', normalizeWorkspaceView(state.category, state.view))
  params.set('route', state.routePath || MAPLE_WORKSPACE_DEFAULT_ROUTE)
  if (state.executionId) {
    params.set('executionId', state.executionId)
  }
  if (state.sessionId) {
    params.set('sessionId', state.sessionId)
  }
  return `${MAPLE_WORKSPACE_PATH_PREFIX}?${params.toString()}`
}

export function isMapleWorkspacePath(pathname) {
  const normalized = normalizeWorkspacePath(pathname)
  return normalized === MAPLE_WORKSPACE_PATH_PREFIX || normalized.startsWith(`${MAPLE_WORKSPACE_PATH_PREFIX}/`)
}
