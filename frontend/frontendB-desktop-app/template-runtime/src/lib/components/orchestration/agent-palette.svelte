<script>
  export let agents = [];
  export let nodes = [];
  let search = '';

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
</script>

<aside class="palette">
  <div class="head">
    <h3>Agents</h3>
    <input bind:value={search} placeholder="Search..." />
  </div>

  <div class="list">
    {#each filtered as agent}
      {@const id = agent.agentId || agent.id}
      <button type="button" class="item" draggable="true" on:dragstart={(event) => onDragStart(event, id)}>
        <div class="meta">
          <p>{agent.name || id}</p>
          <span>{agent.status || 'unknown'}</span>
        </div>
        {#if onCanvasIds.has(id)}
          <small>on canvas</small>
        {/if}
      </button>
    {/each}
    {#if filtered.length === 0}
      <p class="empty">No agents found</p>
    {/if}
  </div>
</aside>

<style>
  .palette { width: 232px; border-right: 1px solid rgba(255,255,255,.08); padding: 10px; display: grid; grid-template-rows: auto 1fr; min-height: 0; }
  .head h3 { margin: 0 0 8px; font-size: 12px; text-transform: uppercase; color: var(--muted); }
  .head input { width: 100%; border: 1px solid rgba(255,255,255,.14); border-radius: 10px; background: rgba(20,24,32,.72); color: var(--fg); padding: 7px 9px; outline: none; }
  .list { margin-top: 8px; overflow: auto; display: grid; gap: 8px; }
  .item {
    width: 100%;
    border: 1px solid rgba(255,255,255,.1);
    border-radius: 12px;
    background: rgba(20,24,32,.6);
    padding: 8px;
    cursor: grab;
    display: grid;
    gap: 4px;
    text-align: left;
    color: inherit;
  }
  .meta { display: flex; justify-content: space-between; gap: 6px; align-items: center; }
  .meta p { margin: 0; font-size: 12px; font-weight: 600; }
  .meta span { font-size: 10px; color: var(--muted); }
  small { color: #86efac; font-size: 10px; }
  .empty { margin: 0; color: var(--muted); font-size: 12px; text-align: center; padding: 8px; }
</style>
