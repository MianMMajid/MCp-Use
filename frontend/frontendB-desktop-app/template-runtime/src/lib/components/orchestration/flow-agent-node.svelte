<script>
  import { Handle, Position } from '@xyflow/svelte';

  export let data = {};
  export let selected = false;
</script>

<div class="node agent-drag-handle" class:selected>
  <Handle type="target" position={Position.Left} />
  <div class="body">
    <div class="top">
      <strong>{data?.label || 'Node'}</strong>
      {#if data?.hasFirewall}
        <span class="shield" title="Firewall active">🛡</span>
      {/if}
    </div>
    <small>{data?.agentId || '--'}</small>
    {#if Array.isArray(data?.toolBadges) && data.toolBadges.length > 0}
      <div class="badges">
        {#each data.toolBadges as badge}
          <span class="badge">{badge}</span>
        {/each}
      </div>
    {/if}
  </div>
  <Handle type="source" position={Position.Right} />
</div>

<style>
  .node {
    min-width: 170px;
    border: 1px solid var(--row-border);
    border-radius: 12px;
    background: var(--card-bg);
    color: var(--fg);
    padding: 10px 12px;
    display: grid;
    gap: 4px;
    box-shadow: 0 6px 20px rgba(0,0,0,.2);
    cursor: grab;
  }
  .node:active { cursor: grabbing; }

  .node.selected {
    border-color: rgba(249,115,22,.8);
    box-shadow: 0 0 0 2px rgba(249,115,22,.2);
  }

  .body {
    display: grid;
    gap: 2px;
  }
  .top { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
  .shield { font-size: 11px; color: #f59e0b; }

  strong {
    font-size: 12px;
    line-height: 1.2;
  }

  small {
    font-size: 10px;
    color: var(--muted);
    line-height: 1.2;
  }
  .badges { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 2px; }
  .badge {
    border: 1px solid rgba(148,163,184,.3);
    border-radius: 999px;
    padding: 1px 5px;
    font-size: 9px;
    color: var(--muted);
    background: var(--row-bg);
  }
</style>
