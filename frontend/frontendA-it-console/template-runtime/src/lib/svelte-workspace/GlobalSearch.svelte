<script>
  import { onMount, onDestroy } from 'svelte'
  import { browser } from '$app/environment'
  import { goto } from '$app/navigation'
  import { buildWorkspaceHref } from '../maple-workspace/workspace-state.js'

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
  const DEBOUNCE_MS = 300
  const STORAGE_KEY = 'maple-recent-searches'

  onMount(() => {
    // Load recent searches
    if (browser) {
      try {
        const stored = localStorage.getItem(STORAGE_KEY)
        if (stored) recentSearches = JSON.parse(stored).slice(0, MAX_RECENT)
      } catch { /* ignore */ }
      window.addEventListener('keydown', handleGlobalKeydown)
    }
  })

  onDestroy(() => {
    if (browser) window.removeEventListener('keydown', handleGlobalKeydown)
    if (debounceTimer) clearTimeout(debounceTimer)
  })

  function handleGlobalKeydown(event) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
      event.preventDefault()
      event.stopPropagation()
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
      // Focus input after DOM update
      setTimeout(() => inputRef?.focus(), 50)
    }
  }

  function close() {
    open = false
    query = ''
    results = []
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
    const q = query.trim()
    if (!q) { results = []; loading = false; return }
    searchError = ''

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&types=agents,runs,traces,approvals`, {
        credentials: 'same-origin',
      })
      if (res.ok) {
        const data = await res.json()
        results = Array.isArray(data.results) ? data.results : []
      } else {
        results = []
        searchError = 'Search unavailable'
      }
    } catch {
      results = []
      searchError = 'Search unavailable — check connection'
    } finally {
      loading = false
      selectedIndex = 0
    }
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
      // Cycle through groups
      const nextGroupStart = groupStarts.find((idx) => idx > selectedIndex)
      selectedIndex = nextGroupStart ?? 0
    }
  }

  function navigateToResult(result) {
    if (!result) return

    // Save to recent searches
    const q = query.trim()
    if (q) {
      recentSearches = [q, ...recentSearches.filter((s) => s !== q)].slice(0, MAX_RECENT)
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(recentSearches)) } catch {}
    }

    close()

    // Navigate based on result type
    const type = result.type?.toLowerCase() || ''
    if (type === 'agent' || type === 'agents') {
      goto(buildWorkspaceHref({ category: 'admin', view: 'control', routePath: '/maple/agent' }))
    } else if (type === 'run' || type === 'runs' || type === 'trace' || type === 'traces') {
      goto(buildWorkspaceHref({
        category: 'observe',
        view: 'timeline',
        routePath: '/maple/runs',
        executionId: result.id || '',
      }))
    } else if (type === 'approval' || type === 'approvals') {
      goto(buildWorkspaceHref({ category: 'admin', view: 'control', routePath: '/maple/hitl' }))
    } else {
      goto(buildWorkspaceHref({ category: 'observe', view: 'live', routePath: '/maple/observability' }))
    }
  }

  function clearRecentSearch(searchTerm) {
    recentSearches = recentSearches.filter((s) => s !== searchTerm)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(recentSearches)) } catch {}
  }

  function applyRecent(searchTerm) {
    query = searchTerm
    onInput()
  }

  // Group results by type
  $: groupedResults = (() => {
    const groups = {}
    for (const result of results) {
      const type = result.type || 'Other'
      if (!groups[type]) groups[type] = []
      groups[type].push(result)
    }
    return groups
  })()

  $: flatResults = results
  $: groupStarts = (() => {
    const starts = []
    let idx = 0
    for (const type of Object.keys(groupedResults)) {
      starts.push(idx)
      idx += groupedResults[type].length
    }
    return starts
  })()

  function onBackdropClick(event) {
    if (event.target === event.currentTarget) close()
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
  <div class="search-backdrop" on:click={onBackdropClick}>
    <div class="search-palette" role="dialog" aria-label="Search">
      <div class="search-input-wrap">
        <span class="search-icon">⌘K</span>
        <input
          bind:this={inputRef}
          type="text"
          class="search-palette-input"
          bind:value={query}
          on:input={onInput}
          on:keydown={onKeydown}
          placeholder="Search traces, agents, policies, users..."
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
            {#each recentSearches as recent, idx}
              <div class="search-result-row" class:is-selected={selectedIndex === idx}>
                <button type="button" class="search-result-btn" on:click={() => applyRecent(recent)}>
                  <span class="search-result-icon">⟲</span>
                  <span>{recent}</span>
                </button>
                <button type="button" class="search-clear-btn" on:click={() => clearRecentSearch(recent)} aria-label="Remove">×</button>
              </div>
            {/each}
          </div>
        {/if}

        {#if query.trim() && results.length === 0 && !loading}
          <div class="search-empty">
            <p>No results for '<strong>{query}</strong>'</p>
            <p class="search-empty-hint">Try searching for trace IDs, agent names, or policy rules</p>
          </div>
        {/if}

        {#if searchError}
          <div class="search-error"><p>{searchError}</p></div>
        {/if}

        {#each Object.entries(groupedResults) as [type, items]}
          <div class="search-group">
            <h3 class="search-group-title">{type} <span class="search-group-count">{items.length}</span></h3>
            {#each items as item, idx}
              {@const globalIdx = flatResults.indexOf(item)}
              <button
                type="button"
                class="search-result-row"
                class:is-selected={selectedIndex === globalIdx}
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

<style>
  .search-backdrop {
    position: fixed; inset: 0; z-index: 9999;
    background: rgba(0, 0, 0, 0.4); backdrop-filter: blur(4px);
    display: grid; place-items: start center; padding-top: 15vh;
  }
  .search-palette {
    width: min(600px, 90vw); background: var(--panel, #fff);
    border: 1px solid var(--line, #e0e0e0); border-radius: 14px;
    box-shadow: var(--shadow-strong, 0 16px 38px rgba(0,0,0,0.08));
    overflow: hidden; animation: searchIn 0.15s ease-out;
  }
  @keyframes searchIn { from { opacity: 0; transform: translateY(-8px) scale(0.98); } }
  .search-input-wrap {
    display: flex; align-items: center; gap: 8px;
    padding: 12px 16px; border-bottom: 1px solid var(--line, #e0e0e0);
  }
  .search-icon { font-size: 0.75rem; color: var(--muted, #999); background: var(--bg-soft, #f5f5f5); padding: 2px 6px; border-radius: 4px; font-family: monospace; }
  .search-palette-input {
    flex: 1; border: none; background: transparent; font-size: 1rem;
    color: var(--ink, #1a1a1a); outline: none;
  }
  .search-spinner { width: 16px; height: 16px; border: 2px solid var(--line, #ddd); border-top-color: var(--brand, #e8740c); border-radius: 50%; animation: spin 0.6s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .search-results { max-height: 400px; overflow-y: auto; }
  .search-group { padding: 4px 0; }
  .search-group-title { font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted, #999); padding: 6px 16px 2px; margin: 0; }
  .search-group-count { font-weight: 400; color: var(--muted, #bbb); }
  .search-result-row {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 16px; cursor: pointer; border: none;
    background: transparent; width: 100%; text-align: left;
    font-size: 0.9rem; color: var(--ink, #333);
    transition: background 0.1s;
  }
  .search-result-row:hover, .search-result-row.is-selected { background: rgba(232, 116, 12, 0.06); }
  .search-result-btn { all: unset; display: flex; align-items: center; gap: 8px; flex: 1; cursor: pointer; }
  .search-result-icon { color: var(--muted, #999); }
  .search-result-title { font-weight: 500; }
  .search-result-desc { color: var(--muted, #999); font-size: 0.8rem; margin-left: auto; }
  .search-clear-btn { all: unset; cursor: pointer; color: var(--muted, #999); padding: 2px 6px; border-radius: 4px; }
  .search-clear-btn:hover { background: var(--bg-soft, #f0f0f0); }
  .search-empty { padding: 24px 16px; text-align: center; color: var(--muted, #999); }
  .search-empty p { margin: 0 0 4px; }
  .search-empty-hint { font-size: 0.8rem; }
  .search-error { padding: 12px 16px; color: var(--warn, #dc2626); font-size: 0.8rem; text-align: center; }
  .search-error p { margin: 0; }
  .search-footer {
    display: flex; gap: 12px; padding: 8px 16px;
    border-top: 1px solid var(--line, #e0e0e0);
    font-size: 0.7rem; color: var(--muted, #999);
  }
  .search-footer kbd {
    background: var(--bg-soft, #f5f5f5); padding: 1px 5px;
    border-radius: 3px; border: 1px solid var(--line, #ddd);
    font-family: monospace; font-size: 0.65rem;
  }
  @media (prefers-reduced-motion: reduce) { .search-palette { animation: none; } .search-spinner { animation: none; } }
</style>
