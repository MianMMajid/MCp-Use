<script>
  import { browser } from '$app/environment'
  import { goto } from '$app/navigation'
  import { onMount } from 'svelte'
  import { page } from '$app/stores'

  import MapleTopBar from './MapleTopBar.svelte'
  import MapleCategoryPills from './MapleCategoryPills.svelte'
  import MapleViewTabs from './MapleViewTabs.svelte'
  import WorkspaceViewHost from './WorkspaceViewHost.svelte'
  import ChatView from './ChatView.svelte'

  import { MAPLE_WORKSPACE_CATEGORIES, MAPLE_ROUTE_REGISTRY } from '../maple-workspace/route-registry.js'
  import { buildWorkspaceHref, resolveWorkspaceState } from '../maple-workspace/workspace-state.js'
  import { filterFrontendBOrigin } from '../maple-workspace/origin-filter.js'
  import { interventionActionCatalog } from '../maple-workspace/intervention-api.js'
  import { loadPermissions, canAccessCategory, can, onPermissionChange, permissionsReady } from '../maple-workspace/permissions.js'

  const actions = interventionActionCatalog()
  const asArray = (value) => (Array.isArray(value) ? value : [])
  const fallbackTopologyHosts = [
    'internet',
    'wikipedia.org',
    'docs.mcp.so',
    'github.com',
    'openai.com',
    'status.mayple.ai',
  ]

  let state = resolveWorkspaceState({ pathname: '/maple', searchParams: new URLSearchParams() })
  let statusText = 'Connected to Frontend B orchestration runtime stream.'

  let summary = null
  let slo = null
  let auditEvents = []
  let approvals = []
  let executions = []
  let rawAuditEvents = []
  let rawApprovals = []
  let rawExecutions = []
  let runtimeCapabilities = []
  let integrationCatalog = []
  let connectedIntegrations = []
  let downstreamApps = []
  let downstreamTools = []
  let openclawCatalog = []
  let firewallRules = []
  let authMe = null
  let currentOrgId = ''
  let orgMembers = []
  let orgInvites = []
  let orgRoles = []
  let selectedExecutionId = ''
  let reason = ''
  let showConfirmStop = false
  let busy = ''
  let notice = ''
  let error = ''
  let traceQuery = ''
  let sessionQuery = ''
  let targetInput = ''
  let chatInput = ''
  let hasPrompted = false
  let selectedAnalysts = []
  let handoffPrompt = null
  let permReady = false
  let pollController = null
  let mutating = false

  const quickPrompts = [
    'Give me a firewall status update.',
    'Why was this trace blocked?',
    'What should we do next to reduce risk?',
    'What is the current risk score?',
  ]
  const defaultFirewallRules = [
    {
      id: 'deny-untrusted-shell',
      condition: 'command contains pipe-to-bash',
      decision: 'block + escalate',
      status: 'enabled',
      source: 'system-default',
    },
    {
      id: 'review-new-endpoint',
      condition: 'host not in allowlist',
      decision: 'pause + review',
      status: 'enabled',
      source: 'system-default',
    },
    {
      id: 'deny-secret-export',
      condition: 'context leakage pattern match',
      decision: 'block + step-up',
      status: 'enabled',
      source: 'system-default',
    },
  ]

  const tabsByCategory = {
    observe: ['topology', 'live', 'forks', 'timeline'],
    chat: ['chat'],
    admin: ['control', 'marketplace'],
    firewalls: ['cybersecurity', 'rules', 'context-leakage'],
    users: ['members', 'invites', 'access'],
    compliance: ['risk', 'frameworks'],
    docs: ['overview', 'api', 'runbooks', 'route-help'],
  }

  const tabLabels = {
    live: 'Live', chat: 'Chat', timeline: 'Timeline', control: 'Control', topology: 'Topology',
    forks: 'Forks',
    marketplace: 'Marketplace',
    cybersecurity: 'Cybersecurity', rules: 'Rules', 'context-leakage': 'Context Leakage', 'action-forks': 'Action Forks',
    members: 'Members', invites: 'Invites', access: 'Access',
    risk: 'Risk Posture', frameworks: 'Frameworks',
    overview: 'Overview', api: 'API', runbooks: 'Runbooks', 'route-help': 'Route Help',
  }

  $: state = resolveWorkspaceState({ pathname: $page.url.pathname, searchParams: $page.url.searchParams })
  $: explicitState = ['category', 'view', 'route'].some((key) => $page.url.searchParams.has(key))
  // Chat category should always render the original main chat screen, not the context panel shell.
  $: panelOpen = explicitState && state.category !== 'chat'

  function normalizeAnalystName(value) {
    return String(value ?? '').trim().toLowerCase()
  }

  function extractAnalystNames(record) {
    if (!record || typeof record !== 'object') return []
    const raw = [
      record.actor,
      record.requestedBy,
      record.approvedBy,
      record.reviewer,
      record.user,
      record.username,
      record.owner,
      record.initiatedBy,
      record.createdBy,
      record.operator,
      record.assignee,
      record.email,
      record?.metadata?.actor,
      record?.metadata?.user,
      record?.metadata?.requestedBy,
    ]
    const names = raw
      .map((value) => String(value ?? '').trim())
      .filter(Boolean)
    return Array.from(new Set(names))
  }

  function matchesSelectedAnalysts(record, selectedSet) {
    if (selectedSet.size === 0) return true
    const names = extractAnalystNames(record)
    if (names.length === 0) return false
    return names.some((name) => selectedSet.has(normalizeAnalystName(name)))
  }

  $: analystOptions = (() => {
    const fromAuth = authMe ? [authMe.username, authMe.email] : []
    const fromAudit = auditEvents.flatMap((event) => extractAnalystNames(event))
    const fromExecutions = executions.flatMap((execution) => extractAnalystNames(execution))
    const fromApprovals = approvals.flatMap((approval) => extractAnalystNames(approval))
    const options = Array.from(new Set([...fromAuth, ...fromAudit, ...fromExecutions, ...fromApprovals].filter(Boolean))).sort((a, b) =>
      a.localeCompare(b),
    )
    return options
  })()
  $: selectedAnalystSet = new Set(selectedAnalysts.map((name) => normalizeAnalystName(name)))
  $: filteredAuditEvents = auditEvents.filter((event) => matchesSelectedAnalysts(event, selectedAnalystSet))
  $: filteredExecutions = executions.filter((execution) => matchesSelectedAnalysts(execution, selectedAnalystSet))
  $: filteredApprovals = approvals.filter((approval) => matchesSelectedAnalysts(approval, selectedAnalystSet))
  $: activeExecution = filteredExecutions.find((entry) => entry.executionId === selectedExecutionId) ?? filteredExecutions[0] ?? null
  $: if (selectedExecutionId && !filteredExecutions.some((entry) => entry.executionId === selectedExecutionId)) {
    selectedExecutionId = filteredExecutions[0]?.executionId ?? ''
  }
  $: if (!targetInput && state.executionId) targetInput = state.executionId
  $: if (!targetInput && state.sessionId) targetInput = state.sessionId
  $: if (!targetInput && activeExecution?.executionId) targetInput = activeExecution.executionId

  function parseHostFromEvent(event, index) {
    const candidates = [event?.url, event?.domain, event?.host, event?.destination, event?.target]
    for (const candidate of candidates) {
      const value = String(candidate ?? '').trim()
      if (!value) continue
      try {
        if (value.startsWith('http://') || value.startsWith('https://')) {
          const host = new URL(value).hostname
          if (host) return host
        }
      } catch {}
      if (value.includes('/') || value.includes(':')) continue
      return value
    }
    return fallbackTopologyHosts[index % fallbackTopologyHosts.length]
  }

  function deriveSessionId(record, fallbackIndex) {
    const direct = String(
      record?.sessionId ??
      record?.session ??
      record?.session_id ??
      record?.metadata?.sessionId ??
      '',
    ).trim()
    if (direct) return direct
    const execution = String(record?.executionId ?? record?.execution_id ?? '').trim()
    if (execution) return `session-for-${execution}`
    return `session-auto-${fallbackIndex + 1}`
  }

  $: topologyEndpoints = (() => {
    const seen = new Set()
    const output = []
    for (let index = 0; index < filteredAuditEvents.length; index += 1) {
      const event = filteredAuditEvents[index]
      const key = parseHostFromEvent(event, index)
      if (!key || seen.has(key)) continue
      seen.add(key)
      output.push({
        host: key,
        status: String(event.status ?? event.severity ?? 'observed').toLowerCase(),
        sessionId: deriveSessionId(event, index),
      })
    }
    return output
  })()

  $: allEndpoints = Array.from(new Set(MAPLE_ROUTE_REGISTRY.flatMap((route) => route.apiEndpoints))).sort()
  $: canonicalHref = buildWorkspaceHref({
    category: state.category,
    view: state.view,
    routePath: state.routePath,
    executionId: state.executionId,
    sessionId: state.sessionId,
  })
  $: currentHref = `${$page.url.pathname}${$page.url.search}`
  $: if (browser && state.isCanonicalPath && explicitState && currentHref !== canonicalHref) {
    goto(canonicalHref, { replaceState: true, noScroll: true, keepFocus: true })
  }

  $: categoryHrefById = Object.fromEntries(
    MAPLE_WORKSPACE_CATEGORIES.map((category) => [
      category.id,
      category.id === 'docs'
        ? '/quickstart'
        : buildWorkspaceHref({
            category: category.id,
            view:
              category.id === 'observe'
                ? 'topology'
                : category.id === 'chat'
                  ? 'chat'
                  : category.id === 'admin'
                    ? 'control'
                    : category.id === 'firewalls'
                      ? 'cybersecurity'
                      : category.id === 'users'
                        ? 'members'
                        : category.id === 'compliance'
                          ? 'risk'
                          : 'overview',
            routePath: state.routePath,
            executionId: targetInput || (activeExecution?.executionId ?? ''),
            sessionId: activeExecution?.sessionId ?? '',
          }),
    ]),
  )

  $: viewHrefById = Object.fromEntries(
    (tabsByCategory[state.category] ?? []).map((view) => [
      view,
      buildWorkspaceHref({
        category: state.category,
        view,
        routePath: state.routePath,
        executionId: targetInput || (activeExecution?.executionId ?? ''),
        sessionId: activeExecution?.sessionId ?? '',
      }),
    ]),
  )

  async function loadData() {
    // Abort any in-flight poll to prevent stale data overwriting fresh
    if (pollController) pollController.abort()
    const controller = new AbortController()
    pollController = controller
    const signal = controller.signal

    const safeJson = (r) => r.ok ? r.json() : Promise.reject(new Error(`${r.url} -> ${r.status}`))
    const safeFetch = (url, opts = {}) => fetch(url, { ...opts, signal })

    try {
      const orgFetches = currentOrgId
        ? [
            safeFetch(`/api/org/${currentOrgId}/members`, { credentials: 'same-origin' }).then((r) => r.ok ? r.json() : { items: [] }),
            safeFetch(`/api/org/${currentOrgId}/invites`, { credentials: 'same-origin' }).then((r) => r.ok ? r.json() : { items: [] }),
            safeFetch(`/api/org/${currentOrgId}/roles`, { credentials: 'same-origin' }).then((r) => r.ok ? r.json() : { items: [] }),
          ]
        : [
            Promise.resolve({ items: [] }),
            Promise.resolve({ items: [] }),
            Promise.resolve({ items: [] }),
          ]

      const [
        summaryRes,
        sloRes,
        auditRes,
        execRes,
        approvalsRes,
        runtimeCapabilitiesRes,
        integrationCatalogRes,
        connectedIntegrationsRes,
        downstreamAppsRes,
        downstreamToolsRes,
        openclawCatalogRes,
        authMeRes,
        firewallRulesRes,
        orgMembersRes,
        orgInvitesRes,
        orgRolesRes,
      ] = await Promise.allSettled([
        safeFetch('/api/observability/orchestrations/summary').then(safeJson),
        safeFetch('/api/observability/orchestrations/slo').then(safeJson),
        safeFetch('/api/observability/orchestrations/audit-log?offset=0&limit=50').then(safeJson),
        safeFetch('/api/orchestrations/executions?limit=50').then(safeJson),
        safeFetch('/api/orchestrations/executions/approvals?status=pending&limit=50').then(safeJson),
        safeFetch('/api/runtime/feature-capabilities').then(safeJson),
        safeFetch('/api/integrations/catalog').then(safeJson),
        safeFetch('/api/integrations').then(safeJson),
        safeFetch('/api/downstream/apps').then(safeJson),
        safeFetch('/api/downstream/apps').then(async (r) => {
          if (!r.ok) return { items: [] };
          const apps = await r.json();
          const appList = apps?.apps ?? apps?.items ?? [];
          if (appList.length === 0) return { items: [] };
          const firstApp = appList[0];
          const appId = firstApp?.appId ?? firstApp?.id ?? '';
          if (!appId) return { items: [] };
          const tr = await safeFetch(`/api/downstream/tools?appId=${encodeURIComponent(appId)}`);
          return tr.ok ? tr.json() : { items: [] };
        }),
        safeFetch('/api/openclaw/cli/catalog').then(safeJson),
        safeFetch('/api/auth/me').then(safeJson),
        safeFetch('/api/firewall/rules/effective').then(safeJson),
        ...orgFetches,
      ])

      if (summaryRes.status === 'fulfilled') summary = summaryRes.value
      if (sloRes.status === 'fulfilled') slo = sloRes.value
      if (auditRes.status === 'fulfilled') {
        const events = auditRes.value?.items ?? auditRes.value?.entries ?? auditRes.value?.events ?? []
        rawAuditEvents = asArray(events)
        auditEvents = filterFrontendBOrigin(events)
      }
      if (execRes.status === 'fulfilled') {
        const items = execRes.value?.items ?? execRes.value?.executions ?? []
        rawExecutions = asArray(items)
        executions = filterFrontendBOrigin(items)
      }
      if (approvalsRes.status === 'fulfilled') {
        const items = approvalsRes.value?.items ?? approvalsRes.value?.approvals ?? approvalsRes.value?.entries ?? []
        rawApprovals = asArray(items)
        approvals = filterFrontendBOrigin(items)
      }
      if (runtimeCapabilitiesRes.status === 'fulfilled') {
        runtimeCapabilities = asArray(runtimeCapabilitiesRes.value?.items
          ?? runtimeCapabilitiesRes.value?.capabilities
          ?? runtimeCapabilitiesRes.value)
      }
      if (integrationCatalogRes.status === 'fulfilled') {
        integrationCatalog = asArray(integrationCatalogRes.value?.providers ?? integrationCatalogRes.value?.integrations ?? integrationCatalogRes.value?.items)
      }
      if (connectedIntegrationsRes.status === 'fulfilled') {
        connectedIntegrations = asArray(connectedIntegrationsRes.value?.items ?? connectedIntegrationsRes.value?.integrations)
      }
      if (downstreamAppsRes.status === 'fulfilled') {
        downstreamApps = asArray(downstreamAppsRes.value?.apps ?? downstreamAppsRes.value?.items)
      }
      if (downstreamToolsRes.status === 'fulfilled') {
        downstreamTools = asArray(downstreamToolsRes.value?.tools ?? downstreamToolsRes.value?.items)
      }
      if (openclawCatalogRes.status === 'fulfilled') {
        openclawCatalog = asArray(openclawCatalogRes.value?.tools ?? openclawCatalogRes.value?.catalog ?? openclawCatalogRes.value?.items)
      }
      if (authMeRes.status === 'fulfilled') {
        authMe = authMeRes.value?.user ?? null
      }
      if (firewallRulesRes.status === 'fulfilled') {
        const entries = asArray(
          firewallRulesRes.value?.rules ??
          firewallRulesRes.value?.items ??
          firewallRulesRes.value?.effective ??
          firewallRulesRes.value,
        )
        if (entries.length > 0) {
          firewallRules = entries.map((rule, index) => ({
            id: String(rule.id ?? rule.ruleId ?? `rule-${index + 1}`),
            condition: String(rule.condition ?? rule.match ?? rule.pattern ?? 'custom condition'),
            decision: String(rule.decision ?? rule.action ?? rule.effect ?? 'review'),
            status: String(rule.status ?? 'enabled'),
            source: String(rule.source ?? 'runtime'),
          }))
        }
      }

      if (orgMembersRes.status === 'fulfilled') {
        orgMembers = asArray(orgMembersRes.value?.members ?? orgMembersRes.value?.items ?? orgMembersRes.value)
      }
      if (orgInvitesRes.status === 'fulfilled') {
        orgInvites = asArray(orgInvitesRes.value?.invites ?? orgInvitesRes.value?.items ?? orgInvitesRes.value)
      }
      if (orgRolesRes.status === 'fulfilled') {
        orgRoles = asArray(orgRolesRes.value?.roles ?? orgRolesRes.value?.items ?? orgRolesRes.value)
      }

      if (!selectedExecutionId && executions.length > 0) selectedExecutionId = executions[0].executionId
      if (firewallRules.length === 0) firewallRules = defaultFirewallRules

      error = '' // Clear stale error from prior failed poll
    } catch (loadError) {
      if (loadError?.name === 'AbortError') return // poll was superseded
      error = loadError instanceof Error ? loadError.message : 'Failed loading runtime data.'
      if (firewallRules.length === 0) firewallRules = defaultFirewallRules
    }
  }

  function handleOrgChange(event) {
    const orgId = event.detail?.orgId ?? ''
    if (orgId !== currentOrgId) {
      currentOrgId = orgId
      orgMembers = []
      orgInvites = []
      orgRoles = []
      loadData()
    }
  }

  async function inviteUser(email, roleId) {
    if (!currentOrgId) return
    mutating = true
    try {
      const res = await fetch(`/api/org/${currentOrgId}/invites`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email, roleId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to send invite')
      await loadData()
      return data
    } finally {
      mutating = false
    }
  }

  async function removeMember(userId) {
    if (!currentOrgId) return
    mutating = true
    try {
      const res = await fetch(`/api/org/${currentOrgId}/members/${userId}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to remove member')
      await loadData()
      return data
    } finally {
      mutating = false
    }
  }

  async function changeRole(userId, roleId) {
    if (!currentOrgId) return
    mutating = true
    try {
      const res = await fetch(`/api/org/${currentOrgId}/roles/${roleId}/assign`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ userId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to change role')
      await loadData()
      return data
    } finally {
      mutating = false
    }
  }

  // Reactive trigger for permission changes — increments when permissions load/change
  let permissionVersion = 0

  // Filter categories by user permissions (re-runs when permissionVersion changes)
  $: visibleCategories = (permissionVersion, MAPLE_WORKSPACE_CATEGORIES.filter((cat) => canAccessCategory(cat.id)))

  onMount(() => {
    // Initialize currentOrgId from localStorage before first loadData
    if (browser) {
      try { currentOrgId = localStorage.getItem('maple-current-org') || '' } catch {}
    }
    const unsubPermissions = onPermissionChange(() => {
      permissionVersion += 1
      permReady = permissionsReady()
    })
    // Check in case permissions were already loaded from a prior mount
    if (permissionsReady()) permReady = true
    loadPermissions()
    loadData()
    // Fail-open after 10s if permissions never load (network partition)
    const permTimeout = setTimeout(() => {
      if (!permReady) permReady = true
    }, 10_000)
    // Poll every 15s but skip when tab is hidden to save API calls
    const id = window.setInterval(() => {
      if (!document.hidden && !mutating) loadData()
    }, 15000)
    return () => {
      window.clearInterval(id)
      clearTimeout(permTimeout)
      unsubPermissions()
      // Abort any in-flight fetches on unmount
      if (pollController) pollController.abort()
    }
  })

  function selectExecution(value) {
    selectedExecutionId = value
    if (value) targetInput = value
  }

  function setTargetInput(value) {
    targetInput = value
    selectedExecutionId = value
  }

  async function runAction(actionName, targetOverride = '') {
    const action = actions[actionName]
    if (!action) return

    const typed = String(targetOverride || targetInput || '').trim()
    const isSessionTarget = typed.toLowerCase().startsWith('sess') || typed.toLowerCase().includes('session')
    const executionId = isSessionTarget ? '' : (typed || selectedExecutionId || activeExecution?.executionId || '')
    const selected = filteredExecutions.find((entry) => entry.executionId === executionId)
    const sessionId = isSessionTarget ? typed : selected?.sessionId ?? activeExecution?.sessionId ?? ''

    if (!executionId && (actionName === 'pauseExecution' || actionName === 'resumeExecution' || actionName === 'cancelExecution')) {
      error = 'Select a trace first.'
      return
    }

    if (action.requiresReason && !reason.trim()) {
      error = 'Reason is required for this action.'
      return
    }

    busy = actionName
    error = ''
    notice = ''

    try {
      await action.execute({ executionId, sessionId, reason: reason.trim() })
      notice = `${action.label} completed.`
      await loadData()
    } catch (requestError) {
      error = requestError instanceof Error ? requestError.message : 'Action failed.'
    } finally {
      busy = ''
      showConfirmStop = false
    }
  }

  function toggleAnalyst(name) {
    const normalized = normalizeAnalystName(name)
    if (!normalized) return
    const exists = selectedAnalysts.some((item) => normalizeAnalystName(item) === normalized)
    selectedAnalysts = exists
      ? selectedAnalysts.filter((item) => normalizeAnalystName(item) !== normalized)
      : [...selectedAnalysts, name]
  }

  function clearAnalysts() {
    selectedAnalysts = []
  }

  function queueInterventionHandoff(payload) {
    const sessionId = String(payload?.sessionId ?? '').trim()
    if (!sessionId) return
    handoffPrompt = {
      sessionId,
      label: String(payload?.label ?? 'selected endpoint'),
    }
  }

  async function acceptInterventionHandoff() {
    if (!handoffPrompt) return
    const sessionId = handoffPrompt.sessionId
    handoffPrompt = null
    targetInput = sessionId
    showConfirmStop = false
    await goto(
      buildWorkspaceHref({
        category: 'admin',
        view: 'control',
        routePath: '/maple/audit',
        executionId: '',
        sessionId,
      }),
      { noScroll: true, keepFocus: true },
    )
  }

  function dismissInterventionHandoff() {
    handoffPrompt = null
  }

  async function blockActionRule(targetValue) {
    const target = String(targetValue || targetInput || '').trim()
    if (!target) {
      error = 'Select a session target first.'
      return
    }
    if (!reason.trim()) {
      error = 'Reason is required to create a blocking rule.'
      return
    }
    const localRule = {
      id: `block-${target.replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 36) || Date.now()}`,
      condition: `target equals ${target}`,
      decision: 'block + escalate',
      status: 'enabled',
      source: 'intervention',
    }
    firewallRules = [localRule, ...firewallRules]
    busy = 'blockActionRule'
    error = ''
    notice = ''
    try {
      const response = await fetch('/api/firewall/rules', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'block',
          target,
          reason: reason.trim(),
          createdBy: authMe?.email ?? authMe?.username ?? 'operator',
        }),
      })
      if (!response.ok) throw new Error(`Rule request failed (${response.status})`)
      notice = `Blocking rule created for ${target}.`
    } catch (requestError) {
      firewallRules = firewallRules.filter((r) => r.id !== localRule.id)
      error = requestError instanceof Error ? requestError.message : 'Failed creating blocking rule.'
    } finally {
      busy = ''
    }
  }

  function applyPrompt(prompt) {
    chatInput = prompt
    hasPrompted = true
  }

</script>

{#if !permReady}
  <section class="workspace product-body" data-testid="maple-workspace-loading">
    <div class="product-shell shell" style="display:flex;align-items:center;justify-content:center;min-height:60vh;">
      <p style="opacity:0.6;">Loading workspace&hellip;</p>
    </div>
  </section>
{:else}
<section class="workspace product-body" data-testid="maple-workspace-layout">
  <div class="product-shell shell" data-testid="maple-workspace-shell">
    <MapleTopBar
      connected={panelOpen}
      {analystOptions}
      {selectedAnalysts}
      {authMe}
      activeCategory={state.category}
      activeView={state.view}
      on:toggleAnalyst={(event) => toggleAnalyst(event.detail.name)}
      on:clearAnalysts={clearAnalysts}
      on:refresh={loadData}
      on:orgChange={handleOrgChange}
    />

    <div class="main-area">
      <div class="chat-home" class:panel-active={panelOpen}>
        {#if state.category === 'chat'}
          <div class="chat-full-panel">
            <ChatView
              {authMe}
              executionId={targetInput || selectedExecutionId}
              sessionId={activeExecution?.sessionId ?? ''}
              routeTitle={state.routeRecord?.title ?? ''}
            />
          </div>
        {/if}

        <div class="context-panel" class:is-open={panelOpen} aria-hidden={!panelOpen}>
          <div class="context-panel-body">
            <WorkspaceViewHost
              {panelOpen}
              {state}
              routeRecord={state.routeRecord}
              {summary}
              {slo}
              auditEvents={filteredAuditEvents}
              approvals={filteredApprovals}
              {topologyEndpoints}
              executions={filteredExecutions}
              {runtimeCapabilities}
              {integrationCatalog}
              {connectedIntegrations}
              {downstreamApps}
              {downstreamTools}
              {openclawCatalog}
              {firewallRules}
              {authMe}
              {orgMembers}
              {orgInvites}
              {orgRoles}
              {currentOrgId}
              {inviteUser}
              {removeMember}
              {changeRole}
              {selectedExecutionId}
              {targetInput}
              {traceQuery}
              {sessionQuery}
              {reason}
              {busy}
              {notice}
              {error}
              {showConfirmStop}
              {allEndpoints}
              queueInterventionHandoff={queueInterventionHandoff}
              setTraceQuery={(value) => (traceQuery = value)}
              setSessionQuery={(value) => (sessionQuery = value)}
              selectExecution={selectExecution}
              setTargetInput={setTargetInput}
              setReason={(value) => (reason = value)}
              pauseExecution={(target) => runAction('pauseExecution', target)}
              resumeExecution={(target) => runAction('resumeExecution', target)}
              blockActionRule={blockActionRule}
              openStopConfirm={() => (showConfirmStop = true)}
              cancelStopConfirm={() => (showConfirmStop = false)}
              confirmStop={(target) => runAction('cancelExecution', target)}
            />
          </div>
        </div>

        <div class="bottom-nav-stack">
          {#if panelOpen && (tabsByCategory[state.category] ?? []).length > 1}
            <MapleViewTabs
              views={tabsByCategory[state.category] ?? []}
              activeView={state.view}
              labels={tabLabels}
              hrefByView={viewHrefById}
            />
          {/if}
          <MapleCategoryPills
            categories={visibleCategories}
            activeCategory={state.category}
            hrefByCategory={categoryHrefById}
          />
        </div>

      </div>
    </div>
  </div>
  {#if handoffPrompt}
    <div class="handoff-toast panel" role="dialog" aria-live="polite">
      <h4>Send to Audit &amp; Compliance?</h4>
      <p>
        Send session <strong>{handoffPrompt.sessionId}</strong> from {handoffPrompt.label} to Intervention Command Bar?
      </p>
      <div class="actions">
        <button type="button" class="action-btn primary" on:click={acceptInterventionHandoff}>Yes, send</button>
        <button type="button" class="action-btn" on:click={dismissInterventionHandoff}>No</button>
      </div>
    </div>
  {/if}
</section>
{/if}
