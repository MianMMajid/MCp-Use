import { describe, expect, it } from 'vitest'

import {
  buildWorkspaceHref,
  resolveWorkspaceState,
} from '../../../frontend/frontendA-it-console/template-runtime/src/lib/maple-workspace/workspace-state.js'

describe('frontend A workspace state resolver', () => {
  it('maps legacy runtime and policies paths to canonical workspace state', () => {
    const runtimeState = resolveWorkspaceState({
      pathname: '/maple/runtime',
      searchParams: new URLSearchParams(),
    })
    expect(runtimeState.routePath).toBe('/maple/observability')
    expect(runtimeState.category).toBe('observe')
    expect(runtimeState.view).toBe('live')

    const policiesState = resolveWorkspaceState({
      pathname: '/maple/policies',
      searchParams: new URLSearchParams(),
    })
    expect(policiesState.routePath).toBe('/maple/audit')
    expect(policiesState.category).toBe('analyze')
    expect(policiesState.view).toBe('control')
  })

  it('parses canonical query parameters and preserves execution/session target', () => {
    const state = resolveWorkspaceState({
      pathname: '/maple',
      searchParams: new URLSearchParams(
        'category=docs&view=runbooks&route=/maple/audit&executionId=exec-7&sessionId=sess-2',
      ),
    })
    expect(state.category).toBe('docs')
    expect(state.view).toBe('runbooks')
    expect(state.routePath).toBe('/maple/audit')
    expect(state.executionId).toBe('exec-7')
    expect(state.sessionId).toBe('sess-2')
  })

  it('builds canonical href with required and optional values', () => {
    const href = buildWorkspaceHref({
      category: 'analyze',
      view: 'control',
      routePath: '/maple/audit',
      executionId: 'exec-1',
      sessionId: 'sess-1',
    })

    expect(href).toContain('/maple?')
    expect(href).toContain('category=analyze')
    expect(href).toContain('view=control')
    expect(href).toContain('route=%2Fmaple%2Faudit')
    expect(href).toContain('executionId=exec-1')
    expect(href).toContain('sessionId=sess-1')
  })
})
