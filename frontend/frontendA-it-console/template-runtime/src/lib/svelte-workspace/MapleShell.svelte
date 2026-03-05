<script>
  import { browser } from '$app/environment'
  import { goto } from '$app/navigation'
  import { onMount } from 'svelte'
  import { page } from '$app/stores'

  import MapleTopBar from './MapleTopBar.svelte'
  import MapleCategoryPills from './MapleCategoryPills.svelte'
  import MapleViewTabs from './MapleViewTabs.svelte'
  import WorkspaceViewHost from './WorkspaceViewHost.svelte'

  import { MAPLE_WORKSPACE_CATEGORIES, MAPLE_ROUTE_REGISTRY } from '../maple-workspace/route-registry.js'
  import { buildWorkspaceHref, resolveWorkspaceState } from '../maple-workspace/workspace-state.js'
  import { filterFrontendBOrigin } from '../maple-workspace/origin-filter.js'
  import { interventionActionCatalog } from '../maple-workspace/intervention-api.js'

  const actions = interventionActionCatalog()
  const asArray = (value) => (Array.isArray(value) ? value : [])

  let state = resolveWorkspaceState({ pathname: '/maple', searchParams: new URLSearchParams() })
  let statusText = 'Connected to Frontend B orchestration runtime stream.'

  let summary = null
  let slo = null
  let auditEvents = []
  let approvals = []
  let executions = []
  let runtimeCapabilities = []
  let integrationCatalog = []
  let connectedIntegrations = []
  let downstreamApps = []
  let downstreamTools = []
  let openclawCatalog = []
  let authMe = null
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

  const quickPrompts = [
    'Give me a firewall status update.',
    'Why was this trace blocked?',
    'What should we do next to reduce risk?',
    'What is the current risk score?',
  ]

  const tabsByCategory = {
    observe: ['live', 'timeline'],
    chat: ['chat'],
    analyze: ['control', 'topology'],
    admin: ['settings', 'policy', 'marketplace'],
    docs: ['overview', 'api', 'runbooks', 'route-help'],
  }

  const tabLabels = {
    live: 'Live', chat: 'Chat', timeline: 'Timeline', control: 'Control', topology: 'Topology',
    settings: 'Settings', policy: 'Policy', marketplace: 'Marketplace',
    overview: 'Overview', api: 'API', runbooks: 'Runbooks', 'route-help': 'Route Help',
  }

  $: state = resolveWorkspaceState({ pathname: $page.url.pathname, searchParams: $page.url.searchParams })
  $: explicitState = ['category', 'view', 'route'].some((key) => $page.url.searchParams.has(key))
  // Chat category should always render the original main chat screen, not the context panel shell.
  $: panelOpen = explicitState && state.category !== 'chat'

  $: activeExecution = executions.find((entry) => entry.executionId === selectedExecutionId) ?? executions[0] ?? null
  $: if (!targetInput && state.executionId) targetInput = state.executionId
  $: if (!targetInput && state.sessionId) targetInput = state.sessionId
  $: if (!targetInput && activeExecution?.executionId) targetInput = activeExecution.executionId

  $: topologyEndpoints = (() => {
    const seen = new Set()
    const output = []
    for (const event of auditEvents) {
      const host = String(event.url ?? event.domain ?? event.host ?? event.destination ?? event.target ?? '').trim()
      const fallback = String(event.traceId ?? event.executionId ?? '').trim()
      const key = host || (fallback ? `trace:${fallback}` : '')
      if (!key || seen.has(key)) continue
      seen.add(key)
      output.push({ host: key, status: String(event.status ?? event.severity ?? 'observed').toLowerCase() })
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
      buildWorkspaceHref({
        category: category.id,
        view:
          category.id === 'docs'
            ? 'overview'
            : category.id === 'observe'
              ? 'live'
              : category.id === 'chat'
                ? 'chat'
                : category.id === 'analyze'
                  ? 'control'
                  : 'settings',
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
    try {
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
      ] = await Promise.allSettled([
        fetch('/api/observability/orchestrations/summary').then((r) => r.json()),
        fetch('/api/observability/orchestrations/slo').then((r) => r.json()),
        fetch('/api/observability/orchestrations/audit-log?offset=0&limit=50').then((r) => r.json()),
        fetch('/api/orchestrations/executions?limit=50').then((r) => r.json()),
        fetch('/api/orchestrations/executions/approvals?status=pending&limit=50').then((r) => r.json()),
        fetch('/api/runtime/feature-capabilities').then((r) => r.json()),
        fetch('/api/integrations/catalog').then((r) => r.json()),
        fetch('/api/integrations').then((r) => r.json()),
        fetch('/api/downstream/apps').then((r) => r.json()),
        fetch('/api/downstream/tools').then((r) => r.json()),
        fetch('/api/openclaw/cli/catalog').then((r) => r.json()),
        fetch('/api/auth/me').then((r) => r.json()),
      ])

      if (summaryRes.status === 'fulfilled') summary = summaryRes.value
      if (sloRes.status === 'fulfilled') slo = sloRes.value
      if (auditRes.status === 'fulfilled') {
        const events = auditRes.value?.items ?? auditRes.value?.entries ?? auditRes.value?.events ?? []
        auditEvents = filterFrontendBOrigin(events)
      }
      if (execRes.status === 'fulfilled') {
        const items = execRes.value?.items ?? execRes.value?.executions ?? []
        executions = filterFrontendBOrigin(items)
      }
      if (approvalsRes.status === 'fulfilled') {
        const items = approvalsRes.value?.items ?? approvalsRes.value?.approvals ?? approvalsRes.value?.entries ?? []
        approvals = filterFrontendBOrigin(items)
      }
      if (runtimeCapabilitiesRes.status === 'fulfilled') {
        runtimeCapabilities = asArray(runtimeCapabilitiesRes.value?.items
          ?? runtimeCapabilitiesRes.value?.capabilities
          ?? runtimeCapabilitiesRes.value)
      }
      if (integrationCatalogRes.status === 'fulfilled') {
        integrationCatalog = asArray(integrationCatalogRes.value?.integrations ?? integrationCatalogRes.value?.items)
      }
      if (connectedIntegrationsRes.status === 'fulfilled') {
        connectedIntegrations = asArray(connectedIntegrationsRes.value?.integrations ?? connectedIntegrationsRes.value?.items)
      }
      if (downstreamAppsRes.status === 'fulfilled') {
        downstreamApps = asArray(downstreamAppsRes.value?.apps ?? downstreamAppsRes.value?.items)
      }
      if (downstreamToolsRes.status === 'fulfilled') {
        downstreamTools = asArray(downstreamToolsRes.value?.tools ?? downstreamToolsRes.value?.items)
      }
      if (openclawCatalogRes.status === 'fulfilled') {
        openclawCatalog = asArray(openclawCatalogRes.value?.catalog ?? openclawCatalogRes.value?.items)
      }
      if (authMeRes.status === 'fulfilled') {
        authMe = authMeRes.value?.user ?? null
      }

      if (!selectedExecutionId && executions.length > 0) selectedExecutionId = executions[0].executionId
    } catch (loadError) {
      error = loadError instanceof Error ? loadError.message : 'Failed loading runtime data.'
    }
  }

  onMount(() => {
    loadData()
    const id = window.setInterval(loadData, 15000)
    return () => window.clearInterval(id)
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
    const selected = executions.find((entry) => entry.executionId === executionId)
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

  function applyPrompt(prompt) {
    chatInput = prompt
    hasPrompted = true
  }
</script>

<section class="workspace product-body" data-testid="maple-workspace-layout">
  <div class="product-shell shell" data-testid="maple-workspace-shell">
    <MapleTopBar connected={panelOpen} />

    <div class="main-area">
      <div class="chat-home" class:panel-active={panelOpen}>
        <div class="welcome-state" class:is-hidden={state.category !== 'chat' || hasPrompted}>
          <h2 class="welcome-heading">What can I help with?</h2>
          <p class="welcome-sub">{statusText}</p>
          <div class="welcome-pills">
            {#each quickPrompts as prompt}
              <button type="button" class="welcome-pill" on:click={() => applyPrompt(prompt)}>{prompt}</button>
            {/each}
          </div>
        </div>

        <div class="context-panel" class:is-open={panelOpen} aria-hidden={!panelOpen}>
          <div class="context-panel-body">
            <WorkspaceViewHost
              {panelOpen}
              {state}
              routeRecord={state.routeRecord}
              {summary}
              {slo}
              {auditEvents}
              {approvals}
              {topologyEndpoints}
              {executions}
              {runtimeCapabilities}
              {integrationCatalog}
              {connectedIntegrations}
              {downstreamApps}
              {downstreamTools}
              {openclawCatalog}
              {authMe}
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
              setTraceQuery={(value) => (traceQuery = value)}
              setSessionQuery={(value) => (sessionQuery = value)}
              selectExecution={selectExecution}
              setTargetInput={setTargetInput}
              setReason={(value) => (reason = value)}
              pauseExecution={(target) => runAction('pauseExecution', target)}
              resumeExecution={(target) => runAction('resumeExecution', target)}
              openStopConfirm={() => (showConfirmStop = true)}
              cancelStopConfirm={() => (showConfirmStop = false)}
              confirmStop={(target) => runAction('cancelExecution', target)}
            />
          </div>
          <div class="context-panel-foot">
            <MapleViewTabs
              views={tabsByCategory[state.category] ?? []}
              activeView={state.view}
              labels={tabLabels}
              hrefByView={viewHrefById}
            />
          </div>
        </div>

        <MapleCategoryPills
          categories={MAPLE_WORKSPACE_CATEGORIES}
          activeCategory={state.category}
          hrefByCategory={categoryHrefById}
        />

        {#if state.category === 'chat'}
          <div class="chat-composer chat-composer-home">
            <div class="chat-input-wrap">
              <input bind:value={chatInput} placeholder="Ask Mayple to summarize runtime context..." aria-label="Mayple chat input" />
              <button type="button" class="chat-send-btn" aria-label="Send">↑</button>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
</section>
