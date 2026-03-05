<script>
  export let node = null;
  export let onChange = () => {};
  export let onRemove = () => {};
</script>

<section class="panel">
  <h3>Node Config</h3>
  {#if !node}
    <p class="muted">Select a node</p>
  {:else}
    <label>
      <span>Label</span>
      <input value={node.label || ''} on:input={(e) => onChange({ ...node, label: e.currentTarget.value })} />
    </label>
    <label>
      <span>Role</span>
      <input value={node.role || ''} on:input={(e) => onChange({ ...node, role: e.currentTarget.value })} />
    </label>
    <button class="pill danger" on:click={() => onRemove(node.id)}>Delete Node</button>
  {/if}
</section>

<style>
  .panel { border-left: 1px solid rgba(255,255,255,.08); padding: 10px; width: 240px; display: grid; gap: 8px; }
  h3 { margin: 0; font-size: 12px; text-transform: uppercase; color: var(--muted); }
  label span { display: block; margin-bottom: 4px; font-size: 11px; color: var(--muted); }
  input { width: 100%; border: 1px solid rgba(255,255,255,.14); border-radius: 10px; background: rgba(20,24,32,.72); color: var(--fg); padding: 7px 9px; outline: none; }
  .muted { margin: 0; color: var(--muted); font-size: 12px; }
  .danger { width: fit-content; padding: 7px 10px; border-color: rgba(251,113,133,.4); background: rgba(251,113,133,.16); cursor: pointer; }
</style>
