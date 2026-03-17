<script>
  import { goto } from '$app/navigation';
  import AppShell from '@/lib/components/AppShell.svelte';
  import Icon from '@/lib/components/icons/Icon.svelte';
  import { chatStore } from '@/lib/stores/chat-store';
  import { postJson, invalidateCache } from '@/lib/api';
  import { statusColor } from '@/lib/format';

  let activeTab = 'orchestrations';
  let agentSearch = '';
  let orchSearch = '';
  let creatingAgent = false;
  let creatingOrch = false;
  let error = '';

  $: agents = Array.isArray($chatStore.agents) ? $chatStore.agents : [];
  $: orchestrations = Array.isArray($chatStore.orchestrations) ? $chatStore.orchestrations : [];

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

    {#if error}<p class="error">{error}</p>{/if}

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
        {#if filteredOrch.length === 0}
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
            <button class="card orch-row" on:click={() => goto(`/orchestrate/${item.id}`)}>
              <div class="orch-info">
                <p class="orch-name">{item.name || item.id}</p>
                {#if item.description}
                  <p class="orch-desc">{item.description}</p>
                {/if}
              </div>
              <div class="orch-meta">
                <span class={badgeClass(item.status)}>{item.status || 'draft'}</span>
                <span class="arrow"><Icon name="chevron" size={14} /></span>
              </div>
            </button>
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
        {#if filteredAgents.length === 0}
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
              <button class="agent-top" type="button" on:click={() => goto(`/agents/${id}`)}>
                <p class="agent-name">{agent.name || id}</p>
                <span class={badgeClass(agent.status)}>{agent.status || 'unknown'}</span>
              </button>
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
                <button class="pill tiny" on:click={() => goto(`/agents/${id}`)}>Configure</button>
                <button class="pill tiny" on:click={async () => { await chatStore.selectAgent(id); goto('/?mode=agent'); }}>Chat</button>
              </div>
            </article>
          {/each}
        {/if}
      </div>
    {/if}
  </section>
</AppShell>

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
  .orch-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 14px 16px; cursor: pointer; text-align: left; transition: border-color 0.15s; }
  .orch-row:hover { border-color: var(--accent); }
  .orch-info { min-width: 0; }
  .orch-name { margin: 0; font-size: 14px; font-weight: 600; }
  .orch-desc { margin: 4px 0 0; color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .orch-meta { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
  .arrow { color: var(--muted); font-size: 16px; }

  /* Agent grid */
  .agent-grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); }
  .agent-card { padding: 12px; text-align: left; transition: border-color 0.15s; }
  .agent-card:hover { border-color: rgba(232, 116, 12, 0.4); }
  .agent-top { width: 100%; border: 0; background: transparent; color: inherit; padding: 0; text-align: left; display: flex; align-items: center; gap: 8px; cursor: pointer; }
  .agent-name { flex: 1; margin: 0; font-size: 13px; font-weight: 600; }
  .agent-desc { margin: 6px 0 0; color: var(--muted); font-size: 11px; }
  .agent-meta { margin-top: 8px; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .tool-count, .model { color: var(--muted); font-size: 10px; }
  .agent-actions { margin-top: 8px; display: flex; gap: 6px; }
  .tiny { padding: 4px 8px; font-size: 11px; cursor: pointer; }

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

  @media (max-width: 720px) {
    .top-bar { flex-direction: column; align-items: flex-start; }
    .section-header { flex-direction: column; }
    .agent-grid { grid-template-columns: 1fr; }
  }
</style>
