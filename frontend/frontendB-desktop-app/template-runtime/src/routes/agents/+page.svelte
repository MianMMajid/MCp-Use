<script>
  import { goto } from '$app/navigation';
  import AppShell from '@/lib/components/AppShell.svelte';
  import { chatStore } from '@/lib/stores/chat-store';
  import { postJson } from '@/lib/api';
  import { riskColor, riskLabel, statusColor } from '@/lib/format';

  let search = '';
  let creating = false;

  $: agents = Array.isArray($chatStore.agents) ? $chatStore.agents : [];
  $: filtered = search
    ? agents.filter((a) =>
        String(a.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
        String(a.description ?? '').toLowerCase().includes(search.toLowerCase()) ||
        String(a.agentId ?? a.id ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : agents;

  function badgeClass(value) {
    const color = statusColor(value);
    if (color === 'green') return 'badge green';
    if (color === 'red') return 'badge red';
    if (color === 'orange') return 'badge orange';
    if (color === 'sky') return 'badge sky';
    return 'badge zinc';
  }

  async function handleCreate() {
    creating = true;
    try {
      const response = await postJson('/api/agents', { name: 'New Agent' });
      if (response.ok) {
        const payload = await response.json().catch(() => ({}));
        const newAgentId = String(payload?.id || payload?.agentId || '');
        if (newAgentId) {
          await goto(`/agents/${encodeURIComponent(newAgentId)}`);
        }
      }
    } finally {
      creating = false;
    }
  }
</script>

<AppShell>
  <section class="page">
    <div class="header card">
      <div>
        <h1>Agents</h1>
        <p>Browse and manage your agents</p>
      </div>
      <button class="pill cta" on:click={handleCreate} disabled={creating}>{creating ? 'Creating...' : 'Create Agent'}</button>
    </div>

    <div class="search card">
      <input bind:value={search} placeholder="Search agents..." />
    </div>

    <div class="grid">
      {#if filtered.length === 0}
        <div class="card empty">{search ? 'No agents match your search.' : 'No agents found.'}</div>
      {:else}
        {#each filtered as agent}
          {@const id = agent.agentId || agent.id}
          <article
            class="card agent"
          >
            <div class="top" on:click={() => goto(`/agents/${id}`)}>
              <p class="name">{agent.name || id}</p>
              <span class={badgeClass(agent.status)}>{agent.status || 'unknown'}</span>
            </div>
            {#if agent.description}
              <p class="desc">{agent.description}</p>
            {/if}
            <div class="meta">
              {#if agent.riskScore != null}
                <span class={badgeClass(riskColor(agent.riskScore))}>{riskLabel(agent.riskScore)} risk</span>
              {/if}
              {#if agent.model}
                <span class="model">{agent.model}</span>
              {/if}
            </div>
            <div class="actions">
              <button class="pill tiny" on:click={() => goto(`/agents/${id}`)}>Open</button>
              <button class="pill tiny" on:click={async () => {
                await chatStore.selectAgent(id);
                goto('/?mode=agent');
              }}>Use in Chat</button>
            </div>
          </article>
        {/each}
      {/if}
    </div>
  </section>
</AppShell>

<style>
  .page {
    min-height: calc(100svh - 24px);
    display: grid;
    gap: 12px;
  }

  .header {
    padding: 14px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
  }

  h1 {
    margin: 0;
    font-size: 1.2rem;
  }

  .header p {
    margin: 3px 0 0;
    color: var(--muted);
    font-size: 14px;
  }

  .cta {
    padding: 9px 12px;
    border-color: rgba(249, 115, 22, 0.55);
    background: rgba(249, 115, 22, 0.2);
    cursor: pointer;
  }

  .search {
    padding: 10px 12px;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .search::before {
    content: '⌕';
    color: var(--muted);
    font-size: 16px;
  }

  .search input {
    width: 100%;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--fg);
  }

  .grid {
    display: grid;
    gap: 12px;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  }

  .agent {
    text-align: left;
    padding: 14px;
    border-radius: 20px;
  }

  .agent:hover {
    border-color: rgba(249, 115, 22, 0.42);
    background: rgba(29, 34, 45, 0.85);
  }

  .top {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .name {
    flex: 1;
    margin: 0;
    font-size: 14px;
    font-weight: 600;
  }

  .desc {
    margin: 8px 0 0;
    color: var(--muted);
    font-size: 12px;
    min-height: 34px;
  }

  .meta {
    margin-top: 10px;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .actions { margin-top: 10px; display: flex; gap: 8px; }
  .tiny { padding: 6px 9px; border-color: rgba(249,115,22,.35); background: rgba(20,24,32,.65); cursor: pointer; }

  .model {
    color: var(--muted);
    font-size: 11px;
  }

  .badge {
    border-radius: 999px;
    padding: 2px 8px;
    font-size: 10px;
    border: 1px solid transparent;
    text-transform: lowercase;
  }

  .green { color: #10b981; background: rgba(16, 185, 129, 0.14); border-color: rgba(16, 185, 129, 0.3); }
  .red { color: #fb7185; background: rgba(251, 113, 133, 0.14); border-color: rgba(251, 113, 133, 0.3); }
  .orange { color: #fb923c; background: rgba(251, 146, 60, 0.14); border-color: rgba(251, 146, 60, 0.3); }
  .sky { color: #38bdf8; background: rgba(56, 189, 248, 0.14); border-color: rgba(56, 189, 248, 0.3); }
  .zinc { color: #d4d4d8; background: rgba(212, 212, 216, 0.1); border-color: rgba(212, 212, 216, 0.22); }

  .empty {
    padding: 20px;
    color: var(--muted);
    grid-column: 1 / -1;
    text-align: center;
  }
</style>
