<script>
  import { onMount, tick } from 'svelte'

  import { humanizeError } from '../utils/error-display.js'
  import { loadJson, loadMany, pickItems, sendJson } from '../api/maple-api.js'
  import { scanColor, scanLabel, incidentColor, degradedSecurityMessage, mutationLaneColor, mutationLaneLabel, mutationStatusLabel } from '../maple-workspace/cyber-view-model.js'
  import { getSourceFilterIds, filterRecordsBySource, getAuditRecordSource } from '../maple-workspace/origin-filter.js'
  import { getMapleRoute } from '../maple-workspace/route-registry.js'
  import ChatView from './ChatView.svelte'
  import CyberOpsPanel from './CyberOpsPanel.svelte'
  import MapleTopologySection from './MapleTopologySection.svelte'
  import WorkspaceViewHost from './WorkspaceViewHost.svelte'

  export let routePath
  export let embedded = false

  const SOURCE_FILTERS = getSourceFilterIds()
  const POLL_INTERVALS = Object.freeze({
    '/maple/chat': 30000,
    '/maple/observability': 30000,
    '/maple/runs': 30000,
    '/maple/audit': 30000,
    '/maple/gateway': 30000,
    '/maple/interventions': 20000,
    '/maple/cyber': 20000,
    '/maple/hitl': 15000,
    '/maple/modifier-approvals': 20000,
    '/maple/agent': 20000,
    '/maple/downstream': 30000,
    '/maple/policies': 20000,
    '/maple/topology': 30000,
    '/maple/forks': 20000,
    '/maple/settings': 30000,
    '/maple/escalation': 30000,
    '/maple/auth-admin': 30000,
    '/maple/api-keys': 30000,
    '/maple/org': 30000,
    '/maple/integrations': 30000,
    '/maple/tenants': 30000,
    '/maple/runtime': 30000,
  })

  const ROUTE_REQUESTS = Object.freeze({
    '/maple/chat': [
      ['agentSessions', '/api/openclaw/agent/sessions'],
      ['leakageEntities', '/api/firewall/context-leakage/entities?activeOnly=true'],
    ],
    '/maple/observability': [
      ['summary', '/api/observability/orchestrations/summary'],
      ['slo', '/api/observability/orchestrations/slo'],
      ['auditLog', '/api/observability/orchestrations/audit-log?offset=0&limit=25'],
      ['alertWebhooks', '/api/observability/orchestrations/alert-webhooks'],
      ['runtimeCapabilities', '/api/runtime/feature-capabilities'],
      ['agentSessions', '/api/openclaw/agent/sessions'],
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
    '/maple/topology': [
      ['runtimeCapabilities', '/api/runtime/feature-capabilities'],
      ['runtimeStatus', '/api/runtime/status'],
      ['agentSessions', '/api/openclaw/agent/sessions'],
    ],
    '/maple/runs': [
      ['runs', '/api/runs'],
      ['agentSessions', '/api/openclaw/agent/sessions'],
    ],
    '/maple/forks': [
      ['auditLog', '/api/observability/orchestrations/audit-log?offset=0&limit=100'],
      ['filesystemStatus', '/api/firewall/filesystem/status'],
      ['filesystemMutations', '/api/firewall/filesystem/mutations?limit=100'],
    ],
    '/maple/downstream': [
      ['downstreamApps', '/api/downstream/apps'],
    ],
    '/maple/auth-admin': [
      ['authMe', '/api/auth/me'],
      ['userProfile', '/api/user/profile'],
      ['mfaStatus', '/api/auth/mfa/status'],
      ['ssoConfig', '/api/auth/sso/config'],
      ['googleClient', '/api/auth/google/client-id'],
    ],
    '/maple/api-keys': [
      ['authMe', '/api/auth/me'],
      ['organizations', '/api/org'],
      ['userApiKeys', '/api/user/api-keys'],
    ],
    '/maple/org': [
      ['organizations', '/api/org'],
    ],
    '/maple/integrations': [
      ['integrationCatalog', '/api/integrations/catalog'],
      ['integrations', '/api/integrations'],
    ],
    '/maple/policies': [
      ['leakageDocuments', '/api/firewall/context-leakage/documents'],
      ['leakageEntities', '/api/firewall/context-leakage/entities?activeOnly=false'],
      ['leakageEvents', '/api/firewall/context-leakage/events?limit=100'],
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
    '/maple/settings': [
      ['notifPrefs', '/api/notifications/preferences'],
      ['notifications', '/api/notifications?limit=10'],
      ['unreadCount', '/api/notifications/unread-count'],
      ['alertWebhooks', '/api/observability/orchestrations/alert-webhooks'],
      ['retention', '/api/observability/orchestrations/retention'],
      ['auditVerify', '/api/observability/orchestrations/audit-chain/verify'],
      ['authMe', '/api/auth/me'],
      ['mfaStatus', '/api/auth/mfa/status'],
    ],
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
  let downstreamRouteLock = false
  let downstreamDispatch = {
    appId: '',
    toolName: '',
    payload: '{"query":"OpenAI GPT-5.4","maxResults":3}',
  }
  let leakagePolicyMode = 'strict'
  let leakageInlineText = ''
  let leakageInlineName = 'context-policy.txt'
  let leakageFileInput
  let agentMode = 'turn'
  let agentPrompt = ''
  let agentReply = null
  let selectedOrgId = ''
  let selectedServiceAccountId = ''
  let selectedMemberId = ''
  let observabilitySelectedSessionId = ''
  let observabilitySelectedRunId = ''
  let observabilitySessionDetail = null
  let observabilityArtifacts = []
  let observabilityArtifactsByRun = {}
  let observabilityArtifactsRunId = ''
  let observabilityStreamState = 'idle'
  let observabilityLatestCursor = '0'
  let observabilityEventSource = null
  let topologyObservedTargets = []
  let currentPassword = ''
  let newPassword = ''
  let newWebhookUrl = ''
  let newWebhookSecret = ''
  let deleteConfirmId = null
  let newApiKeyName = ''
  let newApiKeyExpiry = ''
  let newServiceAccountName = ''
  let inviteEmail = ''
  let inviteRole = 'member'
  let integrationActionResult = null

  $: routeRecord = getMapleRoute(routePath)
  $: routeCategoryLabel = humanizeSlug(routeRecord?.navGroup ?? routeRecord?.category ?? 'workspace')
  $: pollIntervalMs = POLL_INTERVALS[routePath] ?? 0
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
  $: runInventory = pickItems(state.runs?.value, ['runs', 'items'])
  $: downstreamApps = pickItems(state.downstreamApps?.value, ['apps', 'items'])
  $: organizations = pickItems(state.organizations?.value)
  $: userApiKeys = pickItems(state.userApiKeys?.value)
  $: serviceAccounts = pickItems(state.serviceAccounts?.value)
  $: serviceAccountKeys = pickItems(state.serviceAccountKeys?.value)
  $: orgMembers = pickItems(state.orgMembers?.value)
  $: orgInvites = pickItems(state.orgInvites?.value)
  $: orgRoles = pickItems(state.orgRoles?.value)
  $: integrationsList = pickItems(state.integrations?.value)
  $: integrationProviders = pickItems(state.integrationCatalog?.value, ['providers', 'items'])
  $: leakageDocuments = pickItems(state.leakageDocuments?.value)
  $: leakageEntities = pickItems(state.leakageEntities?.value)
  $: leakageEvents = pickItems(state.leakageEvents?.value)
  $: observabilitySessions = pickItems(state.agentSessions?.value, ['sessions', 'items'])
  $: selectedOrg = organizations.find((item) => (item.orgId ?? item.id) === selectedOrgId) ?? null
  $: selectedServiceAccount = serviceAccounts.find((item) => (item.id ?? item.serviceAccountId) === selectedServiceAccountId) ?? null
  $: selectedMember = orgMembers.find((item) => (item.userId ?? item.id) === selectedMemberId) ?? null
  $: selectedPlan = interventionPlans.find((item) => item.planId === selectedPlanId) ?? selectedPlan
  $: selectedForkPlan = interventionPlans.find((item) => item.planId === selectedPlanId) ?? interventionPlans[0] ?? null
  $: settingsNotifPrefs = state.notifPrefs?.value?.preferences ?? state.notifPrefs?.value ?? {}
  $: if (!selectedPlanId && interventionPlans.length > 0) {
    selectedPlanId = interventionPlans[0].planId
  }
  $: if (!selectedSessionId && agentSessions.length > 0) {
    selectedSessionId = agentSessions[0].sessionId ?? agentSessions[0].id ?? ''
  }
  $: if (!selectedOrgId && organizations.length > 0) {
    selectedOrgId = organizations[0].orgId ?? organizations[0].id ?? ''
  }
  $: if (!selectedServiceAccountId && serviceAccounts.length > 0) {
    selectedServiceAccountId = serviceAccounts[0].id ?? serviceAccounts[0].serviceAccountId ?? ''
  }
  $: if (!selectedMemberId && orgMembers.length > 0) {
    selectedMemberId = orgMembers[0].userId ?? orgMembers[0].id ?? ''
  }
  $: if (routePath === '/maple/observability' && !observabilitySelectedSessionId && observabilitySessions.length > 0) {
    observabilitySelectedSessionId = observabilitySessions[0].sessionId ?? observabilitySessions[0].id ?? ''
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

  function safeHostname(value) {
    if (!value) return ''
    try {
      return new URL(String(value).replace(/",$/, '')).hostname
    } catch {
      return ''
    }
  }

  function normalizeExternalUrl(value) {
    if (!value) return ''
    const raw = String(value).trim().replace(/",$/, '')
    try {
      return new URL(raw).toString()
    } catch {
      return ''
    }
  }

  function isExternalHost(hostname) {
    if (!hostname) return false
    return !['localhost', '127.0.0.1'].includes(hostname)
  }

  function collectArtifactUrls(artifact) {
    const urls = []
    const content = artifact?.content ?? {}
    const pushUrl = (value, meta = {}) => {
      const url = normalizeExternalUrl(value)
      const hostname = safeHostname(url)
      if (!url || !isExternalHost(hostname)) return
      urls.push({ url, hostname, ...meta })
    }

    pushUrl(artifact?.url, { source: artifact?.artifactType ?? 'artifact' })
    pushUrl(content?.url, { source: artifact?.artifactType ?? 'artifact' })
    pushUrl(content?.policy?.step?.externalUrl, { source: artifact?.artifactType ?? 'policy-step' })
    pushUrl(content?.result?.structuredContent?.data?.url, { source: artifact?.artifactType ?? 'structured-result' })

    const results = content?.result?.structuredContent?.data?.results
    if (Array.isArray(results)) {
      results.forEach((item) => {
        pushUrl(item?.url, {
          source: artifact?.artifactType ?? 'search-result',
          title: item?.title ?? '',
          snippet: item?.snippet ?? '',
        })
      })
    }

    return urls
  }

  function deriveTopologyTargets(sessions, artifactsByRun, runtimeStatusPayload) {
    const targetMap = new Map()
    const recentSessions = sessions.slice(0, 14)

    recentSessions.forEach((session, sessionIndex) => {
      const sessionId = session?.sessionId ?? session?.id ?? `session-${sessionIndex + 1}`
      const runId = session?.lastRunId ?? ''
      const artifacts = Array.isArray(artifactsByRun[runId]) ? artifactsByRun[runId] : []
      artifacts.forEach((artifact) => {
        collectArtifactUrls(artifact).forEach((urlRecord) => {
          const existing = targetMap.get(urlRecord.hostname)
          const scan = artifact?.content?.result?.scan ?? artifact?.content?.scan ?? artifact?.scan ?? {}
          const next = {
            id: `target-${urlRecord.hostname.replace(/[^a-z0-9]+/gi, '-')}`,
            host: urlRecord.hostname,
            label: urlRecord.hostname,
            url: urlRecord.url,
            path: (() => {
              try { return new URL(urlRecord.url).pathname || '/' } catch { return '/' }
            })(),
            sessionId,
            runId,
            source: urlRecord.source,
            title: urlRecord.title || '',
            snippet: urlRecord.snippet || '',
            blocked: scan?.blocked === true || scan?.quarantined === true || contentLooksBlocked(artifact),
            verdict: scan?.verdict || '',
            count: (existing?.count ?? 0) + 1,
            lastSeenAt: session?.updatedAt ?? session?.createdAt ?? '',
            artifactType: artifact?.artifactType ?? '',
          }
          targetMap.set(urlRecord.hostname, { ...existing, ...next })
        })
      })
    })

    if (!targetMap.size) {
      const apps = Array.isArray(runtimeStatusPayload?.status?.activeDownstreamApps)
        ? runtimeStatusPayload.status.activeDownstreamApps
        : []
      apps.forEach((app) => {
        const mcpUrl = normalizeExternalUrl(app?.mcpUrl)
        const hostname = safeHostname(mcpUrl)
        targetMap.set(
          app?.id ?? app?.name ?? hostname,
          {
            id: `target-${(app?.id ?? hostname ?? 'downstream').replace(/[^a-z0-9]+/gi, '-')}`,
            host: hostname || app?.name || 'downstream',
            label: app?.name ?? hostname ?? 'Downstream app',
            url: mcpUrl,
            path: mcpUrl ? new URL(mcpUrl).pathname || '/' : '/',
            sessionId: '',
            runId: '',
            source: 'downstream-app',
            title: app?.name ?? '',
            snippet: '',
            blocked: false,
            verdict: '',
            count: 1,
            lastSeenAt: '',
            artifactType: '',
          },
        )
      })
    }

    return Array.from(targetMap.values())
      .sort((a, b) => {
        if ((b.count ?? 0) !== (a.count ?? 0)) return (b.count ?? 0) - (a.count ?? 0)
        return String(b.lastSeenAt ?? '').localeCompare(String(a.lastSeenAt ?? ''))
      })
      .slice(0, 12)
  }

  function contentLooksBlocked(artifact) {
    const content = artifact?.content ?? {}
    return content?.ok === false || /blocked|quarantined/i.test(JSON.stringify(content?.result ?? content))
  }

  async function refresh() {
    loading = true
    error = ''
    notice = ''
    try {
      const requests = ROUTE_REQUESTS[routePath] ?? []
      const nextState = await loadMany(fetch, requests)

      if (routePath === '/maple/downstream') {
        downstreamRouteLock = Boolean(nextState.downstreamApps?.value?.routeLock)
        const apps = pickItems(nextState.downstreamApps?.value, ['apps', 'items'])
        const firstApp = apps[0]
        const appId = firstApp?.appId ?? firstApp?.id ?? ''
        if (appId) {
          try {
            nextState.downstreamTools = {
              ok: true,
              value: await loadJson(fetch, `/api/downstream/tools?appId=${encodeURIComponent(appId)}`),
            }
          } catch {
            nextState.downstreamTools = { ok: false, error: 'Failed to load tools for first app' }
          }
          if (!downstreamDispatch.appId) {
            downstreamDispatch = { ...downstreamDispatch, appId }
          }
        }
      }

      if (routePath === '/maple/topology') {
        const topologySessions = pickItems(nextState.agentSessions?.value, ['sessions', 'items'])
        const recentRuns = topologySessions
          .map((item) => item?.lastRunId)
          .filter(Boolean)
          .slice(0, 14)

        const artifactsByRun = Object.fromEntries(
          await Promise.all(
            recentRuns.map(async (runId) => {
              try {
                const artifactPayload = await loadJson(fetch, `/api/openclaw/agent/runs/${encodeURIComponent(runId)}/artifacts`)
                const runPayload = artifactPayload?.run ?? artifactPayload ?? {}
                return [runPayload?.runId ?? runId, Array.isArray(runPayload?.artifacts) ? runPayload.artifacts : []]
              } catch {
                return [runId, []]
              }
            }),
          ),
        )
        topologyObservedTargets = deriveTopologyTargets(topologySessions, artifactsByRun, nextState.runtimeStatus?.value ?? {})
      }

      if (routePath === '/maple/api-keys' || routePath === '/maple/org') {
        const orgs = pickItems(nextState.organizations?.value)
        const activeOrgId = selectedOrgId || orgs[0]?.orgId || orgs[0]?.id || ''
        if (activeOrgId) {
          if (routePath === '/maple/api-keys') {
            nextState.serviceAccounts = {
              ok: true,
              value: await loadJson(fetch, `/api/org/${encodeURIComponent(activeOrgId)}/service-accounts`),
            }
            const accounts = pickItems(nextState.serviceAccounts?.value)
            const activeAccountId = selectedServiceAccountId || accounts[0]?.id || accounts[0]?.serviceAccountId || ''
            if (activeAccountId) {
              nextState.serviceAccountKeys = {
                ok: true,
                value: await loadJson(fetch, `/api/org/${encodeURIComponent(activeOrgId)}/service-accounts/${encodeURIComponent(activeAccountId)}/keys`),
              }
            }
          }

          if (routePath === '/maple/org') {
            nextState.orgMembers = {
              ok: true,
              value: await loadJson(fetch, `/api/org/${encodeURIComponent(activeOrgId)}/members`),
            }
            nextState.orgInvites = {
              ok: true,
              value: await loadJson(fetch, `/api/org/${encodeURIComponent(activeOrgId)}/invites`),
            }
            nextState.orgRoles = {
              ok: true,
              value: await loadJson(fetch, `/api/org/${encodeURIComponent(activeOrgId)}/roles`),
            }
          }
        }
      }

      state = nextState
      await tick()

      if (routePath === '/maple/interventions' && selectedPlanId) {
        await loadInterventionDetail(selectedPlanId)
      }

      if (routePath === '/maple/agent' && selectedSessionId) {
        await loadAgentSession(selectedSessionId)
      }

      if (routePath === '/maple/observability' && observabilitySelectedSessionId) {
        await loadObservabilitySession(observabilitySelectedSessionId, {
          preserveRun: true,
          preserveStream: Boolean(observabilityEventSource),
        })
      }
    } catch (requestError) {
      error = requestError instanceof Error ? requestError.message : String(requestError)
    } finally {
      loading = false
    }
  }

  function closeObservabilityStream() {
    if (observabilityEventSource) {
      observabilityEventSource.close()
      observabilityEventSource = null
    }
  }

  function deriveObservabilityRuns(detail) {
    if (Array.isArray(detail?.session?.runs)) return detail.session.runs
    if (Array.isArray(detail?.runs)) return detail.runs
    return []
  }

  function deriveObservabilityEvents(detail) {
    if (Array.isArray(detail?.session?.events)) return detail.session.events
    if (Array.isArray(detail?.events)) return detail.events
    return []
  }

  async function loadObservabilityArtifacts(runId) {
    if (!runId) return
    busy = `observability-artifacts:${runId}`
    error = ''
    try {
      const payload = await loadJson(fetch, `/api/openclaw/agent/runs/${encodeURIComponent(runId)}/artifacts`)
      const runPayload = payload?.run ?? payload ?? {}
      observabilityArtifactsByRun = {
        ...observabilityArtifactsByRun,
        [runPayload?.runId ?? runId]: Array.isArray(runPayload?.artifacts) ? runPayload.artifacts : [],
      }
      observabilityArtifactsRunId = runPayload?.runId ?? runId
      observabilityArtifacts = Array.isArray(runPayload?.artifacts) ? runPayload.artifacts : []
      observabilitySelectedRunId = observabilityArtifactsRunId
    } catch (requestError) {
      error = requestError instanceof Error ? requestError.message : String(requestError)
      observabilityArtifacts = []
      observabilityArtifactsRunId = runId
      observabilitySelectedRunId = runId
    } finally {
      busy = ''
    }
  }

  function openObservabilityStream(sessionId) {
    closeObservabilityStream()
    if (!sessionId || typeof EventSource === 'undefined') {
      observabilityStreamState = 'unsupported'
      return
    }
    const cursor = encodeURIComponent(observabilityLatestCursor || '0')
    const url = `/api/openclaw/agent/sessions/${encodeURIComponent(sessionId)}/stream?cursor=${cursor}&timeoutMs=25000`
    const source = new EventSource(url)
    observabilityEventSource = source
    observabilityStreamState = 'connecting'

    const refreshDetail = async (event) => {
      try {
        const payload = event?.data ? JSON.parse(event.data) : {}
        if (payload?.cursor) observabilityLatestCursor = String(payload.cursor)
      } catch {
        // best effort
      }
      observabilityStreamState = 'live'
      await loadObservabilitySession(sessionId, { preserveRun: true, preserveStream: true })
    }

    source.addEventListener('ready', (event) => {
      try {
        const payload = event?.data ? JSON.parse(event.data) : {}
        if (payload?.cursor) observabilityLatestCursor = String(payload.cursor)
      } catch {
        // best effort
      }
      observabilityStreamState = 'live'
    })
    source.addEventListener('run_started', refreshDetail)
    source.addEventListener('run_completed', refreshDetail)
    source.addEventListener('run_failed', refreshDetail)
    source.addEventListener('run_canceled', refreshDetail)
    source.addEventListener('cancel_requested', refreshDetail)
    source.addEventListener('gap', refreshDetail)
    source.addEventListener('done', (event) => {
      try {
        const payload = event?.data ? JSON.parse(event.data) : {}
        if (payload?.cursor) observabilityLatestCursor = String(payload.cursor)
      } catch {
        // best effort
      }
      observabilityStreamState = 'idle'
      closeObservabilityStream()
    })
    source.onerror = () => {
      observabilityStreamState = 'polling'
      closeObservabilityStream()
    }
  }

  async function loadObservabilitySession(sessionId, options = {}) {
    if (!sessionId) return
    const preserveRun = options.preserveRun === true
    const preserveStream = options.preserveStream === true
    try {
      const payload = await loadJson(fetch, `/api/openclaw/agent/sessions/${encodeURIComponent(sessionId)}?include=steps,runs`)
      const detail = payload?.session ?? payload ?? null
      observabilitySessionDetail = detail
      observabilitySelectedSessionId = sessionId
      observabilityArtifactsByRun = {}
      const runs = deriveObservabilityRuns(detail)
      const latestCursor = detail?.latestEventCursor
        ?? deriveObservabilityEvents(detail).at(-1)?.cursor
        ?? '0'
      observabilityLatestCursor = String(latestCursor)

      const preferredRunId = preserveRun ? (observabilitySelectedRunId || observabilityArtifactsRunId) : ''
      const activeRun =
        runs.find((run) => (run.runId ?? run.id) === preferredRunId)
        ?? runs[0]
        ?? null

      if (runs.length > 0) {
        const artifactPayloads = await Promise.all(
          runs.map(async (run) => {
            const runId = run.runId ?? run.id ?? ''
            if (!runId) return null
            try {
              const artifactPayload = await loadJson(fetch, `/api/openclaw/agent/runs/${encodeURIComponent(runId)}/artifacts`)
              const runPayload = artifactPayload?.run ?? artifactPayload ?? {}
              return {
                runId: runPayload?.runId ?? runId,
                artifacts: Array.isArray(runPayload?.artifacts) ? runPayload.artifacts : [],
              }
            } catch {
              return { runId, artifacts: [] }
            }
          }),
        )
        observabilityArtifactsByRun = Object.fromEntries(
          artifactPayloads
            .filter(Boolean)
            .map((item) => [item.runId, item.artifacts]),
        )
      }

      if (activeRun) {
        const activeRunId = activeRun.runId ?? activeRun.id ?? ''
        observabilitySelectedRunId = activeRunId
        observabilityArtifactsRunId = activeRunId
        observabilityArtifacts = observabilityArtifactsByRun[activeRunId] ?? []
      } else {
        observabilitySelectedRunId = ''
        observabilityArtifactsRunId = ''
        observabilityArtifacts = []
      }

      if (!preserveStream) {
        openObservabilityStream(sessionId)
      }
    } catch (requestError) {
      error = requestError instanceof Error ? requestError.message : String(requestError)
      observabilitySessionDetail = null
      observabilityArtifacts = []
      observabilityArtifactsRunId = ''
      observabilitySelectedRunId = ''
      observabilityStreamState = 'error'
      closeObservabilityStream()
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

  function selectObservabilitySession(sessionId) {
    observabilitySelectedSessionId = sessionId
    observabilitySelectedRunId = ''
    observabilityArtifacts = []
    observabilityArtifactsRunId = ''
    void loadObservabilitySession(sessionId, { preserveRun: false, preserveStream: false })
  }

  function selectObservabilityRun(runId) {
    observabilitySelectedRunId = runId
    observabilityArtifactsRunId = runId
    observabilityArtifacts = observabilityArtifactsByRun[runId] ?? []
    if (!(runId in observabilityArtifactsByRun)) {
      void loadObservabilityArtifacts(runId)
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
        ...(downstreamRouteLock ? {} : { appId: downstreamDispatch.appId }),
        toolName: downstreamDispatch.toolName,
        arguments: argumentsPayload,
      }),
    )
  }

  async function handleChangePassword() {
    if (!currentPassword || !newPassword) {
      error = 'Current password and a new password are required.'
      return
    }
    await runAction('auth:change-password', async () => {
      await sendJson(fetch, '/api/auth/change-password', { currentPassword, newPassword })
      currentPassword = ''
      newPassword = ''
      notice = 'Password changed successfully.'
    })
  }

  async function handleSaveNotifPrefs(category, channel) {
    const prefs = state.notifPrefs?.value?.preferences ?? state.notifPrefs?.value ?? {}
    const key = `${category}.${channel}`
    const current = prefs[key] ?? prefs?.[category]?.[channel] ?? false
    const updated = { ...prefs, [key]: !current }
    await runAction('settings:notif-prefs', async () => {
      await sendJson(fetch, '/api/notifications/preferences', { preferences: updated })
      notice = 'Notification preferences updated.'
    })
  }

  async function handleAddWebhook() {
    if (!newWebhookUrl.trim()) {
      error = 'Webhook URL is required.'
      return
    }
    await runAction('settings:add-webhook', async () => {
      await sendJson(fetch, '/api/observability/orchestrations/alert-webhooks', {
        url: newWebhookUrl.trim(),
        secret: newWebhookSecret.trim() || undefined,
      })
      newWebhookUrl = ''
      newWebhookSecret = ''
      notice = 'Webhook added.'
    })
  }

  async function handleDeleteWebhook(id) {
    if (deleteConfirmId !== id) {
      deleteConfirmId = id
      return
    }
    deleteConfirmId = null
    await runAction(`settings:delete-webhook:${id}`, async () => {
      await sendJson(fetch, `/api/observability/orchestrations/alert-webhooks/${encodeURIComponent(id)}`, {}, { method: 'DELETE' })
      notice = 'Webhook deleted.'
    })
  }

  async function handleExport(type) {
    const endpoint = type === 'traces' ? '/api/traces/export' : '/api/observability/orchestrations/export'
    await runAction(`settings:export:${type}`, async () => {
      await sendJson(fetch, endpoint, { format: 'json' })
      notice = `${type === 'traces' ? 'Trace' : 'Orchestration'} export started.`
    })
  }

  async function handleCreateApiKey() {
    if (!newApiKeyName.trim()) {
      error = 'API key name is required.'
      return
    }
    await runAction('apikey:create', async () => {
      await sendJson(fetch, '/api/user/api-keys', {
        name: newApiKeyName.trim(),
        ...(newApiKeyExpiry ? { expiresAt: newApiKeyExpiry } : {}),
      })
      newApiKeyName = ''
      newApiKeyExpiry = ''
      notice = 'API key created.'
    })
  }

  async function handleDeleteApiKey(keyId) {
    await runAction(`apikey:${keyId}:delete`, async () => {
      await sendJson(fetch, `/api/user/api-keys/${encodeURIComponent(keyId)}`, {}, { method: 'DELETE' })
      notice = 'API key deleted.'
    })
  }

  async function handleCreateServiceAccount() {
    if (!selectedOrgId || !newServiceAccountName.trim()) {
      error = 'Select an organization and provide a service account name.'
      return
    }
    await runAction('service-account:create', async () => {
      await sendJson(fetch, `/api/org/${encodeURIComponent(selectedOrgId)}/service-accounts`, {
        name: newServiceAccountName.trim(),
      })
      newServiceAccountName = ''
      notice = 'Service account created.'
    })
  }

  async function handleCreateServiceAccountKey(accountId) {
    if (!selectedOrgId || !accountId) return
    await runAction(`service-account:${accountId}:key-create`, async () => {
      await sendJson(fetch, `/api/org/${encodeURIComponent(selectedOrgId)}/service-accounts/${encodeURIComponent(accountId)}/keys`, {})
      notice = 'Service account key created.'
    })
  }

  async function handleDeleteServiceAccountKey(accountId, keyId) {
    if (!selectedOrgId || !accountId || !keyId) return
    await runAction(`service-account:${accountId}:key:${keyId}:delete`, async () => {
      await sendJson(
        fetch,
        `/api/org/${encodeURIComponent(selectedOrgId)}/service-accounts/${encodeURIComponent(accountId)}/keys/${encodeURIComponent(keyId)}`,
        {},
        { method: 'DELETE' },
      )
      notice = 'Service account key revoked.'
    })
  }

  async function handleCreateOrg() {
    const name = window.prompt('Organization name')
    if (!name) return
    await runAction('org:create', async () => {
      await sendJson(fetch, '/api/org', { name })
      notice = 'Organization created.'
    })
  }

  async function handleSaveOrgSettings() {
    if (!selectedOrgId || !selectedOrg) return
    const name = window.prompt('Organization name', selectedOrg.name ?? '') ?? ''
    const email = window.prompt('Organization email', selectedOrg.email ?? '') ?? ''
    const bio = window.prompt('Organization bio', selectedOrg.bio ?? '') ?? ''
    await runAction(`org:${selectedOrgId}:update`, async () => {
      await sendJson(fetch, `/api/org/${encodeURIComponent(selectedOrgId)}`, { name, email, bio }, { method: 'PATCH' })
      notice = 'Organization settings updated.'
    })
  }

  async function handleInviteOrgMember() {
    if (!selectedOrgId || !inviteEmail.trim()) {
      error = 'Select an organization and provide an invite email.'
      return
    }
    await runAction(`org:${selectedOrgId}:invite`, async () => {
      await sendJson(fetch, `/api/org/${encodeURIComponent(selectedOrgId)}/invites`, {
        email: inviteEmail.trim(),
        role: inviteRole,
      })
      inviteEmail = ''
      inviteRole = 'member'
      notice = 'Invitation sent.'
    })
  }

  async function handleChangeOrgRole(member, roleId) {
    if (!selectedOrgId || !member || !roleId) return
    await runAction(`org:${selectedOrgId}:role:${member.userId}:${roleId}`, async () => {
      await sendJson(fetch, `/api/org/${encodeURIComponent(selectedOrgId)}/roles/${encodeURIComponent(roleId)}/assign`, {
        userId: member.userId,
      })
      notice = 'Role updated.'
    })
  }

  async function handleRemoveOrgMember(member) {
    if (!selectedOrgId || !member?.userId) return
    await runAction(`org:${selectedOrgId}:member:${member.userId}:remove`, async () => {
      await sendJson(fetch, `/api/org/${encodeURIComponent(selectedOrgId)}/members/${encodeURIComponent(member.userId)}`, {}, { method: 'DELETE' })
      notice = 'Member removed.'
    })
  }

  async function handleIntegrationAction(item, action) {
    const provider = item?.provider ?? item?.id
    if (!provider) return

    if (action === 'oauth') {
      const returnTo = window.location.pathname
      window.location.assign(`/api/integrations/${encodeURIComponent(provider)}/oauth/start?redirect=1&returnTo=${encodeURIComponent(returnTo)}`)
      return
    }

    await runAction(`integration:${provider}:${action}`, async () => {
      let payload = {}
      let path = `/api/integrations/${encodeURIComponent(provider)}/${action}`
      if (action === 'refresh') {
        path = `/api/integrations/${encodeURIComponent(provider)}/oauth/refresh`
      } else if (action === 'revoke') {
        path = `/api/integrations/${encodeURIComponent(provider)}/oauth/revoke`
      }
      integrationActionResult = await sendJson(fetch, path, payload)
      notice = `Integration ${action} completed for ${provider}.`
    })
  }

  async function handleLeakageUpload() {
    busy = 'leakage:upload'
    error = ''
    notice = ''
    try {
      const formData = new FormData()
      formData.append('policyMode', leakagePolicyMode)
      if (leakageInlineText.trim()) {
        formData.append('name', leakageInlineName || 'context-policy.txt')
        formData.append('text', leakageInlineText)
      }
      const files = leakageFileInput?.files ? Array.from(leakageFileInput.files) : []
      for (const file of files) {
        formData.append('documents', file)
      }
      const response = await fetch('/api/firewall/context-leakage/documents', {
        method: 'POST',
        credentials: 'same-origin',
        body: formData,
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error || `/api/firewall/context-leakage/documents -> ${response.status}`)
      }
      leakageInlineText = ''
      if (leakageFileInput) {
        leakageFileInput.value = ''
      }
      notice = `Stored ${payload?.documents?.length ?? 0} context leakage document(s).`
      await refresh()
    } catch (requestError) {
      error = requestError instanceof Error ? requestError.message : String(requestError)
    } finally {
      busy = ''
    }
  }

  async function deleteLeakageDocument(documentId) {
    await runAction(`leakage:document:${documentId}:delete`, async () => {
      const response = await fetch(`/api/firewall/context-leakage/documents/${encodeURIComponent(documentId)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error || `DELETE context leakage document -> ${response.status}`)
      }
      notice = 'Context leakage document deleted.'
    })
  }

  async function updateLeakageEntity(entityId, body) {
    await runAction(`leakage:entity:${entityId}`, async () => {
      await sendJson(fetch, `/api/firewall/context-leakage/entities/${encodeURIComponent(entityId)}/mode`, body)
      notice = 'Context leakage entity updated.'
    })
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

  function humanizeSlug(value) {
    return String(value ?? '--')
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase())
  }

  onMount(() => {
    refresh()
    const onShellRefresh = () => {
      refresh()
    }
    window.addEventListener('maple:shell-refresh', onShellRefresh)
    const intervalMs = POLL_INTERVALS[routePath]
    // Chat route manages its own data via streaming — skip background polling
    // to avoid saturating the SvelteKit dev server's single thread.
    if (!intervalMs || routePath === '/maple/chat') {
      return () => {
        window.removeEventListener('maple:shell-refresh', onShellRefresh)
      }
    }
    const intervalId = window.setInterval(refresh, intervalMs)
    return () => {
      window.removeEventListener('maple:shell-refresh', onShellRefresh)
      window.clearInterval(intervalId)
      closeObservabilityStream()
    }
  })
</script>

<section class="fa-route-page" class:fa-route-page-embedded={embedded}>
  {#if !embedded}
  <header class="mw-view-header fa-page-header">
    <div class="fa-page-title">
      <span class="fa-page-kicker">{routeCategoryLabel}</span>
      <h1>{routeRecord?.title ?? 'Maple'}</h1>
      <p>{routeRecord?.purpose ?? routeRecord?.description ?? 'Operate Maple control-plane workflows from the canonical Svelte runtime.'}</p>
    </div>
    <div class="fa-page-stats">
      <article class="route-overview-card">
        <span class="route-overview-label">Operator task</span>
        <strong>{humanizeSlug(routeRecord?.operatorTask ?? 'workspace')}</strong>
      </article>
      <article class="route-overview-card">
        <span class="route-overview-label">Topology context</span>
        <strong>{humanizeSlug(routeRecord?.topologyContext ?? routeRecord?.preferredView ?? 'control')}</strong>
      </article>
      <article class="route-overview-card">
        <span class="route-overview-label">Refresh cadence</span>
        <strong>{pollIntervalMs ? `${Math.round(pollIntervalMs / 1000)}s` : 'manual'}</strong>
      </article>
    </div>
  </header>

  <MapleTopologySection
    {routeRecord}
    {routePath}
    {state}
    {selectedSessionId}
    {selectedPlan}
  />
  {/if}

{#if error}
  <p class="mw-chat-error">{humanizeError(error)}</p>
{/if}
{#if notice}
  <p class="empty-row">{notice}</p>
{/if}

{#if !embedded}
<section class="fa-secondary-actions-bar">
  <div class="fa-secondary-actions">
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
</section>
{/if}

{#if routePath === '/maple/chat'}
  <section class="docs-grid">
    <article class="panel fa-chat-panel">
      <ChatView routeTitle={routeRecord?.title ?? 'Operator Chat'} />
    </article>
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Evidence Handoff</h2>
        <span class="chip">{agentSessions.length} active session(s)</span>
      </div>
      <div class="stack-list">
        <a class="list-card" href="/maple/agent">
          <strong>Agent Management</strong>
          <span>Inspect sessions, runs, and governed artifacts.</span>
        </a>
        <a class="list-card" href="/maple/policies">
          <strong>Policy Center</strong>
          <span>Review protected entities and rewrite or block events.</span>
        </a>
        <a class="list-card" href="/maple/gateway">
          <strong>Firewall Dashboard</strong>
          <span>Confirm protection state before or after a governed turn.</span>
        </a>
      </div>
    </article>
  </section>
{:else if routePath === '/maple/observability'}
  <WorkspaceViewHost
    panelOpen={true}
    state={{ category: 'observe', view: 'live', routePath, routeRecord }}
    {routeRecord}
    summary={state.summary?.value ?? {}}
    slo={state.slo?.value ?? {}}
    auditEvents={observabilityAudit}
    runtimeCapabilities={pickItems(state.runtimeCapabilities?.value)}
    openclawSessions={observabilitySessions}
    openclawSessionDetail={observabilitySessionDetail}
    openclawSelectedSessionId={observabilitySelectedSessionId}
    openclawSelectedRunId={observabilitySelectedRunId}
    openclawArtifacts={observabilityArtifacts}
    openclawArtifactsByRun={observabilityArtifactsByRun}
    openclawArtifactsRunId={observabilityArtifactsRunId}
    openclawStreamState={observabilityStreamState}
    selectOpenclawSession={selectObservabilitySession}
    selectOpenclawRun={selectObservabilityRun}
  />
{:else if routePath === '/maple/topology'}
  <WorkspaceViewHost
    panelOpen={true}
    state={{ category: 'observe', view: 'topology', routePath, routeRecord }}
    {routeRecord}
    topologyEndpoints={pickItems(state.runtimeCapabilities?.value, ['endpoints', 'items'])}
    topologyObservedTargets={topologyObservedTargets}
    runtimeCapabilities={pickItems(state.runtimeCapabilities?.value)}
  />
{:else if routePath === '/maple/forks'}
  <WorkspaceViewHost
    panelOpen={true}
    state={{ category: 'observe', view: 'forks', routePath, routeRecord }}
    {routeRecord}
    auditEvents={filterRecordsBySource(pickItems(state.auditLog?.value), sourceFilter)}
    filesystemMutations={selectedForkPlan ? [selectedForkPlan] : []}
  />
  <section class="docs-grid utility-grid">
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Containment Forks</h2>
        <span class="chip">{interventionPlans.length} plans</span>
      </div>
      <div class="utility-stat-strip">
        <article class="route-overview-card">
          <span class="route-overview-label">Mode</span>
          <strong>{(state.filesystemStatus?.value ?? {}).guard?.mode ?? '--'}</strong>
        </article>
        <article class="route-overview-card">
          <span class="route-overview-label">Pending</span>
          <strong>{(state.filesystemStatus?.value ?? {}).counts?.pending ?? interventionPlans.filter((p) => String(p.status).includes('pending')).length}</strong>
        </article>
        <article class="route-overview-card">
          <span class="route-overview-label">Denied</span>
          <strong>{(state.filesystemStatus?.value ?? {}).counts?.denied ?? interventionPlans.filter((p) => p.lane === 'hard_deny').length}</strong>
        </article>
        <article class="route-overview-card">
          <span class="route-overview-label">Total</span>
          <strong>{(state.filesystemStatus?.value ?? {}).counts?.total ?? interventionPlans.length}</strong>
        </article>
      </div>
      <div class="stack-list">
        {#if interventionPlans.length === 0}
          <p class="empty-row">No containment forks yet. Forks are created when the firewall isolates risky filesystem mutations.</p>
        {:else}
          {#each interventionPlans as plan}
            <button type="button" class="list-card" class:static={plan.planId === selectedForkPlan?.planId} on:click={() => { selectedPlanId = plan.planId }}>
              <strong>{plan.plan?.toolName || plan.sourceType || 'filesystem'} · {plan.lane}</strong>
              <span>{plan.taskText || plan.planId}</span>
              <span class="mono">{plan.status} · {plan.sourceSurface} · {formatDate(plan.createdAt)}</span>
            </button>
          {/each}
        {/if}
      </div>
    </article>
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Fork Detail</h2>
        <span class="chip">{selectedForkPlan?.lane ?? 'none'}</span>
      </div>
      {#if selectedForkPlan}
        <div class="utility-stat-strip">
          <article class="route-overview-card">
            <span class="route-overview-label">Lane</span>
            <strong>{selectedForkPlan.lane}</strong>
          </article>
          <article class="route-overview-card">
            <span class="route-overview-label">Status</span>
            <strong>{selectedForkPlan.status}</strong>
          </article>
          <article class="route-overview-card">
            <span class="route-overview-label">Intent</span>
            <strong>{selectedForkPlan.modelAssessment?.intentClass ?? '--'}</strong>
          </article>
          <article class="route-overview-card">
            <span class="route-overview-label">Blast radius</span>
            <strong>{selectedForkPlan.modelAssessment?.blastRadiusAssessment ?? '--'}</strong>
          </article>
        </div>
        <div class="stack-list">
          {#each selectedForkPlan.plan?.operations ?? [] as op, i}
            <div class="list-card static">
              <strong>#{i + 1} {op.op}</strong>
              <span class="mono">{op.path}{op.to ? ` → ${op.to}` : ''}</span>
              <span>{op.sizeBytes ? `${op.sizeBytes} bytes` : ''}{op.recursive ? ' · recursive' : ''}</span>
            </div>
          {/each}
        </div>
        {#if selectedForkPlan.plan?.pathClassifications?.length}
          <div class="stack-list">
            {#each (selectedForkPlan.plan?.pathClassifications ?? []) as pc}
              <div class="list-card static">
                <strong>{pc.classification}</strong>
                <span class="mono">{pc.path}</span>
                <span>{pc.reasons?.join(', ') ?? '--'}</span>
              </div>
            {/each}
          </div>
        {/if}
        {#if selectedForkPlan.modelAssessment?.available}
          <pre class="mono panel-json">{JSON.stringify({
            provider: selectedForkPlan.modelAssessment.provider,
            model: selectedForkPlan.modelAssessment.model,
            intentClass: selectedForkPlan.modelAssessment.intentClass,
            taskAlignment: selectedForkPlan.modelAssessment.taskAlignment,
            userAuthoredRisk: selectedForkPlan.modelAssessment.userAuthoredRisk,
            rebuildability: selectedForkPlan.modelAssessment.rebuildability,
            blastRadiusAssessment: selectedForkPlan.modelAssessment.blastRadiusAssessment,
            suspiciousSignals: selectedForkPlan.modelAssessment.suspiciousSignals,
            recommendedLane: selectedForkPlan.modelAssessment.recommendedLane,
          }, null, 2)}</pre>
        {/if}
        <div class="actions">
          {#if String(selectedForkPlan.status).includes('pending')}
            <button type="button" class="action-btn primary" disabled={Boolean(busy)} on:click={() => runAction(`fork:${selectedForkPlan.planId}:approve`, () => sendJson(fetch, `/api/firewall/filesystem/mutations/${encodeURIComponent(selectedForkPlan.planId)}/decision`, { decision: 'approve' }))}>
              Approve
            </button>
            <button type="button" class="action-btn danger" disabled={Boolean(busy)} on:click={() => runAction(`fork:${selectedForkPlan.planId}:deny`, () => sendJson(fetch, `/api/firewall/filesystem/mutations/${encodeURIComponent(selectedForkPlan.planId)}/decision`, { decision: 'deny' }))}>
              Deny
            </button>
          {/if}
          {#if selectedForkPlan.status === 'approved'}
            <button type="button" class="action-btn primary" disabled={Boolean(busy)} on:click={() => runAction(`fork:${selectedForkPlan.planId}:promote`, () => sendJson(fetch, `/api/firewall/filesystem/mutations/${encodeURIComponent(selectedForkPlan.planId)}/promote`, {}))}>
              Promote
            </button>
            <button type="button" class="action-btn" disabled={Boolean(busy)} on:click={() => runAction(`fork:${selectedForkPlan.planId}:restore`, () => sendJson(fetch, `/api/firewall/filesystem/mutations/${encodeURIComponent(selectedForkPlan.planId)}/restore`, {}))}>
              Restore
            </button>
          {/if}
        </div>
      {:else}
        <p class="empty-row">Select a fork plan from the list to view details.</p>
      {/if}
    </article>
  </section>
{:else if routePath === '/maple/runs'}
  <section class="docs-grid">
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Run Inventory</h2>
        <span class="chip">{runInventory.length}</span>
      </div>
      <div class="table-wrap">
        <table class="timeline-table">
          <thead>
            <tr><th>Run</th><th>Session</th><th>Status</th><th>Updated</th></tr>
          </thead>
          <tbody>
            {#if runInventory.length === 0}
              <tr><td colspan="4" class="empty-row">No runs recorded yet. Runs appear here once governed agent work begins.</td></tr>
            {:else}
              {#each runInventory as item}
                <tr>
                  <td class="mono">{item.runId ?? item.id ?? '--'}</td>
                  <td class="mono">{item.sessionId ?? item.executionId ?? '--'}</td>
                  <td>{item.status ?? item.state ?? '--'}</td>
                  <td>{formatDate(item.updatedAt ?? item.completedAt ?? item.createdAt)}</td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
    </article>
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Session Correlation</h2>
        <span class="chip">{agentSessions.length} active session(s)</span>
      </div>
      <pre class="mono panel-json">{JSON.stringify({
        runs: state.runs?.value ?? {},
        sessions: state.agentSessions?.value ?? {},
      }, null, 2)}</pre>
    </article>
  </section>
{:else if routePath === '/maple/audit'}
  <section class="docs-grid utility-grid">
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Audit + Trace Stream</h2>
        <span class="chip">{auditLog.length}</span>
      </div>
      <div class="utility-stat-strip">
        <article class="route-overview-card">
          <span class="route-overview-label">Integrity</span>
          <strong>{state.auditVerify?.value?.verified ? 'Verified' : 'Check required'}</strong>
        </article>
        <article class="route-overview-card">
          <span class="route-overview-label">Retention</span>
          <strong>{state.retention?.value?.enabled === false ? 'Paused' : 'Active'}</strong>
        </article>
        <article class="route-overview-card">
          <span class="route-overview-label">Dead letters</span>
          <strong>{pickItems(state.deadLetter?.value).length}</strong>
        </article>
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
        <h2 class="panel-title">Forensic Detail</h2>
        <span class="chip">chain + replay</span>
      </div>
      <pre class="mono panel-json">{JSON.stringify({
        auditChain: state.auditChain?.value ?? {},
        auditVerify: state.auditVerify?.value ?? {},
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
  <CyberOpsPanel
    status={state.cyberStatus?.value ?? null}
    policies={state.cyberPolicies?.value ?? null}
    incidents={cyberIncidents}
    downloads={cyberDownloads}
    quarantine={cyberQuarantine}
    suppressions={cyberSuppressions}
    refresh={refresh}
  />
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
  <section class="docs-grid utility-grid">
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">App Inventory</h2>
        <span class="chip">{downstreamApps.length}</span>
      </div>
      <div class="utility-stat-strip">
        <article class="route-overview-card">
          <span class="route-overview-label">Apps</span>
          <strong>{downstreamApps.length}</strong>
        </article>
        <article class="route-overview-card">
          <span class="route-overview-label">Selected app</span>
          <strong>{downstreamDispatch.appId || '--'}</strong>
        </article>
      </div>
      <div class="stack-list">
        {#if downstreamApps.length === 0}
          <p class="empty-row">No downstream applications are registered.</p>
        {:else}
          {#each downstreamApps as item}
            <button type="button" class="list-card" on:click={async () => {
              downstreamDispatch = { ...downstreamDispatch, appId: item.appId ?? item.id ?? '' }
              state = {
                ...state,
                downstreamTools: {
                  ok: true,
                  value: await loadJson(fetch, `/api/downstream/tools?appId=${encodeURIComponent(item.appId ?? item.id ?? '')}`),
                },
              }
            }}>
              <strong>{item.label ?? item.name ?? item.appId ?? item.id}</strong>
              <span>appId={item.appId ?? item.id ?? '--'}</span>
            </button>
          {/each}
        {/if}
      </div>
    </article>
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Tool Dispatch</h2>
        <span class="chip">{pickItems(state.downstreamTools?.value, ['tools', 'items']).length} tool(s)</span>
      </div>
      <pre class="mono panel-json">{JSON.stringify(state.downstreamTools?.value ?? {}, null, 2)}</pre>
      <div class="docs-grid compact-grid">
        {#if !downstreamRouteLock}
        <label>
          <span class="mono">App ID</span>
          <input class="input" bind:value={downstreamDispatch.appId} />
        </label>
        {:else}
        <p class="mono chip">Route-lock active — server resolves target app.</p>
        {/if}
        <label>
          <span class="mono">Tool</span>
          <input class="input" bind:value={downstreamDispatch.toolName} placeholder="web_search" />
        </label>
      </div>
      <textarea class="textarea firewall-json-editor" bind:value={downstreamDispatch.payload} spellcheck="false"></textarea>
      <div class="actions">
        <button type="button" class="action-btn primary" disabled={Boolean(busy) || (!downstreamRouteLock && !downstreamDispatch.appId) || !downstreamDispatch.toolName} on:click={handleDownstreamDispatch}>
          Dispatch
        </button>
      </div>
    </article>
  </section>
{:else if routePath === '/maple/auth-admin'}
  <section class="docs-grid utility-grid">
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Auth Health</h2>
        <span class="chip">{state.authMe?.value?.authenticated ? 'authenticated' : 'not authenticated'}</span>
      </div>
      <div class="utility-stat-strip">
        <article class="route-overview-card">
          <span class="route-overview-label">MFA</span>
          <strong>{state.mfaStatus?.value?.enabled ? 'Enabled' : 'Disabled'}</strong>
        </article>
        <article class="route-overview-card">
          <span class="route-overview-label">SSO</span>
          <strong>{state.ssoConfig?.value?.configured ? 'Configured' : 'Local'}</strong>
        </article>
        <article class="route-overview-card">
          <span class="route-overview-label">Google</span>
          <strong>{state.googleClient?.value?.configured ? 'Configured' : 'Unavailable'}</strong>
        </article>
      </div>
      <pre class="mono panel-json">{JSON.stringify({
        auth: state.authMe?.value ?? {},
        profile: state.userProfile?.value ?? {},
        mfa: state.mfaStatus?.value ?? {},
      }, null, 2)}</pre>
    </article>
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Credential Actions</h2>
        <span class="chip">operator action</span>
      </div>
      <label>
        <span class="mono">Current password</span>
        <input class="input" type="password" bind:value={currentPassword} />
      </label>
      <label>
        <span class="mono">New password</span>
        <input class="input" type="password" bind:value={newPassword} />
      </label>
      <div class="actions">
        <button type="button" class="action-btn primary" disabled={Boolean(busy) || !currentPassword || !newPassword} on:click={handleChangePassword}>
          Change password
        </button>
      </div>
      <p class="empty-row">Use this page for account security posture, MFA visibility, and password rotation.</p>
    </article>
  </section>
{:else if routePath === '/maple/api-keys'}
  <section class="docs-grid utility-grid">
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">User API Keys</h2>
        <span class="chip">{userApiKeys.length}</span>
      </div>
      <div class="utility-stat-strip">
        <article class="route-overview-card">
          <span class="route-overview-label">Active keys</span>
          <strong>{userApiKeys.length}</strong>
        </article>
        <article class="route-overview-card">
          <span class="route-overview-label">Organizations</span>
          <strong>{organizations.length}</strong>
        </article>
      </div>
      <div class="stack-list">
        {#if userApiKeys.length === 0}
          <p class="empty-row">No user API keys created yet.</p>
        {:else}
          {#each userApiKeys as item}
            <div class="list-card static">
              <strong>{item.name ?? item.keyId ?? 'API key'}</strong>
              <span>created={formatDate(item.createdAt)} · expires={item.expiresAt ?? '--'}</span>
              <div class="actions">
                <button type="button" class="action-btn danger" disabled={Boolean(busy)} on:click={() => handleDeleteApiKey(item.keyId ?? item.id)}>
                  Revoke
                </button>
              </div>
            </div>
          {/each}
        {/if}
      </div>
      <div class="docs-grid compact-grid">
        <label>
          <span class="mono">Key name</span>
          <input class="input" bind:value={newApiKeyName} placeholder="Operator CLI key" />
        </label>
        <label>
          <span class="mono">Expires at</span>
          <input class="input" bind:value={newApiKeyExpiry} placeholder="2026-12-31T00:00:00.000Z" />
        </label>
      </div>
      <div class="actions">
        <button type="button" class="action-btn primary" disabled={Boolean(busy) || !newApiKeyName.trim()} on:click={handleCreateApiKey}>
          Create key
        </button>
      </div>
    </article>
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Service Accounts</h2>
        <span class="chip">{selectedOrg?.name ?? 'no org selected'}</span>
      </div>
      <label>
        <span class="mono">Organization</span>
        <select class="select" bind:value={selectedOrgId} on:change={refresh}>
          {#each organizations as org}
            <option value={org.orgId ?? org.id}>{org.name ?? org.slug ?? org.orgId}</option>
          {/each}
        </select>
      </label>
      <div class="stack-list">
        {#if serviceAccounts.length === 0}
          <p class="empty-row">No service accounts for the selected organization.</p>
        {:else}
          {#each serviceAccounts as item}
            <button type="button" class="list-card" on:click={() => { selectedServiceAccountId = item.id ?? item.serviceAccountId ?? ''; refresh() }}>
              <strong>{item.name ?? item.id}</strong>
              <span>account={item.id ?? item.serviceAccountId ?? '--'}</span>
            </button>
          {/each}
        {/if}
      </div>
      <label>
        <span class="mono">New service account</span>
        <input class="input" bind:value={newServiceAccountName} placeholder="automation-bot" />
      </label>
      <div class="actions">
        <button type="button" class="action-btn" disabled={Boolean(busy) || !selectedOrgId || !newServiceAccountName.trim()} on:click={handleCreateServiceAccount}>
          Create service account
        </button>
        {#if selectedServiceAccount}
          <button type="button" class="action-btn primary" disabled={Boolean(busy)} on:click={() => handleCreateServiceAccountKey(selectedServiceAccount.id ?? selectedServiceAccount.serviceAccountId)}>
            Generate key
          </button>
        {/if}
      </div>
      {#if selectedServiceAccount}
        <pre class="mono panel-json">{JSON.stringify({
          account: selectedServiceAccount,
          keys: state.serviceAccountKeys?.value ?? {},
        }, null, 2)}</pre>
        <div class="stack-list">
          {#each serviceAccountKeys as item}
            <div class="list-card static">
              <strong>{item.keyId ?? item.id ?? 'service account key'}</strong>
              <span>created={formatDate(item.createdAt)} · expires={item.expiresAt ?? '--'}</span>
              <button type="button" class="action-btn danger" disabled={Boolean(busy)} on:click={() => handleDeleteServiceAccountKey(selectedServiceAccount.id ?? selectedServiceAccount.serviceAccountId, item.keyId ?? item.id)}>
                Revoke
              </button>
            </div>
          {/each}
        </div>
      {/if}
    </article>
  </section>
{:else if routePath === '/maple/org'}
  <section class="docs-grid utility-grid">
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Organizations</h2>
        <span class="chip">{organizations.length}</span>
      </div>
      <div class="utility-stat-strip">
        <article class="route-overview-card">
          <span class="route-overview-label">Members</span>
          <strong>{orgMembers.length}</strong>
        </article>
        <article class="route-overview-card">
          <span class="route-overview-label">Invites</span>
          <strong>{orgInvites.length}</strong>
        </article>
        <article class="route-overview-card">
          <span class="route-overview-label">Roles</span>
          <strong>{orgRoles.length}</strong>
        </article>
      </div>
      <label>
        <span class="mono">Organization</span>
        <select class="select" bind:value={selectedOrgId} on:change={refresh}>
          {#each organizations as org}
            <option value={org.orgId ?? org.id}>{org.name ?? org.slug ?? org.orgId}</option>
          {/each}
        </select>
      </label>
      <div class="actions">
        <button type="button" class="action-btn" disabled={Boolean(busy)} on:click={handleCreateOrg}>Create organization</button>
        <button type="button" class="action-btn primary" disabled={Boolean(busy) || !selectedOrgId} on:click={handleSaveOrgSettings}>Save settings</button>
      </div>
      {#if selectedOrg}
        <pre class="mono panel-json">{JSON.stringify(selectedOrg, null, 2)}</pre>
      {/if}
    </article>
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Members and Invites</h2>
        <span class="chip">{selectedOrg?.name ?? '--'}</span>
      </div>
      <div class="docs-grid compact-grid">
        <label>
          <span class="mono">Invite email</span>
          <input class="input" bind:value={inviteEmail} placeholder="operator@company.com" />
        </label>
        <label>
          <span class="mono">Invite role</span>
          <select class="select" bind:value={inviteRole}>
            <option value="member">member</option>
            <option value="admin">admin</option>
          </select>
        </label>
      </div>
      <div class="actions">
        <button type="button" class="action-btn primary" disabled={Boolean(busy) || !selectedOrgId || !inviteEmail.trim()} on:click={handleInviteOrgMember}>
          Send invite
        </button>
      </div>
      <div class="stack-list">
        {#each orgMembers as member}
          <div class="list-card static">
            <strong>{member.email ?? member.userId ?? 'member'}</strong>
            <span>{member.roleId ?? member.role ?? 'member'}</span>
            <div class="actions">
              <select class="select" on:change={(event) => handleChangeOrgRole(member, event.currentTarget.value)}>
                {#each orgRoles as role}
                  <option value={role.roleId ?? role.id} selected={(role.roleId ?? role.id) === (member.roleId ?? member.role)}>{role.label ?? role.roleId ?? role.id}</option>
                {/each}
              </select>
              <button type="button" class="action-btn danger" disabled={Boolean(busy)} on:click={() => handleRemoveOrgMember(member)}>
                Remove
              </button>
            </div>
          </div>
        {/each}
        {#each orgInvites as invite}
          <div class="list-card static">
            <strong>{invite.email ?? invite.inviteId ?? 'invite'}</strong>
            <span>role={invite.roleId ?? invite.role ?? '--'} · expires={formatDate(invite.expiresAt)}</span>
          </div>
        {/each}
      </div>
    </article>
  </section>
{:else if routePath === '/maple/integrations'}
  <section class="docs-grid utility-grid">
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Provider Catalog</h2>
        <span class="chip">{integrationProviders.length}</span>
      </div>
      <div class="stack-list">
        {#each integrationProviders as provider}
          <div class="list-card static">
            <strong>{provider.displayName ?? provider.provider ?? provider.id}</strong>
            <span>auth={provider.defaultAuthType ?? '--'} · oauth={provider.oauth?.configured ? 'configured' : 'not configured'}</span>
          </div>
        {/each}
      </div>
    </article>
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Connected Integrations</h2>
        <span class="chip">{integrationsList.length}</span>
      </div>
      <div class="stack-list">
        {#each integrationsList as item}
          <div class="list-card static">
            <strong>{item.displayName ?? item.provider ?? item.id}</strong>
            <span>{item.status ?? 'unknown'} · auth={item.authType ?? '--'}</span>
            <div class="actions">
              {#if item.authType === 'oauth2'}
                <button type="button" class="action-btn" disabled={Boolean(busy)} on:click={() => handleIntegrationAction(item, 'oauth')}>Connect</button>
                <button type="button" class="action-btn" disabled={Boolean(busy)} on:click={() => handleIntegrationAction(item, 'refresh')}>Refresh</button>
                <button type="button" class="action-btn danger" disabled={Boolean(busy)} on:click={() => handleIntegrationAction(item, 'revoke')}>Revoke</button>
              {:else}
                <button type="button" class="action-btn" disabled={Boolean(busy)} on:click={() => handleIntegrationAction(item, 'connect')}>Connect</button>
                <button type="button" class="action-btn danger" disabled={Boolean(busy)} on:click={() => handleIntegrationAction(item, 'disconnect')}>Disconnect</button>
              {/if}
            </div>
          </div>
        {/each}
      </div>
      {#if integrationActionResult}
        <pre class="mono panel-json">{JSON.stringify(integrationActionResult, null, 2)}</pre>
      {/if}
    </article>
  </section>
{:else if routePath === '/maple/policies'}
  <section class="docs-grid">
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Context Leakage Intake</h2>
        <span class="chip">{leakagePolicyMode}</span>
      </div>
      <label>
        <span class="mono">Mode</span>
        <select class="select" bind:value={leakagePolicyMode}>
          <option value="strict">strict</option>
          <option value="review">review</option>
          <option value="monitor">monitor</option>
        </select>
      </label>
      <label>
        <span class="mono">Inline doc name</span>
        <input class="input" bind:value={leakageInlineName} />
      </label>
      <label>
        <span class="mono">Policy text</span>
        <textarea
          class="textarea firewall-json-editor"
          bind:value={leakageInlineText}
          placeholder="Avoid: My address: 2788 San Tomas Expy, Santa Clara, CA 95051"
          spellcheck="false"
        ></textarea>
      </label>
      <label>
        <span class="mono">Upload files</span>
        <input bind:this={leakageFileInput} type="file" multiple />
      </label>
      <div class="actions">
        <button type="button" class="action-btn primary" disabled={Boolean(busy)} on:click={handleLeakageUpload}>
          Store docs
        </button>
      </div>
    </article>
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Documents</h2>
        <span class="chip">{leakageDocuments.length}</span>
      </div>
      <div class="stack-list">
        {#if leakageDocuments.length === 0}
          <p class="empty-row">No active context leakage documents uploaded yet.</p>
        {:else}
          {#each leakageDocuments as item}
            <div class="list-card static">
              <strong>{item.fileName ?? item.documentId}</strong>
              <span>{item.policyMode ?? 'strict'} · {formatDate(item.createdAt)} · active={String(item.isActive ?? true)}</span>
              <div class="actions">
                <button type="button" class="action-btn danger" disabled={Boolean(busy)} on:click={() => deleteLeakageDocument(item.documentId)}>
                  Delete
                </button>
              </div>
            </div>
          {/each}
        {/if}
      </div>
    </article>
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Extracted Entities</h2>
        <span class="chip">{leakageEntities.length}</span>
      </div>
      <div class="stack-list">
        {#if leakageEntities.length === 0}
          <p class="empty-row">Extracted protected entities appear here after upload.</p>
        {:else}
          {#each leakageEntities as item}
            <div class="list-card static">
              <strong>{item.displayText ?? item.category}</strong>
              <span>{item.category} · {item.action} · {item.replacementValue || '--'} · active={String(item.isActive ?? true)}</span>
              <div class="actions">
                <select class="select" value={item.policyMode ?? 'strict'} on:change={(event) => updateLeakageEntity(item.entityId, { policyMode: event.currentTarget.value })}>
                  <option value="strict">strict</option>
                  <option value="review">review</option>
                  <option value="monitor">monitor</option>
                </select>
                <button type="button" class="action-btn" disabled={Boolean(busy)} on:click={() => updateLeakageEntity(item.entityId, { isActive: !(item.isActive ?? true) })}>
                  {item.isActive === false ? 'Activate' : 'Deactivate'}
                </button>
              </div>
            </div>
          {/each}
        {/if}
      </div>
    </article>
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Enforcement Events</h2>
        <span class="chip">{leakageEvents.length}</span>
      </div>
      <div class="stack-list">
        {#if leakageEvents.length === 0}
          <p class="empty-row">No rewrite or block events recorded yet.</p>
        {:else}
          {#each leakageEvents as item}
            <div class="list-card static">
              <strong>{item.action} · {item.direction || 'prompt'}</strong>
              <span>session={item.sessionId || '--'} · run={item.runId || '--'} · trace={item.traceId || '--'} · tool={item.toolName || '--'}</span>
              <pre class="mono panel-json">{JSON.stringify({
                originalRedactedText: item.originalRedactedText,
                sanitizedText: item.sanitizedText,
                blocked: item.blocked,
                reason: item.reason,
                confidence: item.confidence,
                entityIds: item.entityIds,
              }, null, 2)}</pre>
            </div>
          {/each}
        {/if}
      </div>
    </article>
  </section>
{:else if routePath === '/maple/settings'}
  <section class="docs-grid utility-grid">
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Notification Preferences</h2>
        <span class="chip">{state.unreadCount?.value?.count ?? 0} unread</span>
      </div>
      <div class="utility-stat-strip">
        {#each ['approvals', 'escalations', 'run_failures', 'system_alerts'] as cat}
          <article class="route-overview-card">
            <span class="route-overview-label">{cat.replace(/_/g, ' ')}</span>
            <strong>{['email', 'in_app'].filter((ch) => settingsNotifPrefs[`${cat}.${ch}`] ?? settingsNotifPrefs?.[cat]?.[ch] ?? false).length} / 2</strong>
          </article>
        {/each}
      </div>
      <div class="stack-list">
        <div class="list-card static">
          <strong>Category</strong>
          <div class="actions">
            <span class="mono" style="min-width:60px;text-align:center">Email</span>
            <span class="mono" style="min-width:60px;text-align:center">In-App</span>
          </div>
        </div>
        {#each ['approvals', 'escalations', 'run_failures', 'system_alerts'] as cat}
          <div class="list-card static">
            <strong>{cat.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</strong>
            <div class="actions">
              {#each ['email', 'in_app'] as channel}
                <button type="button" class="action-btn" class:primary={settingsNotifPrefs[`${cat}.${channel}`] ?? settingsNotifPrefs?.[cat]?.[channel] ?? false} disabled={Boolean(busy)} on:click={() => handleSaveNotifPrefs(cat, channel)}>
                  {(settingsNotifPrefs[`${cat}.${channel}`] ?? settingsNotifPrefs?.[cat]?.[channel] ?? false) ? 'On' : 'Off'}
                </button>
              {/each}
            </div>
          </div>
        {/each}
      </div>
      <div class="stack-list">
        {#each pickItems(state.notifications?.value) as notif}
          <div class="list-card static">
            <strong>{notif.title || 'Notification'}</strong>
            <span>{notif.body || notif.message || '--'} · {formatDate(notif.created_at || notif.createdAt)}</span>
          </div>
        {:else}
          <p class="empty-row">No recent notifications.</p>
        {/each}
      </div>
    </article>
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Data & Retention</h2>
        <span class="chip">{state.retention?.value?.policy ?? 'default'}</span>
      </div>
      <div class="utility-stat-strip">
        <article class="route-overview-card">
          <span class="route-overview-label">Retention</span>
          <strong>{state.retention?.value?.retention_days ?? '--'} days</strong>
        </article>
        <article class="route-overview-card">
          <span class="route-overview-label">Chain length</span>
          <strong>{state.auditVerify?.value?.chain_length ?? '--'}</strong>
        </article>
        <article class="route-overview-card">
          <span class="route-overview-label">Verified</span>
          <strong>{(state.auditVerify?.value?.valid || state.auditVerify?.value?.verified) ? 'Yes' : 'No'}</strong>
        </article>
      </div>
      <div class="actions">
        <button type="button" class="action-btn" disabled={Boolean(busy)} on:click={() => handleExport('orchestrations')}>Export orchestrations</button>
        <button type="button" class="action-btn" disabled={Boolean(busy)} on:click={() => handleExport('traces')}>Export traces</button>
      </div>
      <pre class="mono panel-json">{JSON.stringify({
        retention: state.retention?.value ?? {},
        auditChain: state.auditVerify?.value ?? {},
      }, null, 2)}</pre>
    </article>
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Alert Webhooks</h2>
        <span class="chip">{pickItems(state.alertWebhooks?.value).length}</span>
      </div>
      <div class="stack-list">
        {#each pickItems(state.alertWebhooks?.value) as webhook}
          <div class="list-card static">
            <strong>{webhook.url}</strong>
            <span>status={webhook.status ?? '--'}{webhook.alert_types?.length ? ` · types=${webhook.alert_types.join(', ')}` : ''}</span>
            <div class="actions">
              <button type="button" class="action-btn danger" disabled={Boolean(busy)} on:click={() => handleDeleteWebhook(webhook.id)}>
                {deleteConfirmId === webhook.id ? 'Confirm delete?' : 'Delete'}
              </button>
            </div>
          </div>
        {:else}
          <p class="empty-row">No webhooks configured.</p>
        {/each}
      </div>
      <label>
        <span class="mono">Webhook URL</span>
        <input class="input" bind:value={newWebhookUrl} placeholder="https://example.com/webhook" />
      </label>
      <label>
        <span class="mono">Secret (optional)</span>
        <input class="input" type="password" bind:value={newWebhookSecret} placeholder="Signing secret" />
      </label>
      <div class="actions">
        <button type="button" class="action-btn primary" disabled={Boolean(busy) || !newWebhookUrl.trim()} on:click={handleAddWebhook}>
          Add webhook
        </button>
      </div>
    </article>
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Account Security</h2>
        <span class="chip">{state.authMe?.value?.role ?? state.authMe?.value?.username ?? 'operator'}</span>
      </div>
      <div class="utility-stat-strip">
        <article class="route-overview-card">
          <span class="route-overview-label">MFA</span>
          <strong>{state.mfaStatus?.value?.enabled ? 'Enabled' : 'Disabled'}</strong>
        </article>
        <article class="route-overview-card">
          <span class="route-overview-label">Auth method</span>
          <strong>{state.authMe?.value?.method ?? 'local'}</strong>
        </article>
        <article class="route-overview-card">
          <span class="route-overview-label">Session</span>
          <strong>{state.authMe?.value?.authenticated ? 'Active' : 'None'}</strong>
        </article>
      </div>
      <label>
        <span class="mono">Current password</span>
        <input class="input" type="password" bind:value={currentPassword} />
      </label>
      <label>
        <span class="mono">New password</span>
        <input class="input" type="password" bind:value={newPassword} />
      </label>
      <div class="actions">
        <button type="button" class="action-btn primary" disabled={Boolean(busy) || !currentPassword || !newPassword} on:click={handleChangePassword}>
          Change password
        </button>
        <button type="button" class="action-btn danger" disabled={Boolean(busy)} on:click={() => runAction('settings:signout', async () => { await sendJson(fetch, '/api/auth/logout', {}); window.location.assign('/login') })}>
          Sign out
        </button>
      </div>
    </article>
  </section>
{:else if routePath === '/maple/demo'}
  <section class="docs-grid">
    <article class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Operational Scenarios</h2>
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
</section>

<style>
  .fa-route-page {
    display: grid;
    gap: 16px;
  }

  .fa-route-page-embedded {
    gap: 0;
  }

  .fa-page-header {
    display: grid;
    gap: 16px;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
    margin-bottom: 0;
  }

  .fa-page-title h1 {
    margin: 0;
  }

  .fa-page-kicker {
    display: inline-flex;
    align-items: center;
    margin-bottom: 8px;
    font-size: var(--text-2xs);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
  }

  .fa-page-stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(140px, 1fr));
    gap: 12px;
  }

  .fa-secondary-actions-bar {
    display: flex;
    justify-content: flex-end;
    margin: 0 0 18px;
  }

  .fa-secondary-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .route-overview-card {
    display: grid;
    gap: 6px;
    border: 1px solid var(--line);
    border-radius: 16px;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(255, 248, 239, 0.92));
    padding: 12px 14px;
    box-shadow: 0 10px 24px rgba(89, 46, 9, 0.05);
  }

  .route-overview-label {
    font-size: var(--text-2xs);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
  }

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

  .utility-grid {
    grid-template-columns: minmax(0, 1.05fr) minmax(300px, 0.95fr);
    align-items: start;
  }

  .utility-stat-strip {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 10px;
    margin-bottom: 16px;
  }

  .compact-grid {
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 12px;
  }

  @media (max-width: 960px) {
    .fa-page-header {
      grid-template-columns: 1fr;
    }

    .fa-page-stats {
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    }

    .interventions-grid {
      grid-template-columns: 1fr;
    }

    .utility-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
