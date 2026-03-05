<script>
  import { createEventDispatcher } from 'svelte'

  export let title = 'Mayple'
  export let sourceText = 'Source: Frontend B orchestration runtime'
  export let connected = false
  export let analystOptions = []
  export let selectedAnalysts = []

  const dispatch = createEventDispatcher()

  $: selectedCount = selectedAnalysts.length

  function toggleAnalyst(name) {
    dispatch('toggleAnalyst', { name })
  }

  function clearAnalysts() {
    dispatch('clearAnalysts')
  }

  function refreshWorkspace() {
    dispatch('refreshWorkspace')
  }
</script>

<header class="top-bar" class:panel-connected={connected}>
  <div class="top-bar-brand">
    <span class="top-bar-title">{title}</span>
  </div>
  <div class="top-bar-end">
    <details class="analyst-filter">
      <summary class="analyst-filter-trigger">
        Analyst
        <span class="analyst-filter-count">{selectedCount === 0 ? 'Global' : `${selectedCount} selected`}</span>
      </summary>
      <div class="analyst-filter-menu">
        <button type="button" class="analyst-filter-clear" on:click={clearAnalysts}>Global (all analysts)</button>
        <div class="analyst-filter-list">
          {#each analystOptions as analyst}
            <label class="analyst-filter-item">
              <input
                type="checkbox"
                checked={selectedAnalysts.includes(analyst)}
                on:change={() => toggleAnalyst(analyst)}
              />
              <span>{analyst}</span>
            </label>
          {/each}
        </div>
      </div>
    </details>
    <span class="source-badge">{sourceText}</span>
    <button class="top-bar-icon-btn" type="button" aria-label="Refresh" on:click={refreshWorkspace}>↻</button>
  </div>
</header>
