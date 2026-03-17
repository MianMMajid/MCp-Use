<script>
  import { tick, onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { shellStore } from '@/lib/stores/shell-store';
  import { chatStore } from '@/lib/stores/chat-store';
  import Icon from '@/lib/components/icons/Icon.svelte';
  import CommandPalette from '@/lib/components/CommandPalette.svelte';
  import { groupByDate, statusColor } from '@/lib/format';

  let search = '';
  let commandPaletteOpen = false;

  const navItems = [
    { key: 'builder', label: 'Builder', icon: 'builder', href: '/orchestrate' },
    { key: 'firewalls', label: 'Firewalls', icon: 'firewall', href: '/firewalls' },
    { key: 'tasks', label: 'Tasks', icon: 'tasks', href: '/tasks' },
  ];

  // ⌘K / Ctrl+K global shortcut
  function onGlobalKeyDown(event) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
      event.preventDefault();
      commandPaletteOpen = !commandPaletteOpen;
    }
  }

  onMount(() => {
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', onGlobalKeyDown);
    }
  });

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', onGlobalKeyDown);
    }
  });

  $: path = $page.url.pathname;
  $: workspaceMode = $chatStore.mode === 'orchestration' ? 'orchestration' : 'agent';
  $: sessions = Array.isArray($chatStore.sessions) ? $chatStore.sessions : [];
  $: sortedSessions = [...sessions].sort((a, b) => new Date(b.createdAt ?? 0) - new Date(a.createdAt ?? 0));
  $: filteredSessions = search
    ? sortedSessions.filter((session) =>
        String(session.title ?? session.sessionId ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : sortedSessions;
  $: groupedSessions = groupByDate(filteredSessions, 'createdAt');

  $: orchestrations = Array.isArray($chatStore.orchestrations) ? $chatStore.orchestrations : [];
  $: filteredOrchestrations = search
    ? orchestrations.filter((item) =>
        String(item.name || '').toLowerCase().includes(search.toLowerCase()) ||
        String(item.description || '').toLowerCase().includes(search.toLowerCase())
      )
    : orchestrations;

  function shortId(value) {
    if (!value) return '--';
    const text = String(value);
    return text.length <= 14 ? text : text.slice(0, 14);
  }

  function active(item) {
    if (item.key === 'builder') {
      return path.startsWith('/orchestrate') || path.startsWith('/agents');
    }
    if (item.key === 'firewalls') {
      return path.startsWith('/firewalls');
    }
    if (!item.href) return false;
    if (item.href === '/') return path === '/';
    return path.startsWith(item.href);
  }

  function clickItem(item) {
    if (item.href) goto(item.href);
  }

  function statusClass(status) {
    const color = statusColor(status);
    if (color === 'green') return 'status status-green';
    if (color === 'red') return 'status status-red';
    if (color === 'sky') return 'status status-info';
    if (color === 'caution' || color === 'orange') return 'status status-caution';
    return 'status status-zinc';
  }
</script>

<aside class="sidebar" style:width={$shellStore.sidebarCollapsed ? '92px' : `${$shellStore.sidebarWidth}px`}>
  <div class="sidebar-inner">
    <div class="brand-row">
      <button class="logo-btn" on:click={() => goto('/')} aria-label="Go home">
        <img src="/maple-favicon.svg" alt="Mayple" class="logo" />
      </button>
      <button class="toggle" on:click={shellStore.toggleSidebar} aria-label="Toggle sidebar">
        <Icon name="menu" size={18} />
      </button>
    </div>

    <nav class="menu" aria-label="Primary">
      {#each navItems as item}
        <button
          class="pill item"
          class:active={active(item)}
          on:click={() => clickItem(item)}
          title={item.label}
          aria-label={item.label}
        >
          <span class="icon"><Icon name={item.icon} size={20} /></span>
          {#if !$shellStore.sidebarCollapsed}
            <span class="label">{item.label}</span>
          {/if}
        </button>
      {/each}
      <button
        class="pill item cmd-k"
        on:click={() => { commandPaletteOpen = true; }}
        title="Search & actions (⌘K)"
        aria-label="Command palette"
      >
        <span class="icon"><Icon name="search" size={20} /></span>
        {#if !$shellStore.sidebarCollapsed}
          <span class="label">Search</span>
          <kbd class="kbd-hint">⌘K</kbd>
        {/if}
      </button>
    </nav>

    {#if !$shellStore.sidebarCollapsed}
      <div class="history-wrap">
        {#if workspaceMode === 'agent'}
          <div class="history">
            {#if !$chatStore.selectedAgentId}
              <p class="empty">Chat is ready. Optional: select an agent to route to agent runtime.</p>
            {:else if $chatStore.sessionsLoading}
              <p class="empty">Loading conversations...</p>
            {:else if filteredSessions.length === 0}
              <p class="empty">No conversations yet</p>
            {:else}
              {#each groupedSessions as group}
                <div class="session-group">
                  <p class="section-title">{group[0]}</p>
                  {#each group[1] as session}
                    {@const sid = session.sessionId || session.id}
                    <button
                      class="history-item"
                      class:active={$chatStore.sessionId === sid}
                      on:click={async () => {
                        await chatStore.selectSession(sid);
                        goto('/?mode=agent');
                      }}
                    >
                      <Icon name="chat" size={14} />
                      <span>{session.title || sid || 'Untitled'}</span>
                    </button>
                  {/each}
                </div>
              {/each}
            {/if}
          </div>
        {:else}
          <div class="history">
            {#if $chatStore.orchestrationsLoading}
              <p class="empty">Loading orchestrations...</p>
            {:else if filteredOrchestrations.length === 0}
              <p class="empty">No orchestrations found</p>
            {:else}
              {#each filteredOrchestrations as orchestration}
                {@const id = String(orchestration.id || '')}
                <button
                  class="orch-item"
                  class:active={id === String($chatStore.selectedOrchestrationId || '')}
                  on:click={async () => {
                    await chatStore.selectOrchestration(id);
                    goto(`/?mode=orchestration&orchestrationId=${encodeURIComponent(id)}`);
                  }}
                >
                  <div class="orch-row">
                    <span class="orch-name">{orchestration.name || id}</span>
                    <span class={statusClass(orchestration.status || 'unknown')}>{orchestration.status || 'unknown'}</span>
                  </div>
                  <p class="orch-meta">{shortId(id)} · {(orchestration.nodes || []).length} nodes</p>
                </button>
              {/each}
            {/if}
          </div>
        {/if}
      </div>
    {/if}

    <div class="footer">
      <button class="account" aria-label="Profile" on:click={() => goto('/profile')}>
        <span>M</span>
      </button>
      <button
        class="theme-toggle"
        aria-label={$shellStore.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        title={$shellStore.theme === 'dark' ? 'Light mode' : 'Dark mode'}
        on:click={() => shellStore.toggleTheme()}
      >
        <Icon name={$shellStore.theme === 'dark' ? 'sun' : 'moon'} size={16} />
      </button>
    </div>
  </div>
</aside>

<CommandPalette bind:open={commandPaletteOpen} onClose={() => { commandPaletteOpen = false; }} />

<style>
  .sidebar {
    height: calc(100svh - 92px);
    border-radius: 16px;
    border: 1px solid var(--border);
    background: var(--glass);
    backdrop-filter: blur(20px) saturate(180%);
    box-shadow: var(--shadow-soft);
    overflow: hidden;
  }

  .sidebar-inner {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: 12px;
    gap: 10px;
  }

  .brand-row {
    display: flex;
    align-items: center;
    gap: 8px;
    justify-content: space-between;
  }

  .logo-btn {
    width: 52px;
    height: 52px;
    border: 0;
    border-radius: 0;
    background: transparent;
    display: grid;
    place-items: center;
    cursor: pointer;
    padding: 0;
  }

  .logo {
    width: 40px;
    height: 40px;
    border-radius: 0;
  }

  .toggle {
    width: 52px;
    height: 52px;
    border: 0;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    padding: 0;
    display: grid;
    place-items: center;
  }

  .menu {
    display: grid;
    gap: 10px;
  }

  .item {
    width: 100%;
    min-height: 52px;
    padding: 0 16px;
    text-align: left;
    display: inline-flex;
    align-items: center;
    gap: 14px;
    border-color: transparent;
    background: var(--btn-secondary-bg);
    cursor: pointer;
    transition: background 0.16s ease, transform 0.16s ease, border-color 0.16s ease;
  }

  .item:hover {
    transform: translateY(-1px);
    border-color: var(--border);
    background: var(--panel);
  }

  .item.active {
    border-color: rgba(232, 116, 12, 0.48);
    background: var(--accent-soft);
    color: var(--ink);
  }

  .icon {
    width: 22px;
    display: inline-grid;
    place-items: center;
    color: var(--muted);
  }

  .label {
    font-size: 14px;
    letter-spacing: 0.01em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .history-wrap {
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 2px;
    overflow: hidden;
  }

  .history {
    overflow: auto;
    display: grid;
    gap: 6px;
    padding-right: 2px;
  }

  .session-group {
    display: grid;
    gap: 6px;
  }

  .section-title {
    margin: 0;
    font-size: 11px;
    color: var(--muted);
    padding: 0 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .history-item {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--btn-secondary-bg);
    color: var(--fg);
    padding: 10px 12px;
    text-align: left;
    cursor: pointer;
  }

  .history-item:hover,
  .history-item.active {
    border-color: rgba(232, 116, 12, 0.42);
    background: var(--panel);
  }

  .history-item span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .orch-item {
    width: 100%;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--btn-secondary-bg);
    color: var(--fg);
    padding: 10px 12px;
    text-align: left;
    cursor: pointer;
    display: grid;
    gap: 6px;
  }

  .orch-item:hover,
  .orch-item.active {
    border-color: rgba(232, 116, 12, 0.45);
    background: var(--panel);
  }

  .orch-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .orch-name {
    flex: 1;
    font-size: 13px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .orch-meta {
    margin: 0;
    color: var(--muted);
    font-size: 11px;
  }

  .status {
    border-radius: 999px;
    padding: 2px 8px;
    font-size: 10px;
    line-height: 1.4;
    text-transform: lowercase;
    border: 1px solid transparent;
  }

  .status-green { color: var(--ok); background: var(--ok-soft); border-color: var(--ok-border); }
  .status-info { color: var(--info); background: var(--info-soft); border-color: var(--info-border); }
  .status-caution { color: var(--caution); background: var(--caution-soft); border-color: var(--caution-border); }
  .status-red { color: var(--danger); background: var(--danger-soft); border-color: var(--danger-border); }
  .status-zinc { color: var(--muted); background: rgba(107, 107, 107, 0.08); border-color: rgba(107, 107, 107, 0.18); }

  .empty {
    margin: 0;
    color: var(--muted);
    border-radius: 14px;
    border: 1px dashed rgba(249, 115, 22, 0.24);
    padding: 10px 12px;
    font-size: 13px;
  }

  .footer {
    margin-top: auto;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .theme-toggle {
    width: 36px;
    height: 36px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--glass);
    color: var(--muted);
    font-size: 16px;
    cursor: pointer;
    display: grid;
    place-items: center;
    padding: 0;
    transition: background 0.2s, color 0.2s, border-color 0.2s;
  }

  .theme-toggle:hover {
    border-color: var(--accent);
    color: var(--accent);
    background: var(--accent-soft);
  }

  .cmd-k {
    border-style: dashed;
    border-color: var(--border);
    background: transparent;
  }

  .cmd-k:hover {
    border-style: solid;
    background: var(--accent-soft);
    border-color: var(--accent);
  }

  .kbd-hint {
    margin-left: auto;
    padding: 1px 5px;
    border-radius: 4px;
    border: 1px solid var(--border);
    background: var(--bg-soft);
    color: var(--muted);
    font-size: 10px;
    font-family: var(--font-mono, monospace);
  }

  .account {
    width: 44px;
    height: 44px;
    border-radius: 999px;
    border: 1px solid rgba(232, 116, 12, 0.35);
    padding: 0;
    overflow: hidden;
    background: var(--bg-soft);
    cursor: pointer;
    color: var(--ink);
    font-weight: 700;
    display: grid;
    place-items: center;
  }

  .account span {
    line-height: 1;
  }

  :global(.sidebar .item) {
    border-radius: 999px;
  }

  @media (max-width: 900px) {
    .sidebar {
      width: 88px !important;
    }

    .label,
    .history-wrap {
      display: none;
    }

    .item {
      justify-content: center;
      padding: 0;
    }

    .footer {
      justify-content: center;
    }
  }
</style>
