import { allSections } from '../docs/allSections.js'
import {
  MAPLE_WORKSPACE_CATEGORY_IDS,
  isMapleWorkspaceCategory,
} from './registry-types.js'

export const MAPLE_WORKSPACE_PATH_PREFIX = '/maple'
export const MAPLE_WORKSPACE_DEFAULT_ROUTE = '/maple/observability'

export const MAPLE_WORKSPACE_CATEGORIES = Object.freeze([
  { id: 'chat', label: 'Chat', description: 'Monitoring agent conversation and live recommendations.' },
  { id: 'observe', label: 'Monitor', description: 'Live telemetry and runtime snapshots.' },
  { id: 'admin', label: 'System', description: 'Identity, integrations, and account operations.' },
  { id: 'firewalls', label: 'Firewalls', description: 'Firewall rules, protections, and context leakage controls.' },
  { id: 'users', label: 'Users', description: 'User accounts, role assignments, and access governance.' },
])

const LEGACY_DOC_LINKS = Object.freeze([
  { label: 'Operations Overview', href: '/' },
  { label: 'Quickstart', href: '/quickstart' },
  { label: 'SDKs', href: '/sdks' },
  { label: 'Messages', href: '/messages' },
  { label: 'Webhooks', href: '/webhooks' },
])

const MAPLE_ROUTE_DEFINITIONS = [
  {
    path: '/maple/observability',
    title: 'Observability',
    category: 'observe',
    tabLabel: 'Observability',
    description: 'Monitor SLOs, audit coverage, and alert webhooks in one surface.',
    apiEndpoints: [
      '/api/observability/orchestrations/summary',
      '/api/observability/orchestrations/slo',
      '/api/observability/orchestrations/audit-log',
      '/api/observability/orchestrations/alert-webhooks',
    ],
    preferredView: 'live',
  },
  {
    path: '/maple/audit',
    title: 'Audit + Traces',
    category: 'admin',
    tabLabel: 'Audit + Traces',
    description: 'Review immutable audit chains, retention state, and dead-letter replay.',
    apiEndpoints: [
      '/api/observability/orchestrations/audit-log',
      '/api/observability/orchestrations/audit-chain',
      '/api/observability/orchestrations/retention',
      '/api/observability/orchestrations/dead-letter',
    ],
    preferredView: 'control',
    legacyAliases: ['/maple/policies', '/maple/tenants'],
  },
  {
    path: '/maple/gateway',
    title: 'Firewall Dashboard',
    category: 'firewalls',
    tabLabel: 'Firewall Dashboard',
    description: 'Track firewall status, effective rules, and preview live decisions.',
    apiEndpoints: [
      '/api/firewall/rules/effective',
      '/api/firewall/state',
      '/api/firewall/preview',
      '/api/firewall/decision',
      '/api/firewall/chat',
    ],
    preferredView: 'cybersecurity',
  },
  {
    path: '/maple/runs',
    title: 'Runs',
    category: 'observe',
    tabLabel: 'Runs',
    description: 'Inspect run inventory and execution outcomes across active sessions.',
    apiEndpoints: ['/api/runs'],
    preferredView: 'timeline',
  },
  {
    path: '/maple/community',
    title: 'Community',
    category: 'observe',
    tabLabel: 'Community',
    description: 'Browse shared trace signals and anonymized network patterns.',
    apiEndpoints: ['/api/community/stats', '/api/community/traces'],
    preferredView: 'timeline',
  },
  {
    path: '/maple/hitl',
    title: 'HITL Queue',
    category: 'admin',
    tabLabel: 'HITL Queue',
    description: 'Process pending approvals and review high-risk interventions.',
    apiEndpoints: [
      '/api/hitl/approvals',
      '/api/hitl/approvals/watch',
      '/admin/api/approvals',
      '/admin/api/approvals/watch',
    ],
    preferredView: 'control',
  },
  {
    path: '/maple/modifier-approvals',
    title: 'Modifier Approvals',
    category: 'admin',
    tabLabel: 'Modifier Approvals',
    description: 'Approve or reject modifier actions requiring explicit authorization.',
    apiEndpoints: ['/api/operations/orchestrations/approvals', '/api/operations/orchestrations/approvals/:approvalId/decision'],
    preferredView: 'control',
  },
  {
    path: '/maple/agent',
    title: 'Agent Management',
    category: 'admin',
    tabLabel: 'Agent Management',
    description: 'Inspect agent status, message streams, and session context.',
    apiEndpoints: ['/api/openclaw/agent/status', '/api/openclaw/agent/turn'],
    preferredView: 'control',
  },
  {
    path: '/maple/demo',
    title: 'Demo Playground',
    category: 'admin',
    tabLabel: 'Demo Playground',
    description: 'Run deterministic demos for trace, audit, block, and fork paths.',
    apiEndpoints: ['/api/demo/start', '/api/demo/full', '/api/demo/guard'],
    preferredView: 'control',
  },
  {
    path: '/maple/downstream',
    title: 'Downstream MCP',
    category: 'admin',
    tabLabel: 'Downstream MCP',
    description: 'Discover connected downstream MCP apps and dispatch tools.',
    apiEndpoints: ['/api/downstream/apps', '/api/downstream/tools', '/api/downstream/dispatch'],
    preferredView: 'marketplace',
  },
  {
    path: '/maple/policies',
    title: 'Policy Center',
    category: 'admin',
    tabLabel: 'Policy Center',
    description: 'Policy operations surface (currently redirects to audit workflows).',
    apiEndpoints: ['/api/policies', '/admin/api/policies'],
    preferredView: 'policy',
  },
  {
    path: '/maple/runtime',
    title: 'Runtime',
    category: 'admin',
    tabLabel: 'Runtime',
    description: 'Runtime dependency and capability controls (redirects to observability).',
    apiEndpoints: ['/api/runtime/feature-capabilities', '/api/runtime/status'],
    preferredView: 'settings',
    legacyAliases: ['/maple/runtime'],
  },
  {
    path: '/maple/tenants',
    title: 'Tenant & Org',
    category: 'admin',
    tabLabel: 'Tenant & Org',
    description: 'Tenant scoping and organizational hierarchy controls.',
    apiEndpoints: ['/api/operations/orchestrations/tenant-bindings', '/api/operations/orchestrations/org/tree'],
    preferredView: 'policy',
  },
  {
    path: '/maple/tools',
    title: 'Tools Registry',
    category: 'admin',
    tabLabel: 'Tools Registry',
    description: 'Manage tool inventory, policy overlays, and execution telemetry.',
    apiEndpoints: ['/api/tools/registry', '/api/tools/policies', '/api/tools/executions'],
    preferredView: 'policy',
  },
  {
    path: '/maple/escalation',
    title: 'Escalation',
    category: 'admin',
    tabLabel: 'Escalation',
    description: 'Configure escalation chains, break-glass controls, and step-up auth.',
    apiEndpoints: ['/api/operations/orchestrations/escalation', '/api/operations/orchestrations/break-glass'],
    preferredView: 'policy',
  },
  {
    path: '/maple/org',
    title: 'Organizations',
    category: 'admin',
    tabLabel: 'Organizations',
    description: 'Organization membership lifecycle, invites, and roles.',
    apiEndpoints: ['/api/org', '/api/org/:orgId/invites', '/api/org/:orgId/roles'],
    preferredView: 'settings',
  },
  {
    path: '/maple/admin',
    title: 'Admin API',
    category: 'admin',
    tabLabel: 'Admin API',
    description: 'Reference and operate admin API endpoints for policy and audit.',
    apiEndpoints: ['/admin/api/policies', '/admin/api/audit', '/admin/api/policies/reload'],
    preferredView: 'settings',
  },
  {
    path: '/maple/auth-admin',
    title: 'Auth Admin',
    category: 'users',
    tabLabel: 'Auth Admin',
    description: 'Operate login, registration, recovery, and session endpoints.',
    apiEndpoints: ['/api/auth/login', '/api/auth/register', '/api/auth/logout', '/api/auth/me'],
    preferredView: 'access',
  },
  {
    path: '/maple/api-keys',
    title: 'API Keys',
    category: 'admin',
    tabLabel: 'API Keys',
    description: 'Manage API keys and service accounts for workspace integrations.',
    apiEndpoints: ['/api/user/api-keys', '/api/org/:orgId/service-accounts'],
    preferredView: 'settings',
  },
  {
    path: '/maple/integrations',
    title: 'Integrations',
    category: 'admin',
    tabLabel: 'Integrations',
    description: 'Connect and manage third-party integrations and OAuth state.',
    apiEndpoints: ['/api/integrations/catalog', '/api/integrations/:provider/oauth/start'],
    preferredView: 'marketplace',
  },
  {
    path: '/maple/usage',
    title: 'Usage & Billing',
    category: 'admin',
    tabLabel: 'Usage & Billing',
    description: 'Track usage, entitlements, and billing limits for active plans.',
    apiEndpoints: ['/api/billing/subscription', '/api/usage/summary', '/api/billing/invoices'],
    preferredView: 'settings',
  },
  {
    path: '/maple/desktop',
    title: 'Desktop Studio',
    category: 'admin',
    tabLabel: 'Desktop Studio',
    description: 'Desktop orchestration journey and deployment handoff notes.',
    apiEndpoints: ['/api/openclaw/agent/turn', '/api/hitl/approvals'],
    preferredView: 'settings',
  },
]

