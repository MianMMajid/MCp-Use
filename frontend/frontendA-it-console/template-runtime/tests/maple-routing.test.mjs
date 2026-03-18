import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveMapleRedirect } from '../src/lib/maple-workspace/legacy-routing.js'
import { MAPLE_WORKSPACE_DEFAULT_ROUTE } from '../src/lib/maple-workspace/route-registry.js'

test('resolveMapleRedirect sends /maple to the canonical default route', () => {
  assert.equal(resolveMapleRedirect('/maple', new URLSearchParams()), MAPLE_WORKSPACE_DEFAULT_ROUTE)
})

test('resolveMapleRedirect preserves explicit canonical route query during migration', () => {
  const searchParams = new URLSearchParams({ route: '/maple/cyber' })
  assert.equal(resolveMapleRedirect('/maple', searchParams), '/maple/cyber')
})

test('resolveMapleRedirect canonicalizes legacy paths to real routes', () => {
  assert.equal(resolveMapleRedirect('/maple/unknown-view', new URLSearchParams()), MAPLE_WORKSPACE_DEFAULT_ROUTE)
  assert.equal(resolveMapleRedirect('/maple/tenants', new URLSearchParams()), '/maple/tenants')
})
