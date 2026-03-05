import { redirect } from '@sveltejs/kit'

const DEFAULT_MAPLE_CHAT_HREF =
  '/maple?category=chat&view=chat&route=%2Fmaple%2Fobservability'

export function load() {
  throw redirect(307, DEFAULT_MAPLE_CHAT_HREF)
}
