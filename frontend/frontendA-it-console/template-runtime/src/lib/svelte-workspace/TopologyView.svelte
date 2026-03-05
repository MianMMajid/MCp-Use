<script>
  export let endpoints = []

  const agents = [
    { id: 'planner', label: 'Planner Agent', role: 'Intent + policy planning' },
    { id: 'runtime', label: 'Runtime Agent', role: 'Execution coordinator' },
    { id: 'guard', label: 'Guard Agent', role: 'Firewall + approval checks' },
  ]

  let popup = { open: false, host: '', status: 'observed' }
  let modalOpen = false
  let modalTab = 'guard'
  let selectedAgent = 'runtime'

  function openEndpoint(endpoint) {
    popup = { open: true, host: endpoint.host, status: endpoint.status || 'observed' }
  }

  function openNodeModal() {
    modalOpen = true
  }

  function closeModal() {
    modalOpen = false
  }

  $: topologyRows = endpoints.slice(0, 12).map((endpoint, index) => ({
    id: `${endpoint.host}-${index}`,
    source: index % 2 === 0 ? 'Frontend B Runtime' : 'Mayple Firewall',
    target: endpoint.host,
    decision: endpoint.status || 'observed',
    agent: agents[index % agents.length].label,
  }))
</script>

<section class="view-panel topology-view panel">
  <header class="mw-view-header">
    <h1>Topology</h1>
    <p>Inspect runtime trace topology, agent decision handoffs, and node-level intervention options.</p>
  </header>

  <article class="panel topology-canvas-panel">
    <div class="panel-head">
      <h2 class="panel-title">Agentic Decision Topology</h2>
      <span class="chip">{topologyRows.length} edges</span>
    </div>
    <p class="panel-sub">Live runtime handoffs from Frontend B orchestration traces.</p>

    <div class="topology-map">
      <div class="topology-agent-grid">
      <div class="topology-agent-column">
        <h3 class="topology-section-title">Agent Interaction Grid</h3>
        <div class="topology-agent-list">
          {#each agents as agent}
            <button
              type="button"
              class="topology-agent-card"
              class:active={selectedAgent === agent.id}
              on:click={() => (selectedAgent = agent.id)}
            >
              <strong>{agent.label}</strong>
              <span>{agent.role}</span>
            </button>
          {/each}
        </div>
      </div>

      <div class="topology-flow-column">
        <h3 class="topology-section-title">Decision Handoffs</h3>
        <div class="topology-flow-list">
          {#if topologyRows.length === 0}
            <p class="empty-row">No topology data yet.</p>
          {/if}
          {#each topologyRows as row}
            <button type="button" class="topology-flow-row" on:click={() => openEndpoint({ host: row.target, status: row.decision })}>
              <span class="mono">{row.source}</span>
              <span class="topology-arrow">→</span>
              <span class="mono">{row.target}</span>
              <span class="topology-state-chip {row.decision}">{row.decision}</span>
            </button>
          {/each}
        </div>
      </div>

      <div class="topology-endpoint-column">
        <h3 class="topology-section-title">Endpoints</h3>
        {#if endpoints.length === 0}
          <p class="empty-row">No endpoint traces available yet.</p>
        {/if}
        {#each endpoints as endpoint}
          <button type="button" class="topology-node surface {endpoint.status}" on:click={() => openEndpoint(endpoint)}>
            <strong>{endpoint.host}</strong>
            <span>Status: {endpoint.status}</span>
          </button>
        {/each}
      </div>
    </div>
    </div>

    <div class="topology-endpoint-popup" class:hidden={!popup.open}>
      <div class="topology-endpoint-head">
        <h3>Endpoint Request</h3>
        <button type="button" class="topology-endpoint-close" on:click={() => (popup.open = false)}>Close</button>
      </div>
      <p class="topology-endpoint-sub">Requested domain / IP</p>
      <div class="topology-endpoint-host mono">{popup.host || '-'}</div>
      <div class="topology-endpoint-row">
        <span class="topology-endpoint-label">Current decision</span>
        <span class="topology-endpoint-status {popup.status}">{popup.status || 'observed'}</span>
      </div>
      <div class="topology-endpoint-actions">
        <button type="button" class="topology-endpoint-approve" on:click={openNodeModal}>Open Node Actions</button>
      </div>
    </div>
  </article>

  <div class="modal" class:hidden={!modalOpen}>
    <button type="button" class="modal-backdrop" on:click={closeModal} aria-label="Close node modal"></button>
    <div class="modal-card" role="dialog" aria-modal="true" aria-label="Node action modal">
      <div class="modal-head">
        <h2>Node Actions</h2>
        <button type="button" class="action-btn" on:click={closeModal}>Close</button>
      </div>
      <p class="modal-sub">Endpoint: <code>{popup.host || '-'}</code></p>
      <div class="modal-tabs">
        <button type="button" class="modal-tab" class:is-active={modalTab === 'guard'} on:click={() => (modalTab = 'guard')}>Guard</button>
        <button type="button" class="modal-tab" class:is-active={modalTab === 'fork'} on:click={() => (modalTab = 'fork')}>Fork</button>
        <button type="button" class="modal-tab" class:is-active={modalTab === 'risk'} on:click={() => (modalTab = 'risk')}>Risk</button>
        <button type="button" class="modal-tab" class:is-active={modalTab === 'growth'} on:click={() => (modalTab = 'growth')}>Growth</button>
      </div>

      {#if modalTab === 'guard'}
        <section class="modal-panel">
          <p>Set guard decision for this endpoint request.</p>
          <div class="actions">
            <button type="button" class="action-btn primary">Allow</button>
            <button type="button" class="action-btn danger">Block</button>
            <button type="button" class="action-btn">Pending</button>
          </div>
          <input class="input" placeholder="Reason" />
        </section>
      {/if}

      {#if modalTab === 'fork'}
        <section class="modal-panel">
          <p>Create a controlled replay branch from this node.</p>
          <input class="input" placeholder="Fork command" />
          <textarea class="textarea" placeholder="Fork note"></textarea>
          <button type="button" class="action-btn primary">Create Fork</button>
        </section>
      {/if}

      {#if modalTab === 'risk'}
        <section class="modal-panel">
          <p>Run risk-focused actions for incident triage.</p>
          <div class="actions">
            <button type="button" class="action-btn">Run Audit</button>
            <button type="button" class="action-btn">Generate Brief</button>
          </div>
        </section>
      {/if}

      {#if modalTab === 'growth'}
        <section class="modal-panel">
          <p>Share trace learnings to improve future orchestration behavior.</p>
          <input class="input" placeholder="Share tags" />
          <button type="button" class="action-btn primary">Share Trace Pattern</button>
        </section>
      {/if}
    </div>
  </div>
</section>
