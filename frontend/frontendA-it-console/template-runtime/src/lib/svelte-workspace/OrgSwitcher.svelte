<script>
  import { onMount, createEventDispatcher } from 'svelte'
  import { browser } from '$app/environment'
  import { humanizeError } from '../utils/error-display.js'

  export let authMe = null

  const dispatch = createEventDispatcher()

  let orgs = []
  let currentOrg = null
  let open = false
  let loading = true
  let loadError = false

  const STORAGE_KEY = 'maple-current-org'

  onMount(async () => {
    await loadOrgs()
  })

  async function loadOrgs() {
    loading = true
    loadError = false
    try {
      const res = await fetch('/api/org', { credentials: 'same-origin' })
      if (res.ok) {
        const data = await res.json()
        orgs = Array.isArray(data.items) ? data.items : []
      }
    } catch {
      orgs = []
      loadError = true
    } finally {
      loading = false
    }

    // Restore last-used org from localStorage
    if (orgs.length > 0) {
      let stored = null
      if (browser) { try { stored = localStorage.getItem(STORAGE_KEY) } catch {} }
      const match = orgs.find((o) => o.orgId === stored)
      currentOrg = match || orgs[0]
    } else {
      currentOrg = null
    }

    // Notify parent of the resolved org
    dispatch('orgChange', { orgId: currentOrg?.orgId ?? '', org: currentOrg })
  }

  function selectOrg(org) {
    if (currentOrg?.orgId === org.orgId) { open = false; return }
    currentOrg = org
    open = false
    try { localStorage.setItem(STORAGE_KEY, org.orgId) } catch {}
    dispatch('orgChange', { orgId: org.orgId, org })
    // Reload page to clear stale data scoped to old org
    if (browser) window.location.reload()
  }

  function toggle() {
    // Don't open if only 0 or 1 org
    if (orgs.length <= 1) return
    open = !open
  }

  function onBackdropClick(event) {
    if (event.target === event.currentTarget) open = false
  }

  function getInitial(name) {
    return (name || '?').charAt(0).toUpperCase()
  }

  $: displayName = currentOrg?.name || authMe?.username || 'Personal'
  $: hasMultipleOrgs = orgs.length > 1
</script>

<div class="org-switcher">
  <button
    type="button"
    class="org-switcher-trigger"
    class:has-dropdown={hasMultipleOrgs}
    on:click={toggle}
    aria-label="Switch organization"
    aria-expanded={open}
    disabled={loading}
  >
    <span class="org-avatar">{getInitial(displayName)}</span>
    <span class="org-name">{displayName}</span>
    {#if hasMultipleOrgs}
      <span class="org-chevron" class:is-open={open}>▾</span>
    {/if}
  </button>

  {#if open && hasMultipleOrgs}
    <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
    <div class="org-backdrop" on:click={onBackdropClick}>
      <div class="org-dropdown" role="listbox" aria-label="Organizations">
        <div class="org-dropdown-header">Switch organization</div>
        {#each orgs as org (org.orgId)}
          <button
            type="button"
            class="org-option"
            class:is-active={currentOrg?.orgId === org.orgId}
            role="option"
            aria-selected={currentOrg?.orgId === org.orgId}
            on:click={() => selectOrg(org)}
          >
            <span class="org-option-avatar">{getInitial(org.name)}</span>
            <span class="org-option-info">
              <span class="org-option-name">{org.name}</span>
              {#if org.status && org.status !== 'active'}
                <span class="org-option-status">{org.status}</span>
              {/if}
            </span>
            {#if currentOrg?.orgId === org.orgId}
              <span class="org-option-check">✓</span>
            {/if}
          </button>
        {/each}
        {#if orgs.length === 0}
          <div class="org-empty">
            {#if loadError}
              <p>Unable to load organizations. Check your connection.</p>
              <button type="button" class="action-btn" on:click={loadOrgs}>Retry</button>
            {:else}
              <p>No organizations available.</p>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .org-switcher { position: relative; }
  .org-switcher-trigger {
    display: flex; align-items: center; gap: 6px;
    background: none; border: 1px solid transparent; border-radius: 8px;
    padding: 4px 8px; cursor: pointer; font-size: 0.85rem; font-weight: 600;
    color: var(--ink, #1a1a1a); transition: background 150ms, border-color 150ms;
  }
  .org-switcher-trigger:hover, .org-switcher-trigger.has-dropdown:hover {
    background: var(--bg-soft, rgba(0,0,0,0.04)); border-color: var(--line, #e0e0e0);
  }
  .org-switcher-trigger:disabled { opacity: 0.5; cursor: default; }
  .org-avatar {
    width: 22px; height: 22px; border-radius: 6px;
    background: var(--brand, #e8740c); color: white;
    display: grid; place-items: center; font-size: 0.7rem; font-weight: 700;
    flex-shrink: 0;
  }
  .org-name { max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .org-chevron { font-size: 0.7rem; color: var(--muted, #999); transition: transform 150ms; }
  .org-chevron.is-open { transform: rotate(180deg); }
  .org-backdrop { position: fixed; inset: 0; z-index: 9998; }
  .org-dropdown {
    position: absolute; top: calc(100% + 4px); left: 0;
    width: 260px; background: var(--panel, #fff);
    border: 1px solid var(--line, #e0e0e0); border-radius: 10px;
    box-shadow: var(--shadow-strong, 0 8px 24px rgba(0,0,0,0.1));
    z-index: 9999; overflow: hidden; animation: dropdownReveal var(--dur-dropdown) var(--ease-dropdown);
  }
  .org-dropdown-header {
    padding: 8px 12px; font-size: 0.7rem; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.05em; color: var(--muted, #999); border-bottom: 1px solid var(--line, #f0f0f0);
  }
  .org-option {
    all: unset; display: flex; align-items: center; gap: 8px;
    width: 100%; box-sizing: border-box; padding: 8px 12px;
    cursor: pointer; font-size: 0.85rem; transition: background 100ms;
  }
  .org-option:hover { background: rgba(232, 116, 12, 0.05); }
  .org-option.is-active { background: rgba(232, 116, 12, 0.08); }
  .org-option-avatar {
    width: 28px; height: 28px; border-radius: 6px;
    background: var(--bg-soft, #f0f0f0); color: var(--ink, #333);
    display: grid; place-items: center; font-size: 0.75rem; font-weight: 700;
    flex-shrink: 0;
  }
  .org-option-info { flex: 1; min-width: 0; display: grid; gap: 1px; }
  .org-option-name { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .org-option-status { font-size: 0.7rem; color: var(--muted, #999); }
  .org-option-check { color: var(--brand, #e8740c); font-weight: 700; }
  .org-empty { padding: 16px 12px; text-align: center; color: var(--muted, #999); font-size: 0.8rem; }
  @media (prefers-reduced-motion: reduce) { .org-dropdown { animation: none; } }
</style>
