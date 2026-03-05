import { describe, expect, it } from 'vitest'

import { getMapleRoute } from '../../../frontend/frontendA-it-console/template-runtime/src/lib/maple-workspace/route-registry.js'
import { docsByPath } from '../../../frontend/frontendA-it-console/template-runtime/src/lib/svelte-docs/content.js'
import {
  parseStoredDocsPanelPreference,
  resolveInitialDocsPanelState,
} from '../../../frontend/frontendA-it-console/template-runtime/src/lib/maple-workspace/docs-panel-preferences.js'

describe('frontend A docs contracts', () => {
  it('keeps route metadata and docs content coverage for observability', () => {
    const routeRecord = getMapleRoute('/maple/observability')
    if (!routeRecord) {
      throw new Error('Missing /maple/observability route metadata.')
    }

    expect(routeRecord.description.length).toBeGreaterThan(0)
    expect(routeRecord.anchors.length).toBeGreaterThan(0)
    expect(routeRecord.apiEndpoints.length).toBeGreaterThan(0)
    expect(routeRecord.legacyDocLinks.length).toBeGreaterThan(0)
    expect(routeRecord.apiEndpoints[0]?.startsWith('/')).toBe(true)

    const overviewDoc = docsByPath['/']
    expect(overviewDoc?.title).toBe('Operations Overview')
    expect(overviewDoc?.sections.length).toBeGreaterThan(0)
    expect(overviewDoc?.summary).toContain('Mayple')
  })

  it('respects desktop/mobile default docs panel state rules', () => {
    expect(resolveInitialDocsPanelState({ storedPreference: undefined, isDesktop: true })).toBe(true)
    expect(resolveInitialDocsPanelState({ storedPreference: undefined, isDesktop: false })).toBe(false)
    expect(resolveInitialDocsPanelState({ storedPreference: true, isDesktop: false })).toBe(true)
    expect(resolveInitialDocsPanelState({ storedPreference: false, isDesktop: true })).toBe(false)

    expect(parseStoredDocsPanelPreference('open')).toBe(true)
    expect(parseStoredDocsPanelPreference('closed')).toBe(false)
    expect(parseStoredDocsPanelPreference('anything-else')).toBeUndefined()
    expect(parseStoredDocsPanelPreference(null)).toBeUndefined()
  })
})
