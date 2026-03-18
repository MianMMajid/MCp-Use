<script>
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { goto } from '$app/navigation';
  import AppShell from '@/lib/components/AppShell.svelte';
  import ConfirmDialog from '@/lib/components/ConfirmDialog.svelte';
  import Icon from '@/lib/components/icons/Icon.svelte';
  import { chatStore } from '@/lib/stores/chat-store';
  import { deleteJson, invalidateCache } from '@/lib/api';
  import { toastStore } from '@/lib/stores/toast-store';
  import { humanizeError } from '@/lib/utils/error-display';

  const AGENT_ID_KEY = 'selectedAgentId';

  let restoringSelectedAgent = false;
  let confirmOpen = false;
  let confirmSessionId = '';
  let confirmSessionTitle = '';
  let deletingSession = false;

  function requestDeleteSession(sessionId, title) {
    confirmSessionId = sessionId;
    confirmSessionTitle = title || sessionId;
    confirmOpen = true;
  }

  async function deleteSession(sessionId) {
    if (deletingSession) return;
    deletingSession = true;
    try {
      const agentId = $chatStore.selectedAgentId;
      await deleteJson(`/api/openclaw/agent/sessions/${sessionId}`);
      // Clear sessionId if this was the active session
      if ($chatStore.sessionId === sessionId) {
        chatStore.newSession();
      }
      invalidateCache(`/api/agents/${agentId}/sessions`);
      invalidateCache(`/api/openclaw/agent/sessions/${sessionId}`);
      toastStore.success('Session deleted');
      // Reload sessions
      if (agentId) await chatStore.restoreSelectedAgent(agentId);
    } catch (err) {
      toastStore.error(humanizeError(err instanceof Error ? err.message : String(err)));
    } finally {
      deletingSession = false;
    }
  }

  onMount(async () => {
    if (typeof window === 'undefined') return;

    await chatStore.initialize();

    const persistedAgentId = String(window.localStorage.getItem(AGENT_ID_KEY) || '');
    if (get(chatStore).selectedAgentId || !persistedAgentId) return;

    restoringSelectedAgent = true;
    try {
      await chatStore.restoreSelectedAgent(persistedAgentId);
    } finally {
      restoringSelectedAgent = false;
    }
  });
</script>

<AppShell>
  <section class="page card">
    <h1>Sessions</h1>
    {#if restoringSelectedAgent || !$chatStore.storageHydrated}
      <p class="muted">Loading sessions...</p>
    {:else if !$chatStore.selectedAgentId}
      <p class="muted">Select an agent in chat to load sessions.</p>
      <button class="pill cta" on:click={() => goto('/?mode=agent')}>Go to Chat</button>
    {:else if $chatStore.sessionsLoading}
      <p class="muted">Loading sessions...</p>
    {:else if ($chatStore.sessions || []).length === 0}
      <p class="muted">No sessions found.</p>
    {:else}
      <div class="list">
        {#each $chatStore.sessions as session}
          {@const sid = session.sessionId || session.id}
          <div class="row-wrap">
            <button class="pill row" on:click={() => goto(`/sessions/${sid}`)}>
              <span>{session.title || sid || 'Untitled'}</span>
              <span class="muted">{session.createdAt ? new Date(session.createdAt).toLocaleString() : ''}</span>
            </button>
            <button class="del-btn" on:click|stopPropagation={() => requestDeleteSession(sid, session.title || sid)} aria-label="Delete session" title="Delete session">
              <Icon name="close" size={14} />
            </button>
          </div>
        {/each}
      </div>
    {/if}
  </section>
</AppShell>

<ConfirmDialog
  bind:open={confirmOpen}
  title="Delete Session"
  message={`Are you sure you want to delete session "${confirmSessionTitle}"? All runs in this session will be lost.`}
  confirmLabel="Delete"
  danger
  onConfirm={() => deleteSession(confirmSessionId)}
/>

<style>
  .page { min-height: calc(100svh - 92px); padding: 14px; }
  h1 { margin: 0 0 10px; }
  .muted { color: var(--muted); }
  .list { display: grid; gap: 8px; }
  .row-wrap { display: flex; align-items: center; gap: 6px; }
  .row { flex: 1; display: flex; justify-content: space-between; padding: 10px 12px; border-color: rgba(249,115,22,.34); background: var(--btn-secondary-bg); cursor: pointer; text-align: left; }
  .del-btn {
    width: 32px; height: 32px; border: 1px solid var(--border); border-radius: 999px;
    background: transparent; color: var(--muted); cursor: pointer;
    display: grid; place-items: center; padding: 0; flex-shrink: 0;
    transition: color 0.15s, border-color 0.15s, background 0.15s;
  }
  .del-btn:hover { color: var(--danger); border-color: var(--danger-border); background: var(--danger-soft); }
  .cta { margin-top: 8px; padding: 8px 14px; border-color: rgba(232,116,12,.5); background: rgba(232,116,12,.15); color: var(--accent); cursor: pointer; font-weight: 600; font-size: 12px; }
  .cta:hover { background: rgba(232,116,12,.25); }
</style>
