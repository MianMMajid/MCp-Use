import { redirect } from '@sveltejs/kit';

export function load({ params }) {
  throw redirect(307, `/?mode=orchestration&executionId=${params.id}&panel=timeline`);
}
