<script>
  import { onMount } from 'svelte';
  import AppShell from '@/lib/components/AppShell.svelte';
  import { loadJson, postJson, deleteJson, invalidateCache } from '@/lib/api';

  const orgId = 'default';

  let accounts = [];
  let loading = true;
  let error = '';
  let message = '';

  let showCreate = false;
  let newName = '';
  let newDesc = '';
  let creating = false;

  let expandedId = '';
  let keys = [];
  let keysLoading = false;

  async function fetchAccounts() {
    loading = true;
    error = '';
    try {
      const data = await loadJson(`/api/org/${orgId}/service-accounts`);
      accounts = Array.isArray(data) ? data : data.accounts ?? data.items ?? [];
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      loading = false;
    }
  }

  onMount(fetchAccounts);

  async function createAccount() {
    if (!newName.trim()) return;
    creating = true;
    try {
      const response = await postJson(`/api/org/${orgId}/service-accounts`, {
        name: newName,
        description: newDesc
      });
      if (response.ok) {
        newName = '';
        newDesc = '';
        showCreate = false;
        message = 'Service account created.';
        invalidateCache('/api/org');
        await fetchAccounts();
      }
    } finally {
      creating = false;
    }
  }

  async function toggleManage(accountId) {
    if (expandedId === accountId) {
      expandedId = '';
      keys = [];
      return;
    }
    expandedId = accountId;
    keysLoading = true;
    try {
      const data = await loadJson(`/api/org/${orgId}/service-accounts/${accountId}/keys`);
      keys = Array.isArray(data) ? data : data.keys ?? data.items ?? [];
    } catch {
      keys = [];
    } finally {
      keysLoading = false;
    }
  }

  async function generateKey(accountId) {
    await postJson(`/api/org/${orgId}/service-accounts/${accountId}/keys`, {});
    await toggleManage(accountId);
    await toggleManage(accountId);
  }

  async function revokeKey(accountId, keyId) {
    await deleteJson(`/api/org/${orgId}/service-accounts/${accountId}/keys/${keyId}`);
    keys = keys.filter((key) => String(key.id || key.keyId) !== String(keyId));
  }
</script>

<AppShell>
  <section class="page">
    <div class="card section">
      <h1>Service Accounts</h1>
      <div class="toolbar">
        <button class="pill" on:click={() => (showCreate = !showCreate)}>{showCreate ? 'Close' : 'New Service Account'}</button>
      </div>

      {#if showCreate}
        <div class="create">
          <input bind:value={newName} placeholder="Name" />
          <input bind:value={newDesc} placeholder="Description" />
          <button class="pill" on:click={createAccount} disabled={creating || !newName.trim()}>{creating ? 'Creating...' : 'Create'}</button>
        </div>
      {/if}

      {#if message}<p class="ok">{message}</p>{/if}
      {#if error}<p class="err">{error}</p>{/if}
    </div>

    <div class="card section">
      {#if loading}
        <p class="muted">Loading service accounts...</p>
      {:else if accounts.length === 0}
        <p class="muted">No service accounts found.</p>
      {:else}
        <table>
          <thead>
            <tr><th>Name</th><th>Description</th><th>Created</th><th>Keys</th><th></th></tr>
          </thead>
          <tbody>
            {#each accounts as acct}
              <tr>
                <td>{acct.name || acct.id}</td>
                <td>{acct.description || '-'}</td>
                <td>{acct.createdAt ? new Date(acct.createdAt).toLocaleDateString() : '-'}</td>
                <td>{acct.keyCount ?? acct.keys?.length ?? '?'}</td>
                <td><button class="pill" on:click={() => toggleManage(acct.id)}>{expandedId === acct.id ? 'Collapse' : 'Manage Keys'}</button></td>
              </tr>
              {#if expandedId === acct.id}
                <tr>
                  <td colspan="5">
                    <div class="keys">
                      <div class="keys-head">
                        <h2>Keys</h2>
                        <button class="pill" on:click={() => generateKey(acct.id)}>Generate Key</button>
                      </div>

                      {#if keysLoading}
                        <p class="muted">Loading keys...</p>
                      {:else if keys.length === 0}
                        <p class="muted">No keys found.</p>
                      {:else}
                        <ul>
                          {#each keys as key}
                            <li>
                              <span>{key.id || key.keyId}</span>
                              <button class="pill danger" on:click={() => revokeKey(acct.id, key.id || key.keyId)}>Revoke</button>
                            </li>
                          {/each}
                        </ul>
                      {/if}
                    </div>
                  </td>
                </tr>
              {/if}
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
  h1, h2 { margin: 0; }
  h2 { font-size: 14px; }
  .toolbar { margin-top: 10px; }
  .toolbar button, .create button, td button { padding: 7px 10px; border-color: rgba(249,115,22,.45); background: rgba(249,115,22,.2); cursor: pointer; }
  .create { margin-top: 10px; display: grid; gap: 8px; grid-template-columns: 1fr 1fr auto; }
  input {
    border: 1px solid rgba(255,255,255,.14);
    border-radius: 12px;
    background: rgba(20,24,32,.72);
    color: var(--fg);
    padding: 9px 11px;
    outline: none;
  }
  .ok { margin: 10px 0 0; color: #6ee7b7; font-size: 13px; }
  .err { margin: 10px 0 0; color: #fecdd3; font-size: 13px; }
  .muted { margin: 0; color: var(--muted); }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 9px 8px; border-bottom: 1px solid rgba(255,255,255,.08); font-size: 13px; vertical-align: top; }
  .keys { border-radius: 14px; border: 1px solid rgba(255,255,255,.08); padding: 10px; background: rgba(20,24,32,.55); }
  .keys-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; }
  li { display: flex; justify-content: space-between; align-items: center; font-size: 12px; }
  .danger { border-color: rgba(251,113,133,.4); background: rgba(251,113,133,.16); }
</style>
