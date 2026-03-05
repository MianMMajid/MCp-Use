import { readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  MAPLE_ROUTE_REGISTRY,
  MAPLE_WORKSPACE_CATEGORIES,
  MAPLE_WORKSPACE_ROUTE_PATHS,
} from '../../../frontend/frontendA-it-console/template-runtime/src/lib/maple-workspace/route-registry.js'

const repoRoot = process.cwd()
const mapleAppRoot = resolve(
  repoRoot,
  'frontend/frontendA-it-console/template-runtime/src/app/maple',
)

function collectMaplePageRoutes(dir: string, prefix = '/maple'): string[] {
  const entries = readdirSync(dir)
  const routes: string[] = []

  for (const entry of entries) {
    const absolutePath = resolve(dir, entry)
    const isDirectory = statSync(absolutePath).isDirectory()

    if (!isDirectory) {
      continue
    }

    const jsxPage = resolve(absolutePath, 'page.jsx')
    const mdxPage = resolve(absolutePath, 'page.mdx')
    const hasPageFile = [jsxPage, mdxPage].some((pageFile) => {
      try {
        return statSync(pageFile).isFile()
      } catch {
        return false
      }
    })

    const routePath = `${prefix}/${entry}`
    const isDynamicRoute = entry.includes('[')
    if (hasPageFile) {
      if (!isDynamicRoute) {
        routes.push(routePath)
      }
    }

    routes.push(...collectMaplePageRoutes(absolutePath, routePath))
  }

  return routes
}

describe('frontend A maple route registry', () => {
  it('includes every mapled route page in the registry', () => {
    const discoveredRoutes = Array.from(new Set(collectMaplePageRoutes(mapleAppRoot))).sort()
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
