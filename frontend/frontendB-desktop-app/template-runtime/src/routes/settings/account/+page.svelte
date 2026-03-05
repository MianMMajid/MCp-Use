<script>
  import { onMount } from 'svelte';
  import AppShell from '@/lib/components/AppShell.svelte';
  import { loadJson, patchJson } from '@/lib/api';

  let loading = true;
  let saving = false;
  let message = '';
  let messageType = 'success';
  let orgId = '';

  let form = {
    accountEmail: '',
    name: 'Mayple',
    bio: '',
    email: '',
    email_is_public: true,
    currency: 'usd',
    address: '147 Mayple Ave',
    city: 'Toronto',
    region: 'Ontario',
    postal_code: 'A1A 1A1',
    country: 'Canada',
  };

  onMount(async () => {
    loading = true;
    try {
      const [profileData, orgData] = await Promise.all([
        loadJson('/api/user/profile').catch(() => null),
        loadJson('/api/org').catch(() => null),
      ]);
      const user = profileData?.user || null;
      if (user) {
        form.accountEmail = user.email || user.username || '';
        form.email = user.email || '';
      }
      const orgs = Array.isArray(orgData?.orgs) ? orgData.orgs : Array.isArray(orgData) ? orgData : [];
      if (orgs.length > 0) {
        const first = orgs[0];
        orgId = first.id || first.orgId || '';
        form.name = first.name || form.name;
        form.bio = first.bio || form.bio;
      }
    } finally {
      loading = false;
    }
  });

  async function save(event) {
    event.preventDefault();
    saving = true;
    message = '';
    try {
      if (!orgId) throw new Error('No organization found.');
      const response = await patchJson(`/api/org/${orgId}`, {
        name: form.name,
        bio: form.bio,
        email: form.email,
        email_is_public: form.email_is_public,
        currency: form.currency,
        address: form.address,
        city: form.city,
        region: form.region,
        postal_code: form.postal_code,
        country: form.country,
      });
      if (!response.ok) throw new Error(`Save failed (${response.status})`);
      message = 'Settings saved successfully.';
      messageType = 'success';
    } catch (err) {
      message = err instanceof Error ? err.message : 'Unable to save settings.';
      messageType = 'error';
    } finally {
      saving = false;
    }
  }
</script>

<AppShell>
  <section class="page card">
    <h1>Account</h1>

    {#if loading}
      <p class="muted">Loading account settings...</p>
    {:else}
      <form class="form" on:submit={save}>
        <label>
          <span>Account Email</span>
          <input value={form.accountEmail} disabled />
        </label>

        <label>
          <span>Organization Name</span>
          <input bind:value={form.name} />
        </label>

        <label>
          <span>Organization Bio</span>
          <textarea rows="3" bind:value={form.bio}></textarea>
        </label>

        <label>
          <span>Organization Email</span>
          <input type="email" bind:value={form.email} />
        </label>

        <label class="checkbox">
          <input type="checkbox" bind:checked={form.email_is_public} />
          <span>Show email on public profile</span>
        </label>

        <div class="grid">
          <label><span>Street Address</span><input bind:value={form.address} /></label>
          <label><span>City</span><input bind:value={form.city} /></label>
          <label><span>Region</span><input bind:value={form.region} /></label>
          <label><span>Postal Code</span><input bind:value={form.postal_code} /></label>
          <label><span>Country</span><input bind:value={form.country} /></label>
          <label>
            <span>Currency</span>
            <select bind:value={form.currency}>
              <option value="cad">CAD - Canadian Dollar</option>
              <option value="usd">USD - United States Dollar</option>
            </select>
          </label>
        </div>

        {#if message}
          <p class={messageType === 'success' ? 'msg ok' : 'msg err'}>{message}</p>
        {/if}

        <div class="actions">
          <button class="pill" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save changes'}</button>
        </div>
      </form>
    {/if}
  </section>
</AppShell>

<style>
  .page { min-height: calc(100svh - 24px); padding: 14px; }
  h1 { margin: 0 0 10px; }
  .muted { margin: 0; color: var(--muted); }
  .form { display: grid; gap: 10px; }
  .grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
  label span { display: block; margin-bottom: 4px; font-size: 12px; color: var(--muted); }
  input, textarea, select {
    width: 100%;
    border: 1px solid rgba(255,255,255,.14);
    border-radius: 12px;
    background: rgba(20,24,32,.72);
    color: var(--fg);
    padding: 9px 11px;
    outline: none;
  }
  .checkbox { display: flex; align-items: center; gap: 8px; }
  .checkbox span { margin: 0; }
  .checkbox input { width: auto; }
  .actions { display: flex; justify-content: flex-end; }
  .actions button { padding: 8px 12px; border-color: rgba(249,115,22,.45); background: rgba(249,115,22,.2); cursor: pointer; }
  .msg { margin: 0; border-radius: 10px; padding: 8px 10px; font-size: 13px; }
  .ok { border: 1px solid rgba(16,185,129,.4); background: rgba(16,185,129,.12); color: #6ee7b7; }
  .err { border: 1px solid rgba(251,113,133,.4); background: rgba(251,113,133,.12); color: #fecdd3; }
</style>
