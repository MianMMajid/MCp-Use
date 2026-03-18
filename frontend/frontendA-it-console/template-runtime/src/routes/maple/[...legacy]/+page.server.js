import { redirect } from '@sveltejs/kit'
import { resolveMapleRedirect } from '../../../lib/maple-workspace/legacy-routing.js'

export function load({ params, url }) {
  const legacyParts = Array.isArray(params.legacy) ? params.legacy : [params.legacy].filter(Boolean)
  const pathname = `/maple/${legacyParts.join('/')}`
  throw redirect(307, resolveMapleRedirect(pathname, url.searchParams))
}
