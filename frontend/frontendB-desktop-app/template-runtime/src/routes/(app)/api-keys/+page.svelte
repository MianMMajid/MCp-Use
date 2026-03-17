<script>
  import { onMount } from 'svelte';
  import AppShell from '@/lib/components/AppShell.svelte';
  import { loadJson, postJson, deleteJson, invalidateCache } from '@/lib/api';
  import { formatDate } from '@/lib/format';

  let keys = [];
  let loading = true;
  let error = '';
  let message = '';
  let newKeyName = '';
  let creating = false;
  let newKeySecret = '';

  async function fetchKeys() {
    loading = true;
    error = '';
    try {
      const data = await loadJson('/api/user/api-keys');
      keys = data?.items || [];
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      loading = false;
    }
  }

  onMount(fetchKeys);

  async function createKey(event) {
    event.preventDefault();
    if (!newKeyName.trim()) return;
    creating = true;
    message = '';
    try {
      const response = await postJson('/api/user/api-keys', { name: newKeyName.trim() });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload?.ok !== false) {
        newKeyName = '';
        newKeySecret = payload?.key?.token || payload?.token || payload?.secret || '';
        message = newKeySecret ? '' : 'API key created.';
        invalidateCache('/api/user/api-keys');
        await fetchKeys();
      } else {
        message = payload?.error || 'Could not create API key.';
      }
    } finally {
      creating = false;
    }
  }

  async function revokeKey(id) {
    try {
      await deleteJson(`/api/user/api-keys/${id}`);
      invalidateCache('/api/user/api-keys');
      keys = keys.filter((item) => String(item.keyId ?? item.id) !== String(id));
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }
</script>

<AppShell>
  <section class="page">
    <div class="card section">
      <h1>API Keys</h1>
      <form class="create" on:submit={createKey}>
        <input bind:value={newKeyName} placeholder="Key name" />
        <button class="pill" type="submit" disabled={creating || !newKeyName.trim()}>{creating ? 'Creating...' : 'Create Key'}</button>
      </form>
      {#if newKeySecret}
        <div class="secret-banner">
          <p class="secret-label">Copy your API key now — it will not be shown again:</p>
          <div class="secret-row">
            <code class="secret-value">{newKeySecret}</code>
            <button class="pill" on:click={() => { navigator.clipboard?.writeText(newKeySecret); message = 'Copied to clipboard.'; }}>Copy</button>
            <button class="pill" on:click={() => { newKeySecret = ''; }}>Dismiss</button>
          </div>
        </div>
      {/if}
      {#if message}
        <p class="msg">{message}</p>
      {/if}
      {#if error}
        <p class="err">{error}</p>
      {/if}
    </div>

    <div class="card section">
      {#if loading}
        <p class="muted">Loading API keys...</p>
      {:else if keys.length === 0}
        <p class="muted">No API keys created yet.</p>
      {:else}
        <table>
          <thead>
            <tr><th>Name</th><th>Fingerprint</th><th>Created</th><th>Expires</th><th></th></tr>
          </thead>
          <tbody>
            {#each keys as key}
              <tr>
                <td>{key.name}</td>
                <td><code>{key.fingerprint || '--'}</code></td>
                <td>{formatDate(key.createdAt)}</td>
                <td>{key.expiresAt ? formatDate(key.expiresAt) : 'Never'}</td>
                <td><button class="pill danger" on:click={() => revokeKey(key.keyId ?? key.id)}>Delete</button></td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>
  </section>
</AppShell>

<style>
  .page { min-height: calc(100svh - 24px); display: grid; gap: 12px; }
  .section { padding: 14px; }
  h1 { margin: 0 0 10px; }
  .create { display: flex; gap: 8px; }
  input {
    flex: 1;
    border: 1px solid var(--input-border);
    border-radius: 12px;
    background: var(--input-bg);
    color: var(--fg);
    padding: 9px 11px;
    outline: none;
  }
  .create button { padding: 8px 12px; border-color: rgba(249,115,22,.45); background: rgba(249,115,22,.2); cursor: pointer; }
  .msg { margin: 10px 0 0; color: var(--ok); font-size: 13px; }
  .err { margin: 10px 0 0; color: var(--warn); font-size: 13px; }
  .muted { margin: 0; color: var(--muted); }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 9px 8px; border-bottom: 1px solid var(--row-border); font-size: 13px; }
  code { font-size: 12px; color: var(--muted); }
  .danger { padding: 6px 10px; border-color: rgba(251,113,133,.4); background: rgba(251,113,133,.16); cursor: pointer; }
  .secret-banner { margin: 10px 0; padding: 12px; border: 1px solid var(--caution-border); border-radius: 12px; background: var(--caution-soft); }
  .secret-label { margin: 0 0 8px; font-size: 13px; font-weight: 600; color: var(--caution); }
  .secret-row { display: flex; gap: 8px; align-items: center; }
  .secret-value { flex: 1; font-size: 12px; color: var(--fg); word-break: break-all; background: var(--pre-bg); padding: 8px; border-radius: 8px; font-family: monospace; }
</style>
