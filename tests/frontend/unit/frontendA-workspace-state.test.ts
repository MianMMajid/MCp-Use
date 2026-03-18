import { describe, expect, it } from 'vitest'

import {
  buildWorkspaceHref,
  isMapleWorkspacePath,
  normalizeWorkspaceCategory,
  normalizeWorkspacePath,
  normalizeWorkspaceView,
  resolveLegacyRoute,
  resolveWorkspaceState,
  MAPLE_WORKSPACE_DEFAULT_CATEGORY,
  MAPLE_WORKSPACE_DEFAULT_VIEW,
  MAPLE_WORKSPACE_CATEGORY_VIEWS,
} from '../../../frontend/frontendA-it-console/template-runtime/src/lib/maple-workspace/workspace-state.js'

// ---------------------------------------------------------------------------
// normalizeWorkspacePath
// ---------------------------------------------------------------------------
describe('normalizeWorkspacePath', () => {
  it('strips trailing slashes', () => {
    expect(normalizeWorkspacePath('/maple/')).toBe('/maple')
    expect(normalizeWorkspacePath('/maple/audit/')).toBe('/maple/audit')
  })

  it('preserves root slash', () => {
    expect(normalizeWorkspacePath('/')).toBe('/')
  })

  it('strips query and hash', () => {
    expect(normalizeWorkspacePath('/maple?foo=1')).toBe('/maple')
    expect(normalizeWorkspacePath('/maple#section')).toBe('/maple')
    expect(normalizeWorkspacePath('/maple?foo=1#bar')).toBe('/maple')
  })

  it('returns "/" for empty/null/undefined input', () => {
    expect(normalizeWorkspacePath('')).toBe('/')
    expect(normalizeWorkspacePath('   ')).toBe('/')
    expect(normalizeWorkspacePath(null as any)).toBe('/')
    expect(normalizeWorkspacePath(undefined as any)).toBe('/')
  })

  it('passes through clean paths unchanged', () => {
    expect(normalizeWorkspacePath('/maple/observability')).toBe('/maple/observability')
  })
})

// ---------------------------------------------------------------------------
// normalizeWorkspaceCategory
// ---------------------------------------------------------------------------
describe('normalizeWorkspaceCategory', () => {
  it('returns the category as-is for known categories', () => {
    expect(normalizeWorkspaceCategory('observe')).toBe('observe')
    expect(normalizeWorkspaceCategory('chat')).toBe('chat')
    expect(normalizeWorkspaceCategory('admin')).toBe('admin')
    expect(normalizeWorkspaceCategory('firewalls')).toBe('firewalls')
    expect(normalizeWorkspaceCategory('users')).toBe('users')
    expect(normalizeWorkspaceCategory('docs')).toBe('docs')
  })

  it('resolves category aliases', () => {
    expect(normalizeWorkspaceCategory('monitor')).toBe('observe')
    expect(normalizeWorkspaceCategory('opschat')).toBe('chat')
    expect(normalizeWorkspaceCategory('analyze')).toBe('admin')
    expect(normalizeWorkspaceCategory('intervene')).toBe('admin')
    expect(normalizeWorkspaceCategory('govern')).toBe('admin')
    expect(normalizeWorkspaceCategory('system')).toBe('admin')
    expect(normalizeWorkspaceCategory('firewall')).toBe('firewalls')
    expect(normalizeWorkspaceCategory('user')).toBe('users')
  })

  it('is case-insensitive', () => {
    expect(normalizeWorkspaceCategory('OBSERVE')).toBe('observe')
    expect(normalizeWorkspaceCategory('Monitor')).toBe('observe')
    expect(normalizeWorkspaceCategory('FIREWALLS')).toBe('firewalls')
  })

  it('falls back to default for unknown categories', () => {
    expect(normalizeWorkspaceCategory('unknown')).toBe(MAPLE_WORKSPACE_DEFAULT_CATEGORY)
    expect(normalizeWorkspaceCategory('')).toBe(MAPLE_WORKSPACE_DEFAULT_CATEGORY)
  })

  it('falls back to default for non-string input', () => {
    expect(normalizeWorkspaceCategory(null as any)).toBe(MAPLE_WORKSPACE_DEFAULT_CATEGORY)
    expect(normalizeWorkspaceCategory(undefined as any)).toBe(MAPLE_WORKSPACE_DEFAULT_CATEGORY)
    expect(normalizeWorkspaceCategory(42 as any)).toBe(MAPLE_WORKSPACE_DEFAULT_CATEGORY)
  })
})

