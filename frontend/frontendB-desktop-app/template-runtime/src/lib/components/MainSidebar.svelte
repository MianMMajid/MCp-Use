<script>
  import { tick } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { shellStore } from '@/lib/stores/shell-store';
  import { chatStore } from '@/lib/stores/chat-store';
  import Icon from '@/lib/components/icons/Icon.svelte';
  import { groupByDate, statusColor } from '@/lib/format';

  let search = '';
  let searchDialogOpen = false;
  let searchDraft = '';
  let searchInputEl;

  const navItems = [
    { key: 'builder', label: 'Builder', icon: 'builder', href: '/orchestrate' },
    { key: 'firewalls', label: 'Firewalls', icon: 'firewall', href: '/firewalls' },
    { key: 'tasks', label: 'Tasks', icon: 'tasks', href: '/tasks' },
    { key: 'new-chat', label: 'New Chat', icon: 'pen', action: () => newChat() },
    { key: 'search', label: 'Search', icon: 'search', action: () => onSearchPillClick() }
  ];

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

  function newChat() {
    chatStore.newSession();
    chatStore.setChatTarget('agent');
    goto('/?mode=agent');
  }

  function clickItem(item) {
    if (item.action) {
      item.action();
      return;
    }
    if (item.href) goto(item.href);
  }

  function onSearchPillClick() {
    searchDraft = search;
    searchDialogOpen = true;
    tick().then(() => {
      searchInputEl?.focus();
      searchInputEl?.select?.();
    });
  }

  function applySearchDialog() {
    search = searchDraft.trim();
    searchDialogOpen = false;
  }

  function cancelSearchDialog() {
    searchDialogOpen = false;
  }

  function onSearchInputKeyDown(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      applySearchDialog();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelSearchDialog();
    }
  }

  function statusClass(status) {
    const color = statusColor(status);
    if (color === 'green') return 'status status-green';
    if (color === 'red') return 'status status-red';
    if (color === 'orange') return 'status status-orange';
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
          title={item.key === 'search' && search ? `Search: ${search}` : item.label}
          aria-label={item.label}
        >
          <span class="icon"><Icon name={item.icon} size={20} /></span>
          {#if !$shellStore.sidebarCollapsed}
            <span class="label">{item.key === 'search' && search ? `Search: ${search}` : item.label}</span>
          {/if}
        </button>
      {/each}
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
    </div>
  </div>
</aside>

{#if searchDialogOpen}
  <div
    class="search-overlay"
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-label={workspaceMode === 'agent' ? 'Search chats' : 'Search orchestrations'}
    on:click={(event) => {
      if (event.currentTarget === event.target) cancelSearchDialog();
    }}
    on:keydown={(event) => {
      if (event.key === 'Escape') cancelSearchDialog();
    }}
  >
    <div class="search-dialog card">
      <p class="search-title">{workspaceMode === 'agent' ? 'Search chats' : 'Search orchestrations'}</p>
      <input
        class="search-input"
        bind:this={searchInputEl}
        bind:value={searchDraft}
        placeholder={workspaceMode === 'agent' ? 'Find a chat...' : 'Find an orchestration...'}
        on:keydown={onSearchInputKeyDown}
      />
      <div class="search-actions">
        <button class="pill ghost" type="button" on:click={cancelSearchDialog}>Cancel</button>
        <button class="pill confirm" type="button" on:click={applySearchDialog}>Apply</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .sidebar {
    height: calc(100svh - 24px);
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
    background: rgba(255, 255, 255, 0.75);
    cursor: pointer;
    transition: background 0.16s ease, transform 0.16s ease, border-color 0.16s ease;
  }

  .item:hover {
    transform: translateY(-1px);
    border-color: var(--border);
    background: rgba(255, 255, 255, 0.95);
  }

  .item.active {
    border-color: rgba(232, 116, 12, 0.48);
    background: linear-gradient(145deg, rgba(255, 237, 215, 0.95), rgba(255, 255, 255, 0.95));
    color: var(--ink);
  }

  .icon {
    width: 22px;
    display: inline-grid;
    place-items: center;
    color: var(--muted);
  }

  .label {
    font-size: 1.05rem;
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
    background: rgba(255, 255, 255, 0.75);
    color: var(--fg);
    padding: 10px 12px;
    text-align: left;
    cursor: pointer;
  }

  .history-item:hover,
  .history-item.active {
    border-color: rgba(232, 116, 12, 0.42);
    background: rgba(255, 255, 255, 0.95);
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
    background: rgba(255, 255, 255, 0.75);
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
    background: rgba(255, 255, 255, 0.95);
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

  .status-green {
    color: #10b981;
    background: rgba(16, 185, 129, 0.14);
    border-color: rgba(16, 185, 129, 0.3);
  }

  .status-orange {
    color: #fb923c;
    background: rgba(251, 146, 60, 0.14);
    border-color: rgba(251, 146, 60, 0.3);
  }

  .status-red {
    color: #fb7185;
    background: rgba(251, 113, 133, 0.14);
    border-color: rgba(251, 113, 133, 0.3);
  }

  .status-zinc {
    color: var(--muted);
    background: rgba(107, 107, 107, 0.1);
    border-color: rgba(107, 107, 107, 0.22);
  }

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
    justify-content: flex-start;
  }

  .search-overlay {
    position: fixed;
    inset: 0;
    z-index: 60;
    background: rgba(0, 0, 0, 0.18);
    backdrop-filter: blur(4px);
    display: grid;
    place-items: center;
    padding: 18px;
  }

  .search-dialog {
    width: min(520px, 100%);
    border-radius: 16px;
    border: 1px solid var(--border);
    background: var(--panel);
    box-shadow: var(--shadow-strong);
    padding: 14px;
    display: grid;
    gap: 12px;
  }

  .search-title {
    margin: 0;
    font-size: 14px;
    color: var(--ink);
    font-weight: 600;
  }

  .search-input {
    width: 100%;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--bg-soft);
    color: var(--ink);
    padding: 10px 12px;
    outline: none;
    font-size: 15px;
  }

  .search-input:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent-soft);
  }

  .search-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .search-actions .ghost {
    border-color: var(--border);
    background: rgba(255, 255, 255, 0.75);
    cursor: pointer;
    padding: 7px 11px;
  }

  .search-actions .confirm {
    border-color: rgba(232, 116, 12, 0.5);
    background: var(--accent-soft);
    cursor: pointer;
    padding: 7px 11px;
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
