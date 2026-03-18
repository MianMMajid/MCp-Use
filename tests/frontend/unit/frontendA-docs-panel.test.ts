import { describe, expect, it } from 'vitest'

import {
  MAPLE_ROUTE_REGISTRY,
  MAPLE_WORKSPACE_CATEGORIES,
} from '../../../frontend/frontendA-it-console/template-runtime/src/lib/maple-workspace/route-registry.js'
import {
  MAPLE_WORKSPACE_CATEGORY_IDS,
} from '../../../frontend/frontendA-it-console/template-runtime/src/lib/maple-workspace/registry-types.js'
import {
  CATEGORY_PERMISSIONS,
} from '../../../frontend/frontendA-it-console/template-runtime/src/lib/maple-workspace/permissions.js'

describe('frontend A category alignment', () => {
  it('MAPLE_WORKSPACE_CATEGORIES includes every id from MAPLE_WORKSPACE_CATEGORY_IDS', () => {
    const navIds = new Set(MAPLE_WORKSPACE_CATEGORIES.map((c) => c.id))
    for (const id of MAPLE_WORKSPACE_CATEGORY_IDS) {
      expect(navIds.has(id), `"${id}" is in registry-types but missing from route-registry nav list`).toBe(true)
    }
  })

  it('CATEGORY_PERMISSIONS covers every category in MAPLE_WORKSPACE_CATEGORY_IDS', () => {
    for (const id of MAPLE_WORKSPACE_CATEGORY_IDS) {
      expect(id in CATEGORY_PERMISSIONS, `"${id}" is missing from CATEGORY_PERMISSIONS`).toBe(true)
    }
  })

  it('every route category appears in the nav list', () => {
    const navIds = new Set(MAPLE_WORKSPACE_CATEGORIES.map((c) => c.id))
    const routeCategories = new Set(MAPLE_ROUTE_REGISTRY.map((r) => r.category))
    for (const cat of routeCategories) {
      expect(navIds.has(cat), `route category "${cat}" is not navigable`).toBe(true)
    }
  })
})
