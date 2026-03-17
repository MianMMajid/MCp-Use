<script>
  import { goto } from '$app/navigation';
  import { postJson, invalidateCache } from '@/lib/api';

  export let agents = [];
  export let nodes = [];
  export let onAgentCreated = () => {};
  let search = '';
  let createOpen = false;
  let createName = '';
  let createBusy = false;
  let createError = '';

  $: filtered = search
    ? (agents || []).filter((item) =>
        String(item.name || '').toLowerCase().includes(search.toLowerCase()) ||
        String(item.description || '').toLowerCase().includes(search.toLowerCase())
      )
    : (agents || []);

  $: onCanvasIds = new Set((nodes || []).map((node) => node.agentId).filter(Boolean));

  function onDragStart(event, agentId) {
    event.dataTransfer.setData('application/orchestration-agent', agentId);
    event.dataTransfer.effectAllowed = 'move';
  }

  async function handleCreate() {
    if (!createName.trim()) return;
    createBusy = true;
    createError = '';
    try {
      const response = await postJson('/api/agents', { name: createName.trim() });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        createError = payload?.error || `Failed (${response.status})`;
        return;
      }
      invalidateCache('/api/agents');
      createName = '';
      createOpen = false;
      search = '';
      onAgentCreated();
    } catch (err) {
      createError = err instanceof Error ? err.message : String(err);
    } finally {
      createBusy = false;
    }
  }

  function onCreateKeydown(event) {
    if (event.key === 'Enter') handleCreate();
    if (event.key === 'Escape') { createOpen = false; createError = ''; }
  }
</script>

<aside class="palette">
  <div class="head">
    <div class="head-row">
      <h3>Agents</h3>
      <button class="add-btn" title="Create new agent" on:click={() => { createOpen = !createOpen; createError = ''; }}>
        {createOpen ? '✕' : '+'}
      </button>
    </div>
    <input bind:value={search} placeholder="Search..." />
  </div>

  {#if createOpen}
    <div class="create-form">
      <input
        bind:value={createName}
        placeholder="Agent name..."
        on:keydown={onCreateKeydown}
        autofocus
      />
      <button class="create-btn" on:click={handleCreate} disabled={createBusy || !createName.trim()}>
        {createBusy ? '...' : 'Create'}
      </button>
      {#if createError}<p class="create-err">{createError}</p>{/if}
    </div>
  {/if}

  <div class="list">
    {#each filtered as agent}
      {@const id = agent.agentId || agent.id}
      <div class="item" draggable="true" on:dragstart={(event) => onDragStart(event, id)}>
        <div class="meta">
          <p><span class="drag">⋮⋮</span>{agent.name || id}</p>
          <span>{agent.status || 'unknown'}</span>
        </div>
        <div class="item-actions">
          {#if onCanvasIds.has(id)}
            <small class="on-canvas">on canvas</small>
          {/if}
          <button class="config-link" title="Configure agent" on:click|stopPropagation={() => goto('/agents/' + id)}>cfg</button>
        </div>
      </div>
    {/each}
    {#if filtered.length === 0}
      <div class="empty">
        <p>No agents found</p>
        {#if !createOpen}
          <button class="create-inline" on:click={() => { createOpen = true; }}>Create one →</button>
        {/if}
      </div>
    {/if}
  </div>
</aside>

<style>
  .palette { width: 232px; border-right: 1px solid var(--row-border); padding: 10px; display: grid; grid-template-rows: auto auto 1fr; min-height: 0; gap: 6px; }
  .head { display: grid; gap: 6px; }
  .head-row { display: flex; justify-content: space-between; align-items: center; }
  .head h3 { margin: 0; font-size: 12px; text-transform: uppercase; color: var(--muted); }
  .head input { width: 100%; border: 1px solid var(--input-border); border-radius: 10px; background: var(--input-bg); color: var(--fg); padding: 7px 9px; outline: none; font-size: 12px; }
  .add-btn { width: 24px; height: 24px; border: 1px solid var(--border); border-radius: 8px; background: var(--glass); color: var(--accent); font-size: 14px; font-weight: 700; cursor: pointer; display: grid; place-items: center; padding: 0; transition: background 0.15s; }
  .add-btn:hover { background: var(--accent-soft); }

  /* Create form */
  .create-form { border: 1px solid rgba(232, 116, 12, 0.3); border-radius: 10px; background: var(--accent-soft); padding: 8px; display: grid; gap: 6px; }
  .create-form input { width: 100%; border: 1px solid var(--input-border); border-radius: 8px; background: var(--input-bg); color: var(--fg); padding: 6px 8px; outline: none; font-size: 12px; }
  .create-btn { border: 1px solid rgba(232, 116, 12, 0.5); border-radius: 8px; background: linear-gradient(145deg, var(--accent-light, #ff8f2e), var(--accent)); color: #fff; padding: 5px 10px; font-size: 11px; font-weight: 700; cursor: pointer; }
  .create-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .create-err { margin: 0; color: var(--warn); font-size: 10px; }

  /* Agent list */
  .list { overflow: auto; display: grid; gap: 6px; align-content: start; }
  .item {
    width: 100%;
    border: 1px solid var(--row-border);
    border-radius: 10px;
    background: var(--btn-secondary-bg);
    padding: 7px 8px;
    cursor: grab;
    display: grid;
    gap: 3px;
    text-align: left;
    color: inherit;
    transition: border-color 0.15s;
  }
  .item:hover { border-color: var(--accent); }
  .meta { display: flex; justify-content: space-between; gap: 4px; align-items: center; }
  .meta p { margin: 0; font-size: 11px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; }
  .drag { color: var(--muted); font-size: 10px; letter-spacing: -1px; }
  .meta span { font-size: 9px; color: var(--muted); }
  .item-actions { display: flex; justify-content: space-between; align-items: center; }
  .on-canvas { color: #10b981; font-size: 9px; }
  .config-link { border: 0; background: transparent; color: var(--muted); font-size: 12px; cursor: pointer; padding: 2px 4px; border-radius: 4px; }
  .config-link:hover { color: var(--accent); background: var(--accent-soft); }

  /* Empty */
  .empty { text-align: center; padding: 12px 8px; display: grid; gap: 6px; justify-items: center; }
  .empty p { margin: 0; color: var(--muted); font-size: 11px; }
  .create-inline { border: 1px solid rgba(232, 116, 12, 0.3); border-radius: 8px; background: var(--accent-soft); color: var(--accent); padding: 4px 10px; font-size: 11px; font-weight: 600; cursor: pointer; }
</style>
