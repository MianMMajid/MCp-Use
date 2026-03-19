<script context="module">
  /**
   * Reusable notification API functions for use by settings panel and other consumers.
   */
  export async function fetchNotificationPreferences() {
    try {
      const res = await fetch('/api/notifications/preferences', { credentials: 'same-origin' })
      if (res.ok) {
        const payload = await res.json()
        return payload?.preferences ?? payload ?? {}
      }
    } catch { /* silent */ }
    return {}
  }

  export async function saveNotificationPreferences(preferences) {
    const res = await fetch('/api/notifications/preferences', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferences }),
    })
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}))
      throw new Error(payload?.error || `Failed (${res.status})`)
    }
    return res.json().catch(() => ({}))
  }
</script>

<script>
  import { goto } from '$app/navigation'
  import { onDestroy, onMount } from 'svelte'

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
      const response = await fetch('/api/notifications?limit=20', { credentials: 'same-origin' })
      if (response.ok) {
        const payload = await response.json()
        notifications = Array.isArray(payload?.items) ? payload.items : []
      }
    } catch {
      // keep current state
    } finally {
      loading = false
    }
  }

  async function loadUnreadCount() {
    try {
      const response = await fetch('/api/notifications/unread-count', { credentials: 'same-origin' })
      if (response.ok) {
        const payload = await response.json()
        unreadCount = payload?.count ?? 0
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
      notifications = notifications.map((item) => ({ ...item, read: true }))
      unreadCount = 0
    } catch {
      // silent
    }
  }

  async function clickNotification(notification) {
    await markAsRead(notification)
    close()

    const type = String(notification?.type || notification?.category || '').toLowerCase()
    if (type.includes('approval') || type.includes('hitl')) {
      goto('/maple/hitl')
    } else if (type.includes('policy')) {
      goto('/maple/policies')
    } else if (type.includes('security') || type.includes('firewall')) {
      goto('/maple/gateway')
    } else if (type.includes('escalation')) {
      goto('/maple/escalation')
    } else {
      goto('/maple/observability')
    }
  }

  function getIcon(notification) {
    const type = String(notification?.type || notification?.category || 'info').toLowerCase()
    for (const [key, icon] of Object.entries(NOTIFICATION_ICONS)) {
      if (type.includes(key)) return icon
    }
    return NOTIFICATION_ICONS.info
  }

  function formatTime(value) {
    if (!value) return ''
    try {
      const date = new Date(value)
      const diff = Date.now() - date.getTime()
      const mins = Math.floor(diff / 60000)
      if (mins < 1) return 'just now'
      if (mins < 60) return `${mins}m ago`
      const hours = Math.floor(mins / 60)
      if (hours < 24) return `${hours}h ago`
      return `${Math.floor(hours / 24)}d ago`
    } catch {
      return ''
    }
  }

  function onBackdropClick(event) {
    if (event.target === event.currentTarget) close()
  }
</script>

<div class="notification-container">
  <button type="button" class="mw-topbar-button notification-bell" on:click={toggle} aria-label="Notifications" title="Notifications">
    <span>Alerts</span>
    {#if unreadCount > 0}
      <span class="notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
    {/if}
  </button>

  {#if open}
    <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
    <div class="notification-backdrop" on:click={onBackdropClick}>
      <div class="notification-dropdown">
        <div class="notification-header">
          <h3>Notifications</h3>
          {#if unreadCount > 0}
            <button type="button" class="mark-all-btn" on:click={markAllAsRead}>Mark all read</button>
          {/if}
        </div>

        <div class="notification-list">
          {#if loading}
            <div class="notification-empty"><p>Loading notifications…</p></div>
          {:else if notifications.length === 0}
            <div class="notification-empty">
              <span class="empty-icon">⟡</span>
              <p>No active notifications.</p>
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
          <a href="/maple/observability" on:click={close}>Open operator timeline</a>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .notification-container {
    position: relative;
  }

  .notification-bell {
    position: relative;
  }

  .notification-badge {
    display: inline-grid;
    place-items: center;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 999px;
    background: var(--critical);
    color: white;
    font-size: var(--text-2xs);
    font-weight: 700;
  }

  .notification-backdrop {
    position: fixed;
    inset: 0;
    z-index: 9998;
  }

  .notification-dropdown {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    width: 380px;
    max-height: 500px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-strong);
    z-index: 9999;
    overflow: hidden;
  }

  .notification-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid var(--line);
  }

  .notification-header h3 {
    margin: 0;
    font-size: var(--text-base);
  }

  .mark-all-btn {
    all: unset;
    cursor: pointer;
    font-size: var(--text-sm);
    color: var(--brand);
  }

  .notification-list {
    max-height: 380px;
    overflow-y: auto;
  }

  .notification-item {
    all: unset;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 16px;
    cursor: pointer;
    width: 100%;
    box-sizing: border-box;
    border-bottom: 1px solid var(--line);
  }

  .notification-item:hover {
    background: var(--brand-tint);
  }

  .notification-item.unread {
    background: var(--brand-tint);
  }

  .notification-icon {
    font-size: var(--text-xl);
    flex-shrink: 0;
    margin-top: 2px;
  }

  .notification-content {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .notification-title {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--ink);
  }

  .notification-body {
    font-size: var(--text-xs);
    color: var(--muted);
  }

  .notification-time {
    font-size: var(--text-xs);
    color: var(--muted);
    flex-shrink: 0;
    margin-top: 2px;
  }

  .notification-empty {
    padding: 28px 16px;
    text-align: center;
    color: var(--muted);
  }

  .empty-icon {
    font-size: 1.4rem;
    display: block;
    margin-bottom: 8px;
  }

  .notification-footer {
    padding: 8px 16px;
    border-top: 1px solid var(--line);
    font-size: var(--text-xs);
    text-align: center;
  }

  .notification-footer a {
    color: var(--brand);
    text-decoration: none;
  }

  @media (max-width: 900px) {
    .notification-dropdown {
      width: min(360px, 92vw);
      right: 0;
    }
  }
</style>
