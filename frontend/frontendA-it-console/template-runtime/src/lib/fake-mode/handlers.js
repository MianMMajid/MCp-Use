function asJson(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  })
}

function asText(text, status = 200, headers = {}) {
  return new Response(String(text), {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      ...headers,
    },
  })
}

function normalizePathname(pathname) {
  if (!pathname) return '/'
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1)
  return pathname
}

function matchPath(pathname, pattern) {
  const path = normalizePathname(pathname)
  const patt = normalizePathname(pattern)
  const pathParts = path.split('/').filter(Boolean)
  const pattParts = patt.split('/').filter(Boolean)
  const params = {}

  if (pathParts.length !== pattParts.length) return null

  for (let i = 0; i < pattParts.length; i += 1) {
    const p = pattParts[i]
    const v = pathParts[i]
    if (p.startsWith(':')) {
      params[p.slice(1)] = decodeURIComponent(v)
      continue
    }
    if (p !== v) return null
  }

  return params
}

function parseBody(body) {
  if (!body) return {}
  if (typeof body === 'string') {
    try {
      return JSON.parse(body)
    } catch {
      return { raw: body }
    }
  }
  return body
}

function normalizeUiRule(rule, fallbackId) {
  return {
    id: String(rule?.id ?? rule?.ruleId ?? fallbackId ?? `rule-${Date.now()}`),
    condition: String(rule?.condition ?? rule?.match ?? rule?.pattern ?? 'custom condition'),
    decision: String(rule?.decision ?? rule?.action ?? rule?.effect ?? 'review'),
    status: String(rule?.status ?? 'enabled'),
    source: String(rule?.source ?? 'runtime'),
    createdAt: rule?.createdAt ?? nowIso(),
    createdBy: rule?.createdBy ?? null,
    reason: String(rule?.reason ?? ''),
  }
}

function normalizeUiRules(rules, nextId) {
  return (Array.isArray(rules) ? rules : []).map((rule, index) =>
    normalizeUiRule(rule, typeof nextId === 'function' ? nextId('rule') : `rule-${index + 1}`),
  )
}

function normalizeAnalyst(value) {
  return String(value ?? '').trim().toLowerCase()
}

function extractAnalystCandidates(item) {
  if (!item || typeof item !== 'object') return []
  return [
    item.actor,
    item.requestedBy,
    item.approvedBy,
    item.reviewer,
    item.user,
    item.username,
    item.email,
    item.owner,
    item?.metadata?.actor,
    item?.metadata?.user,
    item?.metadata?.requestedBy,
  ]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
}

function parseAnalystFilter(searchParams) {
  const fromRepeated = searchParams.getAll('analysts')
  const fromCsv = String(searchParams.get('analysts') ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
  return Array.from(new Set([...fromRepeated, ...fromCsv]))
}

function filterByAnalyst(records, analystFilter) {
  if (!Array.isArray(records)) return []
  if (!Array.isArray(analystFilter) || analystFilter.length === 0) return records
  const selected = new Set(analystFilter.map((value) => normalizeAnalyst(value)))
  return records.filter((record) =>
    extractAnalystCandidates(record).some((candidate) => selected.has(normalizeAnalyst(candidate))),
  )
}

function extractUploadedDocuments(payload) {
  const docs = []
  const pushDoc = (value) => {
    if (!value) return
    const items = Array.isArray(value) ? value : [value]
    for (const item of items) {
      if (!item) continue
      const name = String(item?.name ?? item?.filename ?? 'document')
      const mimeType = String(item?.type ?? item?.mimeType ?? 'application/octet-stream')
      const sizeBytes = Number(item?.size ?? item?.sizeBytes ?? String(item?.content ?? '').length ?? 0)
      docs.push({
        name,
        mimeType,
        sizeBytes,
        content: typeof item === 'string' ? item : String(item?.content ?? ''),
      })
    }
  }

  if (!payload || typeof payload !== 'object') return docs
  pushDoc(payload.documents)
  pushDoc(payload.document)
  pushDoc(payload.file)
  pushDoc(payload.files)
  pushDoc(payload['documents[]'])
  return docs
}

function nowIso() {
  return new Date().toISOString()
}

function short(text, n = 8) {
  const s = String(text || '')
  return s.length <= n ? s : s.slice(0, n)
}

function randomToken(prefix = 'tok') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
}

function setSession(state, active) {
  state.sessionActive = Boolean(active)
  if (typeof document === 'undefined') return
  if (active) {
    document.cookie = 'maple_session=fake-session; path=/; SameSite=Lax'
  } else {
    document.cookie = 'maple_session=; path=/; Max-Age=0; SameSite=Lax'
  }
}

function paginate(items, searchParams) {
  const limitRaw = searchParams.get('limit')
  const cursorRaw = searchParams.get('cursor')
  const limit = Number.isFinite(Number(limitRaw)) ? Math.max(1, Number(limitRaw)) : 20
  const offset = Number.isFinite(Number(cursorRaw)) ? Number(cursorRaw) : 0
  const page = items.slice(offset, offset + limit)
  const nextOffset = offset + limit < items.length ? offset + limit : null
  return {
    page,
    nextCursor: nextOffset == null ? null : String(nextOffset),
  }
}

function ensureOrg(state, orgId) {
  const list = state.org.orgs
  let org = list.find((o) => (o.id || o.orgId) === orgId)
  if (!org && list.length > 0) org = list[0]
  return org
}

function resolveOrgId(state, orgId) {
  if (orgId && orgId !== 'default') return orgId
  const first = state.org.orgs[0]
  return first?.id || first?.orgId || 'default'
}

function getOrchestration(state, id) {
  return state.orchestrations.find((o) => (o.id || o.orchestrationId) === id)
}

function getExecution(state, id) {
  return state.orchestrationExecutions.find((e) => (e.executionId || e.id) === id)
}

