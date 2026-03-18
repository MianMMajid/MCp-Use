<script>
  import { onMount, onDestroy } from 'svelte'
  import { goto } from '$app/navigation'
  import { humanizeError } from '../utils/error-display.js'
  import { buildWorkspaceHref } from '../maple-workspace/workspace-state.js'

  let open = false
  let notifications = []
  let unreadCount = 0
  let loading = false
  let pollTimer = null

  const POLL_INTERVAL_MS = 30_000

  const NOTIFICATION_ICONS = {
    approval: '✋',
    security: '🛡',
    escalation: '⬆',
    system: '⚙',
    info: 'ℹ',
    warning: '⚠',
  }

  onMount(() => {
    loadNotifications()
    loadUnreadCount()
    pollTimer = setInterval(loadUnreadCount, POLL_INTERVAL_MS)
  })

  onDestroy(() => {
    if (pollTimer) clearInterval(pollTimer)
  })

  async function loadNotifications() {
    loading = true
    try {
      const res = await fetch('/api/notifications?limit=20', { credentials: 'same-origin' })
      if (res.ok) {
        const data = await res.json()
        notifications = Array.isArray(data.items) ? data.items : []
      }
    } catch {
      // Network error — keep existing notifications
    } finally {
      loading = false
    }
  }

  async function loadUnreadCount() {
    try {
      const res = await fetch('/api/notifications/unread-count', { credentials: 'same-origin' })
      if (res.ok) {
        const data = await res.json()
        unreadCount = data.count ?? 0
      }
    } catch {
      // silent
    }
  }

  function toggle() {
    open = !open
    if (open) loadNotifications()
  }

  function close() {
    open = false
  }

  async function markAsRead(notification) {
    try {
      await fetch(`/api/notifications/${notification.id}/read`, {
        method: 'POST',
        credentials: 'same-origin',
      })
      notification.read = true
      notifications = [...notifications]
      unreadCount = Math.max(0, unreadCount - 1)
    } catch {
      // silent
    }
  }

  async function markAllAsRead() {
    try {
      await fetch('/api/notifications/read-all', {
        method: 'POST',
        credentials: 'same-origin',
      })
      notifications = notifications.map((n) => ({ ...n, read: true }))
      unreadCount = 0
    } catch {
      // silent
    }
  }

  function clickNotification(notification) {
    markAsRead(notification)
    close()

    // Navigate based on notification type
    const type = String(notification.type || notification.category || '').toLowerCase()
    if (type.includes('approval') || type.includes('hitl')) {
      goto(buildWorkspaceHref({ category: 'admin', view: 'control', routePath: '/maple/hitl' }))
    } else if (type.includes('security') || type.includes('firewall')) {
      goto(buildWorkspaceHref({ category: 'firewalls', view: 'cybersecurity', routePath: '/maple/gateway' }))
    } else if (type.includes('escalation')) {
      goto(buildWorkspaceHref({ category: 'admin', view: 'control', routePath: '/maple/escalation' }))
    }
  }

  function getIcon(notification) {
    const type = String(notification.type || notification.category || 'info').toLowerCase()
    for (const [key, icon] of Object.entries(NOTIFICATION_ICONS)) {
      if (type.includes(key)) return icon
    }
    return NOTIFICATION_ICONS.info
  }

  function formatTime(dateStr) {
    if (!dateStr) return ''
    try {
      const date = new Date(dateStr)
      const now = new Date()
      const diff = now.getTime() - date.getTime()
      const mins = Math.floor(diff / 60000)
      if (mins < 1) return 'just now'
      if (mins < 60) return `${mins}m ago`
      const hours = Math.floor(mins / 60)
      if (hours < 24) return `${hours}h ago`
      const days = Math.floor(hours / 24)
      return `${days}d ago`
    } catch {
      return ''
    }
  }

  function onBackdropClick(event) {
    if (event.target === event.currentTarget) close()
  }
</script>