// ---------------------------------------------------------------------------
// normalizeWorkspaceView
// ---------------------------------------------------------------------------
describe('normalizeWorkspaceView', () => {
  it('returns valid views for their category', () => {
    expect(normalizeWorkspaceView('observe', 'topology')).toBe('topology')
    expect(normalizeWorkspaceView('observe', 'live')).toBe('live')
    expect(normalizeWorkspaceView('observe', 'timeline')).toBe('timeline')
    expect(normalizeWorkspaceView('chat', 'chat')).toBe('chat')
    expect(normalizeWorkspaceView('firewalls', 'cybersecurity')).toBe('cybersecurity')
    expect(normalizeWorkspaceView('firewalls', 'rules')).toBe('rules')
  })

  it('resolves view aliases', () => {
    expect(normalizeWorkspaceView('admin', 'guard')).toBe('control')
    expect(normalizeWorkspaceView('admin', 'integrations')).toBe('marketplace')
    expect(normalizeWorkspaceView('admin', 'settings')).toBe('control')
    expect(normalizeWorkspaceView('firewalls', 'leakage')).toBe('context-leakage')
    expect(normalizeWorkspaceView('observe', 'actionforks')).toBe('forks')
  })

  it('falls back to first view for unknown view', () => {
    const firstObserve = MAPLE_WORKSPACE_CATEGORY_VIEWS.observe[0]
    expect(normalizeWorkspaceView('observe', 'nonexistent')).toBe(firstObserve)
  })

  it('falls back to first view for null/undefined view', () => {
    const firstObserve = MAPLE_WORKSPACE_CATEGORY_VIEWS.observe[0]
    expect(normalizeWorkspaceView('observe', null as any)).toBe(firstObserve)
    expect(normalizeWorkspaceView('observe', undefined as any)).toBe(firstObserve)
  })

  it('normalizes category before looking up views', () => {
    // 'monitor' alias → observe, then 'live' is valid for observe
    expect(normalizeWorkspaceView('monitor', 'live')).toBe('live')
  })
})

// ---------------------------------------------------------------------------
// resolveLegacyRoute
// ---------------------------------------------------------------------------
describe('resolveLegacyRoute', () => {
  it('resolves special legacy redirects', () => {
    // /maple/policies and /maple/runtime now render at their own routes
    expect(resolveLegacyRoute('/maple/policies')).toBe('/maple/policies')
    expect(resolveLegacyRoute('/maple/runtime')).toBe('/maple/runtime')
    // /maple/tenants remains a governance-context redirect
    expect(resolveLegacyRoute('/maple/tenants')).toBe('/maple/audit')
  })

  it('returns the path itself for known routes', () => {
    expect(resolveLegacyRoute('/maple/observability')).toBe('/maple/observability')
    expect(resolveLegacyRoute('/maple/gateway')).toBe('/maple/gateway')
    expect(resolveLegacyRoute('/maple/audit')).toBe('/maple/audit')
  })

  it('returns default route for unknown paths', () => {
    expect(resolveLegacyRoute('/maple/unknown-page')).toBe('/maple/observability')
    expect(resolveLegacyRoute('/totally-random')).toBe('/maple/observability')
  })

  it('handles trailing slashes', () => {
    expect(resolveLegacyRoute('/maple/policies/')).toBe('/maple/policies')
    expect(resolveLegacyRoute('/maple/tenants/')).toBe('/maple/audit')
  })
})

