<script>
  import { goto } from '$app/navigation'

  export let views = []
  export let activeView = ''
  export let labels = {}
  export let hrefByView = {}

  function handleNavigate(event, href) {
    if (!href || href === '#') return
    event.preventDefault()
    goto(href)
  }
</script>

<div class="context-sub-tabs" role="tablist" aria-label="Category views">
  {#each views as view}
    <a
      href={hrefByView[view] ?? '#'}
      class="context-sub-tab"
      class:is-active={activeView === view}
      role="tab"
      aria-selected={activeView === view}
      on:click={(event) => handleNavigate(event, hrefByView[view] ?? '#')}
    >
      {labels[view] ?? view}
    </a>
  {/each}
</div>
