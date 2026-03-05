import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { MapleDocsPanel } from '../../../frontend/frontendA-it-console/template-runtime/src/components/workspace/MapleDocsPanel.jsx'
import { getMapleRoute } from '../../../frontend/frontendA-it-console/template-runtime/src/lib/maple-workspace/route-registry.js'
import {
  parseStoredDocsPanelPreference,
  resolveInitialDocsPanelState,
} from '../../../frontend/frontendA-it-console/template-runtime/src/lib/maple-workspace/docs-panel-preferences.js'

describe('frontend A docs panel', () => {
  it('renders route summary, section anchors, endpoints, and legacy docs links', () => {
    const routeRecord = getMapleRoute('/maple/observability')
    if (!routeRecord) {
      throw new Error('Missing /maple/observability route metadata.')
    }

    render(
      React.createElement(MapleDocsPanel, {
        isDesktop: true,
        isOpen: true,
        routeRecord,
        onClose: vi.fn(),
      }),
    )

    expect(screen.getByRole('heading', { name: 'Context Docs' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'A/B Role Split' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Route Summary' })).toBeInTheDocument()
    expect(screen.getByText(routeRecord.description)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Section Anchors' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'API Endpoints' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Legacy Docs' })).toBeInTheDocument()

    const firstEndpoint = routeRecord.apiEndpoints[0]
    if (firstEndpoint) {
      expect(screen.getByText(firstEndpoint)).toBeInTheDocument()
    }

    const firstAnchor = routeRecord.anchors[0]
    if (firstAnchor) {
      expect(screen.getByRole('link', { name: firstAnchor.title })).toHaveAttribute(
        'href',
        `${routeRecord.path}#${firstAnchor.id}`,
      )
    }
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
