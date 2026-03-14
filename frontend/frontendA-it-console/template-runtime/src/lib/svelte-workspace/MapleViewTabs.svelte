<script>
  export let views = []
  export let activeView = ''
  export let labels = {}
  export let hrefByView = {}
</script>

<div class="context-sub-tabs" role="tablist" aria-label="Category views">
  {#each views as view}
    <a
      href={hrefByView[view] ?? '#'}
      class="context-sub-tab"
      class:is-active={activeView === view}
      role="tab"
      aria-selected={activeView === view}
    >
      {labels[view] ?? view}
    </a>
  {/each}
</div>
