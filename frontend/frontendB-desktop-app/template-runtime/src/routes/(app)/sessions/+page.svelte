<script>
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { goto } from '$app/navigation';
  import AppShell from '@/lib/components/AppShell.svelte';
  import { chatStore } from '@/lib/stores/chat-store';

  const AGENT_ID_KEY = 'selectedAgentId';

  let restoringSelectedAgent = false;

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
    {:else if $chatStore.sessionsLoading}
      <p class="muted">Loading sessions...</p>
    {:else if ($chatStore.sessions || []).length === 0}
      <p class="muted">No sessions found.</p>
    {:else}
      <div class="list">
        {#each $chatStore.sessions as session}
          {@const sid = session.sessionId || session.id}
          <button class="pill row" on:click={() => goto(`/sessions/${sid}`)}>
            <span>{session.title || sid || 'Untitled'}</span>
            <span class="muted">{session.createdAt ? new Date(session.createdAt).toLocaleString() : ''}</span>
          </button>
        {/each}
      </div>
    {/if}
  </section>
</AppShell>

<style>
  .page { min-height: calc(100svh - 24px); padding: 14px; }
  h1 { margin: 0 0 10px; }
  .muted { color: var(--muted); }
  .list { display: grid; gap: 8px; }
  .row { display: flex; justify-content: space-between; padding: 10px 12px; border-color: rgba(249,115,22,.34); background: var(--btn-secondary-bg); cursor: pointer; text-align: left; }
</style>
