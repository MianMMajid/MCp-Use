<script>
  import { createEventDispatcher } from 'svelte'
  import { onDestroy } from 'svelte'
  import { cycleTheme, getResolvedTheme, onThemeChange } from '../maple-workspace/theme-store.js'
  import GlobalSearch from './GlobalSearch.svelte'
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
  <div class="mw-topbar-brand">
    <span class="mw-brand-orb" aria-hidden="true"></span>
    <div>
      <p class="mw-brand-label">{activeCategoryLabel}</p>
      <p class="mw-brand-route">{currentRouteTitle}</p>
    </div>
  </div>

  <div class="mw-topbar-status">
    <span class="mw-status-dot" class:degraded={statusTone === 'degraded'}></span>
    <span>{statusLabel}</span>
    <span class="mw-source-badge">{sourceText}</span>
  </div>

  <div class="mw-topbar-actions">
    <GlobalSearch />

    <button class="mw-topbar-button" type="button" on:click={refresh} aria-label="Refresh workspace" title="Refresh workspace">
      <svg class="mw-btn-icon" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 8a5.5 5.5 0 0 1 9.3-4"/><path d="M13.5 8a5.5 5.5 0 0 1-9.3 4"/><path d="M11.8 2v2.2H14"/><path d="M4.2 14v-2.2H2"/></svg>
    </button>

    <button class="mw-topbar-button" type="button" on:click={toggleThemeMode} aria-label="Switch theme" title="Theme: {themeLabel}">
      {#if resolvedTheme === 'dark'}
        <svg class="mw-btn-icon" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M13.4 9.8A5.5 5.5 0 1 1 6.2 2.6a4.4 4.4 0 0 0 7.2 7.2z"/></svg>
      {:else}
        <svg class="mw-btn-icon" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.2"/><path d="M8 13.3v1.2"/><path d="M3.4 3.4l.85.85"/><path d="M11.75 11.75l.85.85"/><path d="M1.5 8h1.2"/><path d="M13.3 8h1.2"/><path d="M3.4 12.6l.85-.85"/><path d="M11.75 4.25l.85-.85"/></svg>
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
    margin: 12px auto 0;
    width: min(1440px, calc(100vw - 24px));
    border-radius: 18px;
    border: 1px solid var(--line);
    background: var(--glass-bg);
    backdrop-filter: blur(16px) saturate(160%);
    box-shadow: var(--shadow-soft);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px;
    gap: 12px;
  }

  .mw-topbar-brand {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }

  .mw-brand-orb {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--brand);
    flex-shrink: 0;
  }

  .mw-brand-label {
    margin: 0;
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
  }

  .mw-brand-route {
    margin: 0;
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--ink);
  }

  .mw-topbar-status {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.72rem;
    color: var(--muted);
    flex-shrink: 1;
    min-width: 0;
  }

  .mw-status-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--ok);
    flex-shrink: 0;
  }

  .mw-status-dot.degraded {
    background: var(--warn);
  }

  .mw-source-badge {
    font-size: 0.65rem;
    padding: 2px 8px;
    border-radius: var(--radius-pill);
    background: var(--bg-soft);
    border: 1px solid var(--line);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 240px;
  }

  .mw-topbar-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .mw-topbar-button {
    border: 1px solid var(--line);
    background: var(--panel);
    color: var(--muted);
    border-radius: var(--radius-pill);
    padding: 6px;
    width: 34px;
    height: 34px;
    display: inline-grid;
    place-items: center;
    cursor: pointer;
    transition: border-color 120ms ease, color 120ms ease, transform 120ms ease;
  }

  .mw-topbar-button:hover {
    border-color: var(--brand);
    color: var(--ink);
    transform: translateY(-1px);
  }

  .mw-btn-icon {
    display: block;
  }

  @media (max-width: 1023px) {
    .mw-topbar {
      width: calc(100vw - 16px);
      margin-top: 8px;
      padding-inline: 12px;
    }

    .mw-topbar-status {
      display: none;
    }

    .mw-topbar-actions {
      flex-wrap: wrap;
      justify-content: flex-end;
    }
  }

  @media (max-width: 640px) {
    .mw-topbar-brand {
      display: none;
    }
  }
</style>
