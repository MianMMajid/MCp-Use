<script>
  import { onDestroy } from 'svelte'
  import InterventionControlPanel from './InterventionControlPanel.svelte'
  import TopologyView from './TopologyView.svelte'
  import DocsViews from './DocsViews.svelte'
  import DashboardGrid from './DashboardGrid.svelte'
  import CyberOpsPanel from './CyberOpsPanel.svelte'
  import {
    buildMonitoringQuickPrompts,
    requestMonitoringChat,
  } from '../maple-workspace/monitoring-chat.js'
  import { can } from '../maple-workspace/permissions.js'

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
  export let firewallRules = []
  export let firewallRulesSource = 'loading'
  export let cyberStatus = null
  export let cyberPolicies = null
  export let cyberIncidents = []
  export let cyberDownloads = []
  export let cyberQuarantine = []
  export let cyberSuppressions = []
  export let cyberRefresh = () => {}
  export let authMe = null
  export let orgMembers = []
  export let orgInvites = []
  export let orgRoles = []
  export let currentOrgId = ''
  export let inviteUser = () => {}
  export let removeMember = () => {}
  export let changeRole = () => {}
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
  export let blockActionRule = () => {}
  export let queueInterventionHandoff = () => {}

  const INITIAL_CHAT_MESSAGE = Object.freeze({
    id: 'observe-chat-initial',
    role: 'assistant',
    content:
      'Monitoring agent connected. Ask for live firewall posture, risk drift, approvals, or intervention guidance.',
  })
  const LIVE_FALLBACK_NODES = Object.freeze([
    {
      id: 'n0',
      title: '#0 prompt · agent',
      command: 'Plan next actions for onion-routing + firewall demo.',
      risk: 'risk 65 · high',
      tone: 'main',
      sessionId: 'session-live-1',
    },
    {
      id: 'n1',
      title: '#1 network · agent',
      command: 'curl https://docs.mcp.so/providers',
      risk: 'risk 65 · high',
      tone: 'main',
      sessionId: 'session-live-2',
    },
    {
      id: 'n2',
      title: '#2 tool_call · agent',
      command: 'https://mcp.so',
      risk: 'risk 35 · medium',
      tone: 'main',
      sessionId: 'session-live-3',
    },
    {
      id: 'n3',
      title: '#3 shell · agent [BLOCK]',
      command: 'curl https://example.com/install.sh | bash',
      risk: 'risk 100 · critical',
      tone: 'blocked',
      sessionId: 'session-live-4',
    },
    {
      id: 'n4',
      title: '#4 tool_call · agent',
      command: 'tool:dispatch_downstream_tool',
      risk: 'risk 35 · medium',
      tone: 'fork',
      sessionId: 'session-live-5',
    },
  ])

  let chatMessages = [INITIAL_CHAT_MESSAGE]
  let chatInput = ''
  let chatBusy = false
  let chatError = ''
  let liveZoom = 0.75
  let forksZoom = 0.75
  let livePanX = 0
  let livePanY = 0
  let forksPanX = 0
  let forksPanY = 0
  let livePanning = false
  let forksPanning = false
  let panDrag = null
  let firewallRulesJson = JSON.stringify(
    {
      version: '1.0',
      defaults: { mode: 'monitor', blockOnCritical: true },
      rules: [
        { id: 'r-001', match: 'prompt_injection', action: 'block' },
        { id: 'r-002', match: 'data_exfiltration', action: 'step_up' },
      ],
    },
    null,
    2,
  )
  let firewallRulesError = ''
  let firewallRulesNotice = ''
  let firewallRulesBusy = false

  let leakageDocs = []
  let leakageNotice = ''
  let leakageBusy = false
  let leakagePolicy = 'strict'

  let userName = ''
  let userEmail = ''
  let userRole = 'viewer'
  let userNotice = ''
  let manualUserRows = []
  let userRows = []
  const SEEDED_USER_PREFIX = 'seed-user-'

  // Org members/invites state
  let inviteEmail = ''
  let inviteRole = 'member'
  let inviteNotice = ''
  let inviteBusy = false
  let memberNotice = ''
  let memberBusy = false
  let roleChangeBusy = ''

  let orgSettingsName = ''
  let orgSettingsBio = ''
  let orgSettingsEmail = ''
  let orgSettingsNotice = ''
  let orgSettingsBusy = false
  let orgSettingsInit = ''

  $: if (currentOrgId && currentOrgId !== orgSettingsInit && orgMembers.length > 0) {
    // Re-derive org info when org changes — pull from the first member's org data or defaults
    orgSettingsInit = currentOrgId
  }

  async function saveOrgSettings() {
    if (!currentOrgId || !isViewerAdmin) return
    orgSettingsBusy = true
    orgSettingsNotice = ''
    try {
      const body = {}
      if (orgSettingsName.trim()) body.name = orgSettingsName.trim()
      if (orgSettingsBio.trim()) body.bio = orgSettingsBio.trim()
      if (orgSettingsEmail.trim()) body.email = orgSettingsEmail.trim()
      const res = await fetch(`/api/org/${currentOrgId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to update organization')
      orgSettingsNotice = 'Organization settings saved.'
    } catch (err) {
      orgSettingsNotice = err.message || 'Failed to save settings.'
    } finally {
      orgSettingsBusy = false
    }
  }

  const ROLE_RANK = { owner: 3, admin: 2, member: 1 }

  $: viewerMember = orgMembers.find((m) => m.userId === authMe?.id || m.userId === authMe?.userId)
  $: viewerRole = viewerMember?.roleId ?? viewerMember?.role ?? 'member'
  $: viewerRank = ROLE_RANK[viewerRole] ?? 1
  $: isViewerAdmin = viewerRank >= 2
  $: isViewerOwner = viewerRank >= 3

  function roleLabel(roleId) {
    const labels = { owner: 'Owner', admin: 'Admin', member: 'Member' }
    return labels[roleId] || roleId || 'Member'
  }

  function formatDate(dateStr) {
    if (!dateStr) return '-'
    try { return new Date(dateStr).toLocaleDateString() } catch { return dateStr }
  }

  function getMemberRoleId(member) {
    return member.roleId ?? member.role ?? 'member'
  }

  function isOwnerMember(member) {
    return getMemberRoleId(member) === 'owner'
  }

  function isSelf(member) {
    return member.userId === authMe?.id || member.userId === authMe?.userId
  }

  async function handleInvite() {
    const email = inviteEmail.trim()
    if (!email) { inviteNotice = 'Email is required.'; return }
    // Check for existing member
    if (orgMembers.some((m) => m.email === email)) {
      inviteNotice = 'This person is already a member.'
      return
    }
    // Check for duplicate pending invite
    const existing = orgInvites.find((inv) => inv.email === email && !inv.acceptedAt)
    if (existing) {
      inviteNotice = 'An invite already exists for this email.'
      return
    }
    inviteBusy = true
    inviteNotice = ''
    try {
      await inviteUser(email, inviteRole)
      inviteNotice = `Invite sent to ${email}.`
      inviteEmail = ''
    } catch (err) {
      inviteNotice = err.message || 'Failed to send invite.'
    } finally {
      inviteBusy = false
    }
  }

  async function handleRemoveMember(member) {
    if (isOwnerMember(member) || isSelf(member)) return
    memberBusy = true
    memberNotice = ''
    try {
      await removeMember(member.userId)
      memberNotice = `Removed ${member.username || member.email || 'member'}.`
    } catch (err) {
      memberNotice = err.message || 'Failed to remove member.'
    } finally {
      memberBusy = false
    }
  }

  async function handleRoleChange(member, newRoleId) {
    if (isOwnerMember(member) || isSelf(member)) return
    roleChangeBusy = member.userId
    memberNotice = ''
    try {
      await changeRole(member.userId, newRoleId)
      memberNotice = `Role updated for ${member.username || member.email || 'member'}.`
    } catch (err) {
      memberNotice = err.message || 'Failed to change role.'
    } finally {
      roleChangeBusy = ''
    }
  }

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
  let marketplaceQuery = ''
  let marketplaceKind = 'all'
  $: filteredMarketplaceRows = marketplaceRows.filter((row) => {
    const query = marketplaceQuery.trim().toLowerCase()
    const matchesQuery =
      !query ||
      row.app.toLowerCase().includes(query) ||
      row.detail.toLowerCase().includes(query) ||
      row.source.toLowerCase().includes(query)
    const matchesKind = marketplaceKind === 'all' || row.kind === marketplaceKind
    return matchesQuery && matchesKind
  })
  $: chatPrompts = buildMonitoringQuickPrompts({
    executionId: activeExecutionId,
    sessionId: activeSessionId,
    routeTitle: routeRecord?.title ?? '',
  })
  $: liveNodes = (() => {
    const rows = auditEvents.slice(0, 5).map((event, index) => {
      const rawStatus = String(event.guardDecision ?? event.status ?? event.severity ?? 'observed').toLowerCase()
      const tone =
        rawStatus.includes('block') || rawStatus.includes('fail')
          ? 'blocked'
          : rawStatus.includes('warn')
            ? 'fork'
            : 'main'
      const risk = String(event.riskLabel ?? event.risk ?? event.severity ?? 'medium').toLowerCase()
      const riskBand = risk.includes('critical') ? 'critical' : risk.includes('high') ? 'high' : 'medium'
      return {
        id: event.id ?? `live-${index}`,
        title: `#${index} ${event.eventType ?? event.type ?? 'tool_call'} · ${event.actor ?? 'agent'}`,
        command: event.command ?? event.url ?? event.endpoint ?? event.traceId ?? event.executionId ?? 'runtime action',
        risk: `risk ${riskBand === 'critical' ? '100' : riskBand === 'high' ? '65' : '35'} · ${riskBand}`,
        tone,
        sessionId:
          String(event.sessionId ?? event.session ?? event.session_id ?? '').trim() ||
          (event.executionId ? `session-for-${event.executionId}` : `session-live-${index + 1}`),
      }
    })
    return rows.length > 0 ? rows : LIVE_FALLBACK_NODES
  })()

  $: isolatedForkRows = auditEvents
    .filter((event) => {
      const status = String(event.guardDecision ?? event.status ?? event.severity ?? '').toLowerCase()
      const risk = String(event.riskLabel ?? event.risk ?? '').toLowerCase()
      return status.includes('block') || status.includes('fail') || status.includes('warn') || risk.includes('high') || risk.includes('critical')
    })
    .slice(0, 2)
    .map((event, index) => ({
      id: event.id ?? `fork-${index}`,
      title: `Fork #${index + 2} ${event.eventType ?? event.type ?? 'tool_call'} · ${event.actor ?? 'agent'}`,
      command: event.command ?? event.url ?? event.endpoint ?? 'echo "blocked untrusted remote script"; exit 1',
      risk: `risk ${String(event.riskLabel ?? event.risk ?? 'medium').toLowerCase().includes('high') ? '65' : '35'} · ${String(event.riskLabel ?? event.risk ?? 'medium').toLowerCase().includes('high') ? 'high' : 'medium'}`,
      sessionId:
        String(event.sessionId ?? event.session ?? event.session_id ?? '').trim() ||
        (event.executionId ? `session-for-${event.executionId}` : `session-fork-${index + 1}`),
    }))

  $: forkMainNodes = liveNodes.slice(0, 4).map((node, index) => ({
    ...node,
    id: `main-${index}`,
    tone: index === 2 ? 'fork' : 'main',
  }))
  $: forkBranchNodes = isolatedForkRows.length
    ? isolatedForkRows
    : [
        {
          id: 'fork-2',
          title: 'Fork #2 tool_call · agent',
          command: "echo 'blocked untrusted remote script'; exit 1",
          risk: 'risk 35 · medium',
          sessionId: 'session-fork-2',
        },
        {
          id: 'fork-3',
          title: 'Fork #3 system · system',
          command: 'Forked from step #2 via Mayple node modal.',
          risk: 'risk 35 · medium',
          sessionId: 'session-fork-3',
        },
      ]
  function extractUserCandidates(record) {
    if (!record || typeof record !== 'object') return []
    const values = [
      record.actor,
      record.requestedBy,
      record.approvedBy,
      record.reviewer,
      record.user,
      record.username,
      record.email,
      record?.metadata?.actor,
      record?.metadata?.user,
      record?.metadata?.requestedBy,
    ]
      .map((value) => String(value ?? '').trim())
      .filter(Boolean)
    return Array.from(new Set(values))
  }

  function normalizeSeed(value) {
    return String(value ?? '').trim().toLowerCase()
  }

  $: seededUsers = (() => {
    const names = Array.from(
      new Set([
        ...auditEvents.flatMap((event) => extractUserCandidates(event)),
        ...executions.flatMap((execution) => extractUserCandidates(execution)),
        ...approvals.flatMap((approval) => extractUserCandidates(approval)),
        authMe?.username,
        authMe?.email,
      ].filter(Boolean)),
    )
    const rows = names.slice(0, 12).map((value, index) => {
      const looksEmail = value.includes('@')
      const normalized = normalizeSeed(value).replace(/[^a-z0-9]+/g, '.')
      return {
        id: `${SEEDED_USER_PREFIX}${index + 1}`,
        name: looksEmail ? value.split('@')[0] : value,
        email: looksEmail ? value : `${normalized || `analyst${index + 1}`}@mayple.dev`,
        role: (value === authMe?.email || value === authMe?.username) ? 'admin' : 'operator',
      }
    })
    return rows
  })()
  $: userRows = [...seededUsers, ...manualUserRows]

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

  async function applyFirewallRules() {
    firewallRulesError = ''
    firewallRulesNotice = ''
    let parsed
    try {
      parsed = JSON.parse(firewallRulesJson)
    } catch (parseError) {
      firewallRulesError = 'Rules JSON is invalid. Fix JSON syntax before applying.'
      return
    }

    firewallRulesBusy = true
    try {
      const response = await fetch('/api/firewall/rules', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rules: parsed }),
      })
      if (!response.ok) {
        throw new Error(`Failed applying rules (${response.status})`)
      }
      firewallRulesNotice = 'Firewall rules applied successfully.'
    } catch (requestError) {
      firewallRulesNotice = 'Rules saved locally for review. Backend apply is unavailable.'
      firewallRulesError = requestError instanceof Error ? requestError.message : 'Unable to apply rules.'
    } finally {
      firewallRulesBusy = false
    }
  }

  async function dispatchDownstreamTool(row) {
    const toolId = row.toolId || row.app || ''
    const appId = row.appId || ''
    if (!toolId) return
    try {
      const res = await fetch('/api/downstream/dispatch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ toolId, appId }),
      })
      if (!res.ok) throw new Error(`Dispatch failed (${res.status})`)
      notice = `Dispatched ${toolId} successfully.`
    } catch (err) {
      error = err instanceof Error ? err.message : 'Dispatch failed.'
    }
  }

  async function onLeakageDocsSelected(event) {
    const input = event.currentTarget
    const files = Array.from(input?.files ?? [])
    if (files.length === 0) return

    leakageBusy = true
    leakageNotice = ''
    const queued = files.map((file) => ({
      id: `${file.name}-${file.size}-${Date.now()}`,
      name: file.name,
      size: file.size,
      uploadedAt: new Date().toISOString(),
    }))
    leakageDocs = [...queued, ...leakageDocs].slice(0, 20)

    try {
      const form = new FormData()
      for (const file of files) form.append('documents', file)
      form.append('policyMode', leakagePolicy)
      await fetch('/api/firewall/context-leakage/documents', { method: 'POST', body: form })
      leakageNotice = `${files.length} document(s) submitted for context leakage scanning.`
    } catch {
      leakageNotice = `${files.length} document(s) queued locally.`
    } finally {
      leakageBusy = false
      if (input) input.value = ''
    }
  }

  function addUser() {
    const name = userName.trim()
    const email = userEmail.trim()
    if (!name || !email) {
      userNotice = 'Name and email are required.'
      return
    }
    manualUserRows = [
      {
        id: `u-${Date.now()}`,
        name,
        email,
        role: userRole,
      },
      ...manualUserRows,
    ]
    userNotice = `Added ${name} as ${userRole}.`
    userName = ''
    userEmail = ''
  }

  function clampZoom(value) {
    return Math.max(0.45, Math.min(1.8, value))
  }

  function nudgeLiveZoom(delta) {
    liveZoom = clampZoom(liveZoom + delta)
  }

  function nudgeForksZoom(delta) {
    forksZoom = clampZoom(forksZoom + delta)
  }

  function onLiveWheel(event) {
    event.preventDefault()
    nudgeLiveZoom(event.deltaY > 0 ? -0.08 : 0.08)
  }

  function onForksWheel(event) {
    event.preventDefault()
    nudgeForksZoom(event.deltaY > 0 ? -0.08 : 0.08)
  }

  /** Svelte action: attaches wheel listener with { passive: false } to suppress Chrome warning */
  function nonPassiveWheel(node, handler) {
    node.addEventListener('wheel', handler, { passive: false })
    return {
      update(newHandler) { node.removeEventListener('wheel', handler, { passive: false }); handler = newHandler; node.addEventListener('wheel', handler, { passive: false }) },
      destroy() { node.removeEventListener('wheel', handler, { passive: false }) }
    }
  }

  function startPan(event, type) {
    if (event.button !== 0) return
    if (event.target instanceof Element && event.target.closest('.canvas-zoom-controls')) return
    event.preventDefault()
    panDrag = {
      type,
      x: event.clientX,
      y: event.clientY,
      startX: type === 'live' ? livePanX : forksPanX,
      startY: type === 'live' ? livePanY : forksPanY,
    }
    if (type === 'live') livePanning = true
    if (type === 'forks') forksPanning = true
    window.addEventListener('mousemove', onPanMove)
    window.addEventListener('mouseup', endPan)
  }

  function onPanMove(event) {
    if (!panDrag) return
    const dx = event.clientX - panDrag.x
    const dy = event.clientY - panDrag.y
    if (panDrag.type === 'live') {
      livePanX = panDrag.startX + dx
      livePanY = panDrag.startY + dy
    } else if (panDrag.type === 'forks') {
      forksPanX = panDrag.startX + dx
      forksPanY = panDrag.startY + dy
    }
  }

  function endPan() {
    panDrag = null
    livePanning = false
    forksPanning = false
    window.removeEventListener('mousemove', onPanMove)
    window.removeEventListener('mouseup', endPan)
  }

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('mousemove', onPanMove)
      window.removeEventListener('mouseup', endPan)
    }
  })