function buildChatStream(message) {
  const text = `Simulated stream: ${message || 'No message provided.'}`
  const chunks = text.match(/.{1,24}/g) || [text]
  let idx = 0

  const stream = new ReadableStream({
    start(controller) {
      function emit() {
        if (idx >= chunks.length) {
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
          controller.close()
          return
        }
        const payload = JSON.stringify({ content: chunks[idx] })
        controller.enqueue(new TextEncoder().encode(`data: ${payload}\n\n`))
        idx += 1
        setTimeout(emit, 100)
      }
      emit()
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

function listSessionsByAgent(state, agentId) {
  return state.sessions
    .filter((session) => (session.agent || session.agentId) === agentId || session.agent === `agent-${short(agentId, 1)}`)
    .map((session) => ({
      sessionId: session.sessionId,
      id: session.id,
      title: session.title,
      createdAt: session.createdAt,
      startedAt: session.startedAt,
      status: session.status,
      agentName: session.agentName,
    }))
}

function createRunAndSession(state, agentId, payload) {
  const message = payload.message || payload.objective || payload.prompt || 'Simulated input'
  let session = state.sessions.find((s) => s.sessionId === payload.sessionId)
  if (!session) {
    const sessionId = state.nextId('session')
    session = {
      sessionId,
      id: sessionId,
      title: `Session ${sessionId}`,
      status: 'running',
      createdAt: nowIso(),
      startedAt: nowIso(),
      completedAt: null,
      agentName: `Agent ${short(agentId, 4)}`,
      agent: agentId,
      runs: [],
      events: [],
    }
    state.sessions.unshift(session)
  }

  const runId = state.nextId('run')
  const run = {
    runId,
    id: runId,
    type: payload.objective ? 'longform' : 'turn',
    status: 'completed',
    createdAt: nowIso(),
    startedAt: nowIso(),
    updatedAt: nowIso(),
    completedAt: nowIso(),
    duration: '12s',
    agentName: session.agentName,
    agent: agentId,
    sessionId: session.sessionId,
    input: { message },
    output: { reply: `Simulated response for: ${message}` },
    cost: { estimatedCostUsd: 0.0182 },
    timeline: [
      { id: state.nextId('event'), eventType: 'run.started', timestamp: nowIso(), message: 'Run started' },
      { id: state.nextId('event'), eventType: 'run.completed', timestamp: nowIso(), message: 'Run completed' },
    ],
    children: [],
    artifacts: [
      { id: state.nextId('artifact'), name: `artifact-${runId}.json`, type: 'json', size: '4KB' },
    ],
  }

  state.runs.unshift(run)
  session.runs.push({
    runId,
    status: run.status,
    type: run.type,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    cost: run.cost,
    parentRunId: null,
    childRunIds: [],
  })
  session.status = 'running'

  return {
    run,
    session,
    reply: run.output.reply,
  }
}

function markNotificationRead(state, notificationId) {
  const item = state.notifications.find((n) => String(n.id) === String(notificationId))
  if (item) item.read = true
}

function unreadCount(state) {
  return state.notifications.filter((n) => !n.read).length
}

function handleAuth(pathname, method, state, body) {
  if (pathname === '/api/auth/me' && method === 'GET') {
    if (!state.sessionActive) return asJson({ authenticated: false }, 401)
    return asJson({ authenticated: true, user: state.user })
  }

  if (pathname === '/api/auth/google/client-id' && method === 'GET') {
    return asJson({ configured: true, clientId: 'fake-google-client-id' })
  }

  if (pathname === '/api/auth/login' && method === 'POST') {
    setSession(state, true)
    return asJson({ authenticated: true, user: state.user })
  }

  if (pathname === '/api/auth/register' && method === 'POST') {
    const payload = parseBody(body)
    const nextEmail = payload.username || payload.email
    if (nextEmail) {
      state.user.email = nextEmail
      state.user.username = nextEmail.split('@')[0] || 'demo'
    }
    setSession(state, true)
    return asJson({ ok: true, authenticated: true, user: state.user })
  }

  if (pathname === '/api/auth/google' && method === 'POST') {
    setSession(state, true)
    return asJson({ ok: true, authenticated: true, redirectUrl: null, user: state.user })
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    setSession(state, false)
    return asJson({ ok: true })
  }

  if (pathname === '/api/auth/forgot-password' && method === 'POST') {
    return asJson({ ok: true, message: 'Reset email sent.' })
  }

  if (pathname === '/api/auth/reset-password' && method === 'POST') {
    return asJson({ ok: true, message: 'Password reset complete.' })
  }

  if (pathname === '/api/auth/verify-email/request' && method === 'POST') {
    return asJson({ ok: true, message: 'Verification email sent.' })
  }

  if (pathname === '/api/auth/verify-email/confirm' && method === 'POST') {
    return asJson({ ok: true, verified: true })
  }

  return null
}

function handleFirewall(pathname, method, state, body) {
  if (pathname === '/api/firewall/state' && method === 'GET') {
    return asJson({
      ok: true,
      mode: state.firewall.mode,
      status: state.firewall.status,
      updatedAt: nowIso(),
    })
  }

  if (pathname === '/api/firewall/rules/effective' && method === 'GET') {
    const rules = normalizeUiRules(state.firewall.rules, state.nextId)
    state.firewall.rules = rules
    return asJson({
      ok: true,
      source: 'fake-runtime',
      ruleCount: rules.length,
      rules,
    })
  }

  if (pathname === '/api/firewall/rules' && method === 'GET') {
    const rules = normalizeUiRules(state.firewall.rules, state.nextId)
    state.firewall.rules = rules
    return asJson({ ok: true, rules, count: rules.length })
  }

  if (pathname === '/api/firewall/rules' && method === 'POST') {
    const payload = parseBody(body)
    if (Array.isArray(payload.rules)) {
      const nextRules = payload.rules.map((rule, index) =>
        normalizeUiRule(
          { ...rule, createdBy: rule?.createdBy ?? payload.createdBy ?? state.user.email },
          `rule-${index + 1}`,
        ),
      )
      state.firewall.rules = nextRules
      return asJson({ ok: true, rules: state.firewall.rules, count: state.firewall.rules.length })
    }

    const inserted = normalizeUiRule(
      {
        ...payload,
        condition: String(payload.condition ?? (payload.target ? `target equals ${payload.target}` : 'custom condition')),
        source: payload.source ?? 'ui',
        createdBy: payload.createdBy ?? state.user.email,
      },
      state.nextId('rule'),
    )
    state.firewall.rules.unshift(inserted)
    return asJson({ ok: true, rule: inserted, rules: state.firewall.rules, count: state.firewall.rules.length }, 201)
  }

  let ruleParams = matchPath(pathname, '/api/firewall/rules/:ruleId')
  if (ruleParams && method === 'PATCH') {
    const payload = parseBody(body)
    const rule = state.firewall.rules.find((entry) => String(entry.id) === String(ruleParams.ruleId))
    if (!rule) return asJson({ ok: false, message: 'Rule not found.' }, 404)
    Object.assign(rule, payload, { updatedAt: nowIso() })
    return asJson({ ok: true, rule })
  }

  ruleParams = matchPath(pathname, '/api/firewall/rules/:ruleId')
  if (ruleParams && method === 'DELETE') {
    state.firewall.rules = state.firewall.rules.filter((entry) => String(entry.id) !== String(ruleParams.ruleId))
    return asJson({ ok: true, ruleId: ruleParams.ruleId })
  }

  if (pathname === '/api/firewall/preview' && method === 'POST') {
    const payload = parseBody(body)
    const toolName = payload.tool || payload.action || payload.input?.tool || 'unknown-tool'
    return asJson({
      ok: true,
      decision: toolName.includes('delete') ? 'block' : 'allow',
      reason: 'Simulated firewall decision',
      tool: toolName,
      traceId: `trace-${Date.now()}`,
      preview: true,
    })
  }

  if (pathname === '/api/firewall/decision' && method === 'POST') {
    const payload = parseBody(body)
    const toolName = payload.tool || payload.action || payload.input?.tool || 'unknown-tool'
    const blocked = String(toolName).includes('delete')
    return asJson({
      ok: true,
      decision: blocked ? 'blocked' : 'allowed',
      blocked,
      reason: blocked ? 'Destructive actions require approval.' : 'Policy allows action.',
      traceId: `trace-${Date.now()}`,
    })
  }

  if (pathname === '/api/firewall/chat' && method === 'POST') {
    const payload = parseBody(body)
    return asJson({ ok: true, reply: `Firewall assistant: simulated answer for "${payload.message || ''}".` })
  }

  if (pathname === '/api/chat/capabilities' && method === 'GET') {
    return asJson(state.firewall.chatCapabilities)
  }

  if (pathname === '/api/chat/stream' && method === 'POST') {
    const payload = parseBody(body)
    return buildChatStream(payload.message || payload.prompt || '')
  }

  if (pathname === '/api/runtime/feature-capabilities' && method === 'GET') {
    return asJson({
      ok: true,
      service: 'gateway-api',
      capabilities: [
        { name: 'streamingChat', enabled: true, reason: 'Enabled in fake mode' },
        { name: 'policyPreview', enabled: true, reason: 'Enabled in fake mode' },
        { name: 'hitl', enabled: true, reason: 'Enabled in fake mode' },
        { name: 'orchestrationRuntime', enabled: true, reason: 'Enabled in fake mode' },
      ],
      generatedAt: nowIso(),
    })
  }

  if (pathname === '/api/firewall/context-leakage/documents' && method === 'POST') {
    const payload = parseBody(body)
    const incomingDocs = extractUploadedDocuments(payload)
    const policyMode = String(payload?.policyMode ?? 'strict')
    const docs = incomingDocs.map((document) => ({
      id: state.nextId('leakage'),
      name: document.name,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
      preview: String(document.content ?? '').slice(0, 300),
      uploadedAt: nowIso(),
      policyMode,
    }))
    state.ui.leakageUploads = [...docs, ...state.ui.leakageUploads].slice(0, 200)
    return asJson(
      {
        ok: true,
        firewallObjectId: 'context-leakage-global',
        policyMode,
        documents: docs,
        total: state.ui.leakageUploads.length,
      },
      201,
    )
  }

  if (pathname === '/api/firewall/context-leakage/documents' && method === 'GET') {
    return asJson({
      ok: true,
      firewallObjectId: 'context-leakage-global',
      documents: state.ui.leakageUploads.map((item) => ({
        id: item.id,
        name: item.name,
        mimeType: item.mimeType ?? 'application/octet-stream',
        sizeBytes: Number(item.sizeBytes ?? item.size ?? 0),
        preview: item.preview ?? '',
        uploadedAt: item.uploadedAt ?? nowIso(),
      })),
    })
  }

  return null
}

function handleUi(pathname, method, state, searchParams, body) {
  if (!pathname.startsWith('/api/ui/')) return null

  if (pathname === '/api/ui/bootstrap' && method === 'GET') {
    const analystFilter = parseAnalystFilter(searchParams)
    state.firewall.rules = normalizeUiRules(state.firewall.rules, state.nextId)
    return asJson({
      summary: state.observability.summary,
      slo: state.observability.slo,
      auditEvents: filterByAnalyst(state.observability.auditLog.slice(0, 50), analystFilter),
      executions: filterByAnalyst(state.orchestrationExecutions.slice(0, 50), analystFilter),
      approvals: filterByAnalyst(state.hitl.gatewayApprovals.slice(0, 50), analystFilter),
      runtimeCapabilities: [
        { name: 'streamingChat', enabled: true, reason: 'Enabled in fake mode' },
        { name: 'policyPreview', enabled: true, reason: 'Enabled in fake mode' },
        { name: 'hitl', enabled: true, reason: 'Enabled in fake mode' },
        { name: 'orchestrationRuntime', enabled: true, reason: 'Enabled in fake mode' },
      ],
      integrationCatalog: state.integrations.catalog,
      connectedIntegrations: state.integrations.connected,
      downstreamApps: state.downstream.apps,
      downstreamTools: state.downstream.tools,
      openclawCatalog: state.tools.cliCatalog,
      authMe: state.user,
      firewallRules: state.firewall.rules,
      contextLeakageDocuments: state.ui.leakageUploads.map((item) => ({
        id: item.id,
        name: item.name,
        mimeType: item.mimeType ?? 'application/octet-stream',
        sizeBytes: Number(item.sizeBytes ?? item.size ?? 0),
        preview: item.preview ?? '',
        uploadedAt: item.uploadedAt ?? nowIso(),
      })),
    })
  }

  if (pathname === '/api/ui/analysts' && method === 'GET') {
    const analystFilter = parseAnalystFilter(searchParams)
    const set = new Set([
      state.user.username,
      state.user.email,
      ...state.observability.auditLog.slice(0, 80).flatMap((item) => [item.actor, item.user, item.owner]),
      ...state.orchestrationExecutions.slice(0, 80).flatMap((item) => [item.requestedBy, item.user]),
      ...state.hitl.gatewayApprovals.slice(0, 80).flatMap((item) => [item.user, item.reviewer]),
      ...state.ui.users.map((user) => user.email),
      ...state.ui.users.map((user) => user.name),
    ])
    const analysts = Array.from(set)
      .map((value) => String(value ?? '').trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
    const filtered = analystFilter.length
      ? analysts.filter((value) => analystFilter.map((item) => normalizeAnalyst(item)).includes(normalizeAnalyst(value)))
      : analysts
    return asJson({
      analysts: filtered,
    })
  }

  if (pathname === '/api/ui/users' && method === 'GET') {
    return asJson({ orgId: String(state.org?.orgs?.[0]?.id ?? state.org?.orgs?.[0]?.orgId ?? 'default'), users: state.ui.users })
  }

  if (pathname === '/api/ui/users' && method === 'POST') {
    const payload = parseBody(body)
    const orgId = String(state.org?.orgs?.[0]?.id ?? state.org?.orgs?.[0]?.orgId ?? 'default')
    const user = {
      id: state.nextId('ui-user'),
      userId: state.nextId('user'),
      name: String(payload.name ?? payload.email ?? 'new-user'),
      email: String(payload.email ?? `user-${Date.now()}@mayple.dev`),
      role: String(payload.role ?? 'viewer'),
      status: 'pending',
      source: 'invite',
      createdAt: nowIso(),
    }
    state.ui.users.unshift(user)
    return asJson({ ok: true, user, orgId })
  }

  let uiUserRole = matchPath(pathname, '/api/ui/users/:userId/role')
  if (uiUserRole && method === 'PATCH') {
    const payload = parseBody(body)
    const user = state.ui.users.find((item) => String(item.userId) === String(uiUserRole.userId) || String(item.id) === String(uiUserRole.userId))
    if (!user) return asJson({ ok: false, message: 'User not found.' }, 404)
    user.role = String(payload.role ?? user.role)
    user.status = 'active'
    user.updatedAt = nowIso()
    const orgId = String(state.org?.orgs?.[0]?.id ?? state.org?.orgs?.[0]?.orgId ?? 'default')
    return asJson({ ok: true, userId: String(user.userId ?? user.id), role: user.role, orgId, user })
  }

  let uiUserDelete = matchPath(pathname, '/api/ui/users/:userId')
  if (uiUserDelete && method === 'DELETE') {
    state.ui.users = state.ui.users.filter((item) => String(item.userId) !== String(uiUserDelete.userId) && String(item.id) !== String(uiUserDelete.userId))
    const orgId = String(state.org?.orgs?.[0]?.id ?? state.org?.orgs?.[0]?.orgId ?? 'default')
    return asJson({ ok: true, userId: uiUserDelete.userId, orgId })
  }

  if (pathname === '/api/ui/firewall/rules' && method === 'GET') {
    state.firewall.rules = normalizeUiRules(state.firewall.rules, state.nextId)
    return asJson({ rules: state.firewall.rules, count: state.firewall.rules.length })
  }

  if (pathname === '/api/ui/firewall/rules' && method === 'POST') {
    const payload = parseBody(body)
    if (Array.isArray(payload.rules)) {
      state.firewall.rules = payload.rules.map((rule, index) =>
        normalizeUiRule(
          { ...rule, createdBy: rule?.createdBy ?? payload.createdBy ?? state.user.email },
          `rule-${index + 1}`,
        ),
      )
      return asJson({ ok: true, rules: state.firewall.rules, count: state.firewall.rules.length })
    }
    const inserted = normalizeUiRule(
      {
        ...payload,
        condition: String(payload.condition ?? `target equals ${payload.target ?? 'unknown'}`),
        decision: String(payload.decision ?? payload.action ?? 'block'),
        source: String(payload.source ?? 'ui'),
        createdBy: payload.createdBy ?? state.user.email,
      },
      state.nextId('rule'),
    )
    state.firewall.rules.unshift(inserted)
    return asJson({ ok: true, rule: inserted, rules: state.firewall.rules, count: state.firewall.rules.length }, 201)
  }

  let uiRulePatch = matchPath(pathname, '/api/ui/firewall/rules/:ruleId')
  if (uiRulePatch && method === 'PATCH') {
    const payload = parseBody(body)
    const rule = state.firewall.rules.find((item) => String(item.id) === String(uiRulePatch.ruleId))
    if (!rule) return asJson({ ok: false, message: 'Rule not found.' }, 404)
    Object.assign(rule, payload, { updatedAt: nowIso() })
    return asJson({ ok: true, rule })
  }

  let uiRuleDelete = matchPath(pathname, '/api/ui/firewall/rules/:ruleId')
  if (uiRuleDelete && method === 'DELETE') {
    state.firewall.rules = state.firewall.rules.filter((item) => String(item.id) !== String(uiRuleDelete.ruleId))
    return asJson({ ok: true, ruleId: uiRuleDelete.ruleId })
  }

  if (pathname === '/api/ui/firewall/context-leakage/documents' && method === 'POST') {
    const payload = parseBody(body)
    const incoming = extractUploadedDocuments(payload)
    const policyMode = String(payload?.policyMode ?? 'strict')
    const docs = incoming.map((document) => ({
      id: state.nextId('leakage'),
      name: document.name,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
      preview: String(document.content ?? '').slice(0, 300),
      uploadedAt: nowIso(),
      policyMode,
    }))
    state.ui.leakageUploads = [...docs, ...state.ui.leakageUploads].slice(0, 200)
    return asJson({
      ok: true,
      firewallObjectId: 'context-leakage-global',
      policyMode,
      documents: docs,
      uploads: state.ui.leakageUploads,
    }, 201)
  }

  if (pathname === '/api/ui/firewall/context-leakage/documents' && method === 'GET') {
    return asJson({
      firewallObjectId: 'context-leakage-global',
      documents: state.ui.leakageUploads.map((item) => ({
        id: item.id,
        name: item.name,
        mimeType: item.mimeType ?? 'application/octet-stream',
        sizeBytes: Number(item.sizeBytes ?? item.size ?? 0),
        preview: item.preview ?? '',
        uploadedAt: item.uploadedAt ?? nowIso(),
      })),
    })
  }

  if (pathname === '/api/ui/marketplace/dispatch' && method === 'POST') {
    const payload = parseBody(body)
    const item = {
      id: state.nextId('dispatch'),
      app: payload.app ?? payload.provider ?? 'unknown-app',
      tool: payload.tool ?? payload.kind ?? 'unknown-tool',
      target: payload.target ?? '',
      status: 'queued',
      createdAt: nowIso(),
    }
    state.ui.dispatchEvents.unshift(item)
    return asJson({
      ok: true,
      result: {
        dispatchId: item.id,
        app: item.app,
        tool: item.tool,
        output: 'Simulated downstream output',
      },
      dispatchEvents: state.ui.dispatchEvents,
    })
  }

  if (pathname === '/api/ui/chat/send' && method === 'POST') {
    const payload = parseBody(body)
    return asJson({
      ok: true,
      reply: `Monitoring agent: simulated answer for \"${String(payload.message ?? payload.prompt ?? '').trim()}\".`,
      source: 'fake-ui-chat',
    })
  }

  if (pathname === '/api/ui/intervention/pause' && method === 'POST') {
    const payload = parseBody(body)
    const execution = getExecution(state, payload.executionId)
    if (!execution) return asJson({ ok: false, message: 'Execution not found.' }, 404)
    execution.status = 'paused'
    execution.updatedAt = nowIso()
    return asJson({ ok: true, execution })
  }

  if (pathname === '/api/ui/intervention/resume' && method === 'POST') {
    const payload = parseBody(body)
    const execution = getExecution(state, payload.executionId)
    if (!execution) return asJson({ ok: false, message: 'Execution not found.' }, 404)
    execution.status = 'running'
    execution.updatedAt = nowIso()
    return asJson({ ok: true, execution })
  }

  if (pathname === '/api/ui/intervention/cancel' && method === 'POST') {
    const payload = parseBody(body)
    const execution = getExecution(state, payload.executionId)
    if (execution) {
      execution.status = 'canceled'
      execution.completedAt = nowIso()
      execution.updatedAt = nowIso()
      return asJson({ ok: true, execution })
    }
    return asJson({ ok: true, canceled: true, sessionId: payload.sessionId ?? null })
  }

  if (pathname === '/api/ui/intervention/block-rule' && method === 'POST') {
    const payload = parseBody(body)
    const target = String(payload.target ?? '').trim()
    if (!target) return asJson({ ok: false, message: 'Target is required.' }, 400)
    const rule = normalizeUiRule({
      id: state.nextId('rule'),
      condition: `target equals ${target}`,
      decision: 'block + escalate',
      status: 'enabled',
      source: 'intervention',
      createdAt: nowIso(),
      createdBy: payload.createdBy ?? state.user.email,
      reason: payload.reason ?? '',
    })
    state.firewall.rules.unshift(rule)
    return asJson({ ok: true, rule })
  }

  if (pathname === '/api/ui/refresh' && method === 'POST') {
    return asJson({ ok: true, refreshedAt: nowIso() })
  }

  return null
}

function handleDemo(pathname, method, state, body) {
  if (!pathname.startsWith('/api/demo')) return null

  if (pathname === '/api/demo/sessions' && method === 'GET') {
    return asJson({ sessions: state.demos.sessions })
  }

  if (pathname === '/api/demo/start' && method === 'POST') {
    const id = state.nextId('demo-session')
    const item = { id, sessionId: id, status: 'active', createdAt: nowIso() }
    state.demos.sessions.unshift(item)
    return asJson({ ok: true, sessionId: id, session: item })
  }

  if (method === 'POST') {
    return asJson({ ok: true, action: pathname.split('/').pop(), received: parseBody(body), at: nowIso() })
  }

  return null
}

function handleDownstream(pathname, method, state, body) {
  if (pathname === '/api/downstream/apps' && method === 'GET') {
    return asJson({ apps: state.downstream.apps })
  }
  if (pathname === '/api/downstream/tools' && method === 'GET') {
    return asJson({ tools: state.downstream.tools })
  }
  if (pathname === '/api/downstream/dispatch' && method === 'POST') {
    const payload = parseBody(body)
    return asJson({ ok: true, result: { app: payload.app, tool: payload.tool, output: 'Simulated downstream output', traceId: `trace-${Date.now()}` } })
  }
  return null
}

function handleCommunity(pathname, method, state) {
  if (pathname === '/api/community/stats' && method === 'GET') {
    return asJson(state.community.stats)
  }
  if (pathname === '/api/community/traces' && method === 'GET') {
    return asJson({ traces: state.community.traces })
  }
  return null
}

function handleIntegrations(pathname, method, state) {
  if (pathname === '/api/integrations/catalog' && method === 'GET') {
    return asJson({ integrations: state.integrations.catalog })
  }

  if (pathname === '/api/integrations' && method === 'GET') {
    return asJson({ integrations: state.integrations.connected })
  }

  let params = matchPath(pathname, '/api/integrations/:provider/connect')
  if (params && method === 'POST') {
    const provider = params.provider
    const existing = state.integrations.connected.find((c) => c.provider === provider)
    if (!existing) {
      const cat = state.integrations.catalog.find((c) => c.provider === provider)
      state.integrations.connected.push({ id: provider, provider, name: cat?.name || provider, status: 'connected' })
    } else {
      existing.status = 'connected'
    }
    return asJson({ ok: true, provider, status: 'connected' })
  }

  params = matchPath(pathname, '/api/integrations/:provider/disconnect')
  if (params && method === 'POST') {
    const provider = params.provider
    state.integrations.connected = state.integrations.connected.filter((c) => c.provider !== provider)
    return asJson({ ok: true, provider, status: 'disconnected' })
  }

  params = matchPath(pathname, '/api/integrations/:provider/oauth/start')
  if (params && method === 'GET') {
    return asJson({ ok: true, provider: params.provider, url: `https://fake-oauth/${params.provider}` })
  }

  params = matchPath(pathname, '/api/integrations/:provider/oauth/:action')
  if (params && method === 'POST') {
    return asJson({ ok: true, provider: params.provider, action: params.action, status: 'completed' })
  }

  return null
}

function handleOrg(pathname, method, state, body) {
  if (pathname === '/api/org' && method === 'GET') {
    return asJson({ orgs: state.org.orgs })
  }

  if (pathname === '/api/org' && method === 'POST') {
    const payload = parseBody(body)
    const id = state.nextId('org')
    const org = {
      id,
      orgId: id,
      name: payload.name || `Org ${id}`,
      plan: 'pro',
      status: 'active',
      memberCount: 1,
      createdAt: nowIso(),
    }
    state.org.orgs.push(org)
    state.org.membersByOrg[id] = [{ id: state.nextId('member'), userId: state.user.id, email: state.user.email, username: state.user.username, role: 'owner' }]
    state.org.rolesByOrg[id] = [{ id: 'role-owner', roleId: 'role-owner', name: 'owner', description: 'Full access' }]
    state.org.invitesByOrg[id] = []
    state.org.serviceAccountsByOrg[id] = []
    state.org.serviceAccountKeys[id] = {}
    return asJson({ ok: true, org })
  }

  let params = matchPath(pathname, '/api/org/:orgId')
  if (params && method === 'PATCH') {
    const payload = parseBody(body)
    const org = ensureOrg(state, params.orgId)
    if (!org) return asJson({ ok: false, error: 'Org not found' }, 404)
    Object.assign(org, payload)
    return asJson({ ok: true, org })
  }

  params = matchPath(pathname, '/api/org/:orgId')
  if (params && method === 'GET') {
    const org = ensureOrg(state, params.orgId)
    if (!org) return asJson({ ok: false, error: 'Org not found' }, 404)
    return asJson(org)
  }

  params = matchPath(pathname, '/api/org/:orgId/members')
  if (params && method === 'GET') {
    const orgId = resolveOrgId(state, params.orgId)
    return asJson({ members: state.org.membersByOrg[orgId] || [] })
  }

  params = matchPath(pathname, '/api/org/:orgId/members/:userId')
  if (params && method === 'DELETE') {
    const orgId = resolveOrgId(state, params.orgId)
    const list = state.org.membersByOrg[orgId] || []
    state.org.membersByOrg[orgId] = list.filter((m) => String(m.userId) !== String(params.userId))
    return asJson({ ok: true })
  }

  params = matchPath(pathname, '/api/org/:orgId/invites')
  if (params && method === 'GET') {
    const orgId = resolveOrgId(state, params.orgId)
    return asJson({ invites: state.org.invitesByOrg[orgId] || [] })
  }

  params = matchPath(pathname, '/api/org/:orgId/invites')
  if (params && method === 'POST') {
    const payload = parseBody(body)
    const invite = {
      id: state.nextId('invite'),
      inviteId: state.nextId('invite-id'),
      email: payload.email || 'unknown@mayple.dev',
      status: 'pending',
      createdAt: nowIso(),
    }
    const orgId = resolveOrgId(state, params.orgId)
    const list = state.org.invitesByOrg[orgId] || []
    list.push(invite)
    state.org.invitesByOrg[orgId] = list
    return asJson({ ok: true, invite })
  }

  params = matchPath(pathname, '/api/org/invites/:inviteId/accept')
  if (params && method === 'POST') {
    Object.keys(state.org.invitesByOrg).forEach((orgId) => {
      state.org.invitesByOrg[orgId] = (state.org.invitesByOrg[orgId] || []).map((inv) =>
        String(inv.inviteId) === String(params.inviteId) ? { ...inv, status: 'accepted' } : inv,
      )
    })
    return asJson({ ok: true, inviteId: params.inviteId, status: 'accepted' })
  }

  params = matchPath(pathname, '/api/org/:orgId/roles')
  if (params && method === 'GET') {
    const orgId = resolveOrgId(state, params.orgId)
    return asJson({ roles: state.org.rolesByOrg[orgId] || [] })
  }

  params = matchPath(pathname, '/api/org/:orgId/roles/:roleId/assign')
  if (params && method === 'POST') {
    const payload = parseBody(body)
    const orgId = resolveOrgId(state, params.orgId)
    const members = state.org.membersByOrg[orgId] || []
    const member = members.find((m) => String(m.userId) === String(payload.userId))
    if (member) member.role = params.roleId
    return asJson({ ok: true, userId: payload.userId, roleId: params.roleId })
  }

  params = matchPath(pathname, '/api/org/:orgId/service-accounts')
  if (params && method === 'GET') {
    const orgId = resolveOrgId(state, params.orgId)
    const list = state.org.serviceAccountsByOrg[orgId] || []
    return asJson({ items: list, accounts: list })
  }

  params = matchPath(pathname, '/api/org/:orgId/service-accounts')
  if (params && method === 'POST') {
    const payload = parseBody(body)
    const account = {
      id: state.nextId('sa'),
      name: payload.name || `service-account-${Date.now()}`,
      description: payload.description || '',
      keyCount: 0,
      createdAt: nowIso(),
    }
    const orgId = resolveOrgId(state, params.orgId)
    if (!state.org.serviceAccountsByOrg[orgId]) state.org.serviceAccountsByOrg[orgId] = []
    state.org.serviceAccountsByOrg[orgId].push(account)
    if (!state.org.serviceAccountKeys[orgId]) state.org.serviceAccountKeys[orgId] = {}
    state.org.serviceAccountKeys[orgId][account.id] = []
    return asJson({ ok: true, account })
  }

  params = matchPath(pathname, '/api/org/:orgId/service-accounts/:accountId/keys')
  if (params && method === 'GET') {
    const orgId = resolveOrgId(state, params.orgId)
    const keys = state.org.serviceAccountKeys[orgId]?.[params.accountId] || []
    return asJson({ items: keys, keys })
  }

  params = matchPath(pathname, '/api/org/:orgId/service-accounts/:accountId/keys')
  if (params && method === 'POST') {
    const orgId = resolveOrgId(state, params.orgId)
    if (!state.org.serviceAccountKeys[orgId]) state.org.serviceAccountKeys[orgId] = {}
    if (!state.org.serviceAccountKeys[orgId][params.accountId]) state.org.serviceAccountKeys[orgId][params.accountId] = []
    const key = {
      id: state.nextId('sak'),
      keyId: state.nextId('sak-id'),
      createdAt: nowIso(),
    }
    state.org.serviceAccountKeys[orgId][params.accountId].push(key)
    const account = (state.org.serviceAccountsByOrg[orgId] || []).find((a) => a.id === params.accountId)
    if (account) account.keyCount = (account.keyCount || 0) + 1
    return asJson({ ok: true, key: randomToken('msk'), secret: randomToken('msk'), value: randomToken('msk') })
  }

  params = matchPath(pathname, '/api/org/:orgId/service-accounts/:accountId/keys/:keyId')
  if (params && method === 'DELETE') {
    const orgId = resolveOrgId(state, params.orgId)
    if (!state.org.serviceAccountKeys[orgId]?.[params.accountId]) {
      return asJson({ ok: true })
    }
    const keys = state.org.serviceAccountKeys[orgId][params.accountId] || []
    state.org.serviceAccountKeys[orgId][params.accountId] = keys.filter((k) => String(k.id) !== String(params.keyId) && String(k.keyId) !== String(params.keyId))
    const account = (state.org.serviceAccountsByOrg[orgId] || []).find((a) => a.id === params.accountId)
    if (account) account.keyCount = Math.max(0, (account.keyCount || 1) - 1)
    return asJson({ ok: true })
  }

  return null
}

function handleUser(pathname, method, state, body) {
  if (pathname === '/api/user/profile' && method === 'GET') {
    return asJson({ user: state.user, subscription: state.subscription })
  }

  if (pathname === '/api/user/change-password' && method === 'POST') {
    return asJson({ ok: true })
  }

  if (pathname === '/api/user/api-keys' && method === 'GET') {
    return asJson({ items: state.userApiKeys })
  }

  if (pathname === '/api/user/api-keys' && method === 'POST') {
    const payload = parseBody(body)
    const key = {
      id: state.nextId('uak'),
      keyId: state.nextId('uak-id'),
      name: payload.name || 'new-api-key',
      fingerprint: randomToken('fp').slice(0, 10),
      createdAt: nowIso(),
      expiresAt: payload.expiresAt || null,
    }
    state.userApiKeys.unshift(key)
    return asJson({ ok: true, key: { ...key, token: randomToken('muk') } })
  }

  const params = matchPath(pathname, '/api/user/api-keys/:keyId')
  if (params && method === 'DELETE') {
    state.userApiKeys = state.userApiKeys.filter((k) => String(k.id) !== String(params.keyId) && String(k.keyId) !== String(params.keyId))
    return asJson({ ok: true })
  }

  return null
}

function handleUsageAndBilling(pathname, method, state, searchParams, body) {
  if (pathname === '/api/entitlements' && method === 'GET') {
    return asJson({ ...state.usage.entitlements })
  }

  if (pathname === '/api/usage/summary' && method === 'GET') {
    return asJson({ ...state.usage.summary, summary: { ...state.usage.summary } })
  }

  if (pathname === '/api/usage/timeseries' && method === 'GET') {
    const window = searchParams.get('window') || '24h'
    return asJson({ window, ...(state.usage.timeseries[window] || state.usage.timeseries['24h']) })
  }

  if (pathname === '/api/limits' && method === 'GET') {
    return asJson({ ...state.usage.limits, limits: { ...state.usage.limits } })
  }

  if (pathname === '/api/limits/override' && method === 'POST') {
    const payload = parseBody(body)
    Object.assign(state.usage.limits, payload)
    return asJson({ ok: true, limits: state.usage.limits })
  }

  if (pathname === '/api/billing/subscription' && method === 'GET') {
    return asJson({ ...state.subscription })
  }

  if (pathname === '/api/billing/subscription/cancel' && method === 'POST') {
    state.subscription.status = 'canceled'
    return asJson({ ok: true, status: state.subscription.status })
  }

  if (pathname === '/api/billing/subscription/resume' && method === 'POST') {
    state.subscription.status = 'active'
    return asJson({ ok: true, status: state.subscription.status })
  }

  if (pathname === '/api/billing/portal-session' && method === 'POST') {
    return asJson({ ok: true, url: 'https://billing.example.com/portal/fake' })
  }

  if (pathname === '/api/billing/create-checkout-session' && method === 'POST') {
    return asJson({ ok: true, url: 'https://billing.example.com/checkout/fake' })
  }

  if (pathname === '/api/billing/invoices' && method === 'GET') {
    return asJson({ invoices: state.invoices, items: state.invoices })
  }

  return null
}

function handleNotifications(pathname, method, state, searchParams) {
  if (pathname === '/api/notifications/unread-count' && method === 'GET') {
    return asJson({ count: unreadCount(state) })
  }

  if (pathname === '/api/notifications/preferences' && method === 'GET') {
    return asJson(state.notificationPreferences)
  }

  if (pathname === '/api/notifications/preferences' && method === 'POST') {
    return asJson({ ok: true, ...state.notificationPreferences })
  }

  if (pathname === '/api/notifications/read-all' && method === 'POST') {
    state.notifications.forEach((n) => {
      n.read = true
    })
    return asJson({ ok: true })
  }

  const markRead = matchPath(pathname, '/api/notifications/:id/read')
  if (markRead && method === 'POST') {
    markNotificationRead(state, markRead.id)
    return asJson({ ok: true })
  }

  if (pathname === '/api/notifications' && method === 'GET') {
    const limitRaw = searchParams.get('limit')
    const limit = Number.isFinite(Number(limitRaw)) ? Number(limitRaw) : state.notifications.length
    const items = state.notifications.slice(0, Math.max(1, limit))
    return asJson({ items, notifications: items })
  }

  return null
}

function handleSearch(pathname, method, state, searchParams) {
  if (pathname !== '/api/search' || method !== 'GET') return null
  const q = String(searchParams.get('q') || '').toLowerCase().trim()
  const results = state.search.recent.filter((item) => {
    if (!q) return true
    return String(item.title).toLowerCase().includes(q) || String(item.description).toLowerCase().includes(q)
  })
  return asJson({ results })
}

function handleAgentsRunsSessions(pathname, method, state, searchParams, body) {
  if (pathname === '/api/agents' && method === 'GET') {
    const pinnedOnly = searchParams.get('pinned') === 'true'
    const items = pinnedOnly ? state.agents.filter((a) => a.pinned) : state.agents
    return asJson({ items })
  }

  if (pathname === '/api/agents' && method === 'POST') {
    const payload = parseBody(body)
    const id = state.nextId('agent')
    const agent = {
      id,
      agentId: id,
      name: payload.name || `Agent ${id}`,
      description: payload.description || 'Generated in fake mode',
      status: 'active',
      riskTier: 'medium',
      riskScore: 55,
      model: 'gpt-4.1',
      pinned: false,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }
    state.agents.unshift(agent)
    return asJson(agent)
  }

  let params = matchPath(pathname, '/api/agents/:agentId')
  if (params && method === 'GET') {
    const agent = state.agents.find((a) => String(a.id) === String(params.agentId) || String(a.agentId) === String(params.agentId))
    if (!agent) return asJson({ ok: false, error: 'Agent not found' }, 404)
    return asJson(agent)
  }

  params = matchPath(pathname, '/api/agents/:agentId/sessions')
  if (params && method === 'GET') {
    const items = listSessionsByAgent(state, params.agentId)
    return asJson({ items })
  }

  params = matchPath(pathname, '/api/agents/:agentId/run')
  if (params && method === 'POST') {
    const payload = parseBody(body)
    const created = createRunAndSession(state, params.agentId, payload)
    return asJson({
      ok: true,
      sessionId: created.session.sessionId,
      runId: created.run.runId,
      reply: created.reply,
      output: created.reply,
      status: 'completed',
      type: created.run.type,
      cost: created.run.cost,
      parentRunId: null,
      childRunIds: [],
    })
  }

  if (pathname === '/api/openclaw/agent/status' && method === 'GET') {
    return asJson({ status: 'online', state: 'active', version: 'fake-1.0.0', healthy: true })
  }

  if ((pathname === '/api/openclaw/agent/turn' || pathname === '/api/openclaw/agent/longform') && method === 'POST') {
    const payload = parseBody(body)
    const created = createRunAndSession(state, 'agent-1', payload)
    return asJson({ ok: true, reply: created.reply, runId: created.run.runId, sessionId: created.session.sessionId, output: { reply: created.reply } })
  }

  if (pathname === '/api/openclaw/agent/sessions' && method === 'GET') {
    const sorted = [...state.sessions].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    const { page, nextCursor } = paginate(sorted, searchParams)
    return asJson({ sessions: page, items: page, nextCursor })
  }

  params = matchPath(pathname, '/api/openclaw/agent/sessions/:sessionId')
  if (params && method === 'GET') {
    const session = state.sessions.find((s) => String(s.sessionId) === String(params.sessionId) || String(s.id) === String(params.sessionId))
    if (!session) return asJson({ ok: false, error: 'Session not found' }, 404)
    return asJson({ session })
  }

  params = matchPath(pathname, '/api/openclaw/agent/sessions/:sessionId/cancel')
  if (params && method === 'POST') {
    const session = state.sessions.find((s) => String(s.sessionId) === String(params.sessionId) || String(s.id) === String(params.sessionId))
    if (session) {
      session.status = 'canceled'
      session.completedAt = nowIso()
    }
    return asJson({ ok: true })
  }

  params = matchPath(pathname, '/api/openclaw/agent/runs/:runId/artifacts')
  if (params && method === 'GET') {
    const run = state.runs.find((r) => String(r.runId) === String(params.runId) || String(r.id) === String(params.runId))
    return asJson({ run: { artifacts: run?.artifacts || [] }, artifacts: run?.artifacts || [] })
  }

  if (pathname === '/api/runs' && method === 'GET') {
    return asJson({ items: state.runs, runs: state.runs })
  }

  params = matchPath(pathname, '/api/runs/:runId')
  if (params && method === 'GET') {
    const run = state.runs.find((r) => String(r.runId) === String(params.runId) || String(r.id) === String(params.runId))
    if (!run) return asJson({ ok: false, error: 'Run not found' }, 404)
    return asJson({ run, ...run })
  }

  params = matchPath(pathname, '/api/runs/:runId/timeline')
  if (params && method === 'GET') {
    const run = state.runs.find((r) => String(r.runId) === String(params.runId) || String(r.id) === String(params.runId))
    return asJson({ events: run?.timeline || [], timeline: run?.timeline || [] })
  }

  params = matchPath(pathname, '/api/runs/:runId/children')
  if (params && method === 'GET') {
    const run = state.runs.find((r) => String(r.runId) === String(params.runId) || String(r.id) === String(params.runId))
    return asJson({ children: run?.children || [] })
  }

  return null
}

function handleHitlAndOps(pathname, method, state, body) {
  if (pathname === '/admin/api/approvals' && method === 'GET') {
    return asJson({ approvals: state.hitl.adminApprovals })
  }

  if (pathname === '/admin/api/approvals/decision' && method === 'POST') {
    const payload = parseBody(body)
    state.hitl.adminApprovals = state.hitl.adminApprovals.filter(
      (a) => !(String(a.traceId) === String(payload.traceId) && String(a.stepIndex) === String(payload.stepIndex)),
    )
    return asJson({ ok: true })
  }

  if (pathname === '/api/hitl/approvals' && method === 'GET') {
    return asJson({ approvals: state.hitl.gatewayApprovals, count: state.hitl.gatewayApprovals.length })
  }

  if (pathname === '/api/hitl/approvals/decision' && method === 'POST') {
    const payload = parseBody(body)
    state.hitl.gatewayApprovals = state.hitl.gatewayApprovals.filter(
      (a) => !(String(a.traceId) === String(payload.traceId) && String(a.stepIndex) === String(payload.stepIndex)),
    )
    return asJson({ ok: true })
  }

  if (pathname === '/api/openclaw/modifier/capabilities' && method === 'GET') {
    return asJson({
      supportsStepUp: true,
      supportsReasonCodes: true,
      maxBatchSize: 10,
    })
  }

  if (pathname === '/api/openclaw/modifier/exec' && method === 'POST') {
    return asJson({ ok: true, executionId: state.nextId('modifier-exec'), result: 'Simulated modifier execution accepted.' })
  }

  if (pathname === '/api/operations/orchestrations/approvals' && method === 'GET') {
    return asJson({ approvals: state.hitl.modifierApprovals })
  }

  let params = matchPath(pathname, '/api/operations/orchestrations/approvals/:approvalId')
  if (params && method === 'GET') {
    const item = state.hitl.modifierApprovals.find((a) => String(a.approvalId) === String(params.approvalId))
    return asJson(item || { approvalId: params.approvalId, status: 'pending' })
  }

  params = matchPath(pathname, '/api/operations/orchestrations/approvals/:approvalId/decision')
  if (params && method === 'POST') {
    state.hitl.modifierApprovals = state.hitl.modifierApprovals.filter((a) => String(a.approvalId) !== String(params.approvalId))
    return asJson({ ok: true, approvalId: params.approvalId })
  }

  if (pathname === '/api/operations/orchestrations/escalation' && method === 'GET') {
    return asJson({ items: state.operations.escalation, escalations: state.operations.escalation })
  }

  if (pathname === '/api/operations/orchestrations/escalation/escalate' && method === 'POST') {
    const payload = parseBody(body)
    const item = { id: state.nextId('esc'), approvalId: payload.approvalId || state.nextId('approval'), status: 'pending', createdAt: nowIso() }
    state.operations.escalation.unshift(item)
    return asJson({ ok: true, escalation: item })
  }

  params = matchPath(pathname, '/api/operations/orchestrations/escalation/:approvalId/history')
  if (params && method === 'GET') {
    return asJson({ history: [{ status: 'created', timestamp: nowIso() }, { status: 'pending', timestamp: nowIso() }], approvalId: params.approvalId })
  }

  if (pathname === '/api/operations/orchestrations/break-glass' && method === 'GET') {
    return asJson({ items: state.operations.breakGlass })
  }

  if (pathname === '/api/operations/orchestrations/break-glass' && method === 'POST') {
    const payload = parseBody(body)
    const item = { id: state.nextId('bg'), actor: state.user.email, status: 'open', reason: payload.reason || 'Manual request', createdAt: nowIso() }
    state.operations.breakGlass.unshift(item)
    return asJson({ ok: true, item })
  }

  params = matchPath(pathname, '/api/operations/orchestrations/break-glass/:id/review')
  if (params && method === 'POST') {
    const payload = parseBody(body)
    const item = state.operations.breakGlass.find((v) => String(v.id) === String(params.id))
    if (item) item.status = payload?.action || 'reviewed'
    return asJson({ ok: true, id: params.id, status: item?.status || 'reviewed' })
  }

  if (pathname === '/api/operations/orchestrations/step-up/status' && method === 'GET') {
    return asJson(state.operations.stepUp)
  }

  if (pathname === '/api/operations/orchestrations/step-up/challenge' && method === 'POST') {
    const payload = parseBody(body)
    const challenge = { challengeId: state.nextId('challenge'), method: payload.method || 'totp', createdAt: nowIso(), status: 'pending' }
    state.operations.stepUp.activeChallenges.push(challenge)
    return asJson({ ok: true, ...challenge })
  }

  if (pathname === '/api/operations/orchestrations/step-up/verify' && method === 'POST') {
    return asJson({ ok: true, verified: true })
  }

  if (pathname === '/api/operations/orchestrations/tenant-bindings' && method === 'GET') {
    return asJson({ items: state.operations.tenantBindings, bindings: state.operations.tenantBindings })
  }

  if (pathname === '/api/operations/orchestrations/tenant-bindings' && method === 'POST') {
    const payload = parseBody(body)
    const item = { id: state.nextId('tb'), tenantId: payload.tenantId || state.nextId('tenant'), target: payload.target || 'org-1' }
    state.operations.tenantBindings.push(item)
    return asJson({ ok: true, item })
  }

  if (pathname === '/api/operations/orchestrations/tenant-bindings' && method === 'DELETE') {
    state.operations.tenantBindings = []
    return asJson({ ok: true })
  }

  if (pathname === '/api/operations/orchestrations/tenant-scope' && method === 'GET') {
    return asJson(state.operations.tenantScope)
  }

  if (pathname === '/api/operations/orchestrations/org/tree' && method === 'GET') {
    return asJson(state.operations.orgTree)
  }

  let orgParams = matchPath(pathname, '/api/operations/orchestrations/org/:orgId')
  if (orgParams && method === 'GET') {
    const org = ensureOrg(state, orgParams.orgId)
    return asJson(org || { id: orgParams.orgId, name: 'Unknown Org' })
  }

  orgParams = matchPath(pathname, '/api/operations/orchestrations/org/:orgId/lifecycle')
  if (orgParams && method === 'GET') {
    return asJson(state.operations.orgLifecycle[orgParams.orgId] || { status: 'active', updatedAt: nowIso() })
  }

  if (pathname === '/api/operations/orchestrations/org' && method === 'POST') {
    const payload = parseBody(body)
    const id = payload.id || state.nextId('org')
    state.operations.orgTree.children.push({ id, name: payload.name || `Org ${id}`, children: [] })
    state.operations.orgLifecycle[id] = { status: 'active', updatedAt: nowIso() }
    return asJson({ ok: true, id })
  }

  orgParams = matchPath(pathname, '/api/operations/orchestrations/org/:orgId')
  if (orgParams && method === 'DELETE') {
    state.operations.orgTree.children = state.operations.orgTree.children.filter((c) => String(c.id) !== String(orgParams.orgId))
    delete state.operations.orgLifecycle[orgParams.orgId]
    return asJson({ ok: true })
  }

  return null
}

function handleObservability(pathname, method, state, searchParams, body) {
  if (!pathname.startsWith('/api/observability/orchestrations')) return null

  if (pathname === '/api/observability/orchestrations/summary' && method === 'GET') {
    return asJson(state.observability.summary)
  }

  if (pathname === '/api/observability/orchestrations/slo' && method === 'GET') {
    return asJson(state.observability.slo)
  }

  if (pathname === '/api/observability/orchestrations/audit-log' && method === 'GET') {
    const offset = Number(searchParams.get('offset') || 0)
    const limit = Number(searchParams.get('limit') || 100)
    const entries = state.observability.auditLog.slice(offset, offset + limit)
    const nextOffset = offset + limit < state.observability.auditLog.length ? offset + limit : null
    return asJson({ entries, items: entries, events: entries, nextOffset })
  }

  if (pathname === '/api/observability/orchestrations/audit-chain' && method === 'GET') {
    return asJson({ items: state.observability.auditChain, chain: state.observability.auditChain })
  }

  if (pathname === '/api/observability/orchestrations/audit-chain/verify' && method === 'GET') {
    return asJson({ ok: true, verified: true, checked: state.observability.auditChain.length })
  }

  if (pathname === '/api/observability/orchestrations/dead-letter' && method === 'GET') {
    return asJson({ items: state.observability.deadLetter })
  }

  let params = matchPath(pathname, '/api/observability/orchestrations/dead-letter/:eventId/replay')
  if (params && method === 'POST') {
    state.observability.deadLetter = state.observability.deadLetter.filter((e) => String(e.eventId || e.id) !== String(params.eventId))
    return asJson({ ok: true, replayed: params.eventId })
  }

  if (pathname === '/api/observability/orchestrations/retention' && method === 'GET') {
    return asJson({ retentionDays: state.observability.retentionDays })
  }

  if (pathname === '/api/observability/orchestrations/retention' && method === 'POST') {
    const payload = parseBody(body)
    if (Number.isFinite(Number(payload.retentionDays))) {
      state.observability.retentionDays = Number(payload.retentionDays)
    }
    return asJson({ ok: true, retentionDays: state.observability.retentionDays })
  }

  if (pathname === '/api/observability/orchestrations/retention/enforce' && method === 'POST') {
    return asJson({ ok: true, removed: 12, retentionDays: state.observability.retentionDays })
  }

  if (pathname === '/api/observability/orchestrations/export' && method === 'POST') {
    const payload = parseBody(body)
    const format = payload.format || 'json'
    return asJson({ ok: true, format, total: state.observability.auditLog.length, items: state.observability.auditLog.slice(0, 20), message: `Exported ${state.observability.auditLog.length} events.` })
  }

  if (pathname === '/api/observability/orchestrations/flush' && method === 'POST') {
    return asJson({ ok: true, status: 'flushed', message: 'Outbox flushed.' })
  }

  if (pathname === '/api/observability/orchestrations/alert-webhooks' && method === 'GET') {
    return asJson({ items: state.observability.webhooks, webhooks: state.observability.webhooks })
  }

  if (pathname === '/api/observability/orchestrations/alert-webhooks' && method === 'POST') {
    const payload = parseBody(body)
    const hook = {
      id: state.nextId('wh'),
      url: payload.url || 'https://example.com/hook',
      events: payload.events || ['alert.*'],
      active: true,
      createdAt: nowIso(),
    }
    state.observability.webhooks.push(hook)
    state.observability.webhookDeliveries[hook.id] = []
    return asJson({ ok: true, webhook: hook })
  }

  params = matchPath(pathname, '/api/observability/orchestrations/alert-webhooks/:id')
  if (params && method === 'DELETE') {
    state.observability.webhooks = state.observability.webhooks.filter((w) => String(w.id) !== String(params.id))
    delete state.observability.webhookDeliveries[params.id]
    return asJson({ ok: true })
  }

  params = matchPath(pathname, '/api/observability/orchestrations/alert-webhooks/:id/deliveries')
  if (params && method === 'GET') {
    return asJson({ items: state.observability.webhookDeliveries[params.id] || [] })
  }

  params = matchPath(pathname, '/api/observability/orchestrations/executions/:executionId/fork')
  if (params && method === 'POST') {
    const existing = getExecution(state, params.executionId)
    const cloneId = state.nextId('exec-fork')
    const fork = {
      ...(existing || {
        orchestrationId: state.orchestrations[0]?.id,
        graph: { nodes: [], edges: [], approvals: [] },
        timeline: [],
        mutations: [],
      }),
      executionId: cloneId,
      id: cloneId,
      status: 'running',
      createdAt: nowIso(),
      startedAt: nowIso(),
      updatedAt: nowIso(),
      completedAt: null,
    }
    state.orchestrationExecutions.unshift(fork)
    return asJson({ ok: true, executionId: cloneId, forkedFrom: params.executionId })
  }

  return null
}

function handleToolsAndCli(pathname, method, state, body) {
  if (pathname === '/api/tools/registry' && method === 'GET') {
    return asJson({ items: state.tools.registry })
  }

  if (pathname === '/api/tools/registry' && method === 'POST') {
    const payload = parseBody(body)
    const item = {
      id: state.nextId('tool'),
      toolId: state.nextId('tool-id'),
      name: payload.name || `tool-${Date.now()}`,
      description: payload.description || 'Custom tool',
      createdAt: nowIso(),
    }
    state.tools.registry.push(item)
    return asJson({ ok: true, tool: item })
  }

  let params = matchPath(pathname, '/api/tools/registry/:toolId')
  if (params && method === 'GET') {
    const item = state.tools.registry.find((t) => String(t.id) === String(params.toolId) || String(t.toolId) === String(params.toolId))
    return asJson(item || { toolId: params.toolId, name: 'Unknown tool' })
  }

  params = matchPath(pathname, '/api/tools/registry/:toolId')
  if (params && method === 'PATCH') {
    const payload = parseBody(body)
    const item = state.tools.registry.find((t) => String(t.id) === String(params.toolId) || String(t.toolId) === String(params.toolId))
    if (item) Object.assign(item, payload)
    return asJson({ ok: true, tool: item || null })
  }

  if (pathname === '/api/tools/policies' && method === 'GET') {
    return asJson({ items: state.tools.policies, policies: state.tools.policies })
  }

  if (pathname === '/api/tools/policies/validate' && method === 'POST') {
    return asJson({ ok: true, valid: true, warnings: [] })
  }

  if (pathname === '/api/tools/executions' && method === 'GET') {
    return asJson({ items: state.tools.executions })
  }

  params = matchPath(pathname, '/api/tools/executions/:executionId')
  if (params && method === 'GET') {
    const item = state.tools.executions.find((e) => String(e.id) === String(params.executionId) || String(e.executionId) === String(params.executionId))
    return asJson(item || { executionId: params.executionId, status: 'unknown' })
  }

  if (pathname === '/api/openclaw/cli/tools' && method === 'GET') {
    return asJson({ tools: state.tools.cliTools })
  }

  if (pathname === '/api/openclaw/cli/catalog' && method === 'GET') {
    return asJson({ items: state.tools.cliCatalog, catalog: state.tools.cliCatalog })
  }

  params = matchPath(pathname, '/api/openclaw/cli/:toolName/help')
  if (params && method === 'GET') {
    return asJson({ tool: params.toolName, usage: `${params.toolName} --help`, description: 'Simulated CLI help output' })
  }

  params = matchPath(pathname, '/api/openclaw/cli/:toolName/exec')
  if (params && method === 'POST') {
    const payload = parseBody(body)
    return asJson({ ok: true, tool: params.toolName, input: payload, output: `Simulated CLI execution for ${params.toolName}` })
  }

  if (pathname === '/api/openclaw/cli/exec' && method === 'POST') {
    const payload = parseBody(body)
    return asJson({ ok: true, input: payload, output: 'Simulated generic CLI execution output' })
  }

  return null
}

function handleOrchestrations(pathname, method, state, searchParams, body) {
  if (pathname === '/api/orchestrations' && method === 'GET') {
    return asJson({ items: state.orchestrations })
  }

  if (pathname === '/api/orchestrations' && method === 'POST') {
    const payload = parseBody(body)
    const id = state.nextId('orch')
    const item = {
      id,
      orchestrationId: id,
      name: payload.name || `Orchestration ${id}`,
      description: payload.description || '',
      status: 'draft',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      nodes: [],
      edges: [],
      versions: ['v1'],
      publishedVersion: 'v1',
    }
    state.orchestrations.unshift(item)
    return asJson(item)
  }

  let params = matchPath(pathname, '/api/orchestrations/:id')
  if (params && method === 'GET') {
    const item = getOrchestration(state, params.id)
    if (!item) return asJson({ ok: false, error: 'Orchestration not found' }, 404)
    return asJson(item)
  }

  params = matchPath(pathname, '/api/orchestrations/:id')
  if (params && method === 'PATCH') {
    const payload = parseBody(body)
    const item = getOrchestration(state, params.id)
    if (!item) return asJson({ ok: false, error: 'Orchestration not found' }, 404)
    Object.assign(item, payload, { updatedAt: nowIso() })
    return asJson(item)
  }

  params = matchPath(pathname, '/api/orchestrations/:id')
  if (params && method === 'DELETE') {
    state.orchestrations = state.orchestrations.filter((o) => String(o.id) !== String(params.id))
    state.orchestrationExecutions = state.orchestrationExecutions.filter((e) => String(e.orchestrationId) !== String(params.id))
    return asJson({ ok: true })
  }

  params = matchPath(pathname, '/api/orchestrations/:id/validate')
  if (params && method === 'POST') {
    return asJson({ ok: true, errors: [], warnings: [] })
  }

  params = matchPath(pathname, '/api/orchestrations/:id/publish')
  if (params && method === 'POST') {
    const orch = getOrchestration(state, params.id)
    const nextVersion = `v${(orch?.versions?.length || 0) + 1}`
    if (orch) {
      orch.versions = [...(orch.versions || []), nextVersion]
      orch.publishedVersion = nextVersion
      orch.updatedAt = nowIso()
    }
    return asJson({ ok: true, publishedVersion: nextVersion, versionRecord: { version: nextVersion } })
  }

  params = matchPath(pathname, '/api/orchestrations/:id/execute')
  if (params && method === 'POST') {
    const orch = getOrchestration(state, params.id)
    const executionId = state.nextId('exec')
    const execution = {
      executionId,
      id: executionId,
      orchestrationId: params.id,
      status: 'running',
      mode: parseBody(body).mode || 'live',
      requestedBy: state.user.email,
      createdAt: nowIso(),
      startedAt: nowIso(),
      updatedAt: nowIso(),
      completedAt: null,
      graph: {
        nodes: (orch?.nodes || []).map((n, idx) => ({ id: n.id, label: n.label || n.id, agentId: n.agentId, status: idx === 0 ? 'running' : 'pending' })),
        edges: (orch?.edges || []).map((e) => ({ id: e.id, source: e.source, target: e.target, status: 'active' })),
        approvals: [],
      },
      timeline: [
        { id: state.nextId('timeline'), eventType: 'execution.started', timestamp: nowIso(), message: 'Execution started' },
      ],
      mutations: [],
    }
    state.orchestrationExecutions.unshift(execution)
    return asJson({ ok: true, executionId })
  }

  if (pathname === '/api/orchestrations/executions' && method === 'GET') {
    const orchestrationId = searchParams.get('orchestrationId')
    const source = orchestrationId
      ? state.orchestrationExecutions.filter((e) => String(e.orchestrationId) === String(orchestrationId))
      : state.orchestrationExecutions
    const { page, nextCursor } = paginate(source, searchParams)
    return asJson({ items: page, executions: page, nextCursor })
  }

  params = matchPath(pathname, '/api/orchestrations/executions/:executionId')
  if (params && method === 'GET') {
    const execution = getExecution(state, params.executionId)
    if (!execution) return asJson({ ok: false, error: 'Execution not found' }, 404)
    return asJson({ execution, ...execution })
  }

  params = matchPath(pathname, '/api/orchestrations/executions/:executionId/snapshot')
  if (params && method === 'GET') {
    const execution = getExecution(state, params.executionId)
    if (!execution) return asJson({ ok: false, error: 'Execution not found' }, 404)
    return asJson({ ok: true, execution, graph: execution.graph, timeline: execution.timeline, mutations: execution.mutations })
  }

  params = matchPath(pathname, '/api/orchestrations/executions/:executionId/graph')
  if (params && method === 'GET') {
    const execution = getExecution(state, params.executionId)
    return asJson(execution?.graph || { nodes: [], edges: [], approvals: [] })
  }

  params = matchPath(pathname, '/api/orchestrations/executions/:executionId/timeline')
  if (params && method === 'GET') {
    const execution = getExecution(state, params.executionId)
    return asJson({ timeline: execution?.timeline || [], items: execution?.timeline || [] })
  }

  const statusAction = [
    '/pause',
    '/resume',
    '/cancel',
  ].find((suffix) => pathname.endsWith(suffix))
  if (statusAction && method === 'POST') {
    const execId = pathname.split('/')[4]
    const execution = getExecution(state, execId)
    if (!execution) return asJson({ ok: false, error: 'Execution not found' }, 404)
    if (statusAction === '/pause') execution.status = 'paused'
    if (statusAction === '/resume') execution.status = 'running'
    if (statusAction === '/cancel') {
      execution.status = 'canceled'
      execution.completedAt = nowIso()
    }
    execution.updatedAt = nowIso()
    execution.timeline.push({ id: state.nextId('timeline'), eventType: `execution${statusAction}`, timestamp: nowIso(), message: `Execution ${statusAction.slice(1)} requested` })
    return asJson({ ok: true, execution })
  }

  params = matchPath(pathname, '/api/orchestrations/executions/:executionId/mutate')
  if (params && method === 'POST') {
    const payload = parseBody(body)
    const execution = getExecution(state, params.executionId)
    if (!execution) return asJson({ ok: false, error: 'Execution not found' }, 404)
    const op = payload.op || payload.type || 'mutation'
    execution.mutations.push({ id: state.nextId('mutation'), op, payload, timestamp: nowIso() })

    if (op === 'add_node') {
      const nodeId = state.nextId('node')
      execution.graph.nodes.push({ id: nodeId, label: payload.node?.label || nodeId, agentId: payload.node?.agentId || 'agent-1', status: 'pending' })
    } else if (op === 'spawn_agent') {
      const nodeId = state.nextId('node')
      execution.graph.nodes.push({ id: nodeId, label: payload.node?.label || `Spawned ${payload.agentId || 'agent'}`, agentId: payload.agentId || 'agent-1', status: 'running' })
    } else if (op === 'rewire_edge') {
      const edge = execution.graph.edges.find((e) => String(e.id) === String(payload.edgeId))
      if (edge) {
        if (payload.source) edge.source = payload.source
        if (payload.target) edge.target = payload.target
      }
    } else if (op === 'update_node_config') {
      const node = execution.graph.nodes.find((n) => String(n.id) === String(payload.nodeId))
      if (node) node.config = { ...(node.config || {}), ...(payload.config || {}) }
    } else if (op === 'rollback_mutation') {
      execution.mutations.pop()
    }

    execution.updatedAt = nowIso()
    execution.timeline.push({ id: state.nextId('timeline'), eventType: 'execution.mutated', timestamp: nowIso(), message: `Mutation applied: ${op}` })
    return asJson({ ok: true, execution })
  }

  params = matchPath(pathname, '/api/orchestrations/executions/:executionId/retry-node')
  if (params && method === 'POST') {
    const payload = parseBody(body)
    const execution = getExecution(state, params.executionId)
    if (!execution) return asJson({ ok: false, error: 'Execution not found' }, 404)
    const node = execution.graph.nodes.find((n) => String(n.id) === String(payload.nodeId))
    if (node) node.status = 'running'
    execution.timeline.push({ id: state.nextId('timeline'), eventType: 'node.retry', timestamp: nowIso(), message: `Retry node ${payload.nodeId}` })
    return asJson({ ok: true })
  }

  params = matchPath(pathname, '/api/orchestrations/executions/:executionId/replay-from-node')
  if (params && method === 'POST') {
    const payload = parseBody(body)
    const execution = getExecution(state, params.executionId)
    if (!execution) return asJson({ ok: false, error: 'Execution not found' }, 404)
    execution.timeline.push({ id: state.nextId('timeline'), eventType: 'node.replay', timestamp: nowIso(), message: `Replay from node ${payload.nodeId}` })
    return asJson({ ok: true })
  }

  params = matchPath(pathname, '/api/orchestrations/executions/:executionId/approvals/:approvalId/decision')
  if (params && method === 'POST') {
    const execution = getExecution(state, params.executionId)
    if (!execution) return asJson({ ok: false, error: 'Execution not found' }, 404)
    execution.graph.approvals = (execution.graph.approvals || []).filter((a) => String(a.approvalId) !== String(params.approvalId))
    execution.timeline.push({ id: state.nextId('timeline'), eventType: 'approval.decided', timestamp: nowIso(), message: `Approval ${params.approvalId} resolved` })
    return asJson({ ok: true })
  }

  return null
}

function handleObservabilityMisc(pathname, method, state, body) {
  if (pathname === '/api/traces/export' && method === 'POST') {
    const payload = parseBody(body)
    const record = { id: state.nextId('trace-export'), payload, createdAt: nowIso() }
    state.traceExports.push(record)
    return asJson({ ok: true, exportId: record.id })
  }

  if (pathname === '/api/openclaw/events' && method === 'POST') {
    const payload = parseBody(body)
    return asJson({ ok: true, accepted: true, event: payload, eventId: state.nextId('event') })
  }

  return null
}

function handleLegacyAndMisc(pathname, method) {
  if (pathname === '/api/' && method === 'GET') {
    return asJson({ ok: true })
  }
  return null
}

export async function handleFakeRequest({ method, pathname, searchParams, body, state }) {
  const normalizedPath = normalizePathname(pathname)
  const upperMethod = String(method || 'GET').toUpperCase()

  const handlers = [
    () => handleLegacyAndMisc(normalizedPath, upperMethod),
    () => handleUi(normalizedPath, upperMethod, state, searchParams, body),
    () => handleAuth(normalizedPath, upperMethod, state, body),
    () => handleDemo(normalizedPath, upperMethod, state, body),
    () => handleFirewall(normalizedPath, upperMethod, state, body),
    () => handleDownstream(normalizedPath, upperMethod, state, body),
    () => handleCommunity(normalizedPath, upperMethod, state),
    () => handleIntegrations(normalizedPath, upperMethod, state),
    () => handleOrg(normalizedPath, upperMethod, state, body),
    () => handleUser(normalizedPath, upperMethod, state, body),
    () => handleUsageAndBilling(normalizedPath, upperMethod, state, searchParams, body),
    () => handleNotifications(normalizedPath, upperMethod, state, searchParams),
    () => handleSearch(normalizedPath, upperMethod, state, searchParams),
    () => handleAgentsRunsSessions(normalizedPath, upperMethod, state, searchParams, body),
    () => handleHitlAndOps(normalizedPath, upperMethod, state, body),
    () => handleObservability(normalizedPath, upperMethod, state, searchParams, body),
    () => handleToolsAndCli(normalizedPath, upperMethod, state, body),
    () => handleOrchestrations(normalizedPath, upperMethod, state, searchParams, body),
    () => handleObservabilityMisc(normalizedPath, upperMethod, state, body),
  ]

  for (const resolve of handlers) {
    const response = resolve()
    if (response) return response
  }

  console.warn('[fake-mode] Unhandled endpoint', upperMethod, normalizedPath)
  return asJson({ ok: false, warning: `Unhandled fake endpoint: ${upperMethod} ${normalizedPath}` })
}

export function getHandledRouteManifest() {
  return [
    '/api/ui/*',
    '/api/auth/*',
    '/api/demo/*',
    '/api/firewall/*',
    '/api/chat/*',
    '/api/runtime/feature-capabilities',
    '/api/downstream/*',
    '/api/community/*',
    '/api/integrations*',
    '/api/org*',
    '/api/user*',
    '/api/usage*',
    '/api/entitlements',
    '/api/limits*',
    '/api/billing*',
    '/api/notifications*',
    '/api/search*',
    '/api/agents*',
    '/api/openclaw/agent*',
    '/api/runs*',
    '/admin/api/approvals*',
    '/api/hitl/approvals*',
    '/api/openclaw/modifier*',
    '/api/operations/orchestrations*',
    '/api/observability/orchestrations*',
    '/api/tools*',
    '/api/policies',
    '/api/modifier/*',
    '/api/escalation/*',
    '/api/tenants/bindings',
    '/api/runtime/status',
    '/api/openclaw/cli*',
    '/api/orchestrations*',
    '/admin/api/audit/events',
    '/admin/api/policies',
    '/admin/api/reload',
    '/api/traces/export',
    '/api/openclaw/events',
  ]
}
