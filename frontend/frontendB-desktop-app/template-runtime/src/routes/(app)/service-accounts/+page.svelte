<script>
  import { onMount } from 'svelte';
  import AppShell from '@/lib/components/AppShell.svelte';
  import MaypleCharacter from '@/lib/components/MaypleCharacter.svelte';
  import { loadJson, postJson, deleteJson, invalidateCache } from '@/lib/api';
  import { loadActiveOrgState, setActiveOrgId } from '@/lib/active-org';
  import { humanizeError } from '@/lib/utils/error-display';

  let accounts = [];
  let loading = true;
  let error = '';
  let message = '';
  let orgId = '';
  let orgs = [];

  let showCreate = false;
  let newName = '';
  let newDesc = '';
  let creating = false;

  let expandedId = '';
  let keys = [];
  let keysLoading = false;
  let newKeySecret = '';

  async function fetchAccounts() {
    loading = true;
    error = '';
    try {
      if (!orgId) {
        accounts = [];
        return;
      }
      const data = await loadJson(`/api/org/${orgId}/service-accounts`);
      accounts = Array.isArray(data) ? data : data.accounts ?? data.items ?? [];
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      loading = false;
    }
  }

  onMount(async () => {
    const orgState = await loadActiveOrgState().catch(() => ({ items: [], activeOrgId: '' }));
    orgs = orgState.items || [];
    orgId = orgState.activeOrgId || '';
    await fetchAccounts();
  });

  async function changeOrg(nextOrgId) {
    orgId = setActiveOrgId(nextOrgId);
    expandedId = '';
    keys = [];
    message = '';
    await fetchAccounts();
  }

  $: hasOrg = Boolean(orgId);

  async function createAccount() {
    if (!newName.trim() || !orgId) return;
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
    newKeySecret = '';
    message = '';
    try {
      const response = await postJson(`/api/org/${orgId}/service-accounts/${accountId}/keys`, {});
      const payload = typeof response?.json === 'function'
        ? await response.json().catch(() => ({}))
        : (response ?? {});
      const responseOk = typeof response?.ok === 'boolean' ? response.ok : payload?.ok !== false;
      const responseStatus = typeof response?.status === 'number' ? response.status : 200;
      if (!responseOk || payload?.ok === false) {
        message = payload?.error || `Failed to create key (${responseStatus})`;
        return;
      }
      const createdKey = payload?.key || payload?.item || null;
      newKeySecret = payload?.key?.token || payload?.token || payload?.secret || '';
      if (!newKeySecret) message = 'Key created (token unavailable).';
      invalidateCache(`/api/org/${orgId}/service-accounts`);
      accounts = accounts.map((account) =>
        String(account.id) === String(accountId)
          ? { ...account, keyCount: Math.max(1, Number(account.keyCount || 0) + 1) }
          : account
      );
      if (createdKey && (createdKey.id || createdKey.keyId)) {
        expandedId = accountId;
        keys = [
          createdKey,
          ...keys.filter((key) => String(key.id || key.keyId) !== String(createdKey.id || createdKey.keyId)),
        ];
      } else {
        expandedId = '';
        keys = [];
        await toggleManage(accountId);
      }
    } catch (err) {
      message = err instanceof Error ? err.message : 'Key creation failed.';
    }
  }

  async function revokeKey(accountId, keyId) {
    try {
      await deleteJson(`/api/org/${orgId}/service-accounts/${accountId}/keys/${keyId}`);
      invalidateCache(`/api/org/${orgId}/service-accounts`);
      keys = keys.filter((key) => String(key.id || key.keyId) !== String(keyId));
    } catch (err) {
      message = err instanceof Error ? err.message : 'Revoke failed.';
    }
  }
</script>

