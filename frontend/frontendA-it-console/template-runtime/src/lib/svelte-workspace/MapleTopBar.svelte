<script>
  export let title = 'Mayple'
  export let sourceText = 'Source: Frontend B orchestration runtime'
  export let connected = false
</script>

<header class="top-bar" class:panel-connected={connected}>
  <div class="top-bar-brand">
    <span class="top-bar-title">{title}</span>
  </div>
  <div class="top-bar-end">
    <span class="source-badge">{sourceText}</span>
    <button class="top-bar-icon-btn" type="button" aria-label="Refresh">↻</button>
  </div>
</header>
