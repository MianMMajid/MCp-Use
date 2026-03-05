<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import AppShell from '@/lib/components/AppShell.svelte';
  import { loadJson } from '@/lib/api';
  import { statusColor } from '@/lib/format';
  export let data;

  let loading = true;
  let error = '';
  let agent = null;

  function badgeClass(value) {
    const color = statusColor(value);
    if (color === 'green') return 'badge green';
    if (color === 'red') return 'badge red';
    if (color === 'orange') return 'badge orange';
    return 'badge zinc';
  }

  onMount(async () => {
    loading = true;
    error = '';
    try {
      agent = await loadJson(`/api/agents/${data.id}`);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      loading = false;
    }
  });
</script>

<AppShell>
  <section class="page card">
    {#if loading}
      <p class="muted">Loading agent...</p>
    {:else if error}
      <p class="err">{error}</p>
    {:else}
      <div class="top">
        <h1>{agent?.name || agent?.displayName || data.id}</h1>
        <span class={badgeClass(agent?.status || 'unknown')}>{agent?.status || 'unknown'}</span>
      </div>
      <p class="muted">{agent?.description || 'No description provided.'}</p>
      <div class="grid">
        <div><span class="label">Agent ID</span><p>{agent?.agentId || agent?.id || data.id}</p></div>
        <div><span class="label">Model</span><p>{agent?.model || '--'}</p></div>
        <div><span class="label">Temperature</span><p>{agent?.temperature ?? '--'}</p></div>
        <div><span class="label">Max steps</span><p>{agent?.maxSteps ?? '--'}</p></div>
      </div>
      <button class="pill" on:click={() => goto('/?mode=agent')}>Open in Chat</button>
    {/if}
  </section>
</AppShell>

<style>
  .page { min-height: calc(100svh - 24px); padding: 14px; display: grid; gap: 10px; }
  .top { display: flex; align-items: center; gap: 8px; }
  h1 { margin: 0; flex: 1; font-size: 1.2rem; }
  .muted { margin: 0; color: var(--muted); }
  .grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
  .label { display: block; color: var(--muted); font-size: 12px; margin-bottom: 3px; }
  .grid p { margin: 0; }
  button { width: fit-content; padding: 8px 11px; border-color: rgba(249,115,22,.35); background: rgba(20,24,32,.65); cursor: pointer; }
  .badge { border-radius: 999px; padding: 2px 8px; font-size: 10px; border: 1px solid transparent; text-transform: lowercase; }
  .green { color: #10b981; background: rgba(16, 185, 129, 0.14); border-color: rgba(16, 185, 129, 0.3); }
  .red { color: #fb7185; background: rgba(251, 113, 133, 0.14); border-color: rgba(251, 113, 133, 0.3); }
  .orange { color: #fb923c; background: rgba(251, 146, 60, 0.14); border-color: rgba(251, 146, 60, 0.3); }
  .zinc { color: #d4d4d8; background: rgba(212, 212, 216, 0.1); border-color: rgba(212, 212, 216, 0.22); }
  .err { color: #fecdd3; }
</style>
