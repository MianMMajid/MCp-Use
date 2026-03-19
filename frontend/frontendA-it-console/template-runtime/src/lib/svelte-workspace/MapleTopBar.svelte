<script>
  import { createEventDispatcher } from 'svelte'
  import { onDestroy } from 'svelte'
  import { cycleTheme, getResolvedTheme, onThemeChange } from '../maple-workspace/theme-store.js'
  import GlobalSearch from './GlobalSearch.svelte'
  import MaypleCharacter from './MaypleCharacter.svelte'
  import NotificationCenter from './NotificationCenter.svelte'
  import UserMenu from './UserMenu.svelte'

  export let title = 'Mayple'
  export let sourceText = 'Maple operator console'
  export let connected = false
  export let authMe = null
  export let currentRouteTitle = 'Control Plane'
  export let activeCategoryLabel = 'Monitor'

  const dispatch = createEventDispatcher()
  let resolvedTheme = getResolvedTheme()

  const unsubscribe = onThemeChange((theme) => {
    resolvedTheme = theme
  })

  onDestroy(() => {
    unsubscribe()
  })

  function refresh() {
    dispatch('refresh')
  }

  function toggleThemeMode() {
    cycleTheme()
    resolvedTheme = getResolvedTheme()
  }

  $: statusTone = connected ? 'ready' : 'degraded'
  $: statusLabel = connected ? 'Connected' : 'Degraded'
  $: themeLabel = resolvedTheme === 'dark' ? 'Dark' : 'Light'
</script>

<header class="top-bar mw-topbar" class:panel-connected={connected}>
  <div class="mw-topbar-left">
    <span class="mw-brand-mascot"><MaypleCharacter size={26} animate={false} /></span>
    <span class="mw-brand-name">Maple</span>
    <span class="mw-brand-sep" aria-hidden="true">·</span>
    <nav class="mw-breadcrumb" aria-label="Location">
      <span class="mw-breadcrumb-category">{activeCategoryLabel}</span>
      <span class="mw-breadcrumb-sep" aria-hidden="true">/</span>
      <span class="mw-breadcrumb-page">{currentRouteTitle}</span>
    </nav>
    <span class="mw-status-dot" class:degraded={statusTone === 'degraded'} title={statusLabel}></span>
  </div>

  <div class="mw-topbar-actions">
    <GlobalSearch />

    <button class="mw-topbar-button" type="button" on:click={toggleThemeMode} aria-label="Switch theme" title="Theme: {themeLabel}">
      {#if resolvedTheme === 'dark'}
        <svg class="mw-btn-icon" viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13.4 9.8A5.5 5.5 0 1 1 6.2 2.6a4.4 4.4 0 0 0 7.2 7.2z"/></svg>
      {:else}
        <svg class="mw-btn-icon" viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.2"/><path d="M8 13.3v1.2"/><path d="M3.4 3.4l.85.85"/><path d="M11.75 11.75l.85.85"/><path d="M1.5 8h1.2"/><path d="M13.3 8h1.2"/><path d="M3.4 12.6l.85-.85"/><path d="M11.75 4.25l.85-.85"/></svg>
      {/if}
    </button>

    <NotificationCenter />
    <UserMenu {authMe} />
  </div>
</header>

<style>
  .mw-topbar {
    position: sticky;
    top: 0;
    z-index: 60;
    width: 100%;
    height: 48px;
    border-bottom: 1px solid var(--line, #e4e4e7);
    background: var(--panel, rgba(255, 255, 255, 0.97));
    backdrop-filter: blur(16px) saturate(160%);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 var(--space-4);
    gap: var(--space-4);
  }

  /* ── Left: brand + breadcrumb ── */
  .mw-topbar-left {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-shrink: 1;
    min-width: 0;
  }

  .mw-brand-mascot {
    display: inline-flex;
    flex-shrink: 0;
    line-height: 0;
  }

  .mw-brand-name {
    font-size: var(--text-sm);
    font-weight: 700;
    color: var(--ink);
    white-space: nowrap;
    letter-spacing: -0.01em;
  }

  .mw-brand-sep {
    color: var(--line-strong);
    font-size: var(--text-sm);
    flex-shrink: 0;
    user-select: none;
  }

  .mw-breadcrumb {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    min-width: 0;
  }

  .mw-breadcrumb-category {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--muted);
    white-space: nowrap;
  }

  .mw-breadcrumb-sep {
    font-size: var(--text-xs);
    color: var(--muted);
    opacity: 0.4;
    flex-shrink: 0;
    user-select: none;
  }

  .mw-breadcrumb-page {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .mw-status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--ok);
    flex-shrink: 0;
    margin-left: var(--space-1);
  }

  .mw-status-dot.degraded {
    background: var(--warn);
  }

  /* ── Right: actions ── */
  .mw-topbar-actions {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    flex-shrink: 0;
  }

  .mw-topbar-button {
    border: none;
    background: transparent;
    color: var(--muted);
    border-radius: var(--radius-pill);
    padding: 0;
    width: 30px;
    height: 30px;
    display: inline-grid;
    place-items: center;
    cursor: pointer;
    transition: background 100ms ease-out, color 100ms ease-out;
  }

  .mw-topbar-button:hover {
    background: var(--bg-soft);
    color: var(--ink);
  }

  .mw-topbar-button:active {
    background: var(--line);
  }

  .mw-topbar-button:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }

  .mw-btn-icon {
    display: block;
  }

  /* ── Responsive ── */
  @media (max-width: 768px) {
    .mw-topbar {
      width: calc(100vw - var(--space-4));
      padding: 0 var(--space-3);
    }

    .mw-brand-sep,
    .mw-breadcrumb-category,
    .mw-breadcrumb-sep {
      display: none;
    }
  }

  @media (max-width: 480px) {
    .mw-brand-name {
      display: none;
    }
  }
</style>