// ---------------------------------------------------------------------------
// isMapleWorkspacePath
// ---------------------------------------------------------------------------
describe('isMapleWorkspacePath', () => {
  it('returns true for /maple and /maple/* paths', () => {
    expect(isMapleWorkspacePath('/maple')).toBe(true)
    expect(isMapleWorkspacePath('/maple/observability')).toBe(true)
    expect(isMapleWorkspacePath('/maple/audit')).toBe(true)
    expect(isMapleWorkspacePath('/maple/')).toBe(true)
  })

  it('returns false for non-maple paths', () => {
    expect(isMapleWorkspacePath('/')).toBe(false)
    expect(isMapleWorkspacePath('/login')).toBe(false)
    expect(isMapleWorkspacePath('/maplewood')).toBe(false)
  })

  it('handles edge cases', () => {
    expect(isMapleWorkspacePath('')).toBe(false)
    expect(isMapleWorkspacePath(null as any)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// resolveWorkspaceState
// ---------------------------------------------------------------------------
describe('resolveWorkspaceState', () => {
  it('resolves canonical path with query params', () => {
    const state = resolveWorkspaceState({
      pathname: '/maple',
      searchParams: new URLSearchParams('category=observe&view=timeline&route=/maple/runs'),
    })
    expect(state.category).toBe('observe')
    expect(state.view).toBe('timeline')
    expect(state.routePath).toBe('/maple/runs')
    expect(state.isCanonicalPath).toBe(true)
  })

  it('resolves root "/" as canonical path', () => {
    const state = resolveWorkspaceState({
      pathname: '/',
      searchParams: new URLSearchParams('route=/maple/gateway'),
    })
    expect(state.isCanonicalPath).toBe(true)
    expect(state.routePath).toBe('/maple/gateway')
  })

  it('resolves /maple/runtime as its own registered route', () => {
    const runtimeState = resolveWorkspaceState({
      pathname: '/maple/runtime',
      searchParams: new URLSearchParams(),
    })
    expect(runtimeState.routePath).toBe('/maple/runtime')
    expect(runtimeState.category).toBe('admin')
    expect(runtimeState.isCanonicalPath).toBe(false)
  })

  it('resolves /maple/policies as its own registered route', () => {
    const state = resolveWorkspaceState({
      pathname: '/maple/policies',
      searchParams: new URLSearchParams(),
    })
    expect(state.routePath).toBe('/maple/policies')
  })

  it('preserves executionId and sessionId from query', () => {
    const state = resolveWorkspaceState({
      pathname: '/maple',
      searchParams: new URLSearchParams('route=/maple/audit&executionId=exec-7&sessionId=sess-2'),
    })
    expect(state.executionId).toBe('exec-7')
    expect(state.sessionId).toBe('sess-2')
  })

  it('defaults executionId and sessionId to empty string', () => {
    const state = resolveWorkspaceState({
      pathname: '/maple',
      searchParams: new URLSearchParams('route=/maple/audit'),
    })
    expect(state.executionId).toBe('')
    expect(state.sessionId).toBe('')
  })

  it('uses default route when no route param on canonical path', () => {
    const state = resolveWorkspaceState({
      pathname: '/maple',
      searchParams: new URLSearchParams(),
    })
    expect(state.routePath).toBe('/maple/observability')
  })

  it('uses route category and preferred view when no query params', () => {
    const state = resolveWorkspaceState({
      pathname: '/maple/gateway',
      searchParams: new URLSearchParams(),
    })
    expect(state.category).toBe('firewalls')
    expect(state.routePath).toBe('/maple/gateway')
  })

  it('handles null searchParams', () => {
    const state = resolveWorkspaceState({
      pathname: '/maple/observability',
      searchParams: null,
    })
    expect(state.routePath).toBe('/maple/observability')
    expect(state.executionId).toBe('')
    expect(state.sessionId).toBe('')
  })

  it('preserves legacy analyze+topology → observe+topology mapping', () => {
    const state = resolveWorkspaceState({
      pathname: '/maple',
      searchParams: new URLSearchParams('category=analyze&view=topology&route=/maple/observability'),
    })
    expect(state.category).toBe('observe')
    expect(state.view).toBe('topology')
  })

  it('preserves legacy monitor+chat → chat+chat mapping', () => {
    const state = resolveWorkspaceState({
      pathname: '/maple',
      searchParams: new URLSearchParams('category=monitor&view=chat&route=/maple/observability'),
    })
    expect(state.category).toBe('chat')
    expect(state.view).toBe('chat')
  })

  it('resolves docs category with valid views', () => {
    const state = resolveWorkspaceState({
      pathname: '/maple',
      searchParams: new URLSearchParams('category=docs&view=runbooks&route=/maple/audit'),
    })
    expect(state.category).toBe('docs')
    expect(state.view).toBe('runbooks')
  })

  it('returns routeRecord for known routes', () => {
    const state = resolveWorkspaceState({
      pathname: '/maple/audit',
      searchParams: new URLSearchParams(),
    })
    expect(state.routeRecord).toBeTruthy()
    expect(state.routeRecord?.path).toBe('/maple/audit')
    expect(state.routeRecord?.title).toBe('Audit + Traces')
  })

  it('returns fallback routeRecord for unknown paths', () => {
    const state = resolveWorkspaceState({
      pathname: '/maple/nonexistent',
      searchParams: new URLSearchParams(),
    })
    expect(state.routeRecord).toBeTruthy()
    expect(state.routePath).toBe('/maple/observability')
  })
})

// ---------------------------------------------------------------------------
// buildWorkspaceHref
// ---------------------------------------------------------------------------
describe('buildWorkspaceHref', () => {
  it('builds href with all parameters', () => {
    const href = buildWorkspaceHref({
      category: 'observe',
      view: 'timeline',
      routePath: '/maple/runs',
      executionId: 'exec-1',
      sessionId: 'sess-1',
    })
    expect(href).toContain('/maple?')
    expect(href).toContain('category=observe')
    expect(href).toContain('view=timeline')
    expect(href).toContain('route=%2Fmaple%2Fruns')
    expect(href).toContain('executionId=exec-1')
    expect(href).toContain('sessionId=sess-1')
  })

  it('omits executionId and sessionId when empty', () => {
    const href = buildWorkspaceHref({
      category: 'observe',
      view: 'live',
      routePath: '/maple/observability',
    })
    expect(href).not.toContain('executionId')
    expect(href).not.toContain('sessionId')
  })

  it('normalizes category aliases in href', () => {
    const href = buildWorkspaceHref({
      category: 'monitor',
      view: 'live',
      routePath: '/maple/observability',
    })
    expect(href).toContain('category=observe')
  })

  it('normalizes view aliases in href', () => {
    const href = buildWorkspaceHref({
      category: 'admin',
      view: 'guard',
      routePath: '/maple/audit',
    })
    expect(href).toContain('view=control')
  })

  it('uses default route when routePath is empty', () => {
    const href = buildWorkspaceHref({
      category: 'observe',
      view: 'live',
      routePath: '',
    })
    expect(href).toContain('route=%2Fmaple%2Fobservability')
  })

  it('starts with /maple?', () => {
    const href = buildWorkspaceHref({
      category: 'chat',
      view: 'chat',
      routePath: '/maple/observability',
    })
    expect(href.startsWith('/maple?')).toBe(true)
  })
})
