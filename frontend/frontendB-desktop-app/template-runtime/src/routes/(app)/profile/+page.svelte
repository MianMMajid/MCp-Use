<script>
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import AppShell from '@/lib/components/AppShell.svelte';
  import Icon from '@/lib/components/icons/Icon.svelte';
  import { loadJson, postJson, deleteJson, patchJson, invalidateCache } from '@/lib/api';
  import { shellStore } from '@/lib/stores/shell-store';
  import { toastStore } from '@/lib/stores/toast-store';
  import { formatDate } from '@/lib/format';

  // ── Tab state ──
  const tabs = [
    { id: 'account', label: 'Account', icon: 'agent' },
    { id: 'security', label: 'Security', icon: 'firewall' },
    { id: 'appearance', label: 'Appearance', icon: 'spark' },
    { id: 'api-keys', label: 'API Keys', icon: 'skills' },
    { id: 'notifications', label: 'Notifications', icon: 'chat' },
  ];

  let activeTab = 'account';

  // ── Account data ──
  let loading = true;
  let error = '';
  let profile = null;
  let subscription = null;
  let usage = null;

  // ── Security ──
  let currentPassword = '';
  let newPassword = '';
  let confirmPassword = '';
  let savingPassword = false;

  // ── API Keys ──
  let apiKeys = [];
  let newKeyName = '';
  let creatingKey = false;
  let revealedSecret = '';

  // ── Notifications ──
  let notifCategories = {};
  let notifChannels = {};
  let savingNotifs = false;

  const notifCategoryDefs = [
    { id: 'approvals', label: 'Approvals', desc: 'Approval requests and decisions' },
    { id: 'escalations', label: 'Escalations', desc: 'Escalation triggers and resolutions' },
    { id: 'run_failures', label: 'Run Failures', desc: 'Agent run errors and failures' },
    { id: 'system_alerts', label: 'System Alerts', desc: 'System health and security alerts' },
  ];

  // ── Init from URL ──
  $: {
    const urlTab = $page.url.searchParams.get('tab');
    if (urlTab && tabs.some((t) => t.id === urlTab)) activeTab = urlTab;
  }

  onMount(async () => {
    loading = true;
    try {
      const [profileData, usageData, keysData, notifData] = await Promise.all([
        loadJson('/api/user/profile'),
        loadJson('/api/usage/summary').catch(() => null),
        loadJson('/api/user/api-keys').catch(() => ({ items: [] })),
        loadJson('/api/notifications/preferences').catch(() => ({ categories: {}, channels: {} })),
      ]);
      profile = profileData?.user || null;
      subscription = profileData?.subscription || null;
      usage = usageData?.summary || null;
      apiKeys = keysData?.items || [];
      notifCategories = notifData?.categories || {};
      notifChannels = notifData?.channels || {};
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      loading = false;
    }
  });

  // ── Actions ──
  async function changePassword() {
    if (newPassword.length < 8) { toastStore.error('Password must be at least 8 characters'); return; }
    if (newPassword !== confirmPassword) { toastStore.error('Passwords do not match'); return; }
    savingPassword = true;
    try {
      const res = await postJson('/api/user/change-password', { currentPassword, newPassword });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed');
      toastStore.success('Password changed');
      currentPassword = ''; newPassword = ''; confirmPassword = '';
    } catch (err) { toastStore.error(err.message); }
    finally { savingPassword = false; }
  }

  async function createApiKey() {
    if (!newKeyName.trim()) return;
    creatingKey = true;
    try {
      const res = await postJson('/api/user/api-keys', { name: newKeyName.trim() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed');
      revealedSecret = data?.key?.token || data?.token || data?.secret || '';
      newKeyName = '';
      const keysData = await loadJson('/api/user/api-keys').catch(() => ({ items: [] }));
      apiKeys = keysData?.items || [];
      toastStore.success('API key created');
    } catch (err) { toastStore.error(err.message); }
    finally { creatingKey = false; }
  }

  async function revokeApiKey(id) {
    try {
      await deleteJson('/api/user/api-keys/' + id);
      apiKeys = apiKeys.filter((k) => String(k.id) !== String(id));
      toastStore.success('Key revoked');
    } catch (err) { toastStore.error(err.message); }
  }

  function copySecret() {
    navigator.clipboard?.writeText(revealedSecret);
    toastStore.info('Copied to clipboard');
  }

  async function saveNotifications() {
    savingNotifs = true;
    try {
      const res = await postJson('/api/notifications/preferences', { categories: notifCategories, channels: notifChannels });
      if (!res.ok) throw new Error('Failed to save');
      toastStore.success('Notification preferences saved');
    } catch (err) { toastStore.error(err.message); }
    finally { savingNotifs = false; }
  }

  function signOut() {
    if (typeof window !== 'undefined') {
      window.location.href = '/logout';
    }
  }
</script>

<AppShell>
  <section class="settings-page">
    <header class="settings-header">
      <h1>Settings</h1>
      {#if profile}
        <span class="user-badge">{profile.email || profile.username || ''}</span>
      {/if}
    </header>

    <div class="settings-layout">
      <!-- Left nav -->
      <nav class="settings-nav" aria-label="Settings navigation">
        {#each tabs as tab}
          <button
            class="nav-item"
            class:active={activeTab === tab.id}
            on:click={() => { activeTab = tab.id; }}
          >
            <Icon name={tab.icon} size={16} />
            <span>{tab.label}</span>
          </button>
        {/each}
        <div class="nav-divider"></div>
        <button class="nav-item danger" on:click={signOut}>
          <Icon name="close" size={16} />
          <span>Sign out</span>
        </button>
      </nav>

      <!-- Right content -->
      <div class="settings-content">
        {#if loading}
          <p class="muted">Loading settings...</p>

        {:else if activeTab === 'account'}
          <section class="section">
            <h2>Profile</h2>
            <div class="field-group">
              <div class="field">
                <label>Username</label>
                <p class="field-value">{profile?.username || '—'}</p>
              </div>
              <div class="field">
                <label>Email</label>
                <p class="field-value">{profile?.email || '—'}</p>
              </div>
              <div class="field">
                <label>Member since</label>
                <p class="field-value">{profile?.createdAt ? formatDate(profile.createdAt) : '—'}</p>
              </div>
            </div>
          </section>
          <section class="section">
            <h2>Plan & Usage</h2>
            <div class="stat-grid">
              <div class="stat-card">
                <span class="stat-label">Plan</span>
                <span class="stat-value">{subscription?.plan || 'Free'}</span>
              </div>
              <div class="stat-card">
                <span class="stat-label">Runs</span>
                <span class="stat-value">{usage?.runs ?? '—'}</span>
              </div>
              <div class="stat-card">
                <span class="stat-label">Tool Executions</span>
                <span class="stat-value">{usage?.toolExecutions ?? '—'}</span>
              </div>
              <div class="stat-card">
                <span class="stat-label">Tokens</span>
                <span class="stat-value">{usage?.modelTokens ?? '—'}</span>
              </div>
            </div>
          </section>

        {:else if activeTab === 'security'}
          <section class="section">
            <h2>Change Password</h2>
            <form class="form-stack" on:submit|preventDefault={changePassword}>
              <div class="field">
                <label for="cur-pw">Current Password</label>
                <input id="cur-pw" type="password" bind:value={currentPassword} required />
              </div>
              <div class="field">
                <label for="new-pw">New Password</label>
                <input id="new-pw" type="password" bind:value={newPassword} minlength="8" required />
              </div>
              <div class="field">
                <label for="confirm-pw">Confirm New Password</label>
                <input id="confirm-pw" type="password" bind:value={confirmPassword} minlength="8" required />
              </div>
              <button class="pill cta" type="submit" disabled={savingPassword}>
                {savingPassword ? 'Saving...' : 'Change Password'}
              </button>
            </form>
          </section>

        {:else if activeTab === 'appearance'}
          <section class="section">
            <h2>Theme</h2>
            <div class="toggle-row">
              <div>
                <p class="toggle-label">Dark mode</p>
                <p class="toggle-desc">Switch between light and dark appearance</p>
              </div>
              <button class="theme-switch" on:click={() => shellStore.toggleTheme()}>
                <span class="theme-option" class:active={$shellStore.theme === 'light'}>
                  <Icon name="sun" size={14} /> Light
                </span>
                <span class="theme-option" class:active={$shellStore.theme === 'dark'}>
                  <Icon name="moon" size={14} /> Dark
                </span>
              </button>
            </div>
          </section>

        {:else if activeTab === 'api-keys'}
          <section class="section">
            <h2>API Keys</h2>
            {#if revealedSecret}
              <div class="secret-banner">
                <p>Your new API key (copy now — it won't be shown again):</p>
                <div class="secret-row">
                  <code>{revealedSecret}</code>
                  <button class="pill cta" on:click={copySecret}>Copy</button>
                  <button class="pill" on:click={() => { revealedSecret = ''; }}>Dismiss</button>
                </div>
              </div>
            {/if}
            <form class="inline-form" on:submit|preventDefault={createApiKey}>
              <input bind:value={newKeyName} placeholder="Key name..." />
              <button class="pill cta" type="submit" disabled={creatingKey || !newKeyName.trim()}>
                {creatingKey ? 'Creating...' : 'Create Key'}
              </button>
            </form>
            {#if apiKeys.length > 0}
              <div class="key-list">
                {#each apiKeys as key}
                  <div class="key-row">
                    <div>
                      <p class="key-name">{key.name || 'Unnamed'}</p>
                      <p class="key-meta">Created {formatDate(key.createdAt)} · Expires {key.expiresAt ? formatDate(key.expiresAt) : 'Never'}</p>
                    </div>
                    <button class="pill danger-btn" on:click={() => revokeApiKey(key.id)}>Revoke</button>
                  </div>
                {/each}
              </div>
            {:else}
              <p class="muted">No API keys yet.</p>
            {/if}
          </section>

        {:else if activeTab === 'notifications'}
          <section class="section">
            <h2>Notification Preferences</h2>
            <div class="toggle-list">
              {#each notifCategoryDefs as cat}
                <label class="toggle-row">
                  <div>
                    <p class="toggle-label">{cat.label}</p>
                    <p class="toggle-desc">{cat.desc}</p>
                  </div>
                  <input type="checkbox" bind:checked={notifCategories[cat.id]} />
                </label>
              {/each}
            </div>
            <h3>Channels</h3>
            <div class="toggle-list">
              <label class="toggle-row">
                <span>Email</span>
                <input type="checkbox" bind:checked={notifChannels.email} />
              </label>
              <label class="toggle-row">
                <span>In-App</span>
                <input type="checkbox" bind:checked={notifChannels.inApp} />
              </label>
            </div>
            <button class="pill cta" on:click={saveNotifications} disabled={savingNotifs}>
              {savingNotifs ? 'Saving...' : 'Save Preferences'}
            </button>
          </section>
        {/if}
      </div>
    </div>
  </section>
</AppShell>

<style>
  .settings-page { min-height: calc(100svh - 92px); }

  .settings-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 0 16px;
  }

  .settings-header h1 { margin: 0; font-size: 1.3rem; }
  .user-badge { color: var(--muted); font-size: 13px; }

  .settings-layout {
    display: grid;
    grid-template-columns: 200px 1fr;
    gap: 24px;
    min-height: 0;
  }

  /* ── Left nav ── */
  .settings-nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: var(--muted);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s, color 0.15s;
  }

  .nav-item:hover { background: var(--bg-soft); color: var(--fg); }
  .nav-item.active { background: var(--accent); color: #fff; font-weight: 600; }
  .nav-item.danger { color: var(--danger); }
  .nav-item.danger:hover { background: var(--danger-soft); }

  .nav-divider {
    height: 1px;
    background: var(--border);
    margin: 8px 0;
  }

  /* ── Content ── */
  .settings-content {
    min-width: 0;
  }

  .section {
    margin-bottom: 28px;
  }

  .section h2 { margin: 0 0 14px; font-size: 1rem; font-weight: 600; }
  .section h3 { margin: 18px 0 10px; font-size: 13px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }

  .muted { color: var(--muted); font-size: 13px; }

  /* ── Fields ── */
  .field-group { display: grid; gap: 14px; }
  .field label { display: block; font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
  .field-value { margin: 0; font-size: 14px; }

  .form-stack { display: grid; gap: 14px; max-width: 400px; }
  .form-stack input {
    width: 100%;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--bg-soft);
    color: var(--fg);
    padding: 10px 12px;
    outline: none;
  }
  .form-stack input:focus { border-color: var(--accent); }

  /* ── Stats ── */
  .stat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
  .stat-card {
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 14px;
    display: grid;
    gap: 4px;
  }
  .stat-label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
  .stat-value { font-size: 18px; font-weight: 600; }

  /* ── Toggles ── */
  .toggle-list { display: grid; gap: 2px; margin-bottom: 16px; }
  .toggle-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 10px;
    cursor: pointer;
  }
  .toggle-row:hover { background: var(--bg-soft); }
  .toggle-label { margin: 0; font-size: 14px; font-weight: 500; }
  .toggle-desc { margin: 2px 0 0; font-size: 12px; color: var(--muted); }

  .toggle-row input[type="checkbox"] {
    width: 18px;
    height: 18px;
    accent-color: var(--accent);
    cursor: pointer;
  }

  /* ── Theme switch ── */
  .theme-switch {
    display: flex;
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
    background: transparent;
    padding: 0;
    cursor: pointer;
  }
  .theme-option {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    font-size: 12px;
    font-weight: 500;
    color: var(--muted);
    transition: background 0.15s, color 0.15s;
  }
  .theme-option.active {
    background: var(--accent);
    color: #fff;
  }

  /* ── API Keys ── */
  .inline-form {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
  }
  .inline-form input {
    flex: 1;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--bg-soft);
    color: var(--fg);
    padding: 9px 12px;
    outline: none;
  }
  .inline-form input:focus { border-color: var(--accent); }

  .secret-banner {
    border: 1px solid var(--caution-border);
    border-radius: 12px;
    background: var(--caution-soft);
    padding: 12px 14px;
    margin-bottom: 14px;
  }
  .secret-banner p { margin: 0 0 8px; font-size: 13px; font-weight: 500; }
  .secret-row { display: flex; align-items: center; gap: 8px; }
  .secret-row code {
    flex: 1;
    padding: 6px 10px;
    border-radius: 8px;
    background: var(--bg-soft);
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .key-list { display: grid; gap: 8px; }
  .key-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
  }
  .key-name { margin: 0; font-size: 14px; font-weight: 500; }
  .key-meta { margin: 2px 0 0; font-size: 11px; color: var(--muted); }

  .danger-btn {
    border-color: var(--danger-border) !important;
    background: var(--danger-soft) !important;
    color: var(--danger) !important;
    font-size: 12px;
    padding: 5px 10px;
    cursor: pointer;
  }

  /* ── Responsive ── */
  @media (max-width: 640px) {
    .settings-layout { grid-template-columns: 1fr; gap: 16px; }
    .settings-nav { flex-direction: row; overflow-x: auto; gap: 4px; }
    .nav-item span { display: none; }
    .nav-item { padding: 8px 10px; }
    .stat-grid { grid-template-columns: 1fr 1fr; }
  }
</style>
