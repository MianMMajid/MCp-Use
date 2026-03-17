<script>
  import { onMount } from 'svelte';
  import AppShell from '@/lib/components/AppShell.svelte';
  import { loadJson, postJson, invalidateCache } from '@/lib/api';
  import { formatDate } from '@/lib/format';

  const categories = [
    { key: 'approvals', label: 'Approvals', description: 'Approval requests and decisions' },
    { key: 'escalations', label: 'Escalations', description: 'Escalation triggers and resolutions' },
    { key: 'run_failures', label: 'Run Failures', description: 'Agent run errors and failures' },
    { key: 'system_alerts', label: 'System Alerts', description: 'System health and security alerts' },
  ];
  const channels = [
    { key: 'email', label: 'Email' },
    { key: 'in_app', label: 'In-App' },
  ];

  let loading = true;
  let saving = false;
  let message = '';
  let prefs = {};
  let channelPrefs = { email: true, in_app: true };
  let history = [];

  onMount(async () => {
    loading = true;
    try {
      const [prefsData, historyData] = await Promise.all([
        loadJson('/api/notifications/preferences').catch(() => null),
        loadJson('/api/notifications').catch(() => null),
      ]);
      if (prefsData) {
        prefs = prefsData.categories || {};
        channelPrefs = prefsData.channels || channelPrefs;
      }
      const items = Array.isArray(historyData?.items) ? historyData.items
        : Array.isArray(historyData) ? historyData
        : Array.isArray(historyData?.notifications) ? historyData.notifications
        : [];
      history = items.slice(0, 20);
    } finally {
      loading = false;
    }
  });

  function toggleCategory(key) {
    prefs = { ...prefs, [key]: !prefs[key] };
  }

  function toggleChannel(key) {
    channelPrefs = { ...channelPrefs, [key]: !channelPrefs[key] };
  }

  async function save() {
    saving = true;
    try {
      const response = await postJson('/api/notifications/preferences', { categories: prefs, channels: channelPrefs });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || `Save failed (${response.status})`);
      }
      invalidateCache('/api/notifications');
      message = 'Preferences saved';
    } catch (err) {
      message = err instanceof Error ? err.message : 'Failed to save preferences';
    } finally {
      saving = false;
    }
  }

  async function markAllRead() {
    try {
      const response = await postJson('/api/notifications/read-all', {});
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || `Mark read failed (${response.status})`);
      }
      invalidateCache('/api/notifications');
      message = 'All notifications marked as read';
      history = history.map((item) => ({ ...item, read: true }));
    } catch (err) {
      message = err instanceof Error ? err.message : 'Failed to mark notifications as read';
    }
  }
</script>

<AppShell>
  <section class="page card">
    <h1>Notifications</h1>

    {#if loading}
      <p class="muted">Loading notification settings...</p>
    {:else}
      {#if message}<p class="msg">{message}</p>{/if}

      <section class="block">
        <h2>Notification Categories</h2>
        <div class="rows">
          {#each categories as category}
            <div class="row">
              <div>
                <p class="title">{category.label}</p>
                <p class="desc">{category.description}</p>
              </div>
              <label class="switch"><input type="checkbox" checked={prefs[category.key] !== false} on:change={() => toggleCategory(category.key)} /></label>
            </div>
          {/each}
        </div>
      </section>

      <section class="block">
        <h2>Channels</h2>
        <div class="rows">
          {#each channels as channel}
            <div class="row">
              <p class="title">{channel.label}</p>
              <label class="switch"><input type="checkbox" checked={channelPrefs[channel.key] !== false} on:change={() => toggleChannel(channel.key)} /></label>
            </div>
          {/each}
        </div>
      </section>

      <div class="actions">
        <button class="pill" on:click={save} disabled={saving}>{saving ? 'Saving...' : 'Save Preferences'}</button>
      </div>

      <section class="block">
        <div class="header-row">
          <h2>Recent Notifications</h2>
          <button class="pill" on:click={markAllRead}>Mark all read</button>
        </div>

        {#if history.length === 0}
          <p class="muted">No notifications.</p>
        {:else}
          <table>
            <thead><tr><th>Message</th><th>Type</th><th>Time</th><th>Read</th></tr></thead>
            <tbody>
              {#each history as item}
                <tr>
                  <td>{item.message || item.title || '--'}</td>
                  <td>{item.type || item.category || '--'}</td>
                  <td>{formatDate(item.createdAt || item.timestamp)}</td>
                  <td>{item.read ? 'Yes' : 'No'}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}
      </section>
    {/if}
  </section>
</AppShell>

<style>
  .page { min-height: calc(100svh - 92px); padding: 14px; display: grid; gap: 12px; }
  h1 { margin: 0; }
  .msg { margin: 0; border: 1px solid var(--info-border); background: var(--info-soft); color: var(--info); border-radius: 10px; padding: 8px 10px; font-size: 13px; }
  .block { display: grid; gap: 8px; }
  h2 { margin: 0; font-size: 14px; }
  .rows { display: grid; gap: 8px; }
  .row { border: 1px solid var(--row-border); border-radius: 12px; padding: 10px; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .title { margin: 0; font-size: 13px; font-weight: 600; }
  .desc { margin: 3px 0 0; color: var(--muted); font-size: 12px; }
  .switch input { width: 18px; height: 18px; }
  .actions { display: flex; justify-content: flex-start; }
  .actions button, .header-row button { padding: 8px 11px; border-color: rgba(249,115,22,.35); background: var(--btn-secondary-bg); cursor: pointer; }
  .header-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
  .muted { margin: 0; color: var(--muted); }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 9px 8px; border-bottom: 1px solid var(--row-border); font-size: 13px; }
</style>
