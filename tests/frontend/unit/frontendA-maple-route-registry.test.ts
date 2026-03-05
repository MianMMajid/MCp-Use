import { describe, expect, it } from 'vitest'

import {
  MAPLE_ROUTE_REGISTRY,
  MAPLE_WORKSPACE_CATEGORIES,
  MAPLE_WORKSPACE_ROUTE_PATHS,
} from '../../../frontend/frontendA-it-console/template-runtime/src/lib/maple-workspace/route-registry.js'
import { allSections } from '../../../frontend/frontendA-it-console/template-runtime/src/lib/docs/allSections.js'

describe('frontend A maple route registry', () => {
  it('includes every mapled docs section route in the registry', () => {
    const discoveredRoutes = Object.keys(allSections)
      .filter((path) => path.startsWith('/maple/'))
      .sort()
    const registryRoutes = new Set(MAPLE_WORKSPACE_ROUTE_PATHS)

    expect(discoveredRoutes.length).toBeGreaterThan(0)

    for (const route of discoveredRoutes) {
      expect(registryRoutes.has(route)).toBe(true)
    }
  })

  it('provides valid category and docs metadata for every route', () => {
    const categoryIds = new Set(MAPLE_WORKSPACE_CATEGORIES.map((category) => category.id))

    for (const route of MAPLE_ROUTE_REGISTRY) {
      expect(route.path.startsWith('/maple/')).toBe(true)
      expect(route.title.length).toBeGreaterThan(0)
      expect(route.tabLabel.length).toBeGreaterThan(0)
      expect(route.description.length).toBeGreaterThan(0)
      expect(categoryIds.has(route.category)).toBe(true)
      expect(Array.isArray(route.anchors)).toBe(true)
      expect(Array.isArray(route.apiEndpoints)).toBe(true)
      expect(Array.isArray(route.legacyDocLinks)).toBe(true)
      expect(typeof route.preferredView).toBe('string')
      expect(Array.isArray(route.legacyAliases)).toBe(true)
      expect(Array.isArray(route.docsViews)).toBe(true)
      expect(route.docsViews.length).toBeGreaterThan(0)
      expect(typeof route.primaryFunction).toBe('string')
      expect(typeof route.docsContextKey).toBe('string')
      expect(typeof route.compatAliasBehavior).toBe('string')
      expect(typeof route.legacyAliasBehavior).toBe('string')
      expect(typeof route.mappedSurface).toBe('object')
      expect(typeof route.mappedSurface.category).toBe('string')
      expect(typeof route.mappedSurface.view).toBe('string')

      for (const endpoint of route.apiEndpoints) {
        expect(endpoint.startsWith('/')).toBe(true)
      }

      for (const link of route.legacyDocLinks) {
        expect(link.label.length).toBeGreaterThan(0)
        expect(link.href.startsWith('/')).toBe(true)
      }
    }
  })
})
