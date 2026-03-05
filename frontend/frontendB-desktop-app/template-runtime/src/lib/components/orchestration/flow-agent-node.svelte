<script>
  import { Handle, Position } from '@xyflow/svelte';

  export let data = {};
  export let selected = false;
</script>

<div class="node" class:selected>
  <Handle type="target" position={Position.Left} />
  <div class="body">
    <strong>{data?.label || 'Node'}</strong>
    <small>{data?.agentId || '--'}</small>
  </div>
  <Handle type="source" position={Position.Right} />
</div>

<style>
  .node {
    min-width: 170px;
    border: 1px solid rgba(255,255,255,.16);
    border-radius: 12px;
    background: rgba(20,24,32,.85);
    color: var(--fg);
    padding: 10px 12px;
    display: grid;
    gap: 4px;
    box-shadow: 0 6px 20px rgba(0,0,0,.2);
  }

  .node.selected {
    border-color: rgba(249,115,22,.8);
    box-shadow: 0 0 0 2px rgba(249,115,22,.2);
  }

  .body {
    display: grid;
    gap: 2px;
  }

  strong {
    font-size: 12px;
    line-height: 1.2;
  }

  small {
    font-size: 10px;
    color: var(--muted);
    line-height: 1.2;
  }
</style>
