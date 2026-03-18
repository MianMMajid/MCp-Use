<script>
  import { createEventDispatcher, onMount, onDestroy } from 'svelte'
  import { browser } from '$app/environment'
  import { toggleTheme, getResolvedTheme, onThemeChange } from '../maple-workspace/theme-store.js'
  import NotificationCenter from './NotificationCenter.svelte'
  import GlobalSearch from './GlobalSearch.svelte'
  import OrgSwitcher from './OrgSwitcher.svelte'
  import UserMenu from './UserMenu.svelte'

  export let title = 'Mayple'
  export let connected = false
  export let analystOptions = []
  export let selectedAnalysts = []
  export let authMe = null
  export let activeCategory = ''
  export let activeView = ''
  export let dataStale = false

  const dispatch = createEventDispatcher()

  let currentTheme = 'light'
  let unsubTheme

  onMount(() => {
    currentTheme = getResolvedTheme()
    unsubTheme = onThemeChange((theme) => { currentTheme = theme })
  })

  onDestroy(() => { if (unsubTheme) unsubTheme() })

  $: themeLabel = currentTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'

  // Breadcrumbs — category + view only
  $: breadcrumbs = (() => {
    const segs = []
    if (activeCategory) {
      const map = { chat: 'Chat', observe: 'Monitor', admin: 'System', firewalls: 'Firewalls', users: 'Users', compliance: 'Compliance', docs: 'Docs' }
      segs.push(map[activeCategory] || activeCategory)
    }
    if (activeView && activeView !== activeCategory) {
      const map = { live: 'Live', topology: 'Topology', timeline: 'Timeline', forks: 'Forks', control: 'Control', marketplace: 'Marketplace', cybersecurity: 'Cybersecurity', rules: 'Rules', 'context-leakage': 'Context Leakage', members: 'Members', invites: 'Invites', access: 'Access', risk: 'Risk Posture', frameworks: 'Frameworks' }
      segs.push(map[activeView] || activeView)
    }
    return segs
  })()

  function toggleAnalyst(name) { dispatch('toggleAnalyst', { name }) }
  function clearAnalysts() { dispatch('clearAnalysts') }

  function openSearch() {
    if (browser) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))
  }
</script>

