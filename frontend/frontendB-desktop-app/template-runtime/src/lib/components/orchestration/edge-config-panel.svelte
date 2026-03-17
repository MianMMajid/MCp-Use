<script>
  export let edge = null;
  export let onChange = () => {};
  export let onRemove = () => {};
</script>

<section class="panel">
  <h3>Edge Policy</h3>
  {#if !edge}
    <p class="muted">Select an edge</p>
  {:else}
    <label>
      <span>Risk Ceiling</span>
      <select value={edge.delegationPolicy?.riskCeiling || 'medium'} on:change={(e) => onChange({ ...edge, delegationPolicy: { ...(edge.delegationPolicy || {}), riskCeiling: e.currentTarget.value } })}>
        <option value="low">low</option>
        <option value="medium">medium</option>
        <option value="high">high</option>
        <option value="critical">critical</option>
      </select>
    </label>
    <label class="check">
      <input type="checkbox" checked={Boolean(edge.delegationPolicy?.requiresApproval)} on:change={(e) => onChange({ ...edge, delegationPolicy: { ...(edge.delegationPolicy || {}), requiresApproval: e.currentTarget.checked } })} />
      <span>Requires Approval</span>
    </label>
    <button class="pill danger" on:click={() => onRemove(edge.id)}>Delete Edge</button>
  {/if}
</section>

<style>
  .panel { border-left: 1px solid var(--row-border); padding: 10px; width: 240px; display: grid; gap: 8px; }
  h3 { margin: 0; font-size: 12px; text-transform: uppercase; color: var(--muted); }
  label span { display: block; margin-bottom: 4px; font-size: 11px; color: var(--muted); }
  select { width: 100%; border: 1px solid var(--input-border); border-radius: 10px; background: var(--input-bg); color: var(--fg); padding: 7px 9px; outline: none; }
  .check { display: flex; gap: 8px; align-items: center; }
  .check span { margin: 0; }
  .muted { margin: 0; color: var(--muted); font-size: 12px; }
  .danger { width: fit-content; padding: 7px 10px; border-color: rgba(251,113,133,.4); background: rgba(251,113,133,.16); cursor: pointer; }
</style>
