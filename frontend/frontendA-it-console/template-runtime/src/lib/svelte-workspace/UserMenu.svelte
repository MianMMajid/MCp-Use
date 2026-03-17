<script>
  import { browser } from '$app/environment'
  import { goto } from '$app/navigation'
  import { buildWorkspaceHref } from '../maple-workspace/workspace-state.js'
  import { getRoleLabel } from '../maple-workspace/permissions.js'

  export let authMe = null

  let open = false

  function toggle() { open = !open }
  function close() { open = false }

  function getInitials(user) {
    if (!user) return '?'
    const name = user.username || user.email || ''
    if (name.includes('@')) return name.charAt(0).toUpperCase()
    return name.slice(0, 2).toUpperCase()
  }

  function getDisplayName(user) {
    if (!user) return 'Anonymous'
    return user.username || user.email?.split('@')[0] || 'User'
  }

  async function signOut() {
    close()
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
    } catch { /* ignore */ }
    if (browser) window.location.assign('/login')
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
  <button
    type="button"
    class="user-trigger"
    on:click={toggle}
    aria-label="User menu"
    aria-expanded={open}
  >
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

        <button type="button" class="user-item" role="menuitem"
          on:click={() => navigateTo(buildWorkspaceHref({ category: 'users', view: 'access', routePath: '/maple/auth-admin' }))}>
          <span class="user-item-icon">👤</span> Profile & Settings
        </button>

        <button type="button" class="user-item" role="menuitem"
          on:click={() => navigateTo(buildWorkspaceHref({ category: 'admin', view: 'control', routePath: '/maple/api-keys' }))}>
          <span class="user-item-icon">🔑</span> API Keys
        </button>

        <button type="button" class="user-item" role="menuitem"
          on:click={() => navigateTo(buildWorkspaceHref({ category: 'admin', view: 'control', routePath: '/maple/org' }))}>
          <span class="user-item-icon">🏢</span> Organization Settings
        </button>

        <button type="button" class="user-item" role="menuitem"
          on:click={() => navigateTo('/api/auth/mfa/status')}>
          <span class="user-item-icon">🔒</span> MFA Setup
        </button>

        <div class="user-divider"></div>

        <button type="button" class="user-item" role="menuitem"
          on:click={() => navigateTo('/quickstart')}>
          <span class="user-item-icon">📖</span> Help & Docs
        </button>

        <div class="user-divider"></div>

        <button type="button" class="user-item user-item-danger" role="menuitem" on:click={signOut}>
          <span class="user-item-icon">🚪</span> Sign Out
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .user-menu { position: relative; }
  .user-trigger {
    width: 32px; height: 32px; border-radius: 999px; border: 2px solid var(--line, #e0e0e0);
    background: var(--bg-soft, #f5f5f0); color: var(--ink, #333);
    font-size: 0.7rem; font-weight: 700; cursor: pointer;
    display: grid; place-items: center; transition: border-color 150ms;
  }
  .user-trigger:hover { border-color: var(--brand, #e8740c); }
  .user-avatar { line-height: 1; }
  .user-backdrop { position: fixed; inset: 0; z-index: 9998; }
  .user-dropdown {
    position: absolute; top: calc(100% + 6px); right: 0;
    width: 260px; background: var(--panel, #fff);
    border: 1px solid var(--line, #e0e0e0); border-radius: 12px;
    box-shadow: var(--shadow-strong, 0 8px 24px rgba(0,0,0,0.1));
    z-index: 9999; overflow: hidden; padding: 4px 0;
    animation: userDropIn 0.12s ease-out;
  }
  @keyframes userDropIn { from { opacity: 0; transform: translateY(-4px); } }
  .user-info {
    display: flex; align-items: center; gap: 10px;
    padding: 12px 14px;
  }
  .user-info-avatar {
    width: 36px; height: 36px; border-radius: 999px;
    background: var(--brand, #e8740c); color: white;
    display: grid; place-items: center; font-size: 0.8rem; font-weight: 700;
    flex-shrink: 0;
  }
  .user-info-text { flex: 1; min-width: 0; display: grid; gap: 1px; }
  .user-info-name { font-weight: 600; font-size: 0.85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .user-info-email { font-size: 0.75rem; color: var(--muted, #999); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .user-role-badge {
    font-size: 0.6rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em;
    padding: 2px 6px; border-radius: 4px;
    background: var(--bg-soft, #f0f0f0); color: var(--muted, #888);
    border: 1px solid var(--line, #e0e0e0); flex-shrink: 0;
  }
  .user-divider { height: 1px; background: var(--line, #f0f0f0); margin: 4px 0; }
  .user-item {
    all: unset; display: flex; align-items: center; gap: 8px;
    width: 100%; box-sizing: border-box; padding: 8px 14px;
    cursor: pointer; font-size: 0.8rem; color: var(--ink, #333);
    transition: background 100ms;
  }
  .user-item:hover { background: rgba(232, 116, 12, 0.05); }
  .user-item:focus-visible { outline: 2px solid var(--brand); outline-offset: -2px; }
  .user-item-icon { font-size: 0.9rem; width: 20px; text-align: center; flex-shrink: 0; }
  .user-item-danger { color: var(--warn, #dc2626); }
  .user-item-danger:hover { background: rgba(220, 38, 38, 0.06); }
  @media (prefers-reduced-motion: reduce) { .user-dropdown { animation: none; } }
</style>
