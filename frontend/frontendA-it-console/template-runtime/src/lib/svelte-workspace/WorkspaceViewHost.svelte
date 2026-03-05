<script>
  import InterventionControlPanel from './InterventionControlPanel.svelte'
  import TopologyView from './TopologyView.svelte'
  import DocsViews from './DocsViews.svelte'
  import {
    buildMonitoringQuickPrompts,
    requestMonitoringChat,
  } from '../maple-workspace/monitoring-chat.js'

  export let panelOpen = false
  export let state
  export let routeRecord = null
  export let summary = null
  export let slo = null
  export let auditEvents = []
  export let approvals = []
  export let topologyEndpoints = []
  export let executions = []
  export let runtimeCapabilities = []
  export let integrationCatalog = []
  export let connectedIntegrations = []
  export let downstreamApps = []
  export let downstreamTools = []
  export let openclawCatalog = []
  export let authMe = null
  export let selectedExecutionId = ''
  export let targetInput = ''
  export let traceQuery = ''
  export let sessionQuery = ''
  export let reason = ''
  export let busy = ''
  export let notice = ''
  export let error = ''
  export let showConfirmStop = false
  export let allEndpoints = []

  export let setTraceQuery = () => {}
  export let setSessionQuery = () => {}
  export let selectExecution = () => {}
  export let setTargetInput = () => {}
  export let setReason = () => {}
  export let pauseExecution = () => {}
  export let resumeExecution = () => {}
  export let openStopConfirm = () => {}
  export let cancelStopConfirm = () => {}
  export let confirmStop = () => {}

  const INITIAL_CHAT_MESSAGE = Object.freeze({
    id: 'observe-chat-initial',
    role: 'assistant',
    content:
      'Monitoring agent connected. Ask for live firewall posture, risk drift, approvals, or intervention guidance.',
  })

  let chatMessages = [INITIAL_CHAT_MESSAGE]
  let chatInput = ''
  let chatBusy = false
  let chatError = ''

  $: activeExecution = executions.find((entry) => entry.executionId === selectedExecutionId) ?? executions[0] ?? null
  $: activeExecutionId = String(activeExecution?.executionId ?? targetInput ?? '')
  $: activeSessionId = String(activeExecution?.sessionId ?? '')
  $: connectedProviders = new Set(
    connectedIntegrations.map((item) => String(item.provider ?? item.id ?? '').toLowerCase()),
  )
  $: catalogRows = integrationCatalog.map((item) => {
    const provider = String(item.provider ?? item.id ?? '').toLowerCase()
    const connected = connectedProviders.has(provider)
    return {
      source: 'Integrations',
      app: String(item.name ?? item.provider ?? item.id ?? 'Unknown'),
      kind: String(item.category ?? 'integration'),
      status: connected ? 'connected' : String(item.status ?? 'available'),
      detail: String(item.description ?? ''),
    }
  })
  $: appRows = downstreamApps.map((item) => ({
    source: 'Downstream App',
    app: String(item.name ?? item.appId ?? item.id ?? 'Unknown'),
    kind: 'app',
    status: String(item.status ?? 'connected'),
    detail: String(item.id ?? item.appId ?? ''),
  }))
  $: toolRows = downstreamTools.map((item) => ({
    source: 'Downstream Tool',
    app: String(item.name ?? item.toolId ?? item.id ?? 'Unknown'),
    kind: 'tool',
    status: 'enabled',
    detail: String(item.app ?? ''),
  }))
  $: openclawRows = openclawCatalog.map((item) => ({
    source: 'OpenClaw',
    app: String(item.name ?? item.tool ?? item.id ?? 'Unknown'),
    kind: 'agent-tool',
    status: 'enabled',
    detail: String(item.description ?? ''),
  }))
  $: marketplaceRows = [...catalogRows, ...appRows, ...toolRows, ...openclawRows]
  $: chatPrompts = buildMonitoringQuickPrompts({
    executionId: activeExecutionId,
    sessionId: activeSessionId,
    routeTitle: routeRecord?.title ?? '',
  })

  async function sendChatPrompt(rawPrompt) {
    const prompt = String(rawPrompt ?? '').trim()
    if (!prompt || chatBusy) return

    chatBusy = true
    chatError = ''
    const requestId = `observe-chat-${Date.now()}`
    chatMessages = [
      ...chatMessages.slice(-17),
      { id: `${requestId}-user`, role: 'user', content: prompt },
    ]
    chatInput = ''

    try {
      const reply = await requestMonitoringChat(prompt)
      chatMessages = [
        ...chatMessages.slice(-17),
        { id: `${requestId}-assistant`, role: 'assistant', content: reply },
      ]
    } catch (requestError) {
      chatError =
        requestError instanceof Error ? requestError.message : 'Unable to reach monitoring chat.'
      chatMessages = [
        ...chatMessages.slice(-17),
        {
          id: `${requestId}-assistant-error`,
          role: 'assistant',
          content:
            'Monitoring chat is temporarily unavailable. Continue with intervention controls while retrying.',
        },
      ]
    } finally {
      chatBusy = false
    }
  }