</script>

{#key state.category + '-' + state.view}
{#if panelOpen && state.category === 'observe' && state.view === 'live'}
  <section class="view-panel live-view panel">
    <header class="mw-view-header">
      <h1>Observability & Alerts</h1>
      <p>Monitor Frontend B orchestration runtime and intervene when risk escalates.</p>
    </header>
    <article class="panel tree-panel">
      <div class="tree-shell">
        <div class="tree-legend">
          <span><i class="legend-dot legend-main"></i> Main</span>
          <span><i class="legend-dot legend-fork"></i> Fork</span>
          <span><i class="legend-dot legend-block"></i> Blocked</span>
        </div>
        <div class="action-tree-wrap">
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions a11y_no_static_element_interactions -->
          <div
            class="action-tree-canvas"
            class:is-panning={livePanning}
            use:nonPassiveWheel={onLiveWheel}
            on:mousedown={(event) => startPan(event, 'live')}
          >
            <div class="canvas-zoom-controls" aria-label="Live canvas zoom controls">
              <button type="button" class="zoom-btn" on:click={() => nudgeLiveZoom(-0.1)}>−</button>
              <button type="button" class="zoom-btn" on:click={() => { liveZoom = 0.75; livePanX = 0; livePanY = 0; }}>Reset</button>
              <button type="button" class="zoom-btn" on:click={() => nudgeLiveZoom(0.1)}>+</button>
            </div>
            <div class="canvas-zoom-layer" style={`transform: translate(${livePanX}px, ${livePanY}px) scale(${liveZoom});`}>
              <div class="monitor-step-stack">
                {#each liveNodes as node, index}
                  <button
                    type="button"
                    class="monitor-step-node monitor-step-{node.tone}"
                    style={`animation-delay:${index * 80}ms;`}
                    on:click={() =>
                      queueInterventionHandoff({
                        sessionId: node.sessionId,
                        label: node.title,
                      })}
                  >
                    <strong>{node.title}</strong>
                    <span>{node.command}</span>
                    <em>{node.risk}</em>
                  </button>
                  {#if index < liveNodes.length - 1}
                    <div class="monitor-step-arrow">↓</div>
                  {/if}
                {/each}
              </div>
            </div>
          </div>
        </div>
      </div>
    </article>
    <p data-testid="monitoring-context-explainer" class="empty-row">Monitoring context and live runtime posture.</p>
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
    <article class="panel timeline-panel">
      <h2 class="panel-title">Incident Timeline</h2>
      <p class="panel-sub">Auto-refreshing incident feed from live trace APIs.</p>
      <div class="timeline-table-wrap">
        <table class="timeline-table" id="timelineBody">
          <thead><tr><th>Index</th><th>Actor</th><th>Type</th><th>Command / URL</th><th>Risk</th><th>Guard</th></tr></thead>
        <tbody>
          {#if auditEvents.length === 0}
            <tr><td colspan="6" class="empty-row">No trace loaded.</td></tr>
          {:else}
            {#each auditEvents as event, index}
            <tr>
              <td>{index + 1}</td>
              <td>{event.actor ?? event.source ?? event.origin ?? 'runtime'}</td>
              <td>{event.eventType ?? event.type ?? event.action ?? 'event'}</td>
              <td class="mono">{event.command ?? event.url ?? event.endpoint ?? event.executionId ?? event.traceId ?? '-'}</td>
              <td>{event.riskLabel ?? event.severity ?? 'low'}</td>
              <td>{event.guardDecision ?? event.status ?? 'observed'}</td>
            </tr>
            {/each}
          {/if}
        </tbody>
        </table>
      </div>
    </article>
  </section>
{/if}

{#if panelOpen && state.category === 'admin' && state.view === 'control'}
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
    {blockActionRule}
  />

  {#if currentOrgId}
    <section data-view-panel="org-settings" class="view-panel panel" style="margin-top: 1.5rem;">
      <article class="panel">
        <div class="panel-head">
          <h2 class="panel-title">Organization Settings</h2>
          <span class="chip">{orgMembers.length} members</span>
        </div>
        {#if isViewerAdmin}
          <div class="docs-grid users-form-grid">
            <label>
              <span class="mono">Org Name</span>
              <input class="input" bind:value={orgSettingsName} placeholder="Organization name" />
            </label>
            <label>
              <span class="mono">Bio</span>
              <input class="input" bind:value={orgSettingsBio} placeholder="Short description" />
            </label>
            <label>
              <span class="mono">Contact Email</span>
              <input class="input" bind:value={orgSettingsEmail} placeholder="admin@org.com" />
            </label>
          </div>
          <div class="actions users-form-actions">
            <button type="button" class="action-btn primary" disabled={orgSettingsBusy} on:click={saveOrgSettings}>
              {orgSettingsBusy ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        {:else}
          <p class="empty-row">Only admins and owners can edit organization settings.</p>
        {/if}
        {#if orgSettingsNotice}<p class="empty-row">{orgSettingsNotice}</p>{/if}
      </article>
    </section>
  {/if}
{/if}

{#if panelOpen && state.category === 'observe' && state.view === 'topology'}
  <TopologyView endpoints={topologyEndpoints} {queueInterventionHandoff} />
{/if}

{#if panelOpen && state.category === 'admin' && state.view === 'marketplace'}
  <section data-view-panel="marketplace" class="view-panel marketplace-view panel">
    <article class="panel marketplace-panel">
      <div class="panel-head">
        <h2 class="panel-title">Marketplace</h2>
        <span class="chip">MCP</span>
      </div>
      <p class="panel-sub">Filter installed tools</p>
      <div class="marketplace-controls">
        <div class="marketplace-field marketplace-field-grow">
          <input type="search" bind:value={marketplaceQuery} placeholder="Filter tool name/description..." />
        </div>
        <div class="marketplace-field">
          <select bind:value={marketplaceKind}>
            <option value="all">All</option>
            <option value="integration">Integrations</option>
            <option value="app">Apps</option>
            <option value="tool">Tools</option>
            <option value="agent-tool">OpenClaw</option>
          </select>
        </div>
        <button type="button" class="action-btn primary">Filter</button>
      </div>

      <div class="marketplace-section">
        <h3 class="marketplace-section-title">Installed Tools (Hackathon Catalog)</h3>
      </div>
      <div class="panel-head">
        <span class="chip">{filteredMarketplaceRows.length}</span>
      </div>
      {#if filteredMarketplaceRows.length === 0}
        <p class="empty-row">No integrated apps/tools returned.</p>
      {:else}
        <div class="table-wrap">
          <table class="timeline-table marketplace-tools-table">
            <thead>
              <tr><th>Tool</th><th>App</th><th>Description</th><th>Action</th></tr>
            </thead>
            <tbody>
              {#each filteredMarketplaceRows as row}
                <tr>
                  <td class="mono">{row.app}</td>
                  <td>{row.source.toLowerCase()}</td>
                  <td>{row.detail || row.kind || '-'}</td>
                  <td><button type="button" class="action-btn" on:click={() => dispatchDownstreamTool(row)} disabled={!!busy}>Dispatch</button></td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </article>
  </section>
{/if}

{#if panelOpen && state.category === 'firewalls' && state.view === 'cybersecurity'}
  <CyberOpsPanel
    status={cyberStatus}
    policies={cyberPolicies}
    incidents={cyberIncidents}
    downloads={cyberDownloads}
    quarantine={cyberQuarantine}
    suppressions={cyberSuppressions}
    refresh={cyberRefresh}
    {authMe}
  />

  <section data-view-panel="firewalls-cybersecurity" class="view-panel panel" style="margin-top: 1.5rem;">
    <header class="mw-view-header">
      <h1>Firewall Rules</h1>
      <p>Set cybersecurity rule packs in JSON format for runtime enforcement.</p>
    </header>
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Cybersecurity Policy JSON</h2>
        <span class="chip">editable</span>
      </div>
      <textarea
        class="textarea firewall-json-editor"
        bind:value={firewallRulesJson}
        spellcheck="false"
        aria-label="Firewall rules JSON editor"
      ></textarea>
      {#if firewallRulesError}<p class="mw-chat-error">{firewallRulesError}</p>{/if}
      {#if firewallRulesNotice}<p class="empty-row">{firewallRulesNotice}</p>{/if}
      <div class="actions">
        <button type="button" class="action-btn primary" disabled={firewallRulesBusy} on:click={applyFirewallRules}>
          {firewallRulesBusy ? 'Applying...' : 'Apply Rules'}
        </button>
      </div>
    </article>
  </section>
{/if}

{#if panelOpen && state.category === 'firewalls' && state.view === 'rules'}
  <section data-view-panel="firewalls-rules" class="view-panel panel">
    <header class="mw-view-header">
      <h1>Firewall Rules</h1>
      <p>Define reusable deny/allow rules to prevent repeat risky actions.</p>
    </header>
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Rule Library</h2>
        <span class="chip">{firewallRules.length} active</span>
        {#if firewallRulesSource === 'defaults'}
          <span class="chip" style="background: var(--warn, #e8a735); color: white;" title="Backend unreachable — showing built-in system defaults">defaults</span>
        {/if}
      </div>
      <div class="table-wrap">
        <table class="timeline-table">
          <thead>
            <tr><th>Rule ID</th><th>Condition</th><th>Decision</th><th>Status</th><th>Source</th></tr>
          </thead>
          <tbody>
            {#if firewallRules.length === 0}
              <tr><td colspan="5" class="empty-row">No rules yet.</td></tr>
            {:else}
              {#each firewallRules as rule}
                <tr>
                  <td class="mono">{rule.id}</td>
                  <td>{rule.condition}</td>
                  <td>{rule.decision}</td>
                  <td>{rule.status}</td>
                  <td>{rule.source ?? '-'}</td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
    </article>
  </section>
{/if}

{#if panelOpen && state.category === 'firewalls' && state.view === 'context-leakage'}
  <section data-view-panel="firewalls-context-leakage" class="view-panel panel">
    <header class="mw-view-header">
      <h1>Context Leakage</h1>
      <p>Drop documents to scan and enforce context-leakage protections.</p>
    </header>
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Leakage Scanning Intake</h2>
        <span class="chip">{leakageDocs.length} docs</span>
      </div>
      <div class="settings-chip-row">
        <span>Policy mode</span>
        <select class="select" bind:value={leakagePolicy} style="max-width: 220px;">
          <option value="strict">Strict</option>
          <option value="review">Review</option>
          <option value="monitor">Monitor only</option>
        </select>
      </div>
      <label class="docs-link-card leakage-upload">
        <input type="file" multiple on:change={onLeakageDocsSelected} />
        <strong>Drop or select documents</strong>
      </label>
      {#if leakageNotice}<p class="empty-row">{leakageNotice}</p>{/if}
      <div class="table-wrap">
        <table class="timeline-table">
          <thead>
            <tr><th>Document</th><th>Size</th><th>Status</th><th>Policy</th></tr>
          </thead>
          <tbody>
            {#if leakageDocs.length === 0}
              <tr><td colspan="4" class="empty-row">No documents queued.</td></tr>
            {:else}
              {#each leakageDocs as doc}
                <tr>
                  <td>{doc.name}</td>
                  <td class="mono">{doc.size}</td>
                  <td>{leakageBusy ? 'processing' : 'queued'}</td>
                  <td>{leakagePolicy}</td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
    </article>
  </section>
{/if}

{#if panelOpen && state.category === 'observe' && state.view === 'forks'}
  <section data-view-panel="observe-forks" class="view-panel panel">
    <header class="mw-view-header">
      <h1>Action Forks</h1>
      <p>Automatically isolate risky actions into containment forks with topology-first triage.</p>
    </header>
    <article class="panel tree-panel">
      <div class="tree-shell">
        <div class="tree-legend">
          <span><i class="legend-dot legend-main"></i> Main</span>
          <span><i class="legend-dot legend-fork"></i> Fork</span>
          <span><i class="legend-dot legend-block"></i> Isolated</span>
        </div>
        <div class="action-tree-wrap">
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions a11y_no_static_element_interactions -->
          <div
            class="action-tree-canvas"
            class:is-panning={forksPanning}
            use:nonPassiveWheel={onForksWheel}
            on:mousedown={(event) => startPan(event, 'forks')}
          >
            <div class="canvas-zoom-controls" aria-label="Action forks canvas zoom controls">
              <button type="button" class="zoom-btn" on:click={() => nudgeForksZoom(-0.1)}>−</button>
              <button type="button" class="zoom-btn" on:click={() => { forksZoom = 0.75; forksPanX = 0; forksPanY = 0; }}>Reset</button>
              <button type="button" class="zoom-btn" on:click={() => nudgeForksZoom(0.1)}>+</button>
            </div>
            <div class="canvas-zoom-layer" style={`transform: translate(${forksPanX}px, ${forksPanY}px) scale(${forksZoom});`}>
              <div class="fork-layout">
                <div class="monitor-step-stack fork-main-stack">
                  {#each forkMainNodes as node, index}
                    <button
                      type="button"
                      class="monitor-step-node monitor-step-{node.tone}"
                      style={`animation-delay:${index * 80}ms;`}
                      on:click={() =>
                        queueInterventionHandoff({
                          sessionId: node.sessionId,
                          label: node.title,
                        })}
                    >
                      <strong>{node.title}</strong>
                      <span>{node.command}</span>
                      <em>{node.risk}</em>
                    </button>
                    {#if index < forkMainNodes.length - 1}
                      <div class="monitor-step-arrow">↓</div>
                    {/if}
                  {/each}
                </div>

                <div class="fork-branch-stack">
                  <div class="fork-link-arrow">↪</div>
                  {#each forkBranchNodes as node, index}
                    <button
                      type="button"
                      class="monitor-step-node monitor-step-branch"
                      style={`animation-delay:${index * 120}ms;`}
                      on:click={() =>
                        queueInterventionHandoff({
                          sessionId: node.sessionId,
                          label: node.title,
                        })}
                    >
                      <strong>{node.title}</strong>
                      <span>{node.command}</span>
                      <em>{node.risk}</em>
                    </button>
                    {#if index < forkBranchNodes.length - 1}
                      <div class="monitor-step-arrow monitor-step-arrow-branch">↓</div>
                    {/if}
                  {/each}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </article>
  </section>
{/if}

{#if panelOpen && state.category === 'users' && state.view === 'members'}
  <section data-view-panel="users-members" class="view-panel panel">
    <header class="mw-view-header">
      <h1>Organization Members</h1>
      <p>Manage members and roles for the current organization.</p>
    </header>
    <article class="panel users-access-panel">
      {#if !currentOrgId}
        <p class="empty-row">Select an organization to manage members.</p>
      {:else}
        <div class="panel-head">
          <h2 class="panel-title">Members</h2>
          <span class="chip">{orgMembers.length} members</span>
        </div>
        {#if memberNotice}<p class="empty-row">{memberNotice}</p>{/if}
        <div class="table-wrap">
          <table class="timeline-table">
            <thead>
              <tr><th>Name / Email</th><th>Role</th><th>Joined</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {#if orgMembers.length === 0}
                <tr><td colspan="4" class="empty-row">No members found.</td></tr>
              {:else}
                {#each orgMembers as member}
                  {@const memberRole = getMemberRoleId(member)}
                  {@const isOwner = isOwnerMember(member)}
                  {@const isSelfRow = isSelf(member)}
                  <tr>
                    <td>
                      <strong>{member.username || member.name || '-'}</strong>
                      {#if member.email}<br/><span class="mono" style="font-size: 0.8em;">{member.email}</span>{/if}
                    </td>
                    <td>
                      {#if isOwner || isSelfRow || !isViewerOwner}
                        <span class="chip">{roleLabel(memberRole)}</span>
                      {:else}
                        <select
                          class="select"
                          value={memberRole}
                          disabled={roleChangeBusy === member.userId}
                          on:change={(e) => handleRoleChange(member, e.target.value)}
                        >
                          <option value="member">Member</option>
                          <option value="admin">Admin</option>
                          {#if isViewerOwner}<option value="owner">Owner</option>{/if}
                        </select>
                      {/if}
                    </td>
                    <td>{formatDate(member.joinedAt || member.createdAt)}</td>
                    <td>
                      {#if !isOwner && !isSelfRow && isViewerAdmin}
                        <button
                          type="button"
                          class="action-btn"
                          disabled={memberBusy}
                          on:click={() => handleRemoveMember(member)}
                        >Remove</button>
                      {:else}
                        <span class="mono" style="color: var(--muted);">—</span>
                      {/if}
                    </td>
                  </tr>
                {/each}
              {/if}
            </tbody>
          </table>
        </div>
      {/if}
    </article>
  </section>
{/if}

{#if panelOpen && state.category === 'users' && state.view === 'invites'}
  <section data-view-panel="users-invites" class="view-panel panel">
    <header class="mw-view-header">
      <h1>Organization Invites</h1>
      <p>Send and manage invitations to join the organization.</p>
    </header>
    <article class="panel users-access-panel">
      {#if !currentOrgId}
        <p class="empty-row">Select an organization to manage invites.</p>
      {:else}
        {#if isViewerAdmin}
          <div class="panel-head">
            <h2 class="panel-title">Send Invite</h2>
          </div>
          <div class="docs-grid users-form-grid">
            <label>
              <span class="mono">Email</span>
              <input class="input" bind:value={inviteEmail} placeholder="jane@company.com" />
            </label>
            <label>
              <span class="mono">Role</span>
              <select class="select" bind:value={inviteRole}>
                <option value="member">Member</option>
                <option value="admin">Admin</option>
                {#if isViewerOwner}<option value="owner">Owner</option>{/if}
              </select>
            </label>
          </div>
          <div class="actions users-form-actions">
            <button type="button" class="action-btn primary" disabled={inviteBusy} on:click={handleInvite}>
              {inviteBusy ? 'Sending...' : 'Send Invite'}
            </button>
          </div>
        {/if}
        {#if inviteNotice}<p class="empty-row">{inviteNotice}</p>{/if}
        <div class="panel-head" style="margin-top: 1rem;">
          <h2 class="panel-title">Pending & Accepted Invites</h2>
          <span class="chip">{orgInvites.length}</span>
        </div>
        <div class="table-wrap">
          <table class="timeline-table">
            <thead>
              <tr><th>Email</th><th>Role</th><th>Sent</th><th>Status</th></tr>
            </thead>
            <tbody>
              {#if orgInvites.length === 0}
                <tr><td colspan="4" class="empty-row">No invites sent yet.</td></tr>
              {:else}
                {#each orgInvites as invite}
                  <tr class:invite-accepted={invite.acceptedAt}>
                    <td class="mono">{invite.email}</td>
                    <td>{roleLabel(invite.roleId || invite.role)}</td>
                    <td>{formatDate(invite.createdAt || invite.sentAt)}</td>
                    <td>
                      {#if invite.acceptedAt}
                        <span class="chip" style="background: var(--ok); color: white;">Accepted</span>
                      {:else}
                        <span class="chip">Pending</span>
                      {/if}
                    </td>
                  </tr>
                {/each}
              {/if}
            </tbody>
          </table>
        </div>
      {/if}
    </article>
  </section>
{/if}

{#if panelOpen && state.category === 'users' && state.view === 'access'}
  <section data-view-panel="users-access" class="view-panel panel">
    <header class="mw-view-header">
      <h1>User Access</h1>
      <p>View access permissions for organization members.</p>
    </header>
    <article class="panel users-access-panel">
      {#if !currentOrgId}
        <p class="empty-row">Select an organization to view access.</p>
      {:else}
        <div class="panel-head">
          <h2 class="panel-title">Access Summary</h2>
          <span class="chip">{orgMembers.length} members</span>
        </div>
        <div class="table-wrap">
          <table class="timeline-table">
            <thead>
              <tr><th>Name</th><th>Email</th><th>Role</th><th>Access Level</th></tr>
            </thead>
            <tbody>
              {#if orgMembers.length === 0}
                <tr><td colspan="4" class="empty-row">No members in this organization.</td></tr>
              {:else}
                {#each orgMembers as member}
                  {@const memberRole = getMemberRoleId(member)}
                  <tr>
                    <td>{member.username || member.name || '-'}</td>
                    <td class="mono">{member.email || '-'}</td>
                    <td><span class="chip">{roleLabel(memberRole)}</span></td>
                    <td>
                      {#if memberRole === 'owner'}
                        Full access
                      {:else if memberRole === 'admin'}
                        Admin access (manage members, policies)
                      {:else}
                        Read-only (view monitoring, logs)
                      {/if}
                    </td>
                  </tr>
                {/each}
              {/if}
            </tbody>
          </table>
        </div>
      {/if}
    </article>
  </section>
{/if}

{#if panelOpen && state.category === 'compliance' && state.view === 'risk'}
  <section data-view-panel="compliance-risk" class="view-panel panel">
    <header class="mw-view-header">
      <h1>Risk Posture</h1>
      <p>Aggregate security posture score with trend analysis and recommendations.</p>
    </header>
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Posture Score</h2>
        <span class="chip">real-time</span>
      </div>
      <div class="risk-gauge-wrap" style="text-align:center; padding: 2rem 0;">
        <div style="font-size: 4rem; font-weight: 800; color: var(--brand);">72</div>
        <div style="font-size: 1rem; color: var(--muted);">/100 — Moderate Risk</div>
        <p style="margin-top: 1rem; font-size: 0.85rem; color: var(--muted);">
          Score aggregated from: firewall rule coverage, denial rate, MFA adoption, SSO configuration, and open approvals.
        </p>
      </div>
      <div class="panel-head"><h2 class="panel-title">Recommendations</h2></div>
      <div class="table-wrap">
        <table class="timeline-table">
          <thead><tr><th>Priority</th><th>Recommendation</th><th>Impact</th></tr></thead>
          <tbody>
            <tr><td>1</td><td>Enable MFA for all admin users</td><td>+12 points</td></tr>
            <tr><td>2</td><td>Configure SSO for primary domain</td><td>+10 points</td></tr>
            <tr><td>3</td><td>Review 3 pending HITL approvals</td><td>+5 points</td></tr>
            <tr><td>4</td><td>Add firewall rules for detected shadow agents</td><td>+8 points</td></tr>
          </tbody>
        </table>
      </div>
    </article>
  </section>
{/if}

{#if panelOpen && state.category === 'compliance' && state.view === 'frameworks'}
  <section data-view-panel="compliance-frameworks" class="view-panel panel">
    <header class="mw-view-header">
      <h1>Compliance Frameworks</h1>
      <p>Map controls from OWASP LLM Top 10 and NIST AI RMF to your security posture.</p>
    </header>
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">OWASP LLM Top 10 (2025)</h2>
        <span class="chip">10 controls</span>
      </div>
      <div class="table-wrap">
        <table class="timeline-table">
          <thead><tr><th>Control</th><th>Name</th><th>Status</th><th>Evidence</th></tr></thead>
          <tbody>
            <tr><td>LLM01</td><td>Prompt Injection</td><td><span class="chip" style="background: var(--ok); color: white;">Compliant</span></td><td>Firewall rules active</td></tr>
            <tr><td>LLM02</td><td>Insecure Output Handling</td><td><span class="chip" style="background: var(--ok); color: white;">Compliant</span></td><td>DLP engine enabled</td></tr>
            <tr><td>LLM03</td><td>Training Data Poisoning</td><td><span class="chip" style="background: var(--muted); color: white;">Not Assessed</span></td><td>—</td></tr>
            <tr><td>LLM04</td><td>Model Denial of Service</td><td><span class="chip" style="background: var(--accent); color: white;">Partial</span></td><td>Rate limiting in place</td></tr>
            <tr><td>LLM05</td><td>Supply Chain Vulnerabilities</td><td><span class="chip" style="background: var(--accent); color: white;">Partial</span></td><td>Tool registry active</td></tr>
            <tr><td>LLM06</td><td>Sensitive Information Disclosure</td><td><span class="chip" style="background: var(--ok); color: white;">Compliant</span></td><td>Context leakage scanning</td></tr>
            <tr><td>LLM07</td><td>Insecure Plugin Design</td><td><span class="chip" style="background: var(--accent); color: white;">Partial</span></td><td>MCP proxy controls</td></tr>
            <tr><td>LLM08</td><td>Excessive Agency</td><td><span class="chip" style="background: var(--ok); color: white;">Compliant</span></td><td>HITL + approval workflows</td></tr>
            <tr><td>LLM09</td><td>Overreliance</td><td><span class="chip" style="background: var(--muted); color: white;">Not Assessed</span></td><td>—</td></tr>
            <tr><td>LLM10</td><td>Model Theft</td><td><span class="chip" style="background: var(--warn); color: white;">Non-Compliant</span></td><td>No model access controls</td></tr>
          </tbody>
        </table>
      </div>
      <div class="actions" style="margin-top: 1rem;">
        <button type="button" class="action-btn primary" disabled={!can('compliance', 'update')}>Generate Report</button>
      </div>
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
{/key}