function uniqueList(values) {
  return Array.from(new Set(values))
}

function toAnchors(path) {
  const sections = Array.isArray(allSections[path]) ? allSections[path] : []
  return sections.map((section) => ({
    title: section.title,
    id: section.id,
    ...(section.tag ? { tag: section.tag } : {}),
  }))
}

const ROUTE_SURFACE_BY_PATH = Object.freeze({
  '/maple/observability': { category: 'observe', view: 'live' },
  '/maple/gateway': { category: 'firewalls', view: 'cybersecurity' },
  '/maple/runs': { category: 'observe', view: 'timeline' },
  '/maple/community': { category: 'observe', view: 'timeline' },
  '/maple/chat': { category: 'chat', view: 'chat' },
  '/maple/audit': { category: 'admin', view: 'control' },
  '/maple/hitl': { category: 'admin', view: 'control' },
  '/maple/modifier-approvals': { category: 'admin', view: 'control' },
  '/maple/agent': { category: 'admin', view: 'control' },
  '/maple/demo': { category: 'admin', view: 'control' },
  '/maple/downstream': { category: 'admin', view: 'marketplace' },
  '/maple/policies': { category: 'admin', view: 'control' },
  '/maple/runtime': { category: 'admin', view: 'control' },
  '/maple/tenants': { category: 'admin', view: 'control' },
  '/maple/tools': { category: 'admin', view: 'control' },
  '/maple/escalation': { category: 'admin', view: 'control' },
  '/maple/org': { category: 'admin', view: 'control' },
  '/maple/admin': { category: 'admin', view: 'control' },
  '/maple/auth-admin': { category: 'users', view: 'access' },
  '/maple/api-keys': { category: 'admin', view: 'control' },
  '/maple/integrations': { category: 'admin', view: 'marketplace' },
  '/maple/usage': { category: 'admin', view: 'control' },
  '/maple/desktop': { category: 'admin', view: 'control' },
})

