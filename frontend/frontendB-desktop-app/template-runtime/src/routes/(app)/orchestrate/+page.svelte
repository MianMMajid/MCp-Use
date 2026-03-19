<script>
  import { goto } from '$app/navigation';
  import AppShell from '@/lib/components/AppShell.svelte';
  import Icon from '@/lib/components/icons/Icon.svelte';
  import ConfirmDialog from '@/lib/components/ConfirmDialog.svelte';
  import { chatStore } from '@/lib/stores/chat-store';
  import { postJson, deleteJson, loadJson, invalidateCache } from '@/lib/api';
  import { deleteOrchestration, listOrchestrationExecutions } from '@/lib/orchestrations-api';
  import { humanizeError } from '@/lib/utils/error-display';
  import { toastStore } from '@/lib/stores/toast-store';
  import { statusColor } from '@/lib/format';
  import { onMount } from 'svelte';

  let activeTab = 'orchestrations';
  let agentSearch = '';
  let orchSearch = '';
  let creatingAgent = false;
  let creatingOrch = false;
  let deleting = false;
  let error = '';
  let showTrash = false;
  let archivedAgents = [];
  let archivedOrchestrations = [];
  let trashBusy = '';

  // Delete confirmation state
  let confirmOpen = false;
  let confirmTitle = '';
  let confirmMessage = '';
  let confirmAction = () => {};

  async function requestDelete(type, id, name) {
    // Guard: agent used in orchestrations
    if (type === 'agent') {
      const referencingFlows = orchestrations.filter((o) => {
        const nodes = o.nodes || o.graph?.nodes || [];
        return nodes.some((n) => String(n.agentId || n.data?.agentId || '') === String(id));
      });
      if (referencingFlows.length > 0) {
        const flowNames = referencingFlows.map((o) => o.name || o.id).join(', ');
        confirmTitle = 'Agent In Use';
        confirmMessage = `This agent is referenced by: ${flowNames}. Deleting it will leave orphaned nodes in those orchestrations. Continue?`;
        confirmAction = () => performDelete(type, id, name);
        confirmOpen = true;
        return;
      }
    }

    // Guard: orchestration has running executions
    if (type === 'orchestration') {
      try {
        const executions = await listOrchestrationExecutions(id, 10);
        const active = executions.filter((e) => {
          const s = String(e.status || '').toLowerCase();
          return s === 'running' || s === 'in_progress' || s === 'paused';
        });
        if (active.length > 0) {
          confirmTitle = 'Active Executions';
          confirmMessage = `This orchestration has ${active.length} active execution(s). Deleting it may leave dangling processes. Continue?`;
          confirmAction = () => performDelete(type, id, name);
          confirmOpen = true;
          return;
        }
      } catch { /* Can't check — proceed with normal confirm */ }
    }

    confirmTitle = `Delete ${type === 'agent' ? 'Agent' : 'Orchestration'}`;
    confirmMessage = `Are you sure you want to delete "${name || id}"? This action cannot be undone.`;
    confirmAction = () => performDelete(type, id, name);
    confirmOpen = true;
  }

  async function performDelete(type, id, name) {
    if (deleting) return;
    deleting = true;
    error = '';
    try {
      if (type === 'orchestration') {
        await deleteOrchestration(id);
        invalidateCache('/api/orchestrations');
        await chatStore.fetchOrchestrations();
        // Clear selection if this was the selected orchestration
        if ($chatStore.selectedOrchestrationId === String(id)) {
          chatStore.selectOrchestration('');
        }
        toastStore.success(`Orchestration "${name || id}" deleted`);
      } else {
        await deleteJson(`/api/agents/${id}`);
        invalidateCache('/api/agents');
        await chatStore.fetchAgents();
        // Clear selection if this was the selected agent
        if ($chatStore.selectedAgentId === String(id)) {
          chatStore.selectAgent('');
        }
        toastStore.success(`Agent "${name || id}" deleted`);
      }
      await loadTrash();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      toastStore.error(humanizeError(error));
    } finally {
      deleting = false;
    }
  }

  $: agents = Array.isArray($chatStore.agents) ? $chatStore.agents : [];
  $: orchestrations = Array.isArray($chatStore.orchestrations) ? $chatStore.orchestrations : [];

  async function loadTrash() {
    try {
      const [agentRes, orchRes] = await Promise.all([
        loadJson('/api/agents?status=archived'),
        loadJson('/api/orchestrations?status=archived'),
      ]);
      archivedAgents = Array.isArray(agentRes?.items) ? agentRes.items : [];
      archivedOrchestrations = Array.isArray(orchRes?.items) ? orchRes.items : [];
    } catch { /* best effort */ }
  }

  $: trashCount = archivedAgents.length + archivedOrchestrations.length;

  async function restoreItem(type, id, name) {
    trashBusy = id;
    try {
      const path = type === 'agent' ? `/api/agents/${id}/restore` : `/api/orchestrations/${id}/restore`;
      await postJson(path, {});
      invalidateCache('/api/agents');
      invalidateCache('/api/orchestrations');
      await Promise.all([chatStore.fetchAgents(), chatStore.fetchOrchestrations(), loadTrash()]);
      toastStore.show(`Restored "${name || id}"`, 'success');
    } catch (err) {
      toastStore.show(humanizeError(err instanceof Error ? err.message : 'Restore failed'), 'error');
    } finally {
      trashBusy = '';
    }
  }

  async function permanentlyDelete(type, id, name) {
    confirmTitle = `Permanently delete ${type}?`;
    confirmMessage = `"${name || id}" will be permanently removed. This cannot be undone.`;
    confirmAction = async () => {
      trashBusy = id;
      try {
        const path = type === 'agent' ? `/api/agents/${id}/permanent` : `/api/orchestrations/${id}/permanent`;
        await deleteJson(path);
        invalidateCache('/api/agents');
        invalidateCache('/api/orchestrations');
        await loadTrash();
        toastStore.show(`Permanently deleted "${name || id}"`, 'success');
      } catch (err) {
        toastStore.show(humanizeError(err instanceof Error ? err.message : 'Delete failed'), 'error');
      } finally {
        trashBusy = '';
      }
    };
    confirmOpen = true;
  }

  onMount(() => { loadTrash(); });

  $: filteredAgents = agentSearch
    ? agents.filter((a) =>
        String(a.name ?? '').toLowerCase().includes(agentSearch.toLowerCase()) ||
        String(a.agentId ?? a.id ?? '').toLowerCase().includes(agentSearch.toLowerCase())
      )
    : agents;

  $: filteredOrch = orchSearch
    ? orchestrations.filter((o) =>
        String(o.name ?? '').toLowerCase().includes(orchSearch.toLowerCase())
      )
    : orchestrations;

  $: activeAgents = agents.filter((a) => String(a.status || '').toLowerCase() === 'active').length;

  function badgeClass(value) {
    const color = statusColor(value);
    if (color === 'green') return 'badge green';
    if (color === 'red') return 'badge red';
    if (color === 'sky') return 'badge info';
    if (color === 'caution' || color === 'orange') return 'badge caution';
    return 'badge zinc';
  }

  async function createAgent() {
    creatingAgent = true;
    error = '';
    try {
      const response = await postJson('/api/agents', { name: 'New Agent' });
      if (response.ok) {
        const payload = await response.json().catch(() => ({}));
        const id = String(payload?.id || payload?.agentId || '');
        invalidateCache('/api/agents');
        if (id) await goto(`/agents/${encodeURIComponent(id)}`);
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      creatingAgent = false;
    }
  }

  async function createOrchestration() {
    creatingOrch = true;
    error = '';
    try {
      const timestamp = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      const response = await postJson('/api/orchestrations', {
        name: `New Orchestration ${timestamp}`,
        description: 'Created from builder',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || `Failed (${response.status})`);
      const id = payload?.id || payload?.orchestrationId;
      if (!id) throw new Error('No id returned');
      invalidateCache('/api/orchestrations');
      await chatStore.fetchOrchestrations?.();
      chatStore.selectOrchestration?.(String(id));
      goto(`/orchestrate/${id}`);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      creatingOrch = false;
    }
  }
</script>

<AppShell>
  <section class="page">
    <header class="card top-bar">
      <div>
        <h1>Builder</h1>
        <p class="sub">Create agents, equip tools, and build orchestrations.</p>
      </div>
      <div class="stats">
        <span class="pill stat">{agents.length} agents</span>
        <span class="pill stat">{orchestrations.length} flows</span>
      </div>
    </header>

    {#if error}<p class="error">{humanizeError(error)}</p>{/if}

    <nav class="tabs">
      <button class="tab" class:active={activeTab === 'orchestrations'} on:click={() => (activeTab = 'orchestrations')}>
        Orchestrations
      </button>
      <button class="tab" class:active={activeTab === 'agents'} on:click={() => (activeTab = 'agents')}>
        Agents
      </button>
    </nav>

    {#if activeTab === 'orchestrations'}
      <div class="section-header">
        <div class="search-bar card">
          <span class="search-icon"><Icon name="search" size={16} /></span>
          <input bind:value={orchSearch} placeholder="Search orchestrations..." />
        </div>
        <button class="pill cta" on:click={createOrchestration} disabled={creatingOrch}>
          {creatingOrch ? 'Creating...' : '+ New Orchestration'}
        </button>
      </div>

      <div class="orch-list">
        {#if filteredOrch.length === 0 && orchSearch}
          <div class="card empty-state">
            <p class="muted">No orchestrations match "{orchSearch}"</p>
          </div>
        {:else if filteredOrch.length === 0}
          <div class="card empty-state">
            <div class="empty-icon"><Icon name="orchestration" size={32} /></div>
            <h3>No orchestrations yet</h3>
            <p>Create your first multi-agent workflow to get started.</p>
            <button class="pill cta" on:click={createOrchestration} disabled={creatingOrch}>
              {creatingOrch ? 'Creating...' : 'Create Orchestration'}
            </button>
          </div>
        {:else}
          {#each filteredOrch as item}
            <div class="card orch-row">
              <div class="orch-info" on:click={() => goto(`/orchestrate/${item.id}`)} role="button" tabindex="0" on:keydown={(e) => e.key === 'Enter' && goto(`/orchestrate/${item.id}`)}>
                <p class="orch-name">{item.name || item.id}</p>
                {#if item.description}
                  <p class="orch-desc">{item.description}</p>
                {/if}
              </div>
              <div class="orch-actions">
                <span class={badgeClass(item.status)}>{item.status || 'draft'}</span>
                <button class="pill action-btn" on:click={() => goto(`/orchestrate/${item.id}`)}>Open</button>
                <button class="pill action-btn danger-btn" on:click={() => requestDelete('orchestration', item.id, item.name)} title="Delete">
                  <Icon name="close" size={12} />
                </button>
              </div>
            </div>
          {/each}
        {/if}
      </div>
    {/if}

    {#if activeTab === 'agents'}
      <div class="section-header">
        <div class="search-bar card">
          <span class="search-icon"><Icon name="search" size={16} /></span>
          <input bind:value={agentSearch} placeholder="Search agents..." />
        </div>
        <button class="pill cta" on:click={createAgent} disabled={creatingAgent}>
          {creatingAgent ? 'Creating...' : '+ New Agent'}
        </button>
      </div>

      <div class="agent-grid">
        {#if filteredAgents.length === 0 && agentSearch}
          <div class="card empty-state wide">
            <p class="muted">No agents match "{agentSearch}"</p>
          </div>
        {:else if filteredAgents.length === 0}
          <div class="card empty-state wide">
            <div class="empty-icon"><Icon name="agent" size={32} /></div>
            <h3>No agents yet</h3>
            <p>Create your first agent to use in orchestrations.</p>
            <button class="pill cta" on:click={createAgent} disabled={creatingAgent}>
              {creatingAgent ? 'Creating...' : 'Create Agent'}
            </button>
          </div>
        {:else}
          {#each filteredAgents as agent}
            {@const id = agent.agentId || agent.id}
            <article class="card agent-card">
              <div class="agent-header">
                <p class="agent-name">{agent.name || id}</p>
                <span class={badgeClass(agent.status)}>{agent.status || 'pending'}</span>
              </div>
              {#if agent.description}
                <p class="agent-desc">{agent.description}</p>
              {/if}
              <div class="agent-meta">
                <span class="tool-count">{(agent.equippedToolIds || []).length} tools</span>
                {#if agent.model}
                  <span class="model">{agent.model}</span>
                {/if}
              </div>
              <div class="agent-actions">
                <button class="pill action-btn accent-btn" on:click={() => goto(`/agents/${id}`)}>
                  <Icon name="settings" size={12} /> Configure
                </button>
                <button class="pill action-btn" on:click={async () => { await chatStore.selectAgent(id); goto('/?mode=agent'); }}>
                  <Icon name="chat" size={12} /> Chat
                </button>
                <button class="pill action-btn danger-btn" on:click={() => requestDelete('agent', id, agent.name)} title="Delete agent">
                  <Icon name="close" size={12} />
                </button>
              </div>
            </article>
          {/each}
        {/if}
      </div>
    {/if}

    <!-- Recently Deleted -->
    <div class="trash-toggle">
      <button class="pill stat" on:click={() => { showTrash = !showTrash; if (showTrash) loadTrash(); }}>
        {showTrash ? 'Hide' : 'Show'} Recently Deleted{#if trashCount > 0}&nbsp;({trashCount}){/if}
      </button>
    </div>

    {#if showTrash}
      <section class="trash-section">
        <h3 class="trash-heading">Recently Deleted</h3>
        <p class="trash-hint">Items are kept for 30 days. Restore or permanently delete them.</p>

        {#if archivedOrchestrations.length === 0 && archivedAgents.length === 0}
          <p class="muted" style="font-size:12px; text-align:center; padding:12px 0;">Trash is empty.</p>
        {/if}

        {#each archivedOrchestrations as item}
          <div class="card orch-row trash-row">
            <div class="orch-info">
              <p class="orch-name">{item.name || item.id}</p>
              <span class="badge zinc">orchestration</span>
            </div>
            <div class="orch-actions">
              <button class="pill action-btn" disabled={trashBusy === item.id} on:click={() => restoreItem('orchestration', item.id, item.name)}>
                Restore
              </button>
              <button class="pill action-btn danger-btn" disabled={trashBusy === item.id} on:click={() => permanentlyDelete('orchestration', item.id, item.name)}>
                Delete forever
              </button>
            </div>
          </div>
        {/each}

        {#each archivedAgents as agent}
          {@const id = agent.agentId || agent.id}
          <div class="card orch-row trash-row">
            <div class="orch-info">
              <p class="orch-name">{agent.name || id}</p>
              <span class="badge zinc">agent</span>
            </div>
            <div class="orch-actions">
              <button class="pill action-btn" disabled={trashBusy === id} on:click={() => restoreItem('agent', id, agent.name)}>
                Restore
              </button>
              <button class="pill action-btn danger-btn" disabled={trashBusy === id} on:click={() => permanentlyDelete('agent', id, agent.name)}>
                Delete forever
              </button>
            </div>
          </div>
        {/each}
      </section>
    {/if}
  </section>
</AppShell>

<ConfirmDialog
  bind:open={confirmOpen}
  title={confirmTitle}
  message={confirmMessage}
  confirmLabel="Delete"
  danger
  onConfirm={confirmAction}
/>

<style>
  .page { min-height: calc(100svh - 92px); display: grid; gap: 10px; align-content: start; }

  .top-bar { padding: 14px 16px; display: flex; justify-content: space-between; align-items: center; gap: 10px; }
  h1 { margin: 0; font-size: 1.15rem; }
  .sub { margin: 2px 0 0; color: var(--muted); font-size: 12px; }
  .stats { display: flex; gap: 6px; }
  .stat { padding: 4px 10px; font-size: 11px; border-color: var(--border); background: var(--glass); }
  .error { margin: 0; padding: 8px 12px; color: var(--warn); font-size: 12px; border: 1px solid rgba(207, 94, 94, 0.3); border-radius: 10px; background: rgba(207, 94, 94, 0.06); }

  /* Tabs */
  .tabs { display: flex; gap: 0; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
  .tab { flex: 1; padding: 10px; border: 0; background: var(--glass); color: var(--muted); font-size: 13px; font-weight: 600; cursor: pointer; transition: background 0.15s, color 0.15s; }
  .tab:not(:last-child) { border-right: 1px solid var(--border); }
  .tab.active { background: var(--accent-soft); color: var(--accent); }
  .tab:hover:not(.active) { background: var(--panel); }

  /* Section header */
  .section-header { display: flex; gap: 8px; align-items: center; }
  .search-bar { flex: 1; display: flex; align-items: center; gap: 6px; padding: 6px 10px; min-height: 42px; }
  .search-icon { color: var(--muted); font-size: 15px; }
  .search-bar input { width: 100%; border: 0; outline: none; background: transparent; color: var(--fg); font-size: 13px; }
  .cta { padding: 8px 14px; border-color: rgba(232, 116, 12, 0.5); background: rgba(232, 116, 12, 0.15); color: var(--accent); cursor: pointer; font-size: 12px; font-weight: 600; white-space: nowrap; }
  .cta:hover { background: rgba(232, 116, 12, 0.25); }

  /* Orchestration list */
  .orch-list { display: grid; gap: 8px; }
  .orch-row { display: flex; align-items: center; gap: 12px; padding: 12px 14px; transition: border-color 0.15s; }
  .orch-row:hover { border-color: var(--accent); }
  .orch-info { flex: 1; min-width: 0; cursor: pointer; }
  .orch-name { margin: 0; font-size: 14px; font-weight: 600; }
  .orch-desc { margin: 4px 0 0; color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .orch-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

  /* Agent grid */
  .agent-grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
  .agent-card { padding: 14px; text-align: left; transition: border-color 0.15s; display: grid; gap: 8px; }
  .agent-card:hover { border-color: rgba(232, 116, 12, 0.4); }
  .agent-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .agent-name { flex: 1; margin: 0; font-size: 14px; font-weight: 600; }
  .agent-desc { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.4; }
  .agent-meta { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .tool-count, .model { color: var(--muted); font-size: 11px; }
  .agent-actions { display: flex; gap: 6px; margin-top: 2px; }

  /* Shared action buttons */
  .action-btn {
    padding: 6px 12px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border-color: var(--border);
    background: var(--glass);
    color: var(--fg);
    transition: border-color 0.15s, background 0.15s, color 0.15s;
  }
  .action-btn:hover { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }
  .accent-btn { border-color: rgba(232, 116, 12, 0.4); background: rgba(232, 116, 12, 0.1); color: var(--accent); }
  .accent-btn:hover { background: rgba(232, 116, 12, 0.2); }
  .danger-btn { padding: 6px 8px; border-color: transparent; background: transparent; color: var(--muted); }
  .danger-btn:hover { border-color: var(--danger-border); background: var(--danger-soft); color: var(--danger); }

  /* Status badges */
  .badge { border-radius: 999px; padding: 2px 8px; font-size: 10px; border: 1px solid transparent; text-transform: lowercase; }
  .green { color: var(--ok); background: var(--ok-soft); border-color: var(--ok-border); }
  .red { color: var(--danger); background: var(--danger-soft); border-color: var(--danger-border); }
  .info { color: var(--info); background: var(--info-soft); border-color: var(--info-border); }
  .caution { color: var(--caution); background: var(--caution-soft); border-color: var(--caution-border); }
  .zinc { color: var(--muted); background: rgba(107, 107, 107, 0.08); border-color: rgba(107, 107, 107, 0.18); }

  /* Empty states */
  .empty-state { grid-column: 1 / -1; padding: 32px 20px; text-align: center; display: grid; gap: 8px; justify-items: center; }
  .empty-state.wide { grid-column: 1 / -1; }
  .empty-icon { font-size: 28px; opacity: 0.6; }
  .empty-state h3 { margin: 0; font-size: 15px; }
  .empty-state p { margin: 0; color: var(--muted); font-size: 12px; max-width: 280px; }

  /* Trash section */
  .trash-toggle { display: flex; justify-content: center; padding: 4px 0; }
  .trash-section { display: grid; gap: 8px; }
  .trash-heading { margin: 0; font-size: 13px; font-weight: 600; color: var(--muted); }
  .trash-hint { margin: 0; font-size: 11px; color: var(--muted); }
  .trash-row { opacity: 0.7; border-style: dashed; }

  @media (max-width: 720px) {
    .top-bar { flex-direction: column; align-items: flex-start; }
    .section-header { flex-direction: column; }
    .agent-grid { grid-template-columns: 1fr; }
  }
</style>