<header class="top-bar" class:panel-connected={connected}>
  <!-- Left: Brand / Org / Breadcrumbs -->
  <div class="top-bar-start">
    <span class="top-bar-title">{title}</span>
    <span class="top-bar-sep">/</span>
    <OrgSwitcher {authMe} on:orgChange />
    {#if breadcrumbs.length > 0}
      {#each breadcrumbs as crumb}
        <span class="top-bar-sep">/</span>
        <span class="top-bar-crumb">{crumb}</span>
      {/each}
    {/if}
  </div>

  <!-- Stale data indicator -->
  {#if dataStale}
    <div class="stale-banner" role="status">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="8" cy="8" r="6.5"/><path d="M8 5v3.5l2.5 1.5"/></svg>
      <span>Data may be outdated</span>
    </div>
  {/if}

  <!-- Right: Icon actions -->
  <div class="top-bar-end">
    <!-- Search -->
    <button class="tb-icon" type="button" on:click={openSearch} title="Search (⌘K)" aria-label="Search">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="7" cy="7" r="5"/><line x1="10.5" y1="10.5" x2="14" y2="14"/></svg>
    </button>

    <!-- Analyst filter — compact pill, only shows count -->
    {#if analystOptions.length > 0}
      <details class="analyst-compact">
        <summary class="tb-pill" title="Filter by analyst">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 3h12M4 7h8M6 11h4"/></svg>
          {#if selectedAnalysts.length > 0}
            <span class="analyst-badge">{selectedAnalysts.length}</span>
          {/if}
        </summary>
        <div class="analyst-drop">
          <button type="button" class="analyst-clear" on:click={clearAnalysts}>All analysts</button>
          {#each analystOptions as analyst}
            <label class="analyst-row">
              <input type="checkbox" checked={selectedAnalysts.includes(analyst)} on:change={() => toggleAnalyst(analyst)} />
              <span>{analyst}</span>
            </label>
          {/each}
        </div>
      </details>
    {/if}

    <!-- Notifications -->
    <NotificationCenter />

    <!-- Help -->
    <a href="/quickstart" class="tb-icon" title="Help & Docs" aria-label="Help">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="8" cy="8" r="6.5"/><path d="M6 6a2 2 0 013.5 1.5c0 1-1.5 1-1.5 2"/><circle cx="8" cy="12" r="0.5" fill="currentColor" stroke="none"/></svg>
    </a>

    <!-- Theme -->
    <button class="tb-icon" type="button" on:click={toggleTheme} title={themeLabel} aria-label={themeLabel}>
      {#if currentTheme === 'dark'}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="8" cy="8" r="3.5"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.1 3.1l1.4 1.4M11.5 11.5l1.4 1.4M3.1 12.9l1.4-1.4M11.5 4.5l1.4-1.4"/></svg>
      {:else}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M13.5 10.5A6.5 6.5 0 015.5 2.5a5.5 5.5 0 108 8z"/></svg>
      {/if}
    </button>

    <!-- User -->
    <UserMenu {authMe} />
  </div>
</header>
<GlobalSearch />

<style>
  /* ── Left side ── */
  .top-bar-start {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .top-bar-title { font-size: 0.95rem; font-weight: 700; color: var(--ink); white-space: nowrap; }
  .top-bar-sep { color: var(--line-strong, #ccc); font-size: 1rem; font-weight: 300; flex-shrink: 0; }
  .top-bar-crumb { font-size: 0.8rem; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  /* ── Right side ── */
  .top-bar-end {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  /* ── Icon buttons — consistent 32×32 circles, 16px SVGs ── */
  .tb-icon {
    width: 32px;
    height: 32px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    display: grid;
    place-items: center;
    padding: 0;
    flex-shrink: 0;
    text-decoration: none;
    transition: color 150ms, border-color 150ms, background 150ms;
  }
  .tb-icon:hover {
    color: var(--ink);
    border-color: var(--line-strong);
    background: var(--bg-soft);
  }

  /* ── Analyst filter — compact icon pill ── */
  .analyst-compact { position: relative; }
  .tb-pill {
    height: 32px;
    padding: 0 10px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.78rem;
    list-style: none;
    transition: color 150ms, border-color 150ms;
  }
  .tb-pill:hover { color: var(--ink); border-color: var(--line-strong); }
  .tb-pill::-webkit-details-marker { display: none; }
  .analyst-badge {
    min-width: 16px; height: 16px;
    border-radius: 999px;
    background: var(--brand);
    color: #fff;
    font-size: 0.6rem; font-weight: 700;
    display: grid; place-items: center;
    padding: 0 4px;
  }
  .analyst-drop {
    position: absolute; top: calc(100% + 6px); right: 0;
    width: 220px; max-height: 280px; overflow-y: auto;
    background: var(--panel); border: 1px solid var(--line);
    border-radius: 10px; box-shadow: var(--shadow-strong);
    z-index: 200; padding: 4px 0;
  }
  .analyst-clear {
    all: unset; display: block; width: 100%; box-sizing: border-box;
    padding: 6px 12px; font-size: 0.78rem; color: var(--brand);
    cursor: pointer; border-bottom: 1px solid var(--line);
  }
  .analyst-clear:hover { background: var(--bg-soft); }
  .analyst-row {
    display: flex; align-items: center; gap: 6px;
    padding: 5px 12px; font-size: 0.8rem; cursor: pointer;
  }
  .analyst-row:hover { background: var(--bg-soft); }
  .analyst-row input { accent-color: var(--brand); }

  /* ── Stale data indicator ── */
  .stale-banner {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 3px 10px;
    border-radius: 999px;
    border: 1px solid rgba(245, 158, 11, 0.4);
    background: rgba(245, 158, 11, 0.1);
    color: rgb(180, 120, 20);
    font-size: 0.72rem;
    white-space: nowrap;
    flex-shrink: 0;
  }
  :global(.dark) .stale-banner {
    color: rgb(250, 204, 21);
    background: rgba(245, 158, 11, 0.15);
  }
</style>
