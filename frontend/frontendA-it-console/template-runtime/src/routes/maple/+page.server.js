import { redirect } from '@sveltejs/kit'
import { resolveMapleRedirect } from '../../lib/maple-workspace/legacy-routing.js'

export function load({ url }) {
  throw redirect(307, resolveMapleRedirect(url.pathname, url.searchParams))
}