</script>

{#if panelOpen && state.category === 'observe' && state.view === 'live'}
  <section class="view-panel live-view panel">
    <header class="mw-view-header">
      <h1>Observability & Alerts</h1>
      <p>Monitor Frontend B orchestration runtime and intervene when risk escalates.</p>
    </header>
    <p data-testid="monitoring-context-explainer">Monitoring context and live runtime posture.</p>
    <div class="card-grid">
      <article class="card"><h3>Summary</h3><pre>{JSON.stringify(summary ?? {}, null, 2)}</pre></article>
      <article class="card"><h3>SLO</h3><pre>{JSON.stringify(slo ?? {}, null, 2)}</pre></article>
    </div>
  </section>
{/if}

{#if panelOpen && state.category === 'chat' && state.view === 'chat'}
  <section data-view-panel="chat" class="view-panel chat-view panel">
    <header class="mw-view-header">
      <h1>Monitoring Chat</h1>
      <p>Chat with the monitoring agent for live firewall updates and intervention recommendations.</p>
    </header>

    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Monitoring Agent</h2>
        <span class="chip">
          {activeExecutionId
            ? `execution=${activeExecutionId}`
            : activeSessionId
              ? `session=${activeSessionId}`
              : 'target=unselected'}
        </span>
      </div>

      <div class="mw-chat-prompts">
        {#each chatPrompts as prompt}
          <button type="button" class="mw-chat-prompt" disabled={chatBusy} on:click={() => sendChatPrompt(prompt)}>
            {prompt}
          </button>
        {/each}
      </div>

      <div class="mw-chat-log" role="log" aria-live="polite">
        {#each chatMessages as message}
          <article
            class="mw-chat-bubble {message.role === 'user' ? 'mw-chat-bubble-user' : 'mw-chat-bubble-assistant'}"
          >
            <p>{message.content}</p>
          </article>
        {/each}
      </div>

      <form
        class="mw-chat-form"
        on:submit|preventDefault={() => {
          sendChatPrompt(chatInput)
        }}
      >
        <input
          type="text"
          bind:value={chatInput}
          placeholder="Ask for monitoring updates, risk drift, or next intervention..."
          autocomplete="off"
        />
        <button type="submit" disabled={chatBusy || !chatInput.trim()}>
          {chatBusy ? 'Sending...' : 'Send'}
        </button>
      </form>
      {#if chatError}<p class="mw-chat-error">{chatError}</p>{/if}
    </article>
  </section>
{/if}

{#if panelOpen && state.category === 'observe' && state.view === 'timeline'}
  <section data-view-panel="timeline" class="view-panel timeline-view panel">
    <header class="mw-view-header">
      <h1>Timeline</h1>
      <p>Ordered Frontend B runtime events for incident triage and intervention sequencing.</p>
    </header>
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Runtime Event Stream</h2>
        <span class="chip">{auditEvents.length}</span>
      </div>
      {#if auditEvents.length === 0}
        <p class="empty-row">No B-origin events available.</p>
      {/if}
      <div class="timeline-table-wrap">
        <table class="timeline-table" id="timelineBody">
          <thead><tr><th>Event</th><th>Execution</th><th>Timestamp</th><th>Source</th></tr></thead>
        <tbody>
          {#each auditEvents as event}
            <tr>
              <td>{event.eventType ?? event.type ?? event.action ?? 'event'}</td>
              <td class="mono">{event.executionId ?? event.traceId ?? '-'}</td>
              <td>{event.timestamp ?? event.createdAt ?? '-'}</td>
              <td>{event.source ?? event.origin ?? 'runtime'}</td>
            </tr>
          {/each}
        </tbody>
        </table>
      </div>
    </article>
  </section>
{/if}

{#if panelOpen && state.category === 'analyze' && state.view === 'control'}
  <InterventionControlPanel
    {executions}
    {selectedExecutionId}
    {targetInput}
    {traceQuery}
    {sessionQuery}
    {reason}
    {busy}
    {notice}
    {error}
    {showConfirmStop}
    {setTraceQuery}
    {setSessionQuery}
    {selectExecution}
    {setTargetInput}
    {setReason}
    {pauseExecution}
    {resumeExecution}
    {openStopConfirm}
    {cancelStopConfirm}
    {confirmStop}
  />
{/if}

{#if panelOpen && state.category === 'analyze' && state.view === 'topology'}
  <TopologyView endpoints={topologyEndpoints} />
{/if}

{#if panelOpen && state.category === 'admin' && state.view === 'settings'}
  <section data-view-panel="settings" class="view-panel settings-view panel">
    <header class="mw-view-header">
      <h1>Settings</h1>
      <p>Runtime, auth, and configuration health for the monitoring + intervention console.</p>
    </header>
    <div class="docs-grid">
      <article class="panel settings-panel">
        <div class="panel-head">
          <h2 class="panel-title">Runtime Capabilities</h2>
          <span class="chip">{runtimeCapabilities.length}</span>
        </div>
        {#if runtimeCapabilities.length === 0}
          <p class="empty-row">No capability records returned.</p>
        {:else}
          <div class="settings-actions">
            {#each runtimeCapabilities as item}
              <div class="settings-chip-row">
                <span class="mono">{item.name ?? item.key ?? 'capability'}</span>
                <span class="chip {item.enabled ? 'ok-chip' : 'warn-chip'}">{item.enabled ? 'enabled' : 'disabled'}</span>
              </div>
            {/each}
          </div>
        {/if}
      </article>

      <article class="panel settings-panel">
        <div class="panel-head">
          <h2 class="panel-title">Operator Session</h2>
          <span class="chip">auth</span>
        </div>
        <div class="settings-actions">
          <div class="settings-chip-row"><span>User</span><span class="mono">{authMe?.email ?? authMe?.username ?? 'unknown'}</span></div>
          <div class="settings-chip-row"><span>Source</span><span class="chip">Frontend B orchestration runtime</span></div>
          <div class="settings-chip-row"><span>Active traces</span><span class="mono">{executions.length}</span></div>
          <div class="settings-chip-row"><span>Pending approvals</span><span class="mono">{approvals.length}</span></div>
        </div>
      </article>

      <article class="panel settings-panel">
        <div class="panel-head">
          <h2 class="panel-title">Endpoint Health Snapshot</h2>
          <span class="chip">{allEndpoints.length}</span>
        </div>
        <div class="settings-actions">
          {#each allEndpoints.slice(0, 10) as endpoint}
            <div class="settings-chip-row">
              <span class="mono">{endpoint}</span>
              <span class="chip ok-chip">registered</span>
            </div>
          {/each}
        </div>
      </article>
    </div>
  </section>
{/if}

{#if panelOpen && state.category === 'admin' && state.view === 'policy'}
  <section data-view-panel="policy" class="view-panel policy-view panel">
    <header class="mw-view-header">
      <h1>Policy Operations</h1>
      <p>Unified guardrails, approvals, and recovery decisions for live Frontend B executions.</p>
    </header>
    <div class="docs-grid">
      <article class="panel policy-panel">
        <div class="panel-head">
          <h2 class="panel-title">Approval Queue</h2>
          <span class="chip">{approvals.length}</span>
        </div>
        {#if approvals.length === 0}
          <p class="empty-row">No pending approvals.</p>
        {:else}
          <div class="table-wrap">
            <table class="timeline-table">
              <thead>
                <tr><th>Approval</th><th>Execution</th><th>Status</th><th>Created</th></tr>
              </thead>
              <tbody>
                {#each approvals as approval}
                  <tr>
                    <td class="mono">{approval.approvalId ?? approval.id ?? 'approval'}</td>
                    <td class="mono">{approval.executionId ?? '-'}</td>
                    <td>{approval.status ?? 'pending'}</td>
                    <td>{approval.createdAt ?? approval.timestamp ?? '-'}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </article>

      <article class="panel policy-panel">
        <div class="panel-head">
          <h2 class="panel-title">Recovery Strategy</h2>
          <span class="chip">playbook</span>
        </div>
        <ol class="mw-simple-list">
          <li>Pause execution to freeze blast radius.</li>
          <li>Inspect blocked nodes and evidence in Topology + Trace detail.</li>
          <li>Use `retry-node` for same branch continuation.</li>
          <li>Use `replay-from-node` for safe branch fork and validation.</li>
          <li>Resume execution or stop with explicit reason when unrecoverable.</li>
        </ol>
        <p>Current execution target: <span class="mono">{activeExecutionId || 'unselected'}</span></p>
      </article>

      <article class="panel policy-panel">
        <div class="panel-head">
          <h2 class="panel-title">Policy Guarantees</h2>
        </div>
        <div class="settings-actions">
          <div class="settings-chip-row"><span>Destructive actions</span><span class="chip warn-chip">confirm + reason</span></div>
          <div class="settings-chip-row"><span>Step-up required</span><span class="chip warn-chip">challenge/verify</span></div>
          <div class="settings-chip-row"><span>Escalation + break-glass</span><span class="chip">auditable</span></div>
          <div class="settings-chip-row"><span>Monitoring source</span><span class="chip ok-chip">Frontend B runtime only</span></div>
        </div>
      </article>
    </div>
  </section>
{/if}

{#if panelOpen && state.category === 'admin' && state.view === 'marketplace'}
  <section data-view-panel="marketplace" class="view-panel marketplace-view panel">
    <header class="mw-view-header">
      <h1>Marketplace</h1>
      <p>Approved apps and every integrated tool currently enabled for OpenClaw and downstream runtime.</p>
    </header>
    <article class="panel marketplace-panel">
      <div class="panel-head">
        <h2 class="panel-title">Integration Inventory</h2>
        <span class="chip">{marketplaceRows.length}</span>
      </div>
      {#if marketplaceRows.length === 0}
        <p class="empty-row">No integrated apps/tools returned.</p>
      {:else}
        <div class="table-wrap">
          <table class="timeline-table">
            <thead>
              <tr><th>Source</th><th>Name</th><th>Kind</th><th>Status</th><th>Detail</th></tr>
            </thead>
            <tbody>
              {#each marketplaceRows as row}
                <tr>
                  <td>{row.source}</td>
                  <td class="mono">{row.app}</td>
                  <td>{row.kind}</td>
                  <td><span class="chip {row.status === 'connected' || row.status === 'enabled' ? 'ok-chip' : 'warn-chip'}">{row.status}</span></td>
                  <td>{row.detail || '-'}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </article>
  </section>
{/if}

{#if panelOpen && state.category === 'docs'}
  <DocsViews
    view={state.view}
    routePath={state.routePath}
    endpoints={allEndpoints}
    routeRecord={routeRecord}
    runtimeCapabilities={runtimeCapabilities}
  />
{/if}
