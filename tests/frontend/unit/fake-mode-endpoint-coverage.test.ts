import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { getHandledRouteManifest as getManifestA } from '../../../frontend/frontendA-it-console/template-runtime/src/lib/fake-mode/handlers.js'
import { getHandledRouteManifest as getManifestB } from '../../../frontend/frontendB-desktop-app/template-runtime/src/lib/fake-mode/handlers.js'

const repoRoot = process.cwd()

function walkFiles(rootDir: string, into: string[] = []): string[] {
  const entries = readdirSync(rootDir)
  for (const name of entries) {
    const full = resolve(rootDir, name)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      walkFiles(full, into)
      continue
    }
    if (!/\.(js|jsx|ts|tsx)$/.test(name)) continue
    into.push(full)
  }
  return into
}

function normalizeEndpoint(raw: string): string {
  let value = raw.trim()
  value = value.replace(/[),;]+$/g, '')
  value = value.replace(/\$\{[^}]+\}/g, ':param')
  value = value.replace(/\?.*$/, '')
  value = value.replace(/\/+/g, '/')
  if (value.length > 1 && value.endsWith('/')) value = value.slice(0, -1)
  return value
}

function collectEndpoints(appRelativeSrcDir: string): string[] {
  const srcDir = resolve(repoRoot, appRelativeSrcDir)
  const files = walkFiles(srcDir)
  const endpoints = new Set<string>()

  for (const file of files) {
    if (file.includes('/lib/fake-mode/')) continue

    const source = readFileSync(file, 'utf8')
    const quoteMatches = source.matchAll(/['"`]((?:\/admin\/api|\/api)\/[^'"`\n\r]*)['"`]/g)

    for (const match of quoteMatches) {
      const endpoint = normalizeEndpoint(match[1])
      if (endpoint.startsWith('/api/') || endpoint.startsWith('/admin/api/')) {
        endpoints.add(endpoint)
      }
    }
  }

  return Array.from(endpoints).sort()
}

function patternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/:[A-Za-z0-9_]+/g, '[^/]+')
  return new RegExp(`^${escaped}$`)
}

function findMissing(endpoints: string[], manifest: string[]): string[] {
  const regexes = manifest.map((pattern) => patternToRegex(pattern))
  return endpoints.filter((endpoint) => !regexes.some((re) => re.test(endpoint)))
}

describe('fake mode endpoint coverage', () => {
  it('frontend A fake handlers cover all discovered /api callsites', () => {
    const endpoints = collectEndpoints('frontend/frontendA-it-console/template-runtime/src')
    const manifest = getManifestA()
    const missing = findMissing(endpoints, manifest)

    expect(endpoints.length).toBeGreaterThan(0)
    expect(missing).toEqual([])
  })

  it('frontend B fake handlers cover all discovered /api callsites', () => {
    const endpoints = collectEndpoints('frontend/frontendB-desktop-app/template-runtime/src')
    const manifest = getManifestB()
    const missing = findMissing(endpoints, manifest)

    expect(endpoints.length).toBeGreaterThan(0)
    expect(missing).toEqual([])
  })
})
