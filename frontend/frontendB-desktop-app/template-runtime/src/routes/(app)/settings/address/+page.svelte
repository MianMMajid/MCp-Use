<script>
  import { onMount } from 'svelte';
  import AppShell from '@/lib/components/AppShell.svelte';
  import { patchJson, invalidateCache } from '@/lib/api';
  import { getCountries } from '@/data';
  import { loadActiveOrgState, setActiveOrgId } from '@/lib/active-org';

  const countries = getCountries();
  let loading = true;
  let saving = false;
  let message = '';
  let messageType = 'success';
  let orgId = '';
  let orgs = [];

  function codeForCountry(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return countries[0]?.code || '';
    const match = countries.find((item) =>
      item.code.toLowerCase() === normalized || item.name.toLowerCase() === normalized,
    );
    return match?.code || countries[0]?.code || '';
  }

  let selectedCountryCode = countries[0]?.code || '';
  $: selectedCountry = countries.find((item) => item.code === selectedCountryCode) || countries[0];
  $: if (selectedCountry && !selectedCountry.regions.includes(region)) {
    region = selectedCountry.regions[0] || '';
  }
  let region = selectedCountry?.regions?.[0] || '';

  let address = '';
  let city = '';
  let postal = '';

  function applyOrg(org) {
    selectedCountryCode = codeForCountry(org?.country);
    address = org?.address || '';
    city = org?.city || '';
    region = org?.region || selectedCountry?.regions?.[0] || '';
    postal = org?.postal_code || '';
  }

  onMount(async () => {
    loading = true;
    try {
      const orgState = await loadActiveOrgState().catch(() => ({ items: [], activeOrg: null, activeOrgId: '' }));
      orgs = orgState.items || [];
      orgId = orgState.activeOrgId || '';
      applyOrg(orgState.activeOrg);
    } finally {
      loading = false;
    }
  });

  function changeOrg(nextOrgId) {
    orgId = setActiveOrgId(nextOrgId);
    applyOrg(orgs.find((item) => String(item.orgId || item.id) === String(orgId)));
    message = '';
  }

  async function save(event) {
    event.preventDefault();
    if (!orgId) return;
    saving = true;
    message = '';
    try {
      const response = await patchJson(`/api/org/${orgId}`, {
        address,
        city,
        region,
        postal_code: postal,
        country: selectedCountry?.name || '',
      });
      if (!response.ok) throw new Error(`Save failed (${response.status})`);
      invalidateCache('/api/org');
      message = 'Address saved.';
      messageType = 'success';
    } catch (err) {
      message = err instanceof Error ? err.message : 'Unable to save address.';
      messageType = 'error';
    } finally {
      saving = false;
    }
  }
</script>

<AppShell>
  <section class="page card">
    <h1>Address</h1>
    {#if loading}
      <p class="muted">Loading address settings...</p>
    {:else}
      <form class="form" on:submit={save}>
        {#if orgs.length > 0}
          <label>
            <span>Active Organization</span>
            <select bind:value={orgId} on:change={(event) => changeOrg(event.currentTarget.value)}>
              {#each orgs as org}
                <option value={org.orgId || org.id}>{org.name}</option>
              {/each}
            </select>
          </label>
        {/if}

        <div class="grid">
          <label><span>Street Address</span><input bind:value={address} /></label>
          <label><span>City</span><input bind:value={city} /></label>
          <label>
            <span>Region</span>
            <select bind:value={region}>
              {#each selectedCountry?.regions || [] as item}
                <option value={item}>{item}</option>
              {/each}
            </select>
          </label>
          <label><span>Postal Code</span><input bind:value={postal} /></label>
          <label>
            <span>Country</span>
            <select bind:value={selectedCountryCode}>
              {#each countries as country}
                <option value={country.code}>{country.name}</option>
              {/each}
            </select>
          </label>
        </div>

        {#if message}
          <p class={messageType === 'success' ? 'msg ok' : 'msg err'}>{message}</p>
        {/if}

        <div class="actions">
          <button class="pill" type="submit" disabled={saving || !orgId}>{saving ? 'Saving...' : 'Save address'}</button>
        </div>
      </form>
    {/if}
  </section>
</AppShell>

<style>
  .page { min-height: calc(100svh - 24px); padding: 14px; display: grid; gap: 10px; }
  h1 { margin: 0; }
  .form { display: grid; gap: 10px; }
  .grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
  label span { display: block; margin-bottom: 4px; font-size: 12px; color: var(--muted); }
  input, select {
    width: 100%;
    border: 1px solid rgba(255,255,255,.14);
    border-radius: 12px;
    background: rgba(20,24,32,.72);
    color: var(--fg);
    padding: 9px 11px;
    outline: none;
  }
  .muted { margin: 0; color: var(--muted); }
  .actions { display: flex; justify-content: flex-end; }
  .actions button { padding: 8px 12px; border-color: rgba(249,115,22,.45); background: rgba(249,115,22,.2); cursor: pointer; }
  .msg { margin: 0; border-radius: 10px; padding: 8px 10px; font-size: 13px; }
  .ok { border: 1px solid rgba(16,185,129,.4); background: rgba(16,185,129,.12); color: #6ee7b7; }
  .err { border: 1px solid rgba(251,113,133,.4); background: rgba(251,113,133,.12); color: #fecdd3; }
</style>
