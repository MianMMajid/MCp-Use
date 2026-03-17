<script>
  import { onMount } from 'svelte';
  import AppShell from '@/lib/components/AppShell.svelte';
  import { loadJson, postJson } from '@/lib/api';
  import { formatDate } from '@/lib/format';

  let loading = true;
  let error = '';
  let profile = null;
  let subscription = null;
  let usage = null;
  let limits = null;

  let currentPassword = '';
  let newPassword = '';
  let confirmPassword = '';
  let saving = false;
  let message = '';
  let messageType = 'success';

  onMount(async () => {
    loading = true;
    error = '';
    try {
      const [profileData, usageData, limitsData] = await Promise.all([
        loadJson('/api/user/profile'),
        loadJson('/api/usage/summary').catch(() => null),
        loadJson('/api/limits').catch(() => null)
      ]);
      profile = profileData?.user || null;
      subscription = profileData?.subscription || null;
      usage = usageData?.summary || null;
      limits = limitsData?.limits || null;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      loading = false;
    }
  });

  async function changePassword(event) {
    event.preventDefault();
    message = '';

    if (newPassword.length < 8) {
      message = 'New password must be at least 8 characters.';
      messageType = 'error';
      return;
    }

    if (newPassword !== confirmPassword) {
      message = 'New passwords do not match.';
      messageType = 'error';
      return;
    }

    saving = true;
    try {
      const response = await postJson('/api/user/change-password', {
        currentPassword,
        newPassword
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload?.ok !== false) {
        message = 'Password changed successfully.';
        messageType = 'success';
        currentPassword = '';
        newPassword = '';
        confirmPassword = '';
      } else {
        message = payload?.error || 'Could not change password.';
        messageType = 'error';
      }
    } catch {
      message = 'Failed to change password. Please try again.';
      messageType = 'error';
    } finally {
      saving = false;
    }
  }
</script>

<AppShell>
  <section class="page">
    <div class="card section">
      <h1>Profile</h1>
      {#if loading}
        <p class="muted">Loading profile...</p>
      {:else}
        <div class="grid two">
          <div>
            <p class="label">Username</p>
            <p>{profile?.username || 'Unknown'}</p>
          </div>
          <div>
            <p class="label">Email</p>
            <p>{profile?.email || 'No email'}</p>
          </div>
          <div>
            <p class="label">Member since</p>
            <p>{formatDate(profile?.createdAt)}</p>
          </div>
          <div>
            <p class="label">Plan</p>
            <p>{subscription?.plan || 'Free'} ({subscription?.status || 'unknown'})</p>
          </div>
        </div>
      {/if}
    </div>

    <div class="card section">
      <h2>Usage</h2>
      <div class="grid three">
        <div>
          <p class="label">Runs</p>
          <p>{usage?.runs ?? '--'}</p>
        </div>
        <div>
          <p class="label">Tool Executions</p>
          <p>{usage?.toolExecutions ?? '--'}</p>
        </div>
        <div>
          <p class="label">Model Tokens</p>
          <p>{usage?.modelTokens ?? '--'}</p>
        </div>
      </div>
      <div class="grid two">
        <div>
          <p class="label">Window</p>
          <p>{usage?.window ?? '--'}</p>
        </div>
        <div>
          <p class="label">Limits</p>
          <p>{limits ? JSON.stringify(limits) : '--'}</p>
        </div>
      </div>
    </div>

    <form class="card section" on:submit={changePassword}>
      <h2>Change Password</h2>
      {#if message}
        <p class={messageType === 'success' ? 'msg ok' : 'msg err'}>{message}</p>
      {/if}
      {#if error}
        <p class="msg err">{error}</p>
      {/if}
      <div class="grid two">
        <label>
          <span class="label">Current Password</span>
          <input type="password" bind:value={currentPassword} required />
        </label>
        <label>
          <span class="label">New Password</span>
          <input type="password" bind:value={newPassword} required minlength="8" />
        </label>
        <label>
          <span class="label">Confirm Password</span>
          <input type="password" bind:value={confirmPassword} required minlength="8" />
        </label>
      </div>
      <div class="actions">
        <button class="pill" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Change Password'}</button>
      </div>
    </form>
  </section>
</AppShell>

<style>
  .page { min-height: calc(100svh - 92px); display: grid; gap: 12px; }
  .section { padding: 14px; }
  h1, h2 { margin: 0 0 10px; }
  h2 { font-size: 1rem; }
  .grid { display: grid; gap: 10px; }
  .grid.two { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
  .grid.three { grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); }
  .label { display: block; color: var(--muted); font-size: 12px; margin-bottom: 4px; }
  .muted { margin: 0; color: var(--muted); }
  input {
    width: 100%;
    border: 1px solid var(--input-border);
    border-radius: 12px;
    background: var(--input-bg);
    color: var(--fg);
    padding: 9px 11px;
    outline: none;
  }
  .actions { margin-top: 10px; display: flex; justify-content: flex-end; }
  .actions button { padding: 8px 12px; border-color: rgba(249,115,22,.45); background: rgba(249,115,22,.2); cursor: pointer; }
  .msg { margin: 0 0 10px; border-radius: 10px; padding: 8px 10px; font-size: 13px; }
  .msg.ok { border: 1px solid var(--ok-border); background: var(--ok-soft); color: var(--ok); }
  .msg.err { border: 1px solid rgba(251,113,133,.4); background: rgba(251,113,133,.12); color: var(--warn); }
</style>
