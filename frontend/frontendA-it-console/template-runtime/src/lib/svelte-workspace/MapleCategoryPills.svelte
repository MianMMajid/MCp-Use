<script>
  import { goto } from '$app/navigation'
  import { tick, onMount } from 'svelte'

  export let categories = []
  export let activeCategory = 'observe'
  export let hrefByCategory = {}

  let trackEl
  let indicatorLeft = 0
  let indicatorWidth = 0
  let ready = false

  $: activeIndex = Math.max(categories.findIndex((c) => c.id === activeCategory), 0)
  $: hasActive = categories.some((c) => c.id === activeCategory)

  // Re-measure whenever the active category changes
  $: activeCategory, activeIndex, tick().then(() => measureActivePill())

  function measureActivePill() {
    if (!trackEl) return
    const pills = trackEl.querySelectorAll('.category-pill')
    const activePill = pills[activeIndex]
    if (!activePill) return
    const trackRect = trackEl.getBoundingClientRect()
    const pillRect = activePill.getBoundingClientRect()
    indicatorLeft = pillRect.left - trackRect.left
    indicatorWidth = pillRect.width
    ready = true
  }

  function handleNavigate(event, href) {
    if (!href || href === '#') return
    event.preventDefault()
    goto(href)
  }

  onMount(() => {
    measureActivePill()
    // Re-measure on resize
    const observer = new ResizeObserver(measureActivePill)
    observer.observe(trackEl)
    return () => observer.disconnect()
  })
</script>

<nav class="category-bar" aria-label="Workspace categories">
  <div class="category-track" bind:this={trackEl}>
    {#if ready}
      <span
        class="category-indicator"
        class:is-active={hasActive}
        style="left:{indicatorLeft}px; width:{indicatorWidth}px;"
      ></span>
    {/if}
    {#each categories as category}
      <a
        class="category-pill"
        class:is-active={activeCategory === category.id}
        href={hrefByCategory[category.id] ?? '#'}
        role="tab"
        aria-selected={activeCategory === category.id}
        on:click={(event) => handleNavigate(event, hrefByCategory[category.id] ?? '#')}
      >
        {category.label}
      </a>
    {/each}
    <slot />
  </div>
</nav>
