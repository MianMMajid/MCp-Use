<script>
  import { getMapleRoute } from '../maple-workspace/route-registry.js'

  export let routeRecord = null
  export let routePath = ''
  export let state = {}
  export let selectedSessionId = ''
  export let selectedPlan = null

  const RELATED_SURFACES = Object.freeze({
    chat: ['/maple/agent', '/maple/policies', '/maple/gateway'],
    observability: ['/maple/observability', '/maple/runs', '/maple/agent'],
    runs: ['/maple/runs', '/maple/agent', '/maple/observability'],
    gateway: ['/maple/gateway', '/maple/policies', '/maple/cyber', '/maple/interventions'],
    cyber: ['/maple/gateway', '/maple/cyber', '/maple/agent'],
    policies: ['/maple/policies', '/maple/gateway', '/maple/agent'],
    agent: ['/maple/agent', '/maple/gateway', '/maple/policies'],
    interventions: ['/maple/interventions', '/maple/hitl', '/maple/modifier-approvals'],
    hitl: ['/maple/hitl', '/maple/agent', '/maple/interventions'],
    'modifier-approvals': ['/maple/modifier-approvals', '/maple/agent', '/maple/interventions'],
    scenarios: ['/maple/demo', '/maple/agent', '/maple/gateway'],
  })

  const COPY_BY_CONTEXT = Object.freeze({
    chat: {
      title: 'Prompt Origin to Governed Execution',
      caption: 'Operators start in chat, but every meaningful action still crosses policy and evidence boundaries.',
    },
    observability: {
      title: 'Runtime Health and Trace Flow',
      caption: 'Observability exists to explain whether the governed path is healthy before you inspect a run.',
    },
    runs: {
      title: 'Run Inventory and Evidence Correlation',
      caption: 'Runs connect the initiating session to the artifacts and decisions produced by the control plane.',
    },
    gateway: {
      title: 'Firewall Control Plane',
      caption: 'Gateway is the operator proof page for live protection state across policy, mediation, scanning, and filesystem guardrails.',
    },
    cyber: {
      title: 'Raw Download Verdict Path',
      caption: 'Cyber operations explain how a mediated fetch becomes a verdict, quarantine action, and evidence trail.',
    },
    policies: {
      title: 'Protected Input and Outbound Boundary',
      caption: 'Policy Center shows what Maple knows is sensitive and how those entities affect prompt and tool execution.',
    },
    agent: {
      title: 'Agent Session to Artifact Chain',
      caption: 'Agent Management is the canonical evidence surface for what actually happened on a governed run.',
    },
    interventions: {
      title: 'Fork, Review, and Promotion Path',
      caption: 'Filesystem interventions show how risky mutations move from planning through approval to promotion.',
    },
    hitl: {
      title: 'Human Approval Gate',
      caption: 'HITL exists to stop governed actions at the exact approval boundary where a human must decide.',
    },
    'modifier-approvals': {
      title: 'Modifier Authorization Gate',
      caption: 'Modifier approvals isolate privileged actions that cannot execute until a reviewer explicitly authorizes them.',
    },
    scenarios: {
      title: 'Governed Scenario Paths',
      caption: 'Operational scenarios bundle common proof flows so operators can rehearse or validate full system behavior.',
    },
  })

  function pickItems(value, nestedKeys = []) {
    if (Array.isArray(value)) return value
    if (value && typeof value === 'object') {
      for (const key of nestedKeys) {
        if (Array.isArray(value?.[key])) return value[key]
      }
    }
    return []
  }

  function statusTone(value) {
    const normalized = String(value ?? '').toLowerCase()
    if (['ready', 'healthy', 'allowed', 'active', 'promoted', 'safe'].includes(normalized)) return 'allowed'
    if (['blocked', 'quarantined', 'degraded', 'pending', 'fork_required', 'review', 'denied'].includes(normalized)) return 'blocked'
    return 'observed'
  }

  function flowState(label, status, detail) {
    return { label, status, detail, tone: statusTone(status) }
  }

  function getContext() {
    return routeRecord?.topologyContext ?? 'utility'
  }

  function buildFlowStates() {
    const context = getContext()
    const providers = state.cyberStatus?.value?.providers ?? {}
    const documents = pickItems(state.leakageDocuments?.value)
    const entities = pickItems(state.leakageEntities?.value)
    const events = pickItems(state.leakageEvents?.value)
    const sessions = pickItems(state.agentSessions?.value, ['sessions', 'items'])
    const runs = pickItems(state.runs?.value, ['runs', 'items'])
    const interventions = pickItems(state.filesystemMutations?.value)
    const gatewayApprovals = pickItems(state.gatewayApprovals?.value)
    const adminApprovals = pickItems(state.adminApprovals?.value)
    const modifierApprovals = pickItems(state.modifierApprovals?.value)
    const cyberDownloads = pickItems(state.cyberDownloads?.value)
    const quarantine = pickItems(state.cyberQuarantine?.value)

    switch (context) {
      case 'gateway':
        return [
          flowState('Context-Wall', providers.contextWall?.reachable ? 'ready' : 'degraded', providers.contextWall?.reason ?? 'policy boundary'),
          flowState('MCP Proxy', providers.mcpProxy?.reachable ? 'ready' : 'degraded', providers.mcpProxy?.reason ?? 'tool mediation'),
          flowState('Cyber Proxy', providers.cyberProxy?.reachable ? 'ready' : 'degraded', providers.cyberProxy?.reason ?? 'download scan'),
          flowState('Filesystem Guard', state.filesystemStatus?.value?.guard?.available === false ? 'degraded' : 'ready', state.filesystemStatus?.value?.guard?.mode ?? 'mutation control'),
        ]
      case 'cyber':
        return [
          flowState('Mediated Fetch', cyberDownloads.length > 0 ? 'allowed' : 'observed', `${cyberDownloads.length} recorded download(s)`),
          flowState('Raw-Byte Scan', state.cyberStatus?.value?.scanning?.provider ? 'ready' : 'degraded', state.cyberStatus?.value?.scanning?.provider ?? 'provider unknown'),
          flowState('Verdict', quarantine.length > 0 ? 'quarantined' : 'safe', `${quarantine.length} quarantine item(s)`),
        ]
      case 'policies':
        return [
          flowState('Protected Intake', documents.length > 0 ? 'active' : 'pending', `${documents.length} policy document(s)`),
          flowState('Entity Extraction', entities.length > 0 ? 'active' : 'pending', `${entities.length} protected entity(s)`),
          flowState('Prompt Boundary', events.some((item) => item.blocked) ? 'blocked' : events.length > 0 ? 'allowed' : 'observed', `${events.length} enforcement event(s)`),
        ]
      case 'agent':
        return [
          flowState('Session Origin', sessions.length > 0 ? 'active' : 'pending', `${sessions.length} active session(s)`),
          flowState('Governed Execution', selectedSessionId ? 'allowed' : 'observed', selectedSessionId || 'select a session'),
          flowState('Evidence Artifacts', Array.isArray(state.selectedArtifacts) && state.selectedArtifacts.length > 0 ? 'active' : 'observed', 'artifact drill-down'),
        ]
      case 'interventions':
        return [
          flowState('Plan Intake', interventions.length > 0 ? 'pending' : 'observed', `${interventions.length} queued plan(s)`),
          flowState('Fork Lane', selectedPlan?.lane ?? 'observed', selectedPlan?.lane ?? 'awaiting selection'),
          flowState('Promotion', selectedPlan?.status ?? 'pending', selectedPlan?.status ?? 'not promoted'),
        ]
      case 'hitl':
        return [
          flowState('Gateway Approval', gatewayApprovals.length > 0 ? 'pending' : 'ready', `${gatewayApprovals.length} pending`),
          flowState('Admin Approval', adminApprovals.length > 0 ? 'pending' : 'ready', `${adminApprovals.length} pending`),
        ]
      case 'modifier-approvals':
        return [
          flowState('Modifier Queue', modifierApprovals.length > 0 ? 'pending' : 'ready', `${modifierApprovals.length} pending`),
          flowState('Execution Hold', modifierApprovals.length > 0 ? 'blocked' : 'allowed', 'approval required'),
        ]
      case 'observability':
        return [
          flowState('Runtime Summary', state.summary?.value ? 'active' : 'pending', 'control-plane health'),
          flowState('SLO Guard', state.slo?.value ? 'active' : 'pending', 'service objective posture'),
          flowState('Audit Stream', pickItems(state.auditLog?.value).length > 0 ? 'active' : 'observed', 'recent trace activity'),
        ]
      case 'runs':
        return [
          flowState('Run Inventory', runs.length > 0 ? 'active' : 'observed', `${runs.length} run(s)`),
          flowState('Session Correlation', runs.length > 0 ? 'allowed' : 'pending', 'run to session mapping'),
          flowState('Artifact Review', runs.length > 0 ? 'observed' : 'pending', 'drill into evidence'),
        ]
      case 'chat':
        return [
          flowState('Operator Prompt', 'active', 'chat-first operator surface'),
          flowState('Policy Boundary', documents.length > 0 || entities.length > 0 ? 'ready' : 'observed', 'sanitize before execution'),
          flowState('Evidence Handoff', sessions.length > 0 ? 'allowed' : 'observed', 'handoff into Agent or Firewalls'),
        ]
      case 'scenarios':
        return [
          flowState('Scenario Trigger', 'active', 'guided workflow'),
          flowState('Governed Path', 'allowed', 'exercise firewall and agent chain'),
          flowState('Evidence Review', 'observed', 'handoff into canonical proof pages'),
        ]
      default:
        return []
    }
  }

  function relatedSurfaceRecords() {
    return (RELATED_SURFACES[getContext()] ?? [])
      .map((path) => getMapleRoute(path))
      .filter(Boolean)
  }

  $: topologyCopy = COPY_BY_CONTEXT[getContext()] ?? COPY_BY_CONTEXT.gateway
  $: topologyFlows = buildFlowStates()
  $: relatedSurfaces = relatedSurfaceRecords()