<AppShell>
  <section class="page">
    <div class="card section">
      <h1>Service Accounts</h1>
      <div class="toolbar">
        {#if orgs.length > 0}
          <select class="org-select" bind:value={orgId} on:change={(event) => changeOrg(event.currentTarget.value)}>
            {#each orgs as org}
              <option value={org.orgId || org.id}>{org.name}</option>
            {/each}
          </select>
        {/if}
        {#if hasOrg}
          <button class="pill" on:click={() => (showCreate = !showCreate)}>{showCreate ? 'Close' : 'New Service Account'}</button>
        {/if}
      </div>

      {#if showCreate}
        <div class="create">
          <input bind:value={newName} placeholder="Name" />
          <input bind:value={newDesc} placeholder="Description" />
          <button class="pill" on:click={createAccount} disabled={creating || !newName.trim()}>{creating ? 'Creating...' : 'Create'}</button>
        </div>
      {/if}

      {#if newKeySecret}
        <div class="secret-banner">
          <p class="secret-label">Copy your service account key now — it will not be shown again:</p>
          <div class="secret-row">
            <code class="secret-value">{newKeySecret}</code>
            <button class="pill" on:click={() => { navigator.clipboard?.writeText(newKeySecret); message = 'Copied to clipboard.'; }}>Copy</button>
            <button class="pill" on:click={() => { newKeySecret = ''; }}>Dismiss</button>
          </div>
        </div>
      {/if}
      {#if message}<p class="ok">{message}</p>{/if}
      {#if error}
        <div class="error-banner">
          <p>{humanizeError(error)}</p>
        </div>
      {/if}
    </div>

    <div class="card section">
      {#if loading}
        <p class="muted">Loading service accounts...</p>
      {:else if !hasOrg}
        <div class="empty-state empty-hero">
          <MaypleCharacter size={40} animate={false} />
          <p><strong>No organization selected</strong></p>
          <p>Service accounts require an organization. Join or create one in your profile settings.</p>
        </div>
      {:else if accounts.length === 0}
        <div class="empty-state empty-hero">
          <MaypleCharacter size={40} animate={false} />
          <p><strong>No service accounts found</strong></p>
          <p>Create a service account above to generate machine-to-machine credentials.</p>
        </div>
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
  .page { min-height: calc(100svh - 92px); display: grid; gap: 12px; }
  .section { padding: 14px; }
  h1, h2 { margin: 0; }
  h2 { font-size: 14px; }
  .toolbar { margin-top: 10px; }
  .org-select {
    border: 1px solid var(--input-border);
    border-radius: 12px;
    background: var(--input-bg);
    color: var(--fg);
    padding: 9px 11px;
    outline: none;
    margin-right: 8px;
  }
  .toolbar button, .create button, td button { padding: 7px 10px; border-color: rgba(249,115,22,.45); background: rgba(249,115,22,.2); cursor: pointer; }
  .create { margin-top: 10px; display: grid; gap: 8px; grid-template-columns: 1fr 1fr auto; }
  input {
    border: 1px solid var(--input-border);
    border-radius: 12px;
    background: var(--input-bg);
    color: var(--fg);
    padding: 9px 11px;
    outline: none;
  }
  .ok { margin: 10px 0 0; color: var(--ok); font-size: 13px; }
  .muted { margin: 0; color: var(--muted); }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 9px 8px; border-bottom: 1px solid var(--row-border); font-size: 13px; vertical-align: top; }
  .keys { border-radius: 14px; border: 1px solid var(--row-border); padding: 10px; background: var(--btn-secondary-bg); }
  .keys-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; }
  li { display: flex; justify-content: space-between; align-items: center; font-size: 12px; }
  .danger { border-color: rgba(251,113,133,.4); background: rgba(251,113,133,.16); }
  .empty-hero { display: grid; gap: 8px; justify-items: center; padding: 16px; }
  .empty-hero p { margin: 0; font-size: 12px; color: var(--muted); }
  .secret-banner { margin: 10px 0; padding: 12px; border: 1px solid var(--caution-border); border-radius: 12px; background: var(--caution-soft); }
  .secret-label { margin: 0 0 8px; font-size: 13px; font-weight: 600; color: var(--caution); }
  .secret-row { display: flex; gap: 8px; align-items: center; }
  .secret-value { flex: 1; font-size: 12px; color: var(--fg); word-break: break-all; background: var(--pre-bg); padding: 8px; border-radius: 8px; font-family: monospace; }
</style>
