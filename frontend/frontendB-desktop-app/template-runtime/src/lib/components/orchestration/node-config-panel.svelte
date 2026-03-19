<script>
  export let node = null;
  export let firewallLibrary = [];
  export let firewallOverview = null;
  export let canDelete = true;
  export let onChange = () => {};
  export let onRemove = () => {};
</script>

<section class="panel">
  <h3>Node Config</h3>
  {#if !node}
    <p class="muted">Click a node on the canvas to configure it.</p>
  {:else}
    <label>
      <span>Label</span>
      <input value={node.label || ''} on:input={(e) => onChange({ ...node, label: e.currentTarget.value })} />
    </label>
    {#if node.isInstruction}
      <p class="muted">Instruction node does not accept firewall assignment.</p>
    {:else}
      <label>
        <span>Assign Firewall</span>
        <select
          value={node?.config?.firewallId || ''}
          on:change={(e) =>
            onChange({
              ...node,
              config: { ...(node.config || {}), firewallId: e.currentTarget.value || '' },
            })}
        >
          <option value="">No Firewall</option>
          {#each firewallLibrary as fw}
            <option value={fw.id}>{fw.name || fw.id} ({fw.scope === 'agent' ? 'Agent' : 'Global'})</option>
          {/each}
        </select>
      </label>
    {/if}
    <div class="fw">
      <h4>Firewall Overview</h4>
      {#if firewallOverview}
        <p class="safe">Protected</p>
        <p class="muted">{firewallOverview.name || 'Policy'}</p>
        <p class="muted">Scope: {firewallOverview.scope === 'agent' ? 'Agent-Specific' : 'Global'}</p>
      {:else}
        <p class="warn">No active firewall for this node.</p>
      {/if}
    </div>
    {#if canDelete}
      <button class="pill danger" on:click={() => onRemove(node.id)}>Delete Node</button>
    {:else}
      <p class="muted">Instruction node is fixed and cannot be deleted.</p>
    {/if}
  {/if}
</section>

<style>
  .panel { border-left: 1px solid var(--row-border); padding: 10px; width: 240px; display: grid; gap: 8px; }
  h3 { margin: 0; font-size: 12px; text-transform: uppercase; color: var(--muted); }
  label span { display: block; margin-bottom: 4px; font-size: 11px; color: var(--muted); }
  input, select { width: 100%; border: 1px solid var(--input-border); border-radius: 10px; background: var(--input-bg); color: var(--fg); padding: 7px 9px; outline: none; }
  .muted { margin: 0; color: var(--muted); font-size: 12px; }
  .fw { border: 1px solid var(--row-border); border-radius: 10px; background: var(--btn-secondary-bg); padding: 8px; display: grid; gap: 4px; }
  h4 { margin: 0; font-size: 11px; color: var(--muted); text-transform: uppercase; }
  .safe { margin: 0; color: #6ee7b7; font-size: 12px; }
  .warn { margin: 0; color: #fcd34d; font-size: 12px; }
  .danger { width: fit-content; padding: 7px 10px; border-color: rgba(251,113,133,.4); background: rgba(251,113,133,.16); cursor: pointer; }
</style>