</script>

{#if routeRecord?.navTier === 'primary' || routeRecord?.navTier === 'secondary'}
  <section class="panel topology-canvas-panel fa-topology-panel">
    <div class="panel-head">
      <div>
        <p class="fa-topology-kicker">System topology</p>
        <h2 class="panel-title">{topologyCopy.title}</h2>
      </div>
      <span class="chip">operator map</span>
    </div>
    <p class="fa-topology-copy">{topologyCopy.caption}</p>

    <div class="topology-map fa-topology-map">
      <div class="topology-grid topology-agent-grid">
        <div class="topology-agent-column">
          <p class="topology-section-title">Origins</p>
          <div class="topology-agent-list">
            <div class="topology-agent-card {routePath === '/maple/chat' ? 'active' : ''}">
              <strong>Frontend B Agent</strong>
              <span>initiates governed actions</span>
            </div>
            <div class="topology-agent-card active">
              <strong>Frontend A Operator</strong>
              <span>reviews proof and control state</span>
            </div>
            <div class="topology-agent-card">
              <strong>{routeRecord?.title ?? 'Current page'}</strong>
              <span>{routeRecord?.operatorTask ?? 'operator-task'}</span>
            </div>
          </div>
        </div>

        <div class="topology-flow-column">
          <p class="topology-section-title">Governed path</p>
          <div class="topology-flow-list">
            {#each topologyFlows as flow}
              <div class="topology-flow-row">
                <strong>{flow.label}</strong>
                <span class="topology-arrow">→</span>
                <span class="mono">{flow.detail}</span>
                <span class="topology-state-chip {flow.tone}">{flow.status}</span>
              </div>
            {/each}
          </div>
        </div>

        <div class="topology-endpoint-column">
          <p class="topology-section-title">Related surfaces</p>
          <div class="topology-col">
            {#each relatedSurfaces as surface}
              <a
                href={surface.path}
                class="topology-node surface {surface.path === routePath ? 'active' : ''} {surface.path === routePath ? 'allowed' : ''}"
                aria-current={surface.path === routePath ? 'page' : undefined}
              >
                <strong>{surface.title}</strong>
                <span>{surface.purpose}</span>
              </a>
            {/each}
          </div>
        </div>
      </div>
    </div>
  </section>
{/if}

<style>
  .fa-topology-panel {
    display: grid;
    gap: 12px;
  }

  .fa-topology-kicker {
    margin: 0 0 4px;
    font-size: var(--text-2xs);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--muted);
    font-weight: 700;
  }

  .fa-topology-copy {
    margin: 0;
    color: var(--muted);
    max-width: 78ch;
  }

  .fa-topology-map {
    min-height: 0;
    padding: 18px;
    background:
      radial-gradient(circle at 12% 16%, rgba(232, 116, 12, 0.18), transparent 22%),
      radial-gradient(circle at 86% 14%, rgba(255, 182, 116, 0.12), transparent 28%),
      #16120f;
  }

  .topology-node.active {
    border-color: #ffb166;
    background: rgba(255, 245, 234, 0.98);
    box-shadow: 0 0 0 1px rgba(232, 116, 12, 0.16);
  }

  @media (max-width: 960px) {
    .fa-topology-map {
      padding: 14px;
    }
  }
</style>
