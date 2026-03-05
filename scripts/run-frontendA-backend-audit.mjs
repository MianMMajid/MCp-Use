import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, resolve, relative } from 'node:path'

import { createFakeState } from '../frontend/frontendA-it-console/template-runtime/src/lib/fake-mode/state.js'
import { handleFakeRequest } from '../frontend/frontendA-it-console/template-runtime/src/lib/fake-mode/handlers.js'

const ROOT = resolve('/Users/omarramadan/Desktop/mcp_firewall')
const FRONTEND_A_SRC = resolve(ROOT, 'frontend/frontendA-it-console/template-runtime/src')
const FRONTEND_A_WORKSPACE = resolve(FRONTEND_A_SRC, 'lib/svelte-workspace')
const FRONTEND_A_ROUTES = resolve(FRONTEND_A_SRC, 'routes')
const BFF_FILE = resolve(FRONTEND_A_SRC, 'routes/api/ui/[...path]/+server.js')
const GATEWAY_ROUTES_DIR = resolve(ROOT, 'backend/backendB-core-services/gateway-api/service/src/routes')
const PERSISTENCE_FILE = resolve(ROOT, 'backend/backendB-core-services/shared/packages/maple-persistence/src/pg-db.js')

const ARTIFACTS_DIR = resolve(ROOT, 'artifacts/audit')
const DOCS_DIR = resolve(ROOT, 'docs/audit')

function walkFiles(root, into = []) {
  for (const name of readdirSync(root)) {
    const full = resolve(root, name)
    const st = statSync(full)
    if (st.isDirectory()) {
      walkFiles(full, into)
      continue
    }
    into.push(full)
  }
  return into
}

function rel(path) {
  return relative(ROOT, path).replace(/\\/g, '/')
}

function normalizePath(path) {
  if (!path) return '/'
  if (path.length > 1 && path.endsWith('/')) return path.slice(0, -1)
  return path
}

function findTagEnd(src, fromIndex) {
  let quote = null
  let braceDepth = 0
  for (let i = fromIndex; i < src.length; i += 1) {
    const ch = src[i]
    if (quote) {
      if (ch === quote && src[i - 1] !== '\\') quote = null
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (ch === '{') {
      braceDepth += 1
      continue
    }
    if (ch === '}') {
      braceDepth = Math.max(0, braceDepth - 1)
      continue
    }
    if (ch === '>' && braceDepth === 0) return i
  }
  return -1
}

function extractTagBlocks(src, tagName) {
  const results = []
  let cursor = 0
  while (cursor < src.length) {
    const open = src.indexOf(`<${tagName}`, cursor)
    if (open === -1) break
    const openEnd = findTagEnd(src, open + tagName.length + 1)
    if (openEnd === -1) break
    const close = src.indexOf(`</${tagName}>`, openEnd + 1)
    if (close === -1) break
    results.push({
      attrs: src.slice(open + tagName.length + 1, openEnd),
      body: src.slice(openEnd + 1, close),
      full: src.slice(open, close + tagName.length + 3),
    })
    cursor = close + tagName.length + 3
  }
  return results
}

function pathPatternToRegex(pattern) {
  const escaped = pattern
    .replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/:[A-Za-z0-9_]+/g, '[^/]+')
  return new RegExp(`^${escaped}$`)
}

function matchPattern(pattern, actual) {
  const re = pathPatternToRegex(pattern)
  return re.test(normalizePath(actual))
}

