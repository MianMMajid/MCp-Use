<script>
  import { goto } from '$app/navigation';
  import AppShell from '@/lib/components/AppShell.svelte';
  import Icon from '@/lib/components/icons/Icon.svelte';
  import MaypleCharacter from '@/lib/components/MaypleCharacter.svelte';
  import { chatStore } from '@/lib/stores/chat-store';
  import { postJson, invalidateCache } from '@/lib/api';
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

  $: activeCount = agents.filter((item) => String(item.status || '').toLowerCase() === 'active').length;

  function badgeClass(value) {
    const color = statusColor(value);
    if (color === 'green') return 'badge green';
    if (color === 'red') return 'badge red';
    if (color === 'sky') return 'badge info';
    if (color === 'caution' || color === 'orange') return 'badge caution';
    return 'badge zinc';
  }

  async function handleCreate() {
    creating = true;
    try {
      const response = await postJson('/api/agents', { name: 'New Agent' });
      if (response.ok) {
        const payload = await response.json().catch(() => ({}));
        const newAgentId = String(payload?.id || payload?.agentId || '');
        invalidateCache('/api/agents');
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
      <div class="title-wrap">
        <h1>Agents</h1>
        <p>Openclaw-powered operators you can manage and equip with tools.</p>
      </div>
      <div class="meta-row">
        <span class="pill tiny stat">{agents.length} total</span>
        <span class="pill tiny stat">{activeCount} active</span>
        <button class="pill cta" on:click={handleCreate} disabled={creating}>{creating ? 'Creating…' : 'Create Agent'}</button>
      </div>
    </div>

    <div class="search card">
      <span class="search-icon"><Icon name="search" size={16} /></span>
      <input bind:value={search} placeholder="Search agents..." />
    </div>

    <div class="grid">
      {#if filtered.length === 0}
        <div class="card empty">
          {#if search}
            No agents match your search.
          {:else}
            <div class="empty-hero">
              <MaypleCharacter size={48} />
              <h3>No agents yet</h3>
              <p>Create your first agent to get started.</p>
              <button class="pill cta" on:click={handleCreate} disabled={creating}>{creating ? 'Creating…' : 'Create Agent'}</button>
            </div>
          {/if}
        </div>
      {:else}
        {#each filtered as agent}
          {@const id = agent.agentId || agent.id}
          <article class="card agent">
            <button class="top-btn" type="button" on:click={() => goto(`/agents/${id}`)}>
              <p class="name">{agent.name || id}</p>
              <span class={badgeClass(agent.status)}>{agent.status || 'pending'}</span>
            </button>

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
              <span class="model">{(agent.equippedToolIds || []).length} Openclaw tools</span>
            </div>

            <div class="actions">
              <button class="pill tiny" on:click={() => goto(`/agents/${id}`)}>Configure</button>
              <button
                class="pill tiny"
                on:click={async () => {
                  await chatStore.selectAgent(id);
                  goto('/?mode=agent');
                }}
              >Use in Chat</button>
            </div>
          </article>
        {/each}
      {/if}
    </div>
  </section>
</AppShell>

<style>
  .page {
    min-height: calc(100svh - 92px);
    display: grid;
    gap: 10px;
    align-content: start;
    grid-auto-rows: min-content;
  }

  .header {
    padding: 8px 10px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    min-height: 0;
  }

  .title-wrap {
    min-width: 0;
  }

  h1 {
    margin: 0;
    font-size: 1.06rem;
  }

  .title-wrap p {
    margin: 2px 0 0;
    color: var(--muted);
    font-size: 12px;
  }

  .meta-row {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .tiny {
    padding: 5px 8px;
    font-size: 12px;
  }

  .stat {
    border-color: rgba(249, 115, 22, 0.28);
    background: var(--glass);
  }

  .cta {
    padding: 7px 10px;
    border-color: rgba(249, 115, 22, 0.55);
    background: rgba(249, 115, 22, 0.2);
    cursor: pointer;
  }

  .search {
    min-height: 0;
    height: 44px;
    padding: 6px 10px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .search-icon {
    color: var(--muted);
    font-size: 15px;
  }

  .search input {
    width: 100%;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--fg);
    font-size: 14px;
  }

  .grid {
    display: grid;
    gap: 10px;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  }

  .agent {
    text-align: left;
    padding: 12px;
    border-radius: 18px;
  }

  .agent:hover {
    border-color: rgba(249, 115, 22, 0.42);
    background: var(--panel);
  }

  .top-btn {
    width: 100%;
    border: 0;
    background: transparent;
    color: inherit;
    padding: 0;
    text-align: left;
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
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
    min-height: 32px;
  }

  .meta {
    margin-top: 8px;
    display: flex;
    align-items: center;
    gap: 7px;
    flex-wrap: wrap;
  }

  .actions {
    margin-top: 10px;
    display: flex;
    gap: 8px;
  }

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

  .green { color: var(--ok); background: var(--ok-soft); border-color: var(--ok-border); }
  .red { color: var(--danger); background: var(--danger-soft); border-color: var(--danger-border); }
  .info { color: var(--info); background: var(--info-soft); border-color: var(--info-border); }
  .caution { color: var(--caution); background: var(--caution-soft); border-color: var(--caution-border); }
  .zinc { color: var(--muted); background: rgba(107, 107, 107, 0.08); border-color: rgba(107, 107, 107, 0.18); }

  .empty {
    padding: 20px;
    color: var(--muted);
    grid-column: 1 / -1;
    text-align: center;
  }

  .empty-hero { display: grid; gap: 8px; justify-items: center; padding: 16px; }
  .empty-hero h3 { margin: 0; font-size: 15px; }
  .empty-hero p { margin: 0; font-size: 12px; color: var(--muted); }
</style>
