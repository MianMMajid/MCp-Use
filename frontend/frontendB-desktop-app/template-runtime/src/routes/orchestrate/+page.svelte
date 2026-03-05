<script>
  import { goto } from '$app/navigation';
  import AppShell from '@/lib/components/AppShell.svelte';
  import { chatStore } from '@/lib/stores/chat-store';
</script>

<AppShell>
  <section class="card page">
    <h1>Orchestration Builder</h1>
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
  h1 { margin: 0 0 12px; }
  .list { display: grid; gap: 10px; }
  .row { display: flex; justify-content: space-between; padding: 12px 14px; }
  .muted { color: var(--muted); }
</style>
