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
  <button type="button" class="mw-topbar-button" on:click={toggle} aria-label="Search (⌘K)" title="Search (⌘K)">
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg>
  </button>

  {#if open}
    <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
    <div class="search-backdrop" on:click={onBackdropClick}>
      <div class="search-palette" role="dialog" aria-label="Search">
        <div class="search-input-wrap">
          <span class="search-icon"><svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg></span>
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

  /* ── Command palette backdrop ── */
  .search-backdrop {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 18vh;
  }

  /* ── Palette container ── */
  .search-palette {
    width: min(560px, 90vw);
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: var(--radius-xl);
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.16), 0 0 0 1px rgba(0, 0, 0, 0.04);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    animation: dropdownReveal var(--dur-dropdown) var(--ease-dropdown);
  }

  /* ── Search input area ── */
  .search-input-wrap {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--line);
  }

  .search-icon {
    color: var(--muted);
    flex-shrink: 0;
  }

  .search-palette-input {
    flex: 1;
    border: none;
    background: transparent;
    font-size: 15px;
    font-weight: 500;
    color: var(--ink);
    outline: none;
  }

  .search-palette-input::placeholder {
    color: var(--muted);
    font-weight: 400;
  }

  .search-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid var(--line);
    border-top-color: var(--brand);
    border-radius: 50%;
    flex-shrink: 0;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* ── Results area ── */
  .search-results {
    max-height: 20rem;
    overflow-y: auto;
    padding: var(--space-1) 0;
  }

  .search-group {
    padding: var(--space-1) 0;
  }

  .search-group-title {
    font-size: var(--text-2xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted);
    padding: var(--space-1) var(--space-4) var(--space-1);
    margin: 0;
  }

  .search-group-count {
    font-weight: 400;
    opacity: 0.6;
  }

  .search-result-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-4);
    margin: 0 var(--space-1);
    cursor: pointer;
    border: none;
    border-radius: var(--radius-md);
    background: transparent;
    width: calc(100% - var(--space-2));
    text-align: left;
    font-size: var(--text-base);
    color: var(--ink);
    transition: background 80ms ease-out;
  }

  .search-result-row:hover,
  .search-result-row.is-selected {
    background: var(--bg-soft);
  }

  .search-result-btn {
    all: unset;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex: 1;
    cursor: pointer;
  }

  .search-result-btn:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: -2px;
    border-radius: var(--radius-sm);
  }

  .search-result-title {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .search-result-desc {
    color: var(--muted);
    font-size: var(--text-sm);
    margin-left: auto;
    white-space: nowrap;
  }

  .search-result-icon {
    color: var(--muted);
    flex-shrink: 0;
  }

  .search-clear-btn {
    all: unset;
    cursor: pointer;
    color: var(--muted);
    padding: 2px var(--space-1);
    border-radius: var(--radius-xs);
    transition: background 80ms ease-out;
  }

  .search-clear-btn:hover {
    background: var(--bg-soft);
  }

  .search-clear-btn:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: -2px;
  }

  /* ── Empty / error ── */
  .search-empty {
    padding: var(--space-8) var(--space-4);
    text-align: center;
    color: var(--muted);
  }

  .search-empty p {
    margin: 0 0 var(--space-1);
  }

  .search-empty-hint {
    font-size: var(--text-sm);
    opacity: 0.7;
  }

  .search-error {
    padding: var(--space-4) var(--space-4);
    text-align: center;
    color: var(--warn);
    font-size: var(--text-sm);
  }

  .search-error p { margin: 0; }

  /* ── Footer with keyboard hints ── */
  .search-footer {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-2) var(--space-4);
    border-top: 1px solid var(--line);
    font-size: var(--text-2xs);
    color: var(--muted);
    flex-wrap: wrap;
  }

  .search-footer kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 var(--space-1);
    background: var(--bg-soft);
    border: 1px solid var(--line);
    border-radius: var(--radius-xs);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 10px;
    font-weight: 500;
    line-height: 1;
    box-shadow: 0 1px 0 rgba(0, 0, 0, 0.04);
  }

  @media (prefers-reduced-motion: reduce) {
    .search-palette { animation: none; }
    .search-spinner { animation: none; }
  }
</style>
