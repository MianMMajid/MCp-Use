import { allSections } from '../../app/allSections.js'
import {
  MAPLE_WORKSPACE_CATEGORY_IDS,
  isMapleWorkspaceCategory,
} from './registry-types.js'

export const MAPLE_WORKSPACE_PATH_PREFIX = '/maple'
export const MAPLE_WORKSPACE_DEFAULT_ROUTE = '/maple/observability'

export const MAPLE_WORKSPACE_CATEGORIES = Object.freeze([
  { id: 'observe', label: 'Observe', description: 'Live telemetry and runtime snapshots.' },
  { id: 'analyze', label: 'Analyze', description: 'Inspect decisions, sessions, and execution traces.' },
  { id: 'govern', label: 'Govern', description: 'Policy workflows, escalations, and controls.' },
  { id: 'admin', label: 'Admin', description: 'Identity, integrations, and account operations.' },
  { id: 'docs', label: 'Docs', description: 'Runbooks, endpoint references, and route guidance.' },
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
    category: 'analyze',
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
    category: 'observe',
    tabLabel: 'Firewall Dashboard',
    description: 'Track firewall status, effective rules, and preview live decisions.',
    apiEndpoints: [
      '/api/firewall/rules/effective',
      '/api/firewall/state',
      '/api/firewall/preview',
      '/api/firewall/decision',
      '/api/firewall/chat',
    ],
    preferredView: 'live',
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
    preferredView: 'fork',
  },
  {
    path: '/maple/hitl',
    title: 'HITL Queue',
    category: 'analyze',
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
    category: 'analyze',
    tabLabel: 'Modifier Approvals',
    description: 'Approve or reject modifier actions requiring explicit authorization.',
    apiEndpoints: ['/api/modifier/approvals', '/api/modifier/decision'],
    preferredView: 'control',
  },
  {
    path: '/maple/agent',
    title: 'Agent Management',
    category: 'analyze',
    tabLabel: 'Agent Management',
    description: 'Inspect agent status, message streams, and session context.',
    apiEndpoints: ['/api/openclaw/agent/status', '/api/openclaw/agent/turn'],
    preferredView: 'control',
  },
  {
    path: '/maple/downstream',
    title: 'Downstream MCP',
    category: 'analyze',
    tabLabel: 'Downstream MCP',
    description: 'Discover connected downstream MCP apps and dispatch tools.',
    apiEndpoints: ['/api/downstream/apps', '/api/downstream/tools', '/api/downstream/dispatch'],
    preferredView: 'marketplace',
  },
  {
    path: '/maple/policies',
    title: 'Policy Center',
    category: 'govern',
    tabLabel: 'Policy Center',
    description: 'Policy operations surface (currently redirects to audit workflows).',
    apiEndpoints: ['/api/policies', '/admin/api/policies'],
    preferredView: 'policy',
  },
  {
    path: '/maple/runtime',
    title: 'Runtime',
    category: 'govern',
    tabLabel: 'Runtime',
    description: 'Runtime dependency and capability controls (redirects to observability).',
    apiEndpoints: ['/api/runtime/feature-capabilities', '/api/runtime/status'],
    preferredView: 'settings',
    legacyAliases: ['/maple/runtime'],
  },
  {
    path: '/maple/tenants',
    title: 'Tenant & Org',
    category: 'govern',
    tabLabel: 'Tenant & Org',
    description: 'Tenant scoping and organizational hierarchy controls.',
    apiEndpoints: ['/api/tenants/bindings', '/api/org/hierarchy'],
    preferredView: 'policy',
  },
  {
    path: '/maple/tools',
    title: 'Tools Registry',
    category: 'govern',
    tabLabel: 'Tools Registry',
    description: 'Manage tool inventory, policy overlays, and execution telemetry.',
    apiEndpoints: ['/api/tools/registry', '/api/tools/policies', '/api/tools/executions'],
    preferredView: 'policy',
  },
  {
    path: '/maple/escalation',
    title: 'Escalation',
    category: 'govern',
    tabLabel: 'Escalation',
    description: 'Configure escalation chains, break-glass controls, and step-up auth.',
    apiEndpoints: ['/api/escalation/chains', '/api/escalation/break-glass'],
    preferredView: 'guard',
  },
  {
    path: '/maple/org',
    title: 'Organizations',
    category: 'govern',
    tabLabel: 'Organizations',
    description: 'Organization membership lifecycle, invites, and roles.',
    apiEndpoints: ['/api/org', '/api/org/invites', '/api/org/roles'],
    preferredView: 'settings',
  },
  {
    path: '/maple/admin',
    title: 'Admin API',
    category: 'admin',
    tabLabel: 'Admin API',
    description: 'Reference and operate admin API endpoints for policy and audit.',
    apiEndpoints: ['/admin/api/policies', '/admin/api/audit/events', '/admin/api/reload'],
    preferredView: 'settings',
  },
  {
    path: '/maple/auth-admin',
    title: 'Auth Admin',
    category: 'admin',
    tabLabel: 'Auth Admin',
    description: 'Operate login, registration, recovery, and session endpoints.',
    apiEndpoints: ['/api/auth/login', '/api/auth/register', '/api/auth/logout', '/api/auth/me'],
    preferredView: 'settings',
  },
  {
    path: '/maple/api-keys',
    title: 'API Keys',
    category: 'admin',
    tabLabel: 'API Keys',
    description: 'Manage API keys and service accounts for workspace integrations.',
    apiEndpoints: ['/api/auth/api-keys', '/api/auth/service-accounts'],
    preferredView: 'settings',
  },
  {
    path: '/maple/integrations',
    title: 'Integrations',
    category: 'admin',
    tabLabel: 'Integrations',
    description: 'Connect and manage third-party integrations and OAuth state.',
    apiEndpoints: ['/api/integrations/catalog', '/api/integrations/oauth/connect'],
    preferredView: 'marketplace',
  },
  {
    path: '/maple/usage',
    title: 'Usage & Billing',
    category: 'admin',
    tabLabel: 'Usage & Billing',
    description: 'Track usage, entitlements, and billing limits for active plans.',
    apiEndpoints: ['/api/billing/subscription', '/api/billing/usage', '/api/billing/invoices'],
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

function normalizeRouteRecord(route) {
  const category = isMapleWorkspaceCategory(route.category) ? route.category : 'observe'
  const preferredViewByCategory = {
    observe: 'live',
    analyze: 'control',
    govern: 'guard',
    admin: 'settings',
    docs: 'route-help',
  }
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
    preferredView: route.preferredView ?? preferredViewByCategory[category] ?? 'live',
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