const PRIMARY_FUNCTION_BY_SURFACE = Object.freeze({
  'chat:chat': 'monitoring-agent-chat',
  'observe:topology': 'runtime-topology',
  'observe:live': 'monitor-now',
  'observe:timeline': 'chronology',
  'observe:forks': 'fork-isolation-monitoring',
  'admin:control': 'intervention-execution',
  'admin:settings': 'system-health',
  'admin:policy': 'policy-operations',
  'admin:marketplace': 'integration-lifecycle',
  'firewalls:cybersecurity': 'firewall-rules',
  'firewalls:rules': 'firewall-rules-library',
  'firewalls:context-leakage': 'context-leakage-controls',
  'users:access': 'user-role-access',
  'docs:overview': 'docs-workspace-model',
  'docs:api': 'docs-endpoints',
  'docs:runbooks': 'docs-response',
  'docs:route-help': 'docs-route-context',
})

function normalizeRouteRecord(route) {
  const category = isMapleWorkspaceCategory(route.category) ? route.category : 'observe'
  const mappedSurface = ROUTE_SURFACE_BY_PATH[route.path] ?? { category, view: 'live' }
  const docsViews = ['overview', 'api', 'runbooks', 'route-help']
  const endpoints = uniqueList(
    Array.isArray(route.apiEndpoints)
      ? route.apiEndpoints.filter((endpoint) => typeof endpoint === 'string' && endpoint.startsWith('/'))
      : [],
  )

  return {
    path: route.path,
    title: route.title,
    category,
    tabLabel: route.tabLabel,
    description: route.description,
    anchors: toAnchors(route.path),
    apiEndpoints: endpoints,
    legacyDocLinks: LEGACY_DOC_LINKS.map((link) => ({ ...link })),
    preferredView: mappedSurface.view,
    primaryFunction: PRIMARY_FUNCTION_BY_SURFACE[`${mappedSurface.category}:${mappedSurface.view}`] ?? 'monitor-now',
    mappedSurface,
    docsContextKey: route.path,
    compatAliasBehavior: 'canonicalize-via-query',
    legacyAliasBehavior: 'canonicalize-via-query',
    legacyAliases: Array.isArray(route.legacyAliases)
      ? uniqueList(route.legacyAliases.filter((value) => typeof value === 'string' && value.startsWith('/maple')))
      : [],
    docsViews,
  }
}

export const MAPLE_ROUTE_REGISTRY = Object.freeze(
  MAPLE_ROUTE_DEFINITIONS.map(normalizeRouteRecord),
)

export const MAPLE_ROUTE_REGISTRY_BY_PATH = new Map(
  MAPLE_ROUTE_REGISTRY.flatMap((route) => [
    [route.path, route],
    ...route.legacyAliases.map((aliasPath) => [aliasPath, route]),
  ]),
)

export function getMapleRoutesByCategory(category) {
  const normalizedCategory = MAPLE_WORKSPACE_CATEGORY_IDS.includes(category)
    ? category
    : 'observe'
  return MAPLE_ROUTE_REGISTRY.filter((route) => route.category === normalizedCategory)
}

export function getMapleRoute(path) {
  return MAPLE_ROUTE_REGISTRY_BY_PATH.get(path) ?? null
}

export const MAPLE_WORKSPACE_ROUTE_PATHS = Object.freeze(
  MAPLE_ROUTE_REGISTRY.map((route) => route.path),
)
