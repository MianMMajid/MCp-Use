<script>
  import { createEventDispatcher } from 'svelte'
  import { onDestroy } from 'svelte'
  import { cycleTheme, getResolvedTheme, onThemeChange } from '../maple-workspace/theme-store.js'
  import GlobalSearch from './GlobalSearch.svelte'
  import NotificationCenter from './NotificationCenter.svelte'
  import MapleUtilityDrawer from './MapleUtilityDrawer.svelte'
  import UserMenu from './UserMenu.svelte'

  export let title = 'Mayple'
  export let sourceText = 'Source: Maple security control plane'
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
  $: statusLabel = connected ? 'Live firewall control plane' : 'Degraded control plane'
  $: themeLabel = resolvedTheme === 'dark' ? 'Dark' : 'Light'
</script>

<header class="top-bar mw-topbar" class:panel-connected={connected}>
  <div class="mw-topbar-brand">
    <span class="mw-brand-orb" aria-hidden="true"></span>
    <div>
      <p class="mw-brand-label">{activeCategoryLabel}</p>
      <p class="mw-brand-route">{title} · {currentRouteTitle}</p>
    </div>
  </div>

  <div class="mw-topbar-status">
    <span class="mw-status-dot" class:degraded={statusTone === 'degraded'}></span>
    <span>{statusLabel}</span>
    <span class="mw-source-badge">{sourceText}</span>
  </div>

  <div class="mw-topbar-actions">
    <GlobalSearch />
    <MapleUtilityDrawer />
    <button class="mw-topbar-button" type="button" on:click={refresh}>Refresh</button>
    <button class="mw-topbar-button" type="button" on:click={toggleThemeMode}>
      Theme: {themeLabel}
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
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  }

  .mw-topbar-button {
    border: 1px solid var(--mw-line, var(--line));
    background: var(--bg-elevated, rgba(255, 255, 255, 0.82));
    color: var(--mw-ink, var(--ink));
    font-weight: 600;
    border-radius: var(--radius-pill);
    padding: 0.55rem 0.9rem;
    cursor: pointer;
    transition: border-color 120ms ease, transform 120ms ease, background 120ms ease;
  }

  .mw-topbar-button:hover {
    border-color: var(--mw-brand, var(--brand));
    transform: translateY(-1px);
  }

  @media (max-width: 1023px) {
    .mw-topbar {
      width: calc(100vw - 16px);
      margin-top: 8px;
      padding-inline: 12px;
    }

    .mw-topbar-actions {
      flex-wrap: wrap;
      justify-content: flex-end;
    }
  }
</style>
