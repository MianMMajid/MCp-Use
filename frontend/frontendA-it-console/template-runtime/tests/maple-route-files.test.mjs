import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { MAPLE_WORKSPACE_ROUTE_PATHS } from '../src/lib/maple-workspace/route-registry.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const routesDir = resolve(__dirname, '../src/routes')

function routePathToFile(routePath) {
  return resolve(routesDir, routePath.replace('/maple/', 'maple/') + '/+page.svelte')
}

test('every canonical frontend A Maple route has a real Svelte route file', () => {
  const missing = MAPLE_WORKSPACE_ROUTE_PATHS.filter((routePath) => !existsSync(routePathToFile(routePath)))
  assert.deepEqual(missing, [])
})
