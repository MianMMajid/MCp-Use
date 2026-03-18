import { json } from '@sveltejs/kit'
import { getGatewayOrigin } from '$lib/server/origins.js'

const HEALTH_TIMEOUT_MS = 3000

async function probeGateway(path) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS)
  try {
    const res = await fetch(`${getGatewayOrigin()}${path}`, { signal: controller.signal })
    clearTimeout(timeoutId)
    return { ok: res.ok, status: res.status, body: await res.json().catch(() => null) }
  } catch {
    clearTimeout(timeoutId)
    return { ok: false, status: 0, body: null }
  }
}

export async function GET() {
  const checks = {
    frontend: 'ok',
    gatewayAlive: 'unknown',
    gatewayReady: 'unknown',
    db: 'unknown',
    dependencies: [],
  }

  const [health, ready] = await Promise.all([
    probeGateway('/api/health'),
    probeGateway('/ready'),
  ])

  // Liveness: is the gateway process running?
  if (health.status === 0) {
    checks.gatewayAlive = 'unreachable'
  } else {
    checks.gatewayAlive = health.ok ? 'ok' : 'degraded'
    checks.db = health.body?.db?.ok ? 'ok' : 'degraded'
  }

  // Readiness: are critical gateway dependencies satisfied?
  if (ready.status === 0) {
    checks.gatewayReady = 'unreachable'
  } else if (ready.ok) {
    checks.gatewayReady = 'ok'
  } else {
    checks.gatewayReady = 'not-ready'
    const failing = ready.body?.failing ?? ready.body?.failingDependencies ?? []
    if (Array.isArray(failing) && failing.length > 0) {
      checks.dependencies = failing.map((d) => typeof d === 'string' ? d : (d.name ?? d.id ?? String(d)))
    }
  }

  const allOk = checks.gatewayAlive === 'ok' && checks.gatewayReady === 'ok'
  const alive = checks.gatewayAlive === 'ok'

  return json({
    status: allOk ? 'ok' : alive ? 'degraded' : 'critical',
    service: 'frontendA-it-console',
    checks,
  })
}