function extractControlsFromSvelte(filePath) {
  const src = readFileSync(filePath, 'utf8')
  const controls = []

  const file = rel(filePath)

  for (const button of extractTagBlocks(src, 'button')) {
    const attrs = button.attrs || ''
    const body = (button.body || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    const onClick = /on:click=\{([^}]+)\}/.exec(attrs)?.[1]?.trim() || ''
    const classes = /class="([^"]+)"/.exec(attrs)?.[1] || ''
    const aria = /aria-label="([^"]+)"/.exec(attrs)?.[1] || ''
    const type = /type="([^"]+)"/.exec(attrs)?.[1] || 'button'
    const disabledExpr = /disabled=\{([^}]+)\}/.exec(attrs)?.[1] || ''

    let actionType = 'business-action'
    if (classes.includes('zoom-btn')) actionType = 'visual-only'
    if (onClick.includes('toggleAnalyst') || onClick.includes('clearAnalysts')) actionType = 'business-query'
    if (onClick.includes('applyPrompt')) actionType = 'business-query'
    if (onClick.includes('applyMarketplaceFilter')) actionType = 'business-query'
    if (onClick.includes('openStopConfirm') || onClick.includes('cancelStopConfirm')) actionType = 'navigation'
    if (onClick.includes('dismissInterventionHandoff') || onClick.includes('acceptInterventionHandoff')) actionType = 'navigation'
    if (file.includes('MapleCategoryPills') || file.includes('MapleViewTabs')) actionType = 'navigation'
    if (file.includes('FakeDataControl.svelte')) actionType = 'visual-only'
    if (onClick.includes('selectExecution') || onClick.includes('queueInterventionHandoff')) actionType = 'business-query'
    if (onClick.includes('nudgeLiveZoom') || onClick.includes('nudgeForksZoom') || onClick.includes('nudgeTopologyZoom')) actionType = 'visual-only'

    const idSeed = [file.split('/').pop()?.replace('.svelte', ''), aria || body || onClick || classes]
      .filter(Boolean)
      .join(':')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')

    controls.push({
      control_id: idSeed || `${file.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${controls.length + 1}`,
      component: file,
      route_context: file.includes('/routes/') ? file : '/maple',
      element: 'button',
      button_type: type,
      action_type: actionType,
      handler: onClick || null,
      label: aria || body || null,
      class_name: classes || null,
      disabled_expression: disabledExpr || null,
    })
  }

  for (const form of extractTagBlocks(src, 'form')) {
    const attrs = form.attrs || ''
    const onSubmit = /on:submit(?:\|preventDefault)?=\{([^}]+)\}/.exec(attrs)?.[1]?.trim() || ''
    if (!onSubmit) continue
    controls.push({
      control_id: `${file.split('/').pop()?.replace('.svelte', '') || 'form'}-submit-${controls.length + 1}`.toLowerCase(),
      component: file,
      route_context: file.includes('/routes/') ? file : '/maple',
      element: 'form',
      button_type: 'submit',
      action_type: 'business-action',
      handler: onSubmit,
      label: 'form submit',
      class_name: null,
      disabled_expression: null,
    })
  }

  return controls
}

const HANDLER_TO_API = [
  { includes: 'refreshWorkspace', api: 'POST /api/ui/refresh' },
  { includes: 'sendHomeChat', api: 'POST /api/ui/chat/send' },
  { includes: 'sendChatPrompt', api: 'POST /api/ui/chat/send' },
  { includes: 'requestMonitoringChat', api: 'POST /api/ui/chat/send' },
  { includes: 'pauseExecution', api: 'POST /api/ui/intervention/pause' },
  { includes: 'resumeExecution', api: 'POST /api/ui/intervention/resume' },
  { includes: 'confirmStop', api: 'POST /api/ui/intervention/cancel' },
  { includes: 'blockActionRule', api: 'POST /api/ui/intervention/block-rule' },
  { includes: 'applyFirewallRules', api: 'POST /api/ui/firewall/rules' },
  { includes: 'onLeakageDocsSelected', api: 'POST /api/ui/firewall/context-leakage/documents' },
  { includes: 'dispatchMarketplaceRow', api: 'POST /api/ui/marketplace/dispatch' },
  { includes: 'addUser', api: 'POST /api/ui/users' },
  { includes: 'updateUserRole', api: 'PATCH /api/ui/users/:userId/role' },
  { includes: 'deleteUser', api: 'DELETE /api/ui/users/:userId' },
  { includes: 'handleSubmit', api: 'POST /api/auth/login' },
  { includes: 'signInWithGoogle', api: 'POST /api/auth/google' },
]

function enrichControlApis(controls) {
  return controls.map((control) => {
    const handler = String(control.handler || '')
    let expectedApi = null
    for (const mapping of HANDLER_TO_API) {
      if (handler.includes(mapping.includes)) {
        expectedApi = mapping.api
        break
      }
    }

    if (control.element === 'form' && handler.includes('sendHomeChat')) expectedApi = 'POST /api/ui/chat/send'
    if (control.element === 'form' && handler.includes('handleSubmit')) expectedApi = 'POST /api/auth/login'
    if (!expectedApi && control.element === 'button' && control.button_type === 'submit') {
      if (control.component.includes('/routes/login/+page.svelte')) expectedApi = 'POST /api/auth/login'
      if (
        control.component.includes('/svelte-workspace/MapleShell.svelte') ||
        control.component.includes('/svelte-workspace/WorkspaceViewHost.svelte')
      ) {
        expectedApi = 'POST /api/ui/chat/send'
      }
    }

    const expectedResult = expectedApi
      ? 'API response drives UI state or follow-up reload'
      : control.action_type === 'visual-only'
        ? 'Client-only visual state mutation'
        : control.action_type === 'navigation'
          ? 'Route/UI state transition only'
          : 'Client-side state/filter update'

    return {
      ...control,
      expected_api: expectedApi,
      expected_payload: expectedApi ? 'see control handler + BFF contract' : null,
      expected_result: expectedResult,
      api_support:
        control.action_type === 'business-action'
          ? Boolean(expectedApi)
          : null,
      coverage_status:
        control.action_type === 'business-action' && !expectedApi
          ? 'missing-api'
          : 'covered-or-nonbusiness',
    }
  })
}

