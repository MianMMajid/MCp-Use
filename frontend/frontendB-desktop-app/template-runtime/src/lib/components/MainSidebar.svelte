<script>
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { shellStore } from '@/lib/stores/shell-store';
  import { chatStore } from '@/lib/stores/chat-store';
  import Icon from '@/lib/components/icons/Icon.svelte';
  import { groupByDate, statusColor } from '@/lib/format';

  let search = '';

  const navItems = [
    { key: 'agents', label: 'Agents', icon: 'agent', href: '/agents' },
    { key: 'builder', label: 'Builder', icon: 'builder', href: '/orchestrate' },
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
    if (item.key === 'agents') {
      return path.startsWith('/agents');
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
    if (typeof window === 'undefined') return;
    const promptLabel = workspaceMode === 'agent' ? 'Search chats' : 'Search orchestrations';
    const nextValue = window.prompt(promptLabel, search);
    if (nextValue !== null) search = nextValue;
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
      {#if !$shellStore.sidebarCollapsed}
        <button class="brand pill" on:click={() => goto('/')}>Mayple</button>
      {/if}
      <button class="toggle pill" on:click={shellStore.toggleSidebar} aria-label="Toggle sidebar">
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

<style>
  .sidebar {
    height: calc(100svh - 24px);
    border-radius: 26px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: linear-gradient(180deg, rgba(24, 28, 36, 0.62), rgba(12, 15, 21, 0.58));
    backdrop-filter: blur(22px) saturate(130%);
    box-shadow: inset 0 0 0 1px rgba(249, 115, 22, 0.12), 0 16px 40px rgba(0, 0, 0, 0.35);
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
    gap: 10px;
  }

  .logo-btn {
    width: 52px;
    height: 52px;
    border: 1px solid rgba(249, 115, 22, 0.32);
    border-radius: 16px;
    background: rgba(19, 22, 29, 0.75);
    display: grid;
    place-items: center;
    cursor: pointer;
  }

  .logo {
    width: 34px;
    height: 34px;
    border-radius: 10px;
  }

  .brand {
    flex: 1;
    height: 52px;
    justify-content: flex-start;
    padding: 0 16px;
    border-color: rgba(249, 115, 22, 0.28);
    background: rgba(20, 24, 32, 0.66);
    cursor: pointer;
    font-size: 1.05rem;
  }

  .toggle {
    width: 52px;
    height: 52px;
    border-color: rgba(249, 115, 22, 0.28);
    background: rgba(20, 24, 32, 0.66);
    cursor: pointer;
  }

  .menu {
    display: grid;
    gap: 10px;
  }

  .item {
    width: 100%;
    min-height: 58px;
    padding: 0 18px;
    text-align: left;
    display: inline-flex;
    align-items: center;
    gap: 14px;
    border-color: rgba(249, 115, 22, 0.28);
    background: rgba(15, 18, 25, 0.68);
    cursor: pointer;
    transition: background 0.16s ease, transform 0.16s ease, border-color 0.16s ease;
  }

  .item:hover {
    transform: translateY(-1px);
    background: rgba(30, 34, 43, 0.74);
    border-color: rgba(249, 115, 22, 0.45);
  }

  .item.active {
    background: linear-gradient(180deg, rgba(72, 76, 88, 0.72), rgba(56, 60, 70, 0.72));
    border-color: rgba(249, 115, 22, 0.52);
  }

  .icon {
    width: 22px;
    display: inline-grid;
    place-items: center;
    color: #e5e7eb;
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
    border: 1px solid rgba(249, 115, 22, 0.22);
    border-radius: 999px;
    background: rgba(20, 24, 32, 0.62);
    color: var(--fg);
    padding: 10px 12px;
    text-align: left;
    cursor: pointer;
  }

  .history-item:hover,
  .history-item.active {
    border-color: rgba(249, 115, 22, 0.42);
    background: rgba(34, 38, 47, 0.74);
  }

  .history-item span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .orch-item {
    width: 100%;
    border: 1px solid rgba(249, 115, 22, 0.22);
    border-radius: 18px;
    background: rgba(20, 24, 32, 0.64);
    color: var(--fg);
    padding: 10px 12px;
    text-align: left;
    cursor: pointer;
    display: grid;
    gap: 6px;
  }

  .orch-item:hover,
  .orch-item.active {
    border-color: rgba(249, 115, 22, 0.45);
    background: rgba(34, 38, 47, 0.78);
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
    color: #d4d4d8;
    background: rgba(212, 212, 216, 0.1);
    border-color: rgba(212, 212, 216, 0.22);
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

  .account {
    width: 44px;
    height: 44px;
    border-radius: 999px;
    border: 1px solid rgba(249, 115, 22, 0.35);
    padding: 0;
    overflow: hidden;
    background: rgba(14, 16, 22, 0.84);
    cursor: pointer;
    color: #f4f4f5;
    font-weight: 700;
    display: grid;
    place-items: center;
  }

  .account span {
    line-height: 1;
  }

  :global(.sidebar .item),
  :global(.sidebar .toggle),
  :global(.sidebar .brand) {
    border-radius: 999px;
  }

  @media (max-width: 900px) {
    .sidebar {
      width: 88px !important;
    }

    .brand,
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
