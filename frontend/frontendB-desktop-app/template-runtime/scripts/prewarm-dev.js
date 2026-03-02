#!/usr/bin/env node

/**
 * Pre-warm all routes so they are compiled and cached.
 * Run after the dev server starts: node scripts/prewarm-dev.js
 *
 * Routes are hit in parallel batches for speed.
 */

const PORT = process.env.PORT || 4102
const BASE = `http://localhost:${PORT}`
const BATCH_SIZE = 4

const routes = [
  '/',
  '/events',
  '/sessions',
  '/runs',
  '/firewall',
  '/orders',
  '/modifier-approvals',
  '/modifier-observability',
  '/modifier-ops',
  '/modifier-ops/compliance',
  '/modifier-ops/policy',
  '/tool-registry',
  '/downstream',
  '/diagnostics',
  '/cli-tools',
  '/agent-chat',
  '/community',
  '/demo',
  '/settings',
  '/billing',
  '/usage',
  '/integrations',
  '/organization',
  '/api-keys',
  '/service-accounts',
  '/profile',
  '/admin-console',
]

async function prewarm() {
  console.log(`[prewarm] Warming ${routes.length} routes on ${BASE} (batch size ${BATCH_SIZE})...`)
  const start = Date.now()

  for (let i = 0; i < routes.length; i += BATCH_SIZE) {
    const batch = routes.slice(i, i + BATCH_SIZE)
    const results = await Promise.allSettled(
      batch.map(async (route) => {
        const res = await fetch(`${BASE}${route}`)
        return { status: res.status, route }
      }),
    )
    for (const r of results) {
      if (r.status === 'fulfilled') {
        console.log(`  ${r.value.status} ${r.value.route}`)
      } else {
        console.error(`  FAIL ${r.reason?.message}`)
      }
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1)
  console.log(`[prewarm] Done in ${elapsed}s — all pages cached.`)
}

prewarm()
