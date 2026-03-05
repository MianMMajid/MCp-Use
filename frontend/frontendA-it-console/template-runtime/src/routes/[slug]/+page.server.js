import { error } from '@sveltejs/kit'
import { docsBySlug } from '$lib/svelte-docs/content.js'

const RESERVED_SLUGS = new Set(['maple', 'login', 'health', 'api', 'admin'])

export function load({ params }) {
  const slug = String(params.slug ?? '')
  if (RESERVED_SLUGS.has(slug)) {
    throw error(404, 'Not found')
  }

  const doc = docsBySlug[slug]
  if (!doc) {
    throw error(404, 'Not found')
  }
  return { doc }
}
