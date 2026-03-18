<script>
  import { browser } from '$app/environment'
  import { goto } from '$app/navigation'
  import { onDestroy, onMount } from 'svelte'

  let open = false
  let query = ''
  let results = []
  let loading = false
  let searchError = ''
  let selectedIndex = 0
  let recentSearches = []
  let debounceTimer = null
  let inputRef = null

  const MAX_RECENT = 5
  const DEBOUNCE_MS = 250
  const STORAGE_KEY = 'maple-recent-searches'

  onMount(() => {
    if (!browser) return undefined

    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        recentSearches = JSON.parse(stored).slice(0, MAX_RECENT)
      }
    } catch {
      recentSearches = []
    }

    window.addEventListener('keydown', handleGlobalKeydown)
    return () => {
      window.removeEventListener('keydown', handleGlobalKeydown)
    }
  })

  onDestroy(() => {
    if (debounceTimer) clearTimeout(debounceTimer)
  })

  function handleGlobalKeydown(event) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault()
      toggle()
    }
    if (event.key === 'Escape' && open) {
      close()
    }
  }

  function toggle() {
    open = !open
    if (open) {
      query = ''
      results = []
      selectedIndex = 0
      setTimeout(() => inputRef?.focus(), 30)
    }
  }

  function close() {
    open = false
    query = ''
    results = []
    loading = false
    searchError = ''
  }

  function onInput() {
    if (debounceTimer) clearTimeout(debounceTimer)
    if (!query.trim()) {
      results = []
      searchError = ''
      loading = false
      return
    }
    loading = true
    debounceTimer = setTimeout(doSearch, DEBOUNCE_MS)
  }

  async function doSearch() {
    const trimmed = query.trim()
    if (!trimmed) {
      results = []
      loading = false
      return
    }

    searchError = ''
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}&types=agents,runs,traces,approvals,policies`, {
        credentials: 'same-origin',
      })
      if (!response.ok) {
        throw new Error(`search -> ${response.status}`)
      }
      const payload = await response.json()
      results = Array.isArray(payload?.results) ? payload.results : []
    } catch {
      results = []
      searchError = 'Search unavailable'
    } finally {
      loading = false
      selectedIndex = 0
    }
  }

  function persistRecent(term) {
    recentSearches = [term, ...recentSearches.filter((entry) => entry !== term)].slice(0, MAX_RECENT)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(recentSearches))
    } catch {
      // ignore
    }
  }

  function clearRecentSearch(term) {
    recentSearches = recentSearches.filter((entry) => entry !== term)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(recentSearches))
    } catch {
      // ignore
    }
  }

  function applyRecent(term) {
    query = term
    onInput()
  }

  function resultHref(result) {
    const type = String(result?.type ?? '').toLowerCase()
    if (type.includes('approval') || type.includes('hitl')) return '/maple/hitl'
    if (type.includes('policy')) return '/maple/policies'
    if (type.includes('security') || type.includes('firewall')) return '/maple/gateway'
    if (type.includes('trace') || type.includes('run') || type.includes('agent')) return '/maple/agent'
    return '/maple/observability'
  }

  async function navigateToResult(result) {
    if (!result) return
    const trimmed = query.trim()
    if (trimmed) persistRecent(trimmed)
    close()
    await goto(resultHref(result))
  }

  function onKeydown(event) {
    const total = flatResults.length
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      selectedIndex = (selectedIndex + 1) % Math.max(total, 1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      selectedIndex = (selectedIndex - 1 + Math.max(total, 1)) % Math.max(total, 1)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      navigateToResult(flatResults[selectedIndex])
    } else if (event.key === 'Tab') {
      event.preventDefault()
      const nextGroupStart = groupStarts.find((index) => index > selectedIndex)
      selectedIndex = nextGroupStart ?? 0
    }
  }

  function onBackdropClick(event) {
    if (event.target === event.currentTarget) close()
  }

  $: groupedResults = (() => {
    const groups = {}
    for (const result of results) {
      const type = result?.type || 'Other'
      if (!groups[type]) groups[type] = []
      groups[type].push(result)
    }
    return groups
  })()

  $: flatResults = results
  $: groupStarts = (() => {
    const starts = []
    let offset = 0
    for (const type of Object.keys(groupedResults)) {
      starts.push(offset)
      offset += groupedResults[type].length
    }
    return starts
  })()
</script>

<div class="mw-search">
  <button type="button" class="mw-topbar-button mw-search-trigger" on:click={toggle} aria-label="Search">
    <span class="mw-search-trigger-label">Search</span>
    <span class="mw-search-shortcut">⌘K</span>
  </button>

  {#if open}
    <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
    <div class="search-backdrop" on:click={onBackdropClick}>
      <div class="search-palette" role="dialog" aria-label="Search">
        <div class="search-input-wrap">
          <span class="search-icon">⌘K</span>
          <input
            bind:this={inputRef}
            bind:value={query}
            type="text"
            class="search-palette-input"
            on:input={onInput}
            on:keydown={onKeydown}
            placeholder="Search traces, agent runs, policies, or approvals..."
            autocomplete="off"
            spellcheck="false"
          />
          {#if loading}
            <span class="search-spinner"></span>
          {/if}
        </div>

        <div class="search-results">
          {#if !query.trim() && recentSearches.length > 0}
            <div class="search-group">
              <h3 class="search-group-title">Recent Searches</h3>
              {#each recentSearches as recent, index}
                <div class="search-result-row" class:is-selected={selectedIndex === index}>
                  <button type="button" class="search-result-btn" on:click={() => applyRecent(recent)}>
                    <span class="search-result-icon">⟲</span>
                    <span>{recent}</span>
                  </button>
                  <button type="button" class="search-clear-btn" on:click={() => clearRecentSearch(recent)} aria-label="Remove">
                    ×
                  </button>
                </div>
              {/each}
            </div>
          {/if}

          {#if query.trim() && !loading && results.length === 0}
            <div class="search-empty">
              <p>No results for <strong>{query}</strong></p>
              <p class="search-empty-hint">Try a trace ID, run ID, policy name, or approval.</p>
            </div>
          {/if}

          {#if searchError}
            <div class="search-error"><p>{searchError}</p></div>
          {/if}

          {#each Object.entries(groupedResults) as [type, items]}
            <div class="search-group">
              <h3 class="search-group-title">{type} <span class="search-group-count">{items.length}</span></h3>
              {#each items as item}
                {@const globalIndex = flatResults.indexOf(item)}
                <button
                  type="button"
                  class="search-result-row"
                  class:is-selected={selectedIndex === globalIndex}
                  on:click={() => navigateToResult(item)}
                >
                  <span class="search-result-title">{item.title || item.id || 'Untitled'}</span>
                  {#if item.description}
                    <span class="search-result-desc">{item.description}</span>
                  {/if}
                </button>
              {/each}
            </div>
          {/each}
        </div>

        <div class="search-footer">
          <span><kbd>↑↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>Tab</kbd> next group</span>
          <span><kbd>Esc</kbd> close</span>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .mw-search {
    position: relative;
  }

  .mw-search-trigger {
    min-width: 9rem;
    justify-content: space-between;
  }

  .mw-search-trigger-label {
    font-weight: 600;
  }

  .mw-search-shortcut {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: var(--text-2xs);
    color: var(--mw-muted, var(--muted));
  }

  .search-backdrop {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: rgba(33, 22, 12, 0.22);
    backdrop-filter: blur(4px);
    display: grid;
    place-items: start center;
    padding-top: 12vh;
  }

  .search-palette {
    width: min(640px, 92vw);
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-strong);
    overflow: hidden;
  }

  .search-input-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--line);
  }

  .search-icon {
    font-size: var(--text-xs);
    color: var(--muted);
    background: var(--bg-soft);
    padding: 2px 6px;
    border-radius: var(--radius-xs);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }

  .search-palette-input {
    flex: 1;
    border: none;
    background: transparent;
    font-size: var(--text-base);
    color: var(--ink);
    outline: none;
  }

  .search-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid var(--line);
    border-top-color: var(--brand);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .search-results {
    max-height: 24rem;
    overflow-y: auto;
  }

  .search-group {
    padding: 4px 0;
  }

  .search-group-title {
    font-size: var(--text-xs);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted);
    padding: 6px 16px 2px;
    margin: 0;
  }

  .search-group-count {
    font-weight: 400;
    color: var(--muted);
  }

  .search-result-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    cursor: pointer;
    border: none;
    background: transparent;
    width: 100%;
    text-align: left;
    font-size: 0.9rem;
    color: var(--ink);
    transition: background 0.1s;
  }

  .search-result-row:hover,
  .search-result-row.is-selected {
    background: var(--brand-tint);
  }

  .search-result-btn {
    all: unset;
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    cursor: pointer;
  }

  .search-result-title {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .search-result-desc {
    color: var(--muted);
    font-size: var(--text-sm);
    margin-left: auto;
  }

  .search-result-icon {
    color: var(--muted);
  }

  .search-clear-btn {
    all: unset;
    cursor: pointer;
    color: var(--muted);
    padding: 2px 6px;
    border-radius: var(--radius-xs);
  }

  .search-empty,
  .search-error {
    padding: 18px 16px;
    text-align: center;
  }

  .search-empty-hint {
    color: var(--muted);
    font-size: var(--text-sm);
  }

  .search-footer {
    display: flex;
    gap: 12px;
    padding: 8px 16px;
    border-top: 1px solid var(--line);
    font-size: var(--text-xs);
    color: var(--muted);
    flex-wrap: wrap;
  }

  .search-footer kbd {
    background: var(--bg-soft);
    padding: 1px 5px;
    border-radius: var(--radius-xs);
    border: 1px solid var(--line);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.65rem;
  }

  @media (max-width: 900px) {
    .mw-search-trigger {
      min-width: 0;
      padding-inline: 10px;
    }

    .mw-search-trigger-label {
      display: none;
    }
  }
</style>
