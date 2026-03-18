import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '../../../..')
const frontendARoot = resolve(repoRoot, 'frontend/frontendA-it-console/template-runtime')

function readRepoFile(relativePath) {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8')
}

test('frontend A removes stale Next/query-era runtime residue', () => {
  const removedPaths = [
    'src/proxy.js',
    'src/lib/maple-workspace/workspace-state.js',
    'src/lib/svelte-workspace/NotificationCenter.svelte',
    'src/lib/svelte-workspace/UserMenu.svelte',
    'src/lib/svelte-workspace/GlobalSearch.svelte',
    'src/lib/svelte-workspace/MapleShell.svelte',
  ]

  for (const relativePath of removedPaths) {
    assert.equal(
      existsSync(resolve(frontendARoot, relativePath)),
      false,
      `Expected removed legacy runtime file to stay deleted: ${relativePath}`,
    )
  }
})

test('frontend A source filtering is explicit and backend-authoritative fallback text is removed', () => {
  const originFilter = readRepoFile('frontend/frontendA-it-console/template-runtime/src/lib/maple-workspace/origin-filter.js')
  const workspaceViewHost = readRepoFile('frontend/frontendA-it-console/template-runtime/src/lib/svelte-workspace/WorkspaceViewHost.svelte')

  assert.equal(originFilter.includes('filterFrontendBOrigin'), false)
  assert.equal(workspaceViewHost.includes('saved locally for review'), false)
  assert.equal(workspaceViewHost.includes('queued locally'), false)
})

test('frontend B production startup uses adapter-node directly in deploy targets', () => {
  const railwayEntrypoint = readRepoFile('backend/backendA-platform-infra/deploy/railway-entrypoint.sh')
  const k8sDeployment = readRepoFile('backend/backendA-platform-infra/k8s/deployment.yaml')

  assert.match(railwayEntrypoint, /frontendB\)[\s\S]*exec node build/)
  assert.doesNotMatch(railwayEntrypoint, /frontendB\)[\s\S]*exec npm run preview/)
  assert.match(k8sDeployment, /\["node", "frontend\/frontendB-desktop-app\/template-runtime\/build"\]/)
})
