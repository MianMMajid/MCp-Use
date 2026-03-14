import { browser } from '$app/environment';
import { loadJson } from '@/lib/api';

const ACTIVE_ORG_KEY = 'mayple_active_org_id';

function normalizeOrgId(org) {
  return String(org?.orgId || org?.id || '').trim();
}

export async function loadActiveOrgState() {
  const data = await loadJson('/api/org').catch(() => ({ items: [] }));
  const items = Array.isArray(data?.items) ? data.items : [];
  const storedId = browser ? window.sessionStorage.getItem(ACTIVE_ORG_KEY) || '' : '';
  const activeOrg = items.find((item) => normalizeOrgId(item) === storedId) || items[0] || null;
  const activeOrgId = activeOrg ? normalizeOrgId(activeOrg) : '';
  if (browser && activeOrgId) {
    window.sessionStorage.setItem(ACTIVE_ORG_KEY, activeOrgId);
  }
  return { items, activeOrg, activeOrgId };
}

export function setActiveOrgId(orgId) {
  const value = String(orgId || '').trim();
  if (!browser) return value;
  if (value) {
    window.sessionStorage.setItem(ACTIVE_ORG_KEY, value);
  } else {
    window.sessionStorage.removeItem(ACTIVE_ORG_KEY);
  }
  return value;
}
