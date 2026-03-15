<script>
  import { goto } from '$app/navigation';
  import AppShell from '@/lib/components/AppShell.svelte';
  import { chatStore } from '@/lib/stores/chat-store';
  import { postJson, invalidateCache } from '@/lib/api';

  let creating = false;
  let error = '';

  async function createOrchestration() {
    creating = true;
    error = '';
    try {
      const timestamp = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      const response = await postJson('/api/orchestrations', {
        name: `New Orchestration ${timestamp}`,
        description: 'Created from builder list',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || `Failed to create orchestration (${response.status})`);
      }
      const id = payload?.id || payload?.orchestrationId;
      if (!id) throw new Error('Orchestration created but no id returned');
      invalidateCache('/api/orchestrations');
      goto(`/orchestrate/${id}`);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      creating = false;
    }
  }
</script>

<AppShell>
  <section class="card page">
    <div class="head">
      <h1>Orchestration Builder</h1>
      <button class="pill cta" on:click={createOrchestration} disabled={creating}>
        {creating ? 'Creating...' : 'New Orchestration'}
      </button>
    </div>
    {#if error}
      <p class="error">{error}</p>
    {/if}
    <div class="list">
      {#each $chatStore.orchestrations as item}
        <button class="pill row" on:click={() => goto(`/orchestrate/${item.id}`)}>
          <span>{item.name || item.id}</span>
          <span class="muted">{item.status || 'draft'}</span>
        </button>
      {/each}
    </div>
  </section>
</AppShell>

<style>
  .page { padding: 18px; min-height: calc(100svh - 44px); }
  .head { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 12px; }
  h1 { margin: 0; }
  .list { display: grid; gap: 10px; }
  .row { display: flex; justify-content: space-between; padding: 12px 14px; }
  .muted { color: var(--muted); }
  .cta { padding: 8px 12px; border-color: rgba(249,115,22,.6); background: rgba(249,115,22,.2); cursor: pointer; }
  .error { margin: 0 0 10px; color: #fecdd3; font-size: 12px; }
</style>
