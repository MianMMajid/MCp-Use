<script>
  import { onMount } from 'svelte'

  import { humanizeError } from '../utils/error-display.js'
  import { loadJson, loadMany, pickItems, sendJson } from '../api/maple-api.js'
  import { scanColor, scanLabel, incidentColor, degradedSecurityMessage, mutationLaneColor, mutationLaneLabel, mutationStatusLabel } from '../maple-workspace/cyber-view-model.js'
  import { getSourceFilterIds, filterRecordsBySource, getAuditRecordSource } from '../maple-workspace/origin-filter.js'
  import { getMapleRoute } from '../maple-workspace/route-registry.js'

  export let routePath

  const SOURCE_FILTERS = getSourceFilterIds()
  const POLL_INTERVALS = Object.freeze({
    '/maple/observability': 30000,
    '/maple/audit': 30000,
    '/maple/gateway': 30000,
    '/maple/interventions': 20000,
    '/maple/cyber': 20000,
    '/maple/hitl': 15000,
    '/maple/agent': 20000,
    '/maple/downstream': 30000,
  })

  const ROUTE_REQUESTS = Object.freeze({
    '/maple/observability': [
      ['summary', '/api/observability/orchestrations/summary'],
      ['slo', '/api/observability/orchestrations/slo'],
      ['auditLog', '/api/observability/orchestrations/audit-log?offset=0&limit=25'],
      ['alertWebhooks', '/api/observability/orchestrations/alert-webhooks'],
      ['runtimeCapabilities', '/api/runtime/feature-capabilities'],
    ],
    '/maple/audit': [
      ['auditLog', '/api/observability/orchestrations/audit-log?offset=0&limit=100'],
      ['auditChain', '/api/observability/orchestrations/audit-chain'],
      ['auditVerify', '/api/observability/orchestrations/audit-chain/verify'],
      ['retention', '/api/observability/orchestrations/retention'],
      ['deadLetter', '/api/observability/orchestrations/dead-letter'],
    ],
    '/maple/gateway': [
      ['firewallRules', '/api/firewall/rules/effective'],
      ['firewallState', '/api/firewall/state'],
      ['runtimeCapabilities', '/api/runtime/feature-capabilities'],
      ['cyberStatus', '/api/cyber/status'],
      ['cyberEvents', '/api/cyber/events?limit=5'],
      ['filesystemStatus', '/api/firewall/filesystem/status'],
      ['filesystemMutations', '/api/firewall/filesystem/mutations?limit=5'],
    ],
    '/maple/interventions': [
      ['filesystemStatus', '/api/firewall/filesystem/status'],
      ['filesystemMutations', '/api/firewall/filesystem/mutations?limit=100'],
    ],
    '/maple/cyber': [
      ['cyberStatus', '/api/cyber/status'],
      ['cyberPolicies', '/api/cyber/policies'],
      ['cyberEvents', '/api/cyber/events?limit=100'],
      ['cyberDownloads', '/api/cyber/downloads?limit=100'],
      ['cyberIncidents', '/api/cyber/incidents?limit=100'],
      ['cyberQuarantine', '/api/cyber/quarantine'],
      ['cyberSuppressions', '/api/cyber/suppressions'],
    ],
    '/maple/hitl': [
      ['gatewayApprovals', '/api/hitl/approvals'],
      ['adminApprovals', '/admin/api/approvals'],
    ],
    '/maple/modifier-approvals': [
      ['modifierApprovals', '/api/operations/orchestrations/approvals'],
    ],
    '/maple/agent': [
      ['agentStatus', '/api/openclaw/agent/status'],
      ['agentSessions', '/api/openclaw/agent/sessions'],
    ],
    '/maple/downstream': [
      ['downstreamApps', '/api/downstream/apps'],
    ],
    '/maple/demo': [],
    '/maple/tenants': [
      ['tenantBindings', '/api/operations/orchestrations/tenant-bindings'],
      ['orgTree', '/api/operations/orchestrations/org/tree'],
    ],
    '/maple/escalation': [
      ['escalation', '/api/operations/orchestrations/escalation'],
      ['breakGlass', '/api/operations/orchestrations/break-glass'],
    ],
    '/maple/runtime': [
      ['runtimeCapabilities', '/api/runtime/feature-capabilities'],
      ['runtimeStatus', '/api/runtime/status'],
    ],
    '/maple/demo': [],
  })

  let loading = true
  let error = ''
  let busy = ''
  let notice = ''
  let state = {}

  let sourceFilter = 'all'
  let previewInput = '{"command":"status","target":"agent-01","timeout":10}'
  let previewResult = null
  let selectedPlanId = ''
  let selectedPlan = null
  let selectedSessionId = ''
  let selectedAgentDetail = null
  let selectedArtifacts = []
  let selectedArtifactsRunId = ''
  let downstreamDispatch = {
    appId: '',
    toolName: '',
    payload: '{"query":"OpenAI GPT-5.4","maxResults":3}',
  }
  let agentMode = 'turn'
  let agentPrompt = ''
  let agentReply = null

  $: routeRecord = getMapleRoute(routePath)
  $: auditLog = filterRecordsBySource(pickItems(state.auditLog?.value), sourceFilter)
  $: observabilityAudit = filterRecordsBySource(pickItems(state.auditLog?.value), sourceFilter)
  $: cyberEvents = filterRecordsBySource(pickItems(state.cyberEvents?.value), sourceFilter)
  $: gatewayRecentMutations = pickItems(state.filesystemMutations?.value)
  $: cyberIncidents = pickItems(state.cyberIncidents?.value)
  $: cyberDownloads = pickItems(state.cyberDownloads?.value)
  $: cyberQuarantine = pickItems(state.cyberQuarantine?.value)
  $: cyberSuppressions = pickItems(state.cyberSuppressions?.value)
  $: gatewayApprovals = pickItems(state.gatewayApprovals?.value)
  $: adminApprovals = pickItems(state.adminApprovals?.value)
  $: modifierApprovals = pickItems(state.modifierApprovals?.value)
  $: interventionPlans = pickItems(state.filesystemMutations?.value)
  $: agentSessions = pickItems(state.agentSessions?.value, ['sessions', 'items'])
  $: downstreamApps = pickItems(state.downstreamApps?.value, ['apps', 'items'])
  $: selectedPlan = interventionPlans.find((item) => item.planId === selectedPlanId) ?? selectedPlan
  $: if (!selectedPlanId && interventionPlans.length > 0) {
    selectedPlanId = interventionPlans[0].planId
  }
  $: if (!selectedSessionId && agentSessions.length > 0) {
    selectedSessionId = agentSessions[0].sessionId ?? agentSessions[0].id ?? ''
  }
  $: sourceFilterLabel = sourceFilter === 'all' ? 'All sources' : sourceFilter
  $: severityOpenIncidents = cyberIncidents.filter((item) => {
    const severity = String(item?.severity ?? '').toLowerCase()
    const incidentState = String(item?.state ?? '').toLowerCase()
    return !['closed', 'resolved'].includes(incidentState) && (severity.includes('high') || severity.includes('critical'))
  })

  function getNestedCyberScan(item) {
    const rawArtifact = item?.metadata?.rawArtifact
    const content = rawArtifact?.content
    const nestedResultScan = content?.result?.scan
    if (nestedResultScan && typeof nestedResultScan === 'object') return nestedResultScan
    const nestedPreviewScan = content?.scan
    if (nestedPreviewScan && typeof nestedPreviewScan === 'object') return nestedPreviewScan
    const rawContentResultScan = content?.mediation?.result?.scan
    if (rawContentResultScan && typeof rawContentResultScan === 'object') return rawContentResultScan
    return item?.scan ?? null
  }

  function getCyberDownloadLabel(item) {
    return item?.metadata?.rawArtifact?.url
      ?? item?.url
      ?? item?.metadata?.rawArtifact?.filename
      ?? item?.filename
      ?? item?.fileName
      ?? item?.downloadId
      ?? '--'
  }

  function getCyberDownloadTrace(item) {
    return item?.metadata?.rawArtifact?.traceId
      ?? item?.traceId
      ?? item?.sessionId
      ?? '--'
  }

  async function refresh() {
    loading = true
    error = ''
    notice = ''
    try {
      const requests = ROUTE_REQUESTS[routePath] ?? []
      const nextState = await loadMany(fetch, requests)

      if (routePath === '/maple/downstream') {
        const apps = pickItems(nextState.downstreamApps?.value, ['apps', 'items'])
        const firstApp = apps[0]
        const appId = firstApp?.appId ?? firstApp?.id ?? ''
        if (appId) {
          nextState.downstreamTools = {
            ok: true,
            value: await loadJson(fetch, `/api/downstream/tools?appId=${encodeURIComponent(appId)}`),
          }
          if (!downstreamDispatch.appId) {
            downstreamDispatch = { ...downstreamDispatch, appId }
          }
        }
      }

      state = nextState

      if (routePath === '/maple/interventions' && selectedPlanId) {
        await loadInterventionDetail(selectedPlanId)
      }

      if (routePath === '/maple/agent' && selectedSessionId) {
        await loadAgentSession(selectedSessionId)
      }
    } catch (requestError) {
      error = requestError instanceof Error ? requestError.message : String(requestError)
    } finally {
      loading = false
    }
  }

  async function loadInterventionDetail(planId) {
    if (!planId) return
    try {
      const detail = await loadJson(fetch, `/api/firewall/filesystem/mutations/${encodeURIComponent(planId)}`)
      selectedPlan = detail?.item ?? null
    } catch (requestError) {
      error = requestError instanceof Error ? requestError.message : String(requestError)
    }
  }

  async function loadAgentSession(sessionId) {
    if (!sessionId) return
    try {
      selectedAgentDetail = await loadJson(fetch, `/api/openclaw/agent/sessions/${encodeURIComponent(sessionId)}`)
    } catch {
      selectedAgentDetail = null
    }
  }

  async function loadArtifacts(runId) {
    if (!runId) return
    busy = `artifacts:${runId}`
    error = ''
    try {
      const payload = await loadJson(fetch, `/api/openclaw/agent/runs/${encodeURIComponent(runId)}/artifacts`)
      selectedArtifactsRunId = payload?.runId ?? runId
      selectedArtifacts = Array.isArray(payload?.artifacts) ? payload.artifacts : []
    } catch (requestError) {
      error = requestError instanceof Error ? requestError.message : String(requestError)
    } finally {
      busy = ''
    }
  }

  async function runAction(key, operation) {
    busy = key
    error = ''
    notice = ''
    try {
      await operation()
      await refresh()
    } catch (requestError) {
      error = requestError instanceof Error ? requestError.message : String(requestError)
    } finally {
      busy = ''
    }
  }

  async function handleGatewayPreview(enforce = false) {
    let body
    try {
      body = JSON.parse(previewInput)
    } catch {
      body = { input: previewInput }
    }
    busy = enforce ? 'firewall-enforce' : 'firewall-preview'
    error = ''
    notice = ''
    try {
      previewResult = await sendJson(fetch, enforce ? '/api/firewall/decision' : '/api/firewall/preview', body)
      notice = enforce ? 'Firewall decision executed.' : 'Preview generated.'
      if (enforce) {
        await refresh()
      }
    } catch (requestError) {
      previewResult = null
      error = requestError instanceof Error ? requestError.message : String(requestError)
    } finally {
      busy = ''
    }
  }

  async function handleInterventionDecision(item, action) {
    const reason = window.prompt(`${action} reason`, action === 'approve' ? 'Reviewed mutation bundle' : 'Unsafe mutation')
    if (reason == null) return
    await runAction(`intervention:${item.planId}:${action}`, async () => {
      await sendJson(fetch, `/api/firewall/filesystem/mutations/${encodeURIComponent(item.planId)}/decision`, { action, reason })
      await loadInterventionDetail(item.planId)
    })
  }

  async function handlePromote(item) {
    const reason = window.prompt('Promotion note', 'Promote reviewed mutation bundle')
    if (reason == null) return
    await runAction(`intervention:${item.planId}:promote`, async () => {
      await sendJson(fetch, `/api/firewall/filesystem/mutations/${encodeURIComponent(item.planId)}/promote`, { reason })
      await loadInterventionDetail(item.planId)
    })
  }

  async function handleRestore(item) {
    const reason = window.prompt('Restore note', 'Restore archived content')
    if (reason == null) return
    await runAction(`intervention:${item.planId}:restore`, async () => {
      await sendJson(fetch, `/api/firewall/filesystem/mutations/${encodeURIComponent(item.planId)}/restore`, { reason })
      await loadInterventionDetail(item.planId)
    })
  }

  async function handleIncidentAction(incident, action) {
    if (action === 'assign') {
      const ownerId = window.prompt('Assign incident to owner', incident?.ownerId || 'secops')
      if (!ownerId) return
      await runAction(`incident:${incident.incidentId}:assign`, () =>
        sendJson(fetch, `/api/cyber/incidents/${encodeURIComponent(incident.incidentId)}/assign`, { ownerId }),
      )
      return
    }
    if (action === 'state') {
      const nextState = window.prompt('New incident state', incident?.state || 'triaged')
      if (!nextState) return
      const disposition = window.prompt('Disposition (optional)', incident?.disposition || '') ?? ''
      await runAction(`incident:${incident.incidentId}:state`, () =>
        sendJson(fetch, `/api/cyber/incidents/${encodeURIComponent(incident.incidentId)}/state`, { state: nextState, disposition }),
      )
      return
    }
    if (action === 'note') {
      const note = window.prompt('Add incident note')
      if (!note) return
      await runAction(`incident:${incident.incidentId}:note`, () =>
        sendJson(fetch, `/api/cyber/incidents/${encodeURIComponent(incident.incidentId)}/note`, { note }),
      )
    }
  }

  async function handleQuarantineAction(item, action) {
    if (action === 'review') {
      const reviewStatus = window.prompt('Review status', 'marked_benign')
      if (!reviewStatus) return
      await runAction(`quarantine:${item.quarantineId}:review`, () =>
        sendJson(fetch, `/api/cyber/quarantine/${encodeURIComponent(item.quarantineId)}/review`, { reviewStatus }),
      )
      return
    }
    if (action === 'release') {
      const releaseDisposition = window.prompt('Release disposition', 'operator_release')
      if (!releaseDisposition) return
      await runAction(`quarantine:${item.quarantineId}:release`, () =>
        sendJson(fetch, `/api/cyber/quarantine/${encodeURIComponent(item.quarantineId)}/release`, { releaseDisposition }),
      )
      return
    }
    if (action === 'rescan') {
      await runAction(`quarantine:${item.quarantineId}:rescan`, () =>
        sendJson(fetch, `/api/cyber/quarantine/${encodeURIComponent(item.quarantineId)}/rescan`, {}),
      )
    }
  }

  async function createSuppression() {
    const scopeType = window.prompt('Suppression scope type', 'sha256')
    if (!scopeType) return
    const scopeValue = window.prompt('Suppression scope value')
    if (!scopeValue) return
    const rationale = window.prompt('Rationale', 'Operator-approved temporary suppression')
    if (!rationale) return
    await runAction('suppression:create', () =>
      sendJson(fetch, '/api/cyber/suppressions', { scopeType, scopeValue, rationale }),
    )
  }

  async function revokeSuppression(item) {
    await runAction(`suppression:${item.suppressionId}:revoke`, () =>
      sendJson(fetch, `/api/cyber/suppressions/${encodeURIComponent(item.suppressionId)}/revoke`, { reason: 'Operator revoke' }),
    )
  }

  async function handleApprovalDecision(mode, approval, action) {
    const reason = window.prompt(`${action} reason`, action === 'approve' ? 'Reviewed by operator' : 'Rejected by operator') ?? ''
    const path = mode === 'admin' ? '/admin/api/approvals/decision' : '/api/hitl/approvals/decision'
    await runAction(`approval:${mode}:${approval.traceId}:${approval.stepIndex}:${action}`, () =>
      sendJson(fetch, path, {
        traceId: approval.traceId,
        stepIndex: approval.stepIndex,
        action,
        ...(reason ? { reason } : {}),
      }),
    )
  }

  async function handleModifierDecision(approval, action) {
    const reason = window.prompt(`${action} reason`, action === 'approve' ? 'Modifier approved' : 'Modifier denied') ?? ''
    await runAction(`modifier:${approval.approvalId}:${action}`, () =>
      sendJson(fetch, `/api/operations/orchestrations/approvals/${encodeURIComponent(approval.approvalId)}/decision`, {
        action,
        ...(reason ? { reason } : {}),
      }),
    )
  }

  async function handleAgentPrompt() {
    if (!agentPrompt.trim()) return
    const endpoint = agentMode === 'longform' ? '/api/openclaw/agent/longform' : '/api/openclaw/agent/turn'
    const body = agentMode === 'longform' ? { objective: agentPrompt } : { message: agentPrompt }
    await runAction(`agent:${agentMode}`, async () => {
      agentReply = await sendJson(fetch, endpoint, body)
      notice = `Agent ${agentMode} request completed.`
    })
  }

  async function handleAgentCancel(sessionId) {
    await runAction(`agent:${sessionId}:cancel`, () =>
      sendJson(fetch, `/api/openclaw/agent/sessions/${encodeURIComponent(sessionId)}/cancel`, {}),
    )
  }

  async function handleDownstreamDispatch() {
    let argumentsPayload
    try {
      argumentsPayload = JSON.parse(downstreamDispatch.payload)
    } catch {
      argumentsPayload = { input: downstreamDispatch.payload }
    }
    await runAction('downstream:dispatch', () =>
      sendJson(fetch, '/api/downstream/dispatch', {
        appId: downstreamDispatch.appId,
        toolName: downstreamDispatch.toolName,
        arguments: argumentsPayload,
      }),
    )
  }

  async function runDemo(action) {
    await runAction(`demo:${action}`, async () => {
      const endpoint = action === 'start' ? '/api/demo/start' : action === 'guard' ? '/api/demo/guard' : '/api/demo/full'
      const payload = await sendJson(fetch, endpoint, {})
      notice = payload?.message || `${action} demo completed.`
    })
  }

  function formatDate(value) {
    if (!value) return '--'
    try {
      return new Date(value).toLocaleString()
    } catch {
      return value
    }
  }

  function normalizeRules(payload) {
    return Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.rules)
        ? payload.rules
        : []
  }

  onMount(() => {
    refresh()
    const intervalMs = POLL_INTERVALS[routePath]
    if (!intervalMs) {
      return undefined
    }
    const intervalId = window.setInterval(refresh, intervalMs)
    return () => window.clearInterval(intervalId)
  })
