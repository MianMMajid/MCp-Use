<script>
  import { browser } from '$app/environment'
  import { goto } from '$app/navigation'
  import { getRoleLabel } from '../maple-workspace/permissions.js'

  export let authMe = null

  let open = false

  function toggle() {
    open = !open
  }

  function close() {
    open = false
  }

  function getInitials(user) {
    if (!user) return '?'
    const name = user.username || user.email || ''
    if (name.includes('@')) return name.charAt(0).toUpperCase()
    return name.slice(0, 2).toUpperCase()
  }

  function getDisplayName(user) {
    if (!user) return 'Operator'
    return user.username || user.email?.split('@')[0] || 'Operator'
  }

  async function signOut() {
    close()
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
      })
    } catch {
      // ignore
    }
    if (browser) {
      window.location.assign('/login')
    }
  }

  function navigateTo(href) {
    close()
    goto(href)
  }

  function onBackdropClick(event) {
    if (event.target === event.currentTarget) close()
  }

  $: initials = getInitials(authMe)
  $: displayName = getDisplayName(authMe)
  $: email = authMe?.email || ''
  $: roleLabel = getRoleLabel()
</script>

<div class="user-menu">
  <button type="button" class="user-trigger" on:click={toggle} aria-label="User menu" aria-expanded={open}>
    <span class="user-avatar">{initials}</span>
  </button>

  {#if open}
    <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
    <div class="user-backdrop" on:click={onBackdropClick}>
      <div class="user-dropdown" role="menu">
        <div class="user-info">
          <span class="user-info-avatar">{initials}</span>
          <div class="user-info-text">
            <span class="user-info-name">{displayName}</span>
            {#if email}<span class="user-info-email">{email}</span>{/if}
          </div>
          <span class="user-role-badge">{roleLabel}</span>
        </div>

        <div class="user-divider"></div>

        <button type="button" class="user-item" role="menuitem" on:click={() => navigateTo('/maple/auth-admin')}>
          <span class="user-item-icon">👤</span> Profile & Settings
        </button>

        <button type="button" class="user-item" role="menuitem" on:click={() => navigateTo('/maple/api-keys')}>
          <span class="user-item-icon">🔑</span> API Keys
        </button>

        <button type="button" class="user-item" role="menuitem" on:click={() => navigateTo('/maple/org')}>
          <span class="user-item-icon">🏢</span> Organization Settings
        </button>

        <button type="button" class="user-item user-item-danger" role="menuitem" on:click={signOut}>
          <span class="user-item-icon">🚪</span> Sign Out
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .user-menu {
    position: relative;
  }

  .user-trigger {
    width: 28px;
    height: 28px;
    border-radius: var(--radius-pill);
    border: none;
    background: var(--brand);
    color: #fff;
    font-size: var(--text-2xs);
    font-weight: 700;
    cursor: pointer;
    display: grid;
    place-items: center;
    transition: opacity 100ms ease-out;
  }

  .user-trigger:hover {
    opacity: 0.85;
  }

  .user-avatar {
    line-height: 1;
  }

  .user-backdrop {
    position: fixed;
    inset: 0;
    z-index: 9998;
  }

  .user-dropdown {
    position: absolute;
    top: calc(100% + var(--space-2));
    right: 0;
    width: 260px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: var(--radius-xl);
    box-shadow: var(--shadow-strong);
    z-index: 9999;
    overflow: hidden;
    padding: var(--space-1) 0;
    animation: dropdownReveal var(--dur-dropdown) var(--ease-dropdown);
  }

  .user-info {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
  }

  .user-info-avatar {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-pill);
    background: var(--brand);
    color: white;
    display: grid;
    place-items: center;
    font-size: 0.8rem;
    font-weight: 700;
    flex-shrink: 0;
  }

  .user-info-text {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 1px;
  }

  .user-info-name {
    font-weight: 600;
    font-size: 0.85rem;
  }

  .user-info-email {
    font-size: 0.75rem;
    color: var(--muted, #999);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .user-role-badge {
    font-size: var(--text-2xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 2px var(--space-2);
    border-radius: var(--radius-pill);
    background: var(--bg-soft);
    color: var(--muted);
    border: 1px solid var(--line);
    flex-shrink: 0;
  }

  .user-divider {
    height: 1px;
    background: var(--line, #f0f0f0);
    margin: 4px 0;
  }

  .user-item {
    all: unset;
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    box-sizing: border-box;
    padding: 8px 14px;
    cursor: pointer;
    font-size: 0.82rem;
    color: var(--ink, #333);
  }

  .user-item:hover {
    background: rgba(232, 116, 12, 0.05);
  }

  .user-item-icon {
    font-size: 0.9rem;
    width: 20px;
    text-align: center;
    flex-shrink: 0;
  }

  .user-item-danger {
    color: var(--warn, #dc2626);
  }

  .user-item-danger:hover {
    background: rgba(220, 38, 38, 0.06);
  }
</style>
