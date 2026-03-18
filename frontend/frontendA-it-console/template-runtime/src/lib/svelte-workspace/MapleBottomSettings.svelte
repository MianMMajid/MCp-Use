<script>
  import { createEventDispatcher } from 'svelte'
  import { onDestroy } from 'svelte'

  import { cycleTheme, getResolvedTheme, onThemeChange } from '../maple-workspace/theme-store.js'
  import GlobalSearch from './GlobalSearch.svelte'
  import MapleUtilityDrawer from './MapleUtilityDrawer.svelte'
  import NotificationCenter from './NotificationCenter.svelte'
  import UserMenu from './UserMenu.svelte'

  export let authMe = null

  const dispatch = createEventDispatcher()

  let open = false
  let resolvedTheme = getResolvedTheme()

  const unsubscribe = onThemeChange((theme) => {
    resolvedTheme = theme
  })

  onDestroy(() => {
    unsubscribe()
  })

  function toggle() {
    open = !open
  }

  function close() {
    open = false
  }

  function onBackdropClick(event) {
    if (event.target === event.currentTarget) close()
  }

  function refresh() {
    dispatch('refresh')
  }

  function toggleThemeMode() {
    cycleTheme()
    resolvedTheme = getResolvedTheme()
  }

  $: themeLabel = resolvedTheme === 'dark' ? 'Dark' : 'Light'
</script>

<div class="bottom-settings">
  <button type="button" class="settings-pill" aria-expanded={open} on:click={toggle}>
    Settings
  </button>

  {#if open}
    <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
    <div class="settings-backdrop" on:click={onBackdropClick}>
      <div class="settings-panel">
        <div class="settings-head">
          <div>
            <p class="settings-kicker">Operator Controls</p>
            <h3>Workspace Settings</h3>
          </div>
          <button type="button" class="settings-close" on:click={close}>Close</button>
        </div>

        <div class="settings-grid">
          <GlobalSearch />
          <MapleUtilityDrawer />
          <button class="settings-action" type="button" on:click={refresh}>Refresh</button>
          <button class="settings-action" type="button" on:click={toggleThemeMode}>Theme: {themeLabel}</button>
          <NotificationCenter />
          <UserMenu {authMe} />
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .bottom-settings {
    position: relative;
  }

  .settings-pill {
    position: relative;
    z-index: 1;
    height: 34px;
    padding: 0 var(--space-4);
    border: 1px solid var(--line-strong, #d4d4d8);
    border-radius: var(--radius-xl);
    background: var(--panel, rgba(255,255,255,0.97));
    color: var(--muted, #71717a);
    font-size: var(--text-base);
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
    backdrop-filter: blur(16px) saturate(160%);
    cursor: pointer;
    transition: color 150ms, border-color 150ms, transform 150ms;
  }

  .settings-pill:hover {
    color: var(--ink, #18181b);
    border-color: var(--brand, #f59e0b);
    transform: translateY(-1px);
  }

  .settings-backdrop {
    position: fixed;
    inset: 0;
    z-index: 9997;
  }

  .settings-panel {
    position: absolute;
    right: 0;
    bottom: calc(100% + 12px);
    width: min(520px, calc(100vw - 24px));
    border: 1px solid var(--line);
    border-radius: 22px;
    background: rgba(255, 252, 248, 0.98);
    backdrop-filter: blur(18px) saturate(155%);
    box-shadow: 0 18px 40px rgba(52, 31, 10, 0.14);
    padding: 14px;
    z-index: 9998;
  }

  .settings-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 14px;
  }

  .settings-kicker {
    margin: 0 0 4px;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
    font-weight: 700;
  }

  .settings-head h3 {
    margin: 0;
    font-size: 1rem;
  }

  .settings-close,
  .settings-action {
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--panel);
    padding: 0.55rem 0.85rem;
    font-weight: 600;
    cursor: pointer;
    color: var(--ink);
  }

  .settings-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    align-items: start;
  }

  .settings-grid :global(.mw-search-trigger),
  .settings-grid :global(.mw-topbar-button),
  .settings-grid :global(.notification-bell),
  .settings-grid :global(.user-trigger) {
    width: 100%;
    min-width: 0;
    justify-content: center;
  }

  .settings-grid :global(.user-trigger) {
    height: 40px;
    border-radius: 999px;
  }

  @media (max-width: 700px) {
    .settings-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