function extractApiCalls(files) {
  const calls = []
  const callRegex = /fetch\(\s*['"`]((?:\/admin\/api|\/api)\/[^'"`\n\r]*)['"`]/g
  for (const filePath of files) {
    const src = readFileSync(filePath, 'utf8')
    const file = rel(filePath)
    for (const match of src.matchAll(callRegex)) {
      let endpoint = match[1].replace(/\?.*$/, '').replace(/\$\{[^}]+\}/g, ':param')
      endpoint = normalizePath(endpoint)
      calls.push({ file, endpoint })
    }
  }
  return calls
}

function extractGatewayRoutes() {
  const files = walkFiles(GATEWAY_ROUTES_DIR).filter((p) => p.endsWith('.js'))
  const routes = []
  const routeRegex = /\b([A-Za-z_$][A-Za-z0-9_$.]*)\.(get|post|patch|delete|put|options)\(\s*['"]([^'"]+)['"]/g
  for (const filePath of files) {
    const src = readFileSync(filePath, 'utf8')
    const file = rel(filePath)
    for (const match of src.matchAll(routeRegex)) {
      routes.push({
        file,
        method: match[2].toUpperCase(),
        path: normalizePath(match[3]),
      })
    }
  }
  return routes
}

const BFF_SURFACE = [
  { method: 'GET', bff: '/api/ui/bootstrap', downstream: [{ method: 'GET', path: '/api/observability/orchestrations/summary' }, { method: 'GET', path: '/api/observability/orchestrations/slo' }, { method: 'GET', path: '/api/observability/orchestrations/audit-log' }, { method: 'GET', path: '/api/orchestrations/executions' }, { method: 'GET', path: '/api/orchestrations/executions/approvals' }, { method: 'GET', path: '/api/runtime/feature-capabilities' }, { method: 'GET', path: '/api/integrations/catalog' }, { method: 'GET', path: '/api/integrations' }, { method: 'GET', path: '/api/downstream/apps' }, { method: 'GET', path: '/api/downstream/tools' }, { method: 'GET', path: '/api/openclaw/cli/catalog' }, { method: 'GET', path: '/api/auth/me' }, { method: 'GET', path: '/api/firewall/rules' }, { method: 'GET', path: '/api/firewall/context-leakage/documents' }] },
  { method: 'GET', bff: '/api/ui/analysts', downstream: [{ method: 'GET', path: '/api/observability/orchestrations/audit-log' }, { method: 'GET', path: '/api/orchestrations/executions' }, { method: 'GET', path: '/api/orchestrations/executions/approvals' }] },
  { method: 'GET', bff: '/api/ui/users', downstream: [{ method: 'GET', path: '/api/org' }, { method: 'GET', path: '/api/org/:orgId/members' }, { method: 'GET', path: '/api/org/:orgId/invites' }] },
  { method: 'POST', bff: '/api/ui/users', downstream: [{ method: 'POST', path: '/api/org/:orgId/invites' }] },
  { method: 'PATCH', bff: '/api/ui/users/:userId/role', downstream: [{ method: 'GET', path: '/api/org/:orgId/roles' }, { method: 'POST', path: '/api/org/:orgId/roles/:roleId/assign' }] },
  { method: 'DELETE', bff: '/api/ui/users/:userId', downstream: [{ method: 'DELETE', path: '/api/org/:orgId/members/:userId' }] },
  { method: 'GET', bff: '/api/ui/firewall/rules', downstream: [{ method: 'GET', path: '/api/firewall/rules' }, { method: 'GET', path: '/api/firewall/rules/effective' }] },
  { method: 'POST', bff: '/api/ui/firewall/rules', downstream: [{ method: 'POST', path: '/api/firewall/rules' }] },
  { method: 'PATCH', bff: '/api/ui/firewall/rules/:ruleId', downstream: [{ method: 'PATCH', path: '/api/firewall/rules/:ruleId' }] },
  { method: 'DELETE', bff: '/api/ui/firewall/rules/:ruleId', downstream: [{ method: 'DELETE', path: '/api/firewall/rules/:ruleId' }] },
  { method: 'GET', bff: '/api/ui/firewall/context-leakage/documents', downstream: [{ method: 'GET', path: '/api/firewall/context-leakage/documents' }] },
  { method: 'POST', bff: '/api/ui/firewall/context-leakage/documents', downstream: [{ method: 'POST', path: '/api/firewall/context-leakage/documents' }] },
  { method: 'POST', bff: '/api/ui/marketplace/dispatch', downstream: [{ method: 'POST', path: '/api/downstream/dispatch' }] },
  { method: 'POST', bff: '/api/ui/chat/send', downstream: [{ method: 'POST', path: '/api/firewall/chat' }, { method: 'POST', path: '/api/chat/stream' }] },
  { method: 'POST', bff: '/api/ui/intervention/pause', downstream: [{ method: 'POST', path: '/api/orchestrations/executions/:executionId/pause' }] },
  { method: 'POST', bff: '/api/ui/intervention/resume', downstream: [{ method: 'POST', path: '/api/orchestrations/executions/:executionId/resume' }] },
  { method: 'POST', bff: '/api/ui/intervention/cancel', downstream: [{ method: 'POST', path: '/api/orchestrations/executions/:executionId/cancel' }, { method: 'POST', path: '/api/openclaw/agent/sessions/:sessionId/cancel' }] },
  { method: 'POST', bff: '/api/ui/intervention/block-rule', downstream: [{ method: 'POST', path: '/api/firewall/rules' }] },
  { method: 'POST', bff: '/api/ui/refresh', downstream: [] },
]

function classifyOwnership(downstream) {
  const all = downstream.map((d) => d.path)
  if (all.some((p) => p.includes('/firewall/chat') || p.includes('/chat/stream'))) return 'gateway+grpc(context-wall)'
  if (all.some((p) => p.startsWith('/admin/api') || p.includes('/observability/orchestrations'))) return 'gateway+grpc(audit-writer)'
  if (all.some((p) => p.startsWith('/api/org') || p.startsWith('/api/orchestrations') || p.startsWith('/api/auth') || p.startsWith('/api/downstream') || p.startsWith('/api/firewall/rules'))) return 'gateway+db'
  return 'gateway-only'
}

function classifyPersistence(endpoint) {
  const bff = endpoint.bff
  if (bff.includes('/users')) return 'durable-db'
  if (bff.includes('/firewall/rules')) return 'durable-db'
  if (bff.includes('/firewall/context-leakage/documents')) return 'durable-db'
  if (bff.includes('/marketplace/dispatch')) return 'ephemeral'
  if (bff.includes('/intervention/')) return 'ephemeral'
  if (bff.includes('/chat/send')) return 'not-persisted'
  if (bff.includes('/refresh')) return 'not-persisted'
  return 'not-persisted'
}

function buildLineage(gatewayRoutes) {
  return BFF_SURFACE.map((endpoint) => {
    const downstreamChecks = endpoint.downstream.map((d) => {
      const matched = gatewayRoutes.find((route) => route.method === d.method && matchPattern(route.path, d.path))
      return {
        ...d,
        implemented: Boolean(matched),
        evidence_file: matched?.file || null,
        evidence_route: matched ? `${matched.method} ${matched.path}` : null,
      }
    })

    return {
      method: endpoint.method,
      bff_endpoint: endpoint.bff,
      bff_handler: 'frontend/frontendA-it-console/template-runtime/src/routes/api/ui/[...path]/+server.js',
      downstream: downstreamChecks,
      ownership: classifyOwnership(endpoint.downstream),
      auth_requirements: endpoint.bff.includes('/users') || endpoint.bff.includes('/intervention') ? 'session + backend policy' : 'session/api-key depending on downstream',
      persistence_class: classifyPersistence(endpoint),
    }
  })
}

function buildPersistenceMap(lineage) {
  const persistenceSrc = readFileSync(PERSISTENCE_FILE, 'utf8')
  const tableRegex = /CREATE TABLE IF NOT EXISTS\s+([a-z_]+)/gi
  const tables = Array.from(persistenceSrc.matchAll(tableRegex)).map((m) => m[1])

  return {
    db_tables: Array.from(new Set(tables)).sort(),
    endpoint_persistence: lineage.map((entry) => ({
      endpoint: `${entry.method} ${entry.bff_endpoint}`,
      persistence_class: entry.persistence_class,
      backing_tables_guess:
        entry.persistence_class === 'durable-db'
          ? tables.filter((t) => ['users', 'sessions'].includes(t))
          : [],
    })),
  }
}

function buildDataflowMatrix(apiCalls, lineage) {
  const map = [
    {
      panel: 'workspace-bootstrap',
      frontend_source: '/api/ui/bootstrap',
      transformations: 'B-origin filtering, fallback behavior in fake mode, derived topology endpoint projection',
      backend_pipeline: 'BFF composition -> gateway observability/orchestration/integration routes -> mixed db+grpc',
      durability: 'read-model (mixed durable+ephemeral)',
    },
    {
      panel: 'analyst-filter-source',
      frontend_source: '/api/ui/analysts',
      transformations: 'dedupe/sort analyst identifiers, client-side filtering across panels',
      backend_pipeline: 'BFF composed from audit/executions/approvals/auth',
      durability: 'read-model',
    },
    {
      panel: 'timeline-live-topology-forks',
      frontend_source: '/api/ui/bootstrap.auditEvents + executions',
      transformations: 'risk/status normalization, host extraction, node derivation',
      backend_pipeline: 'gateway observability + orchestration queries',
      durability: 'audit: durable-db/outbox; execution state: mixed',
    },
    {
      panel: 'intervention-command-bar',
      frontend_source: '/api/ui/intervention/*',
      transformations: 'target resolution (execution/session), reason gate for destructive actions',
      backend_pipeline: 'BFF -> orchestration/openclaw routes',
      durability: 'ephemeral control-state mutations',
    },
    {
      panel: 'users-crud',
      frontend_source: '/api/ui/users*',
      transformations: 'row normalization id/userId/name/email/role/status/source',
      backend_pipeline: 'BFF -> org members/invites/roles routes',
      durability: 'durable-db',
    },
    {
      panel: 'firewall-rules-library',
      frontend_source: '/api/ui/firewall/rules*',
      transformations: 'rule normalization condition/decision/status/source',
      backend_pipeline: 'BFF -> firewall routes',
      durability: 'ephemeral in gateway/fake-durable-localstorage',
    },
    {
      panel: 'context-leakage-documents',
      frontend_source: 'POST /api/ui/firewall/context-leakage/documents',
      transformations: 'file metadata extraction + policy mode tagging',
      backend_pipeline: 'BFF -> firewall upload route',
      durability: 'not-persisted in real path; fake-localstorage in fake mode',
    },
    {
      panel: 'marketplace-dispatch',
      frontend_source: 'POST /api/ui/marketplace/dispatch',
      transformations: 'dispatch payload mapping app/tool/source',
      backend_pipeline: 'BFF -> downstream dispatch route',
      durability: 'ephemeral (fake-localstorage dispatch history)',
    },
    {
      panel: 'monitoring-chat',
      frontend_source: 'POST /api/ui/chat/send',
      transformations: 'primary + fallback adapter extraction',
      backend_pipeline: 'BFF -> firewall chat -> stream fallback',
      durability: 'not-persisted conversation history',
    },
  ]

  return {
    panels: map,
    discovered_api_calls: apiCalls,
    lineage_endpoints: lineage.map((entry) => `${entry.method} ${entry.bff_endpoint}`),
  }
}

async function runFakeRuntimeVerification() {
  const state = createFakeState('audit-seed')
  state.sessionActive = true

  const cases = [
    { name: 'bootstrap', method: 'GET', path: '/api/ui/bootstrap' },
    { name: 'analysts', method: 'GET', path: '/api/ui/analysts' },
    { name: 'users:list', method: 'GET', path: '/api/ui/users' },
    { name: 'users:create', method: 'POST', path: '/api/ui/users', body: { name: 'Audit User', email: 'audit@mayple.dev', role: 'operator' } },
    { name: 'firewall-rules:list', method: 'GET', path: '/api/ui/firewall/rules' },
    { name: 'firewall-rules:create', method: 'POST', path: '/api/ui/firewall/rules', body: { condition: 'target equals trace-1', decision: 'block' } },
    { name: 'marketplace:dispatch', method: 'POST', path: '/api/ui/marketplace/dispatch', body: { app: 'GitHub', tool: 'integration' } },
    { name: 'chat:send', method: 'POST', path: '/api/ui/chat/send', body: { message: 'status update' } },
    { name: 'intervention:pause', method: 'POST', path: '/api/ui/intervention/pause', body: { executionId: state.orchestrationExecutions[0]?.executionId } },
    { name: 'intervention:resume', method: 'POST', path: '/api/ui/intervention/resume', body: { executionId: state.orchestrationExecutions[0]?.executionId } },
    { name: 'intervention:cancel', method: 'POST', path: '/api/ui/intervention/cancel', body: { executionId: state.orchestrationExecutions[0]?.executionId, reason: 'audit' } },
    { name: 'intervention:block-rule', method: 'POST', path: '/api/ui/intervention/block-rule', body: { target: 'session-1', reason: 'audit' } },
    { name: 'refresh', method: 'POST', path: '/api/ui/refresh', body: {} },
  ]

  const results = []
  for (const scenario of cases) {
    const response = await handleFakeRequest({
      method: scenario.method,
      pathname: scenario.path,
      searchParams: new URLSearchParams(),
      body: scenario.body ? JSON.stringify(scenario.body) : null,
      state,
    })
    const payload = await response.json().catch(() => ({}))
    results.push({
      scenario: scenario.name,
      method: scenario.method,
      path: scenario.path,
      status: response.status,
      ok: response.ok,
      response_keys: Object.keys(payload || {}).slice(0, 10),
      evidence_class: 'runtime-proven-fake',
    })
  }

  return results
}

async function runRealRuntimeVerification(baseUrl = 'http://localhost:4101') {
  const cases = [
    { name: 'health', method: 'GET', path: '/health' },
    { name: 'ui-bootstrap', method: 'GET', path: '/api/ui/bootstrap' },
    { name: 'ui-analysts', method: 'GET', path: '/api/ui/analysts' },
    { name: 'ui-users', method: 'GET', path: '/api/ui/users' },
  ]

  const results = []
  let reachable = false
  try {
    const health = await fetch(`${baseUrl}/health`)
    reachable = health.ok
  } catch {
    reachable = false
  }

  if (!reachable) {
    return cases.map((c) => ({
      scenario: c.name,
      method: c.method,
      path: c.path,
      status: null,
      ok: false,
      response_keys: [],
      evidence_class: 'code-proven-only',
      note: `Frontend A runtime not reachable at ${baseUrl}`,
    }))
  }

  for (const c of cases) {
    try {
      const res = await fetch(`${baseUrl}${c.path}`, { method: c.method })
      const payload = await res.json().catch(() => ({}))
      results.push({
        scenario: c.name,
        method: c.method,
        path: c.path,
        status: res.status,
        ok: res.ok,
        response_keys: Object.keys(payload || {}).slice(0, 10),
        evidence_class: 'runtime-proven-real',
      })
    } catch (error) {
      results.push({
        scenario: c.name,
        method: c.method,
        path: c.path,
        status: null,
        ok: false,
        response_keys: [],
        evidence_class: 'code-proven-only',
        note: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return results
}

function scoreGaps(controls, lineage, dataflow) {
  const gaps = []
  const bffSource = readFileSync(BFF_FILE, 'utf8')

  for (const control of controls) {
    if (control.action_type === 'business-action' && !control.expected_api) {
      gaps.push({
        severity: 'P0',
        area: 'control-api',
        control_id: control.control_id,
        impacted: control.component,
        root_cause: 'Business action missing explicit API binding',
        owner_service: 'frontendA BFF',
        recommendation: 'Bind control to /api/ui/* endpoint or reclassify as non-business',
      })
    }
  }

  for (const endpoint of lineage) {
    const missing = endpoint.downstream.filter((d) => !d.implemented)
    if (missing.length > 0) {
      gaps.push({
        severity: 'P1',
        area: 'bff-lineage',
        control_id: endpoint.bff_endpoint,
        impacted: endpoint.bff_endpoint,
        root_cause: `Missing downstream route implementation: ${missing.map((d) => `${d.method} ${d.path}`).join(', ')}`,
        owner_service: 'gateway-api',
        recommendation: 'Implement downstream route or change BFF mapping',
      })
    }
    if (
      ['POST', 'PATCH', 'DELETE', 'PUT'].includes(endpoint.method) &&
      endpoint.persistence_class === 'not-persisted' &&
      /users|rules|intervention|documents|dispatch/.test(endpoint.bff_endpoint)
    ) {
      gaps.push({
        severity: 'P2',
        area: 'persistence',
        control_id: endpoint.bff_endpoint,
        impacted: endpoint.bff_endpoint,
        root_cause: 'Mutation path classified as not persisted',
        owner_service: 'gateway-api + persistence',
        recommendation: 'Either add durable storage path or document explicit ephemeral contract',
      })
    }
  }

  const hasLeakageRead = lineage.some(
    (entry) =>
      entry.bff_endpoint === '/api/ui/firewall/context-leakage/documents' &&
      entry.method === 'GET' &&
      entry.downstream.some((d) => d.implemented === true),
  )
  if (!hasLeakageRead) {
    gaps.push({
      severity: 'P2',
      area: 'read-model',
      control_id: 'context-leakage-documents',
      impacted: 'Context Leakage table reload behavior',
      root_cause: 'No GET read endpoint for uploaded document state',
      owner_service: 'frontendA BFF + gateway',
      recommendation: 'Add GET /api/ui/firewall/context-leakage/documents for durable/readback visibility',
    })
  }

  const hasServerAnalystFilter =
    bffSource.includes("getAll('analysts')") ||
    bffSource.includes("get('analysts')")
  if (!hasServerAnalystFilter) {
    gaps.push({
      severity: 'P3',
      area: 'processing',
      control_id: 'analyst-filter',
      impacted: 'Global analyst filter consistency',
      root_cause: 'Filter currently client-side only',
      owner_service: 'frontendA BFF',
      recommendation: 'Add queryable server-side filter for high-volume datasets',
    })
  }

  return gaps
}

function toMarkdownTable(rows, headers) {
  const lines = []
  lines.push(`| ${headers.join(' | ')} |`)
  lines.push(`| ${headers.map(() => '---').join(' | ')} |`)
  for (const row of rows) {
    lines.push(`| ${headers.map((h) => String(row[h] ?? '')).join(' | ')} |`)
  }
  return lines.join('\n')
}

function writeJson(path, data) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

function writeText(path, text) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text, 'utf8')
}

function buildSchemas() {
  return {
    control: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      title: 'Frontend A Control Inventory',
      type: 'array',
      items: {
        type: 'object',
        required: ['control_id', 'component', 'action_type'],
        properties: {
          control_id: { type: 'string' },
          component: { type: 'string' },
          route_context: { type: 'string' },
          element: { type: 'string' },
          action_type: { type: 'string', enum: ['business-action', 'business-query', 'navigation', 'visual-only'] },
          expected_api: { type: ['string', 'null'] },
          expected_payload: { type: ['string', 'null'] },
          expected_result: { type: 'string' },
          coverage_status: { type: 'string' },
        },
      },
    },
    lineage: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      title: 'Frontend A Endpoint Lineage',
      type: 'array',
      items: {
        type: 'object',
        required: ['method', 'bff_endpoint', 'ownership', 'persistence_class'],
        properties: {
          method: { type: 'string' },
          bff_endpoint: { type: 'string' },
          bff_handler: { type: 'string' },
          ownership: { type: 'string' },
          auth_requirements: { type: 'string' },
          persistence_class: { type: 'string' },
          downstream: {
            type: 'array',
            items: {
              type: 'object',
              required: ['method', 'path', 'implemented'],
              properties: {
                method: { type: 'string' },
                path: { type: 'string' },
                implemented: { type: 'boolean' },
                evidence_file: { type: ['string', 'null'] },
                evidence_route: { type: ['string', 'null'] },
              },
            },
          },
        },
      },
    },
  }
}

async function main() {
  const files = walkFiles(FRONTEND_A_SRC).filter((p) => ['.svelte', '.js', '.ts'].includes(extname(p)))
  const controlFiles = files.filter((p) => p.endsWith('.svelte') && (p.includes('/lib/svelte-workspace/') || p.includes('/routes/login/')))

  const controlsRaw = controlFiles.flatMap(extractControlsFromSvelte)
  const controls = enrichControlApis(controlsRaw)

  const apiCalls = extractApiCalls(files)
  const gatewayRoutes = extractGatewayRoutes()
  const lineage = buildLineage(gatewayRoutes)
  const persistence = buildPersistenceMap(lineage)
  const dataflow = buildDataflowMatrix(apiCalls, lineage)
  const fakeRuntime = await runFakeRuntimeVerification()
  const realRuntime = await runRealRuntimeVerification(process.env.FRONTEND_A_AUDIT_BASE_URL || 'http://localhost:4101')
  const gaps = scoreGaps(controls, lineage, dataflow)

  const runtimeVerification = {
    generatedAt: new Date().toISOString(),
    fake_mode: fakeRuntime,
    real_mode: realRuntime,
  }

  const schemas = buildSchemas()

  writeJson(resolve(ARTIFACTS_DIR, 'frontendA-control-inventory.json'), controls)
  writeJson(resolve(ARTIFACTS_DIR, 'frontendA-endpoint-lineage.json'), lineage)
  writeJson(resolve(ARTIFACTS_DIR, 'frontendA-persistence-map.json'), persistence)
  writeJson(resolve(ARTIFACTS_DIR, 'frontendA-runtime-verification.json'), runtimeVerification)
  writeJson(resolve(ARTIFACTS_DIR, 'frontendA-remediation-gaps.json'), gaps)
  writeJson(resolve(ARTIFACTS_DIR, 'frontendA-control-inventory.schema.json'), schemas.control)
  writeJson(resolve(ARTIFACTS_DIR, 'frontendA-endpoint-lineage.schema.json'), schemas.lineage)

  const controlMd = [
    '# Frontend A Control Inventory',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    toMarkdownTable(
      controls.map((c) => ({
        control_id: c.control_id,
        component: c.component,
        action_type: c.action_type,
        expected_api: c.expected_api || '-',
        coverage_status: c.coverage_status,
      })),
      ['control_id', 'component', 'action_type', 'expected_api', 'coverage_status'],
    ),
    '',
  ].join('\n')
  writeText(resolve(DOCS_DIR, 'frontendA-control-inventory.md'), controlMd)

  const coverageMd = [
    '# Frontend A Button/API Coverage',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    toMarkdownTable(
      controls.map((c) => ({
        control_id: c.control_id,
        component: c.component,
        action_type: c.action_type,
        api_support:
          c.api_support === null
            ? 'n/a'
            : c.api_support
              ? 'yes'
              : 'no',
        expected_api: c.expected_api || '-',
      })),
      ['control_id', 'component', 'action_type', 'api_support', 'expected_api'],
    ),
    '',
  ].join('\n')
  writeText(resolve(DOCS_DIR, 'frontendA-button-api-coverage.md'), coverageMd)

  const lineageMd = [
    '# Frontend A Backend Lineage',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    toMarkdownTable(
      lineage.map((l) => ({
        bff_endpoint: `${l.method} ${l.bff_endpoint}`,
        ownership: l.ownership,
        persistence_class: l.persistence_class,
        downstream_count: l.downstream.length,
        missing_downstream: l.downstream.filter((d) => !d.implemented).length,
      })),
      ['bff_endpoint', 'ownership', 'persistence_class', 'downstream_count', 'missing_downstream'],
    ),
    '',
  ].join('\n')
  writeText(resolve(DOCS_DIR, 'frontendA-backend-lineage.md'), lineageMd)

  const dataflowMd = [
    '# Frontend A Dataflow + Dataprocessing Matrix',
    '',
    toMarkdownTable(dataflow.panels, ['panel', 'frontend_source', 'transformations', 'backend_pipeline', 'durability']),
    '',
  ].join('\n')
  writeText(resolve(DOCS_DIR, 'frontendA-dataflow-processing-matrix.md'), dataflowMd)

  const persistenceMd = [
    '# Frontend A Persistence Gap Report',
    '',
    `Known DB tables in MaplePostgresDatabase: ${persistence.db_tables.join(', ')}`,
    '',
    toMarkdownTable(
      persistence.endpoint_persistence.map((p) => ({ endpoint: p.endpoint, persistence_class: p.persistence_class, backing_tables_guess: p.backing_tables_guess.join(', ') || '-' })),
      ['endpoint', 'persistence_class', 'backing_tables_guess'],
    ),
    '',
  ].join('\n')
  writeText(resolve(DOCS_DIR, 'frontendA-persistence-gap-report.md'), persistenceMd)

  const fakeParityMd = [
    '# Frontend A Fake Mode Parity',
    '',
    '## Fake-mode runtime verification',
    '',
    toMarkdownTable(
      fakeRuntime.map((r) => ({ scenario: r.scenario, method: r.method, path: r.path, status: r.status, evidence_class: r.evidence_class })),
      ['scenario', 'method', 'path', 'status', 'evidence_class'],
    ),
    '',
    '## Real-mode probe',
    '',
    toMarkdownTable(
      realRuntime.map((r) => ({ scenario: r.scenario, method: r.method, path: r.path, status: r.status ?? 'n/a', evidence_class: r.evidence_class })),
      ['scenario', 'method', 'path', 'status', 'evidence_class'],
    ),
    '',
  ].join('\n')
  writeText(resolve(DOCS_DIR, 'frontendA-fake-mode-parity.md'), fakeParityMd)

  const remediationMd = [
    '# Frontend A Backend Support Remediation',
    '',
    toMarkdownTable(
      gaps.map((g, idx) => ({
        id: `gap-${idx + 1}`,
        severity: g.severity,
        area: g.area,
        impacted: g.impacted,
        owner_service: g.owner_service,
        recommendation: g.recommendation,
      })),
      ['id', 'severity', 'area', 'impacted', 'owner_service', 'recommendation'],
    ),
    '',
  ].join('\n')
  writeText(resolve(DOCS_DIR, 'frontendA-backend-support-remediation.md'), remediationMd)

  console.log('[frontendA-backend-audit] generated artifacts and docs')
}

main().catch((error) => {
  console.error('[frontendA-backend-audit] failed', error)
  process.exitCode = 1
})