</script>

<header class="mw-view-header">
  <h1>{routeRecord?.title ?? 'Maple'}</h1>
  <p>{routeRecord?.description ?? 'Operate Maple control-plane workflows from the canonical Svelte runtime.'}</p>
</header>

<div class="panel-head">
  <h2 class="panel-title">Route Context</h2>
  <span class="chip">{routePath}</span>
</div>

{#if error}
  <p class="mw-chat-error">{humanizeError(error)}</p>
{/if}
{#if notice}
  <p class="empty-row">{notice}</p>
{/if}

<div class="actions">
  <button type="button" class="action-btn primary" disabled={loading || Boolean(busy)} on:click={refresh}>
    {loading ? 'Refreshing...' : 'Refresh'}
  </button>
  {#if routePath === '/maple/cyber' || routePath === '/maple/audit' || routePath === '/maple/observability'}
    <label class="settings-chip-row">
      <span>Source</span>
      <select class="select" bind:value={sourceFilter} style="max-width: 220px;">
        {#each SOURCE_FILTERS as filterId}
          <option value={filterId}>{filterId}</option>
        {/each}
      </select>
    </label>
  {/if}
</div>

{#if routePath === '/maple/observability'}
  <section class="docs-grid">
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Summary</h2>
        <span class="chip">{sourceFilterLabel}</span>
      </div>
      <pre class="mono panel-json">{JSON.stringify(state.summary?.value ?? {}, null, 2)}</pre>
    </article>
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">SLO</h2>
        <span class="chip">live</span>
      </div>
      <pre class="mono panel-json">{JSON.stringify(state.slo?.value ?? {}, null, 2)}</pre>
    </article>
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Alert Webhooks</h2>
        <span class="chip">{pickItems(state.alertWebhooks?.value).length}</span>
      </div>
      <pre class="mono panel-json">{JSON.stringify(state.alertWebhooks?.value ?? {}, null, 2)}</pre>
    </article>
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Recent Audit</h2>
        <span class="chip">{observabilityAudit.length}</span>
      </div>
      <div class="table-wrap">
        <table class="timeline-table">
          <thead>
            <tr><th>Time</th><th>Source</th><th>Event</th><th>Trace</th></tr>
          </thead>
          <tbody>
            {#if observabilityAudit.length === 0}
              <tr><td colspan="4" class="empty-row">No events for this source filter. Try changing the filter or refreshing.</td></tr>
            {:else}
              {#each observabilityAudit.slice(0, 20) as item}
                <tr>
                  <td>{formatDate(item.createdAt ?? item.timestamp)}</td>
                  <td>{getAuditRecordSource(item)}</td>
                  <td>{item.eventType ?? item.type ?? item.action ?? 'event'}</td>
                  <td class="mono">{item.traceId ?? item.executionId ?? item.sessionId ?? '--'}</td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
    </article>
  </section>
{:else if routePath === '/maple/audit'}
  <section class="docs-grid">
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Audit Events</h2>
        <span class="chip">{auditLog.length}</span>
      </div>
      <div class="table-wrap">
        <table class="timeline-table">
          <thead>
            <tr><th>Time</th><th>Source</th><th>Event</th><th>Target</th></tr>
          </thead>
          <tbody>
            {#if auditLog.length === 0}
              <tr><td colspan="4" class="empty-row">No audit events for this source filter. Try adjusting the filter above.</td></tr>
            {:else}
              {#each auditLog as item}
                <tr>
                  <td>{formatDate(item.createdAt ?? item.timestamp)}</td>
                  <td>{getAuditRecordSource(item)}</td>
                  <td>{item.eventType ?? item.type ?? item.action ?? 'event'}</td>
                  <td class="mono">{item.traceId ?? item.sessionId ?? item.executionId ?? item.url ?? '--'}</td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
    </article>
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Audit Chain</h2>
        <span class="chip">{pickItems(state.auditChain?.value, ['items', 'chain']).length}</span>
      </div>
      <pre class="mono panel-json">{JSON.stringify(state.auditChain?.value ?? {}, null, 2)}</pre>
    </article>
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Chain Verification</h2>
        <span class="chip">{state.auditVerify?.value?.verified ? 'verified' : 'unverified'}</span>
      </div>
      <pre class="mono panel-json">{JSON.stringify(state.auditVerify?.value ?? {}, null, 2)}</pre>
    </article>
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Retention & Dead Letter</h2>
        <span class="chip">authoritative</span>
      </div>
      <pre class="mono panel-json">{JSON.stringify({
        retention: state.retention?.value ?? {},
        deadLetter: state.deadLetter?.value ?? {},
      }, null, 2)}</pre>
    </article>
  </section>
{:else if routePath === '/maple/gateway'}
  <section class="docs-grid">
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Combined Health</h2>
        <span class="chip">{degradedSecurityMessage(state.cyberStatus?.value) || 'healthy'}</span>
      </div>
      <div class="table-wrap">
        <table class="timeline-table">
          <thead>
            <tr><th>Plane</th><th>Status</th><th>Detail</th></tr>
          </thead>
          <tbody>
            <tr><td>Context-Wall</td><td>{state.cyberStatus?.value?.providers?.contextWall?.reachable ? 'ready' : 'degraded'}</td><td>{state.cyberStatus?.value?.providers?.contextWall?.reason ?? '--'}</td></tr>
            <tr><td>Cyber-Proxy</td><td>{state.cyberStatus?.value?.providers?.cyberProxy?.reachable ? 'ready' : 'degraded'}</td><td>{state.cyberStatus?.value?.providers?.cyberProxy?.reason ?? '--'}</td></tr>
            <tr><td>MCP-Proxy</td><td>{state.cyberStatus?.value?.providers?.mcpProxy?.reachable ? 'ready' : 'degraded'}</td><td>{state.cyberStatus?.value?.providers?.mcpProxy?.reason ?? '--'}</td></tr>
            <tr><td>Scan Provider</td><td>{state.cyberStatus?.value?.scanning?.degraded ? 'degraded' : 'ready'}</td><td>{state.cyberStatus?.value?.scanning?.provider ?? '--'}</td></tr>
            <tr><td>Filesystem Guard</td><td>{state.filesystemStatus?.value?.guard?.available === false ? 'degraded' : 'ready'}</td><td>{state.filesystemStatus?.value?.guard?.mode ?? '--'}</td></tr>
          </tbody>
        </table>
      </div>
    </article>
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Preview / Decision</h2>
        <span class="chip">authoritative backend only</span>
      </div>
      <textarea class="textarea firewall-json-editor" bind:value={previewInput} spellcheck="false"></textarea>
      <div class="actions">
        <button type="button" class="action-btn" disabled={busy === 'firewall-preview'} on:click={() => handleGatewayPreview(false)}>Preview</button>
        <button type="button" class="action-btn primary" disabled={busy === 'firewall-enforce'} on:click={() => handleGatewayPreview(true)}>Enforce</button>
      </div>
      <pre class="mono panel-json">{JSON.stringify(previewResult ?? state.firewallState?.value ?? {}, null, 2)}</pre>
    </article>
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Effective Rules</h2>
        <span class="chip">{normalizeRules(state.firewallRules?.value).length}</span>
      </div>
      <pre class="mono panel-json">{JSON.stringify(state.firewallRules?.value ?? {}, null, 2)}</pre>
    </article>
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Recent Cyber + Filesystem Activity</h2>
        <span class="chip">live snapshot</span>
      </div>
      <pre class="mono panel-json">{JSON.stringify({
        cyberEvents: cyberEvents.slice(0, 5),
        filesystemMutations: gatewayRecentMutations.slice(0, 5),
        capabilities: state.runtimeCapabilities?.value ?? {},
      }, null, 2)}</pre>
    </article>
  </section>
{:else if routePath === '/maple/interventions'}
  <section class="docs-grid interventions-grid">
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Intervention Queue</h2>
        <span class="chip">{interventionPlans.length}</span>
      </div>
      <div class="stack-list">
        {#if interventionPlans.length === 0}
          <p class="empty-row">No filesystem mutation plans queued. Plans appear when agents propose file changes.</p>
        {:else}
          {#each interventionPlans as item}
            <button type="button" class="list-card" on:click={() => { selectedPlanId = item.planId; loadInterventionDetail(item.planId) }}>
              <strong>{item.taskText || item.planId}</strong>
              <span>{mutationLaneLabel(item)} · {mutationStatusLabel(item)}</span>
            </button>
          {/each}
        {/if}
      </div>
    </article>
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Selected Plan</h2>
        <span class="chip">{selectedPlan?.planId ?? '--'}</span>
      </div>
      {#if !selectedPlan}
        <p class="empty-row">Select a mutation plan to inspect and promote.</p>
      {:else}
        <div class="actions">
          <button type="button" class="action-btn" disabled={Boolean(busy)} on:click={() => handleInterventionDecision(selectedPlan, 'approve')}>Approve</button>
          <button type="button" class="action-btn danger" disabled={Boolean(busy)} on:click={() => handleInterventionDecision(selectedPlan, 'deny')}>Deny</button>
          <button type="button" class="action-btn primary" disabled={Boolean(busy) || !['approved', 'direct_ready'].includes(String(selectedPlan.status))} on:click={() => handlePromote(selectedPlan)}>Promote</button>
          <button type="button" class="action-btn" disabled={Boolean(busy) || selectedPlan.status !== 'promoted'} on:click={() => handleRestore(selectedPlan)}>Restore</button>
        </div>
        <pre class="mono panel-json">{JSON.stringify(selectedPlan, null, 2)}</pre>
      {/if}
    </article>
  </section>
{:else if routePath === '/maple/cyber'}
  <section class="docs-grid">
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Status</h2>
        <span class="chip">{state.cyberStatus?.value?.scanning?.provider ?? '--'}</span>
      </div>
      <pre class="mono panel-json">{JSON.stringify(state.cyberStatus?.value ?? {}, null, 2)}</pre>
    </article>
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Policies</h2>
        <span class="chip">effective</span>
      </div>
      <pre class="mono panel-json">{JSON.stringify(state.cyberPolicies?.value ?? {}, null, 2)}</pre>
    </article>
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Incident Queue</h2>
        <span class="chip">{cyberIncidents.length}</span>
      </div>
      <div class="stack-list">
        {#each cyberIncidents as incident}
          <div class="list-card static">
            <strong>{incident.title || incident.incidentId}</strong>
            <span>{incident.state || 'new'} · {incident.severity || 'low'} · {incidentColor(incident)}</span>
            <div class="actions">
              <button type="button" class="action-btn" disabled={Boolean(busy)} on:click={() => handleIncidentAction(incident, 'assign')}>Assign</button>
              <button type="button" class="action-btn" disabled={Boolean(busy)} on:click={() => handleIncidentAction(incident, 'state')}>State</button>
              <button type="button" class="action-btn" disabled={Boolean(busy)} on:click={() => handleIncidentAction(incident, 'note')}>Note</button>
            </div>
          </div>
        {/each}
        {#if cyberIncidents.length === 0}
          <p class="empty-row">No incidents in current scope. Security incidents appear when threats are detected.</p>
        {/if}
      </div>
    </article>
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Downloads + Quarantine</h2>
        <span class="chip">{cyberDownloads.length} downloads · {cyberQuarantine.length} quarantine</span>
      </div>
      <div class="stack-list">
        {#each cyberDownloads.slice(0, 10) as item}
          <div class="list-card static">
            <strong>{getCyberDownloadLabel(item)}</strong>
            <span>{scanLabel(getNestedCyberScan(item))} · {scanColor(getNestedCyberScan(item))} · trace={getCyberDownloadTrace(item)}</span>
          </div>
        {/each}
      </div>
      <div class="stack-list">
        {#each cyberQuarantine.slice(0, 10) as item}
          <div class="list-card static">
            <strong>{item.fileName ?? item.quarantineId}</strong>
            <span>{item.status ?? item.reviewStatus ?? 'quarantined'}</span>
            <div class="actions">
              <button type="button" class="action-btn" disabled={Boolean(busy)} on:click={() => handleQuarantineAction(item, 'review')}>Review</button>
              <button type="button" class="action-btn" disabled={Boolean(busy)} on:click={() => handleQuarantineAction(item, 'release')}>Release</button>
              <button type="button" class="action-btn" disabled={Boolean(busy)} on:click={() => handleQuarantineAction(item, 'rescan')}>Rescan</button>
            </div>
          </div>
        {/each}
      </div>
    </article>
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Suppressions</h2>
        <span class="chip">{cyberSuppressions.length}</span>
      </div>
      <div class="actions">
        <button type="button" class="action-btn primary" disabled={Boolean(busy)} on:click={createSuppression}>Create suppression</button>
      </div>
      <div class="stack-list">
        {#each cyberSuppressions as item}
          <div class="list-card static">
            <strong>{item.scopeType}:{item.scopeValue}</strong>
            <span>{item.status ?? 'active'} · expires={item.expiresAt ?? '--'}</span>
            <button type="button" class="action-btn" disabled={Boolean(busy)} on:click={() => revokeSuppression(item)}>Revoke</button>
          </div>
        {/each}
      </div>
      <p class="empty-row">{degradedSecurityMessage(state.cyberStatus?.value) || `Severe open incidents: ${severityOpenIncidents.length}`}</p>
    </article>
  </section>
{:else if routePath === '/maple/hitl'}
  <section class="docs-grid">
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Gateway HITL</h2>
        <span class="chip">{gatewayApprovals.length}</span>
      </div>
      <div class="stack-list">
        {#each gatewayApprovals as approval}
          <div class="list-card static">
            <strong>{approval.title ?? approval.traceId ?? 'approval'}</strong>
            <span>step={approval.stepIndex ?? '--'} · session={approval.sessionId ?? '--'}</span>
            <div class="actions">
              <button type="button" class="action-btn" disabled={Boolean(busy)} on:click={() => handleApprovalDecision('gateway', approval, 'approve')}>Approve</button>
              <button type="button" class="action-btn danger" disabled={Boolean(busy)} on:click={() => handleApprovalDecision('gateway', approval, 'deny')}>Deny</button>
            </div>
          </div>
        {/each}
      </div>
    </article>
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Admin Approvals</h2>
        <span class="chip">{adminApprovals.length}</span>
      </div>
      <div class="stack-list">
        {#each adminApprovals as approval}
          <div class="list-card static">
            <strong>{approval.title ?? approval.traceId ?? 'approval'}</strong>
            <span>step={approval.stepIndex ?? '--'} · session={approval.sessionId ?? '--'}</span>
            <div class="actions">
              <button type="button" class="action-btn" disabled={Boolean(busy)} on:click={() => handleApprovalDecision('admin', approval, 'approve')}>Approve</button>
              <button type="button" class="action-btn danger" disabled={Boolean(busy)} on:click={() => handleApprovalDecision('admin', approval, 'deny')}>Deny</button>
            </div>
          </div>
        {/each}
      </div>
    </article>
  </section>
{:else if routePath === '/maple/modifier-approvals'}
  <section class="docs-grid">
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Modifier Approvals</h2>
        <span class="chip">{modifierApprovals.length}</span>
      </div>
      <div class="stack-list">
        {#each modifierApprovals as approval}
          <div class="list-card static">
            <strong>{approval.approvalId ?? approval.title ?? 'modifier approval'}</strong>
            <span>{approval.summary ?? approval.reason ?? '--'}</span>
            <div class="actions">
              <button type="button" class="action-btn" disabled={Boolean(busy)} on:click={() => handleModifierDecision(approval, 'approve')}>Approve</button>
              <button type="button" class="action-btn danger" disabled={Boolean(busy)} on:click={() => handleModifierDecision(approval, 'deny')}>Deny</button>
            </div>
          </div>
        {/each}
      </div>
    </article>
  </section>
{:else if routePath === '/maple/agent'}
  <section class="docs-grid">
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Agent Status</h2>
        <span class="chip">{state.agentStatus?.value?.status ?? state.agentStatus?.value?.state ?? 'unknown'}</span>
      </div>
      <pre class="mono panel-json">{JSON.stringify(state.agentStatus?.value ?? {}, null, 2)}</pre>
    </article>
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Agent Prompt</h2>
        <span class="chip">{agentMode}</span>
      </div>
      <div class="actions">
        <button type="button" class="action-btn" on:click={() => (agentMode = 'turn')}>Turn</button>
        <button type="button" class="action-btn" on:click={() => (agentMode = 'longform')}>Longform</button>
      </div>
      <textarea class="textarea firewall-json-editor" bind:value={agentPrompt} spellcheck="false"></textarea>
      <div class="actions">
        <button type="button" class="action-btn primary" disabled={Boolean(busy) || !agentPrompt.trim()} on:click={handleAgentPrompt}>Send</button>
      </div>
      <pre class="mono panel-json">{JSON.stringify(agentReply ?? {}, null, 2)}</pre>
    </article>
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Sessions</h2>
        <span class="chip">{agentSessions.length}</span>
      </div>
      <div class="stack-list">
        {#each agentSessions as session}
          <div class="list-card static">
            <strong>{session.sessionId ?? session.id ?? 'session'}</strong>
            <span>{session.status ?? 'unknown'} · updated={formatDate(session.updatedAt ?? session.createdAt)}</span>
            <div class="actions">
              <button type="button" class="action-btn" on:click={() => { selectedSessionId = session.sessionId ?? session.id ?? ''; loadAgentSession(selectedSessionId) }}>Inspect</button>
              <button type="button" class="action-btn danger" disabled={Boolean(busy)} on:click={() => handleAgentCancel(session.sessionId ?? session.id ?? '')}>Cancel</button>
            </div>
          </div>
        {/each}
      </div>
    </article>
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Selected Session Detail</h2>
        <span class="chip">{selectedSessionId || '--'}</span>
      </div>
      <pre class="mono panel-json">{JSON.stringify(selectedAgentDetail ?? {}, null, 2)}</pre>
      {#if Array.isArray(selectedAgentDetail?.runs)}
        <div class="actions">
          {#each selectedAgentDetail.runs as run}
            <button type="button" class="action-btn" disabled={Boolean(busy)} on:click={() => loadArtifacts(run.runId ?? run.id)}>
              Load artifacts {run.runId ?? run.id}
            </button>
          {/each}
        </div>
      {/if}
      {#if selectedArtifactsRunId}
        <pre class="mono panel-json">{JSON.stringify({ runId: selectedArtifactsRunId, artifacts: selectedArtifacts }, null, 2)}</pre>
      {/if}
    </article>
  </section>
{:else if routePath === '/maple/downstream'}
  <section class="docs-grid">
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Apps + Tools</h2>
        <span class="chip">{downstreamApps.length}</span>
      </div>
      <pre class="mono panel-json">{JSON.stringify({
        apps: state.downstreamApps?.value ?? {},
        tools: state.downstreamTools?.value ?? {},
      }, null, 2)}</pre>
    </article>
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Dispatch</h2>
        <span class="chip">mediated</span>
      </div>
      <div class="docs-grid">
        <label>
          <span class="mono">App ID</span>
          <input class="input" bind:value={downstreamDispatch.appId} />
        </label>
        <label>
          <span class="mono">Tool</span>
          <input class="input" bind:value={downstreamDispatch.toolName} placeholder="web_search" />
        </label>
      </div>
      <textarea class="textarea firewall-json-editor" bind:value={downstreamDispatch.payload} spellcheck="false"></textarea>
      <div class="actions">
        <button type="button" class="action-btn primary" disabled={Boolean(busy) || !downstreamDispatch.appId || !downstreamDispatch.toolName} on:click={handleDownstreamDispatch}>
          Dispatch
        </button>
      </div>
    </article>
  </section>
{:else if routePath === '/maple/demo'}
  <section class="docs-grid">
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Deterministic Demo Paths</h2>
        <span class="chip">operator ready</span>
      </div>
      <div class="actions">
        <button type="button" class="action-btn" disabled={Boolean(busy)} on:click={() => runDemo('start')}>Start</button>
        <button type="button" class="action-btn" disabled={Boolean(busy)} on:click={() => runDemo('guard')}>Guard</button>
        <button type="button" class="action-btn primary" disabled={Boolean(busy)} on:click={() => runDemo('full')}>Full</button>
      </div>
    </article>
  </section>
{:else}
  <section class="docs-grid">
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Backend Surfaces</h2>
        <span class="chip">{routeRecord?.apiEndpoints?.length ?? 0}</span>
      </div>
      <pre class="mono panel-json">{JSON.stringify(
        Object.fromEntries(
          Object.entries(state).map(([key, value]) => [key, value?.value ?? { error: value?.error ?? 'unavailable' }]),
        ),
        null,
        2,
      )}</pre>
    </article>
  </section>
{/if}

<style>
  .panel-json {
    max-height: 28rem;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .stack-list {
    display: grid;
    gap: 12px;
    margin-top: 16px;
  }

  .list-card {
    display: grid;
    gap: 8px;
    border: 1px solid var(--line);
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.72);
    padding: 14px 16px;
    text-align: left;
  }

  .list-card.static {
    cursor: default;
  }

  .interventions-grid {
    grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
  }

  @media (max-width: 960px) {
    .interventions-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