<div class="notification-container">
  <button type="button" class="notification-bell" on:click={toggle} aria-label="Notifications" title="Notifications">
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 6a4 4 0 018 0c0 3 1.5 4.5 2 5H2c.5-.5 2-2 2-5z"/><path d="M6.5 13a1.5 1.5 0 003 0"/></svg>
    {#if unreadCount > 0}
      <span class="notification-badge" class:pulse={unreadCount > 0}>{unreadCount > 99 ? '99+' : unreadCount}</span>
    {/if}
  </button>

  {#if open}
    <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
    <div class="notification-backdrop" on:click={onBackdropClick}>
      <div class="notification-dropdown" role="dialog" aria-label="Notifications">
        <div class="notification-header">
          <h3>Notifications</h3>
          {#if unreadCount > 0}
            <button type="button" class="mark-all-btn" on:click={markAllAsRead}>Mark all as read</button>
          {/if}
        </div>

        <div class="notification-list">
          {#if loading && notifications.length === 0}
            <div class="notification-empty">Loading...</div>
          {:else if notifications.length === 0}
            <div class="notification-empty">
              <span class="empty-icon">✓</span>
              <p>All caught up!</p>
            </div>
          {:else}
            {#each notifications as notification}
              <button
                type="button"
                class="notification-item"
                class:unread={!notification.read}
                on:click={() => clickNotification(notification)}
              >
                <span class="notification-icon">{getIcon(notification)}</span>
                <div class="notification-content">
                  <span class="notification-title">{notification.title || 'Notification'}</span>
                  {#if notification.body || notification.message}
                    <span class="notification-body">{notification.body || notification.message}</span>
                  {/if}
                </div>
                <span class="notification-time">{formatTime(notification.created_at || notification.createdAt)}</span>
              </button>
            {/each}
          {/if}
        </div>

        <div class="notification-footer">
          <a href="/maple?category=admin&view=control&route=%2Fmaple%2Fobservability" on:click={close}>Notification preferences</a>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .notification-container { position: relative; }
  .notification-bell {
    position: relative; width: 32px; height: 32px;
    border: 1px solid var(--line, #e0e0e0); border-radius: 999px;
    background: transparent; cursor: pointer; display: grid; place-items: center;
    color: var(--muted, #71717a); padding: 0; flex-shrink: 0;
    transition: color 150ms, border-color 150ms, background 150ms;
  }
  .notification-bell:hover { color: var(--ink, #18181b); border-color: var(--line-strong, #d4d4d8); background: var(--bg-soft, #f4f4f5); }
  .notification-badge {
    position: absolute; top: -4px; right: -4px;
    background: var(--critical, #ef6b8b); color: white;
    font-size: 0.6rem; font-weight: 700;
    min-width: 16px; height: 16px;
    border-radius: 999px; display: grid; place-items: center;
    padding: 0 4px; line-height: 1;
  }
  .notification-badge.pulse {
    animation: badgePulse 2s ease-in-out infinite;
  }
  @keyframes badgePulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.1); } }
  .notification-backdrop { position: fixed; inset: 0; z-index: 9998; }
  .notification-dropdown {
    position: absolute; top: calc(100% + 8px); right: 0;
    width: 380px; max-height: 500px;
    background: var(--panel, #fff);
    border: 1px solid var(--line, #e0e0e0);
    border-radius: 12px;
    box-shadow: var(--shadow-strong, 0 16px 38px rgba(0,0,0,0.08));
    z-index: 9999; overflow: hidden;
    animation: dropdownReveal var(--dur-dropdown) var(--ease-dropdown);
  }
  .notification-header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 12px 16px; border-bottom: 1px solid var(--line, #e0e0e0);
  }
  .notification-header h3 { margin: 0; font-size: 0.95rem; }
  .mark-all-btn { all: unset; cursor: pointer; font-size: 0.8rem; color: var(--brand, #e8740c); }
  .mark-all-btn:hover { text-decoration: underline; }
  .notification-list { max-height: 380px; overflow-y: auto; }
  .notification-item {
    all: unset; display: flex; align-items: flex-start; gap: 10px;
    padding: 10px 16px; cursor: pointer; width: 100%; box-sizing: border-box;
    transition: background 0.1s; border-bottom: 1px solid var(--line, #f0f0f0);
  }
  .notification-item:hover { background: rgba(232, 116, 12, 0.04); }
  .notification-item.unread { background: rgba(232, 116, 12, 0.06); }
  .notification-icon { font-size: 1.1rem; flex-shrink: 0; margin-top: 2px; }
  .notification-content { flex: 1; min-width: 0; display: grid; gap: 2px; }
  .notification-title { font-size: 0.85rem; font-weight: 500; color: var(--ink, #333); }
  .notification-body { font-size: 0.78rem; color: var(--muted, #999); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .notification-time { font-size: 0.7rem; color: var(--muted, #bbb); flex-shrink: 0; margin-top: 2px; }
  .notification-empty { padding: 32px 16px; text-align: center; color: var(--muted, #999); }
  .empty-icon { font-size: 2rem; display: block; margin-bottom: 8px; }
  .notification-empty p { margin: 0; }
  .notification-footer {
    padding: 8px 16px; border-top: 1px solid var(--line, #e0e0e0);
    font-size: 0.75rem; text-align: center;
  }
  .notification-footer a { color: var(--brand, #e8740c); text-decoration: none; }
  .notification-footer a:hover { text-decoration: underline; }
  @media (prefers-reduced-motion: reduce) { .notification-dropdown { animation: none; } .notification-badge { animation: none; } }
</style>
