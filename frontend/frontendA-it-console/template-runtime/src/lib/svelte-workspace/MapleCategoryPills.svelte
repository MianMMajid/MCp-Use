<script>
  export let categories = []
  export let activeCategory = 'observe'
  export let hrefByCategory = {}

  $: activeIndex = Math.max(categories.findIndex((c) => c.id === activeCategory), 0)
  $: hasActive = categories.some((c) => c.id === activeCategory)
</script>

<nav class="category-bar" aria-label="Workspace categories">
  <div
    class="category-track"
    style={`--pill-count:${Math.max(categories.length, 1)}; --active-index:${activeIndex};`}
  >
    <span class="category-indicator" class:is-active={hasActive}></span>
    {#each categories as category}
      <a
        class="category-pill"
        class:is-active={activeCategory === category.id}
        href={hrefByCategory[category.id] ?? '#'}
        role="tab"
        aria-selected={activeCategory === category.id}
      >
        {category.label}
      </a>
    {/each}
  </div>
</nav>
