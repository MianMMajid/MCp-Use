import { json } from '@sveltejs/kit'
import { getGatewayOrigin } from '$lib/server/origins.js'

const HEALTH_TIMEOUT_MS = 3000

export async function GET() {
  const checks = { frontend: 'ok', gateway: 'unknown' }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS)
    const res = await fetch(`${getGatewayOrigin()}/api/health`, { signal: controller.signal })
    clearTimeout(timeoutId)
    checks.gateway = res.ok ? 'ok' : 'degraded'
  } catch {
    checks.gateway = 'unreachable'
  }

  return json({
    status: checks.gateway === 'ok' ? 'ok' : 'degraded',
    service: 'frontendA-it-console',
    checks,
  })
}
