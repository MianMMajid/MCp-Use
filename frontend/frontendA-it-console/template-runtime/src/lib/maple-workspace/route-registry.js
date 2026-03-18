import { allSections } from '../docs/allSections.js'
import {
  MAPLE_WORKSPACE_CATEGORY_IDS,
  isMapleWorkspaceCategory,
} from './registry-types.js'
import { getFrontendAParityForRoute } from './frontendA-parity-spec.js'

export const MAPLE_WORKSPACE_PATH_PREFIX = '/maple'
export const MAPLE_WORKSPACE_DEFAULT_ROUTE = '/maple/chat'

export const MAPLE_WORKSPACE_CATEGORIES = Object.freeze([
  { id: 'chat', label: 'Chat', description: 'Monitoring agent conversation and live recommendations.' },
  { id: 'observe', label: 'Monitor', description: 'Live telemetry and runtime snapshots.' },
  { id: 'admin', label: 'System', description: 'Identity, integrations, and account operations.' },
  { id: 'firewalls', label: 'Firewalls', description: 'Firewall rules, protections, and context leakage controls.' },
  { id: 'users', label: 'Users', description: 'User accounts, role assignments, and access governance.' },
  { id: 'compliance', label: 'Compliance', description: 'Risk posture scoring and compliance framework mapping.' },
  { id: 'docs', label: 'Docs', description: 'Workspace documentation, runbooks, and route context.' },
])

export const MAPLE_DOCK_GROUPS = Object.freeze([
  { id: 'chat', label: 'Investigate', icon: 'chat', primaryHref: '/maple/chat' },
  { id: 'monitor', label: 'Observe', icon: 'monitor', primaryHref: '/maple/observability' },
  { id: 'firewalls', label: 'Protect', icon: 'firewalls', primaryHref: '/maple/gateway' },
  { id: 'agents', label: 'Govern', icon: 'agents', primaryHref: '/maple/agent' },
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
    path: '/maple/chat',
    title: 'Investigation Console',
    category: 'chat',
    tabLabel: 'Investigation Console',
    description: 'Interrogate agent activity, surface evidence, and hand off findings into governed workflows.',
    apiEndpoints: ['/api/chat/stream', '/api/openclaw/agent/turn'],
    preferredView: 'chat',
  },
  {
    path: '/maple/observability',
    title: 'Dashboard',
    category: 'observe',
    tabLabel: 'Dashboard',
    description: 'Live SLO health, audit delivery, alert webhooks, and runtime posture at a glance.',
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
    title: 'Audit Trail',
    category: 'admin',
    tabLabel: 'Audit Trail',
    description: 'Review immutable audit chains, trace integrity, retention state, and dead-letter replay.',
    apiEndpoints: [
      '/api/observability/orchestrations/audit-log',
      '/api/observability/orchestrations/audit-chain',
      '/api/observability/orchestrations/retention',
      '/api/observability/orchestrations/dead-letter',
    ],
    preferredView: 'control',
    legacyAliases: ['/maple/tenants'],
  },
  {
    path: '/maple/gateway',
    title: 'Security Overview',
    category: 'firewalls',
    tabLabel: 'Overview',
    description: 'Unified protection posture across firewall rules, MCP mediation, and scanning providers.',
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
    path: '/maple/interventions',
    title: 'File Interventions',
    category: 'firewalls',
    tabLabel: 'Interventions',
    description: 'Review mutation plans, approve or deny file changes, and promote forked bundles.',
    apiEndpoints: [
      '/api/firewall/filesystem/status',
      '/api/firewall/filesystem/preflight',
      '/api/firewall/filesystem/mutations',
      '/api/firewall/filesystem/mutations/:planId',
      '/api/firewall/filesystem/mutations/:planId/decision',
      '/api/firewall/filesystem/mutations/:planId/promote',
      '/api/firewall/filesystem/mutations/:planId/restore',
    ],
    preferredView: 'cybersecurity',
  },
  {
    path: '/maple/cyber',
    title: 'Threat Response',
    category: 'firewalls',
    tabLabel: 'Threats',
    description: 'Investigate incidents, manage quarantine, review scan evidence, and enforce suppressions.',
    apiEndpoints: [
      '/api/cyber/status',
      '/api/cyber/policies',
      '/api/cyber/events',
      '/api/cyber/downloads',
      '/api/cyber/incidents',
      '/api/cyber/quarantine',
      '/api/cyber/suppressions',
    ],
    preferredView: 'cybersecurity',
  },
  {
    path: '/maple/topology',
    title: 'Service Topology',
    category: 'observe',
    tabLabel: 'Topology',
    description: 'Map service dependencies, endpoint reachability, and runtime connectivity.',
    apiEndpoints: ['/api/runtime/feature-capabilities', '/api/runtime/status'],
    preferredView: 'topology',
  },
  {
    path: '/maple/runs',
    title: 'Executions',
    category: 'observe',
    tabLabel: 'Executions',
    description: 'Trace governed run inventory, execution outcomes, and session correlation.',
    apiEndpoints: ['/api/runs'],
    preferredView: 'timeline',
  },
  {
    path: '/maple/forks',
    title: 'Containment',
    category: 'observe',
    tabLabel: 'Containment',
    description: 'Triage containment forks created when firewall policy isolates high-risk agent actions.',
    apiEndpoints: ['/api/firewall/filesystem/status', '/api/firewall/filesystem/mutations'],
    preferredView: 'forks',
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
    title: 'Approval Queue',
    category: 'admin',
    tabLabel: 'Approvals',
    description: 'Process pending human-in-the-loop approvals for governed actions.',
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
    title: 'Policy Overrides',
    category: 'admin',
    tabLabel: 'Overrides',
    description: 'Review and authorize runtime policy overrides requiring explicit operator approval.',
    apiEndpoints: ['/api/operations/orchestrations/approvals', '/api/operations/orchestrations/approvals/:approvalId/decision'],
    preferredView: 'control',
  },
  {
    path: '/maple/agent',
    title: 'Agent Sessions',
    category: 'admin',
    tabLabel: 'Sessions',
    description: 'Inspect agent runtime status, active sessions, and execution artifacts.',
    apiEndpoints: ['/api/openclaw/agent/status', '/api/openclaw/agent/turn'],
    preferredView: 'control',
  },
  {
    path: '/maple/demo',
    title: 'Playbooks',
    category: 'admin',
    tabLabel: 'Playbooks',
    description: 'Execute deterministic operator playbooks that exercise governed trace, audit, and block flows.',
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
    tabLabel: 'Policies',
    description: 'Manage context leakage policies, extracted entities, and runtime rewrite/block evidence.',
    apiEndpoints: [
      '/api/firewall/context-leakage/documents',
      '/api/firewall/context-leakage/entities',
      '/api/firewall/context-leakage/events',
    ],
    preferredView: 'policy',
  },
  {
    path: '/maple/runtime',
    title: 'Runtime',
    category: 'admin',
    tabLabel: 'Runtime',
    description: 'Runtime dependency and capability controls.',
    apiEndpoints: ['/api/runtime/feature-capabilities', '/api/runtime/status', '/api/runtime/dependencies'],
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
  '/maple/chat': { category: 'chat', view: 'chat' },
  '/maple/observability': { category: 'observe', view: 'live' },
  '/maple/gateway': { category: 'firewalls', view: 'cybersecurity' },
  '/maple/interventions': { category: 'firewalls', view: 'cybersecurity' },
  '/maple/cyber': { category: 'firewalls', view: 'cybersecurity' },
  '/maple/topology': { category: 'observe', view: 'topology' },
  '/maple/runs': { category: 'observe', view: 'timeline' },
  '/maple/forks': { category: 'observe', view: 'forks' },
  '/maple/community': { category: 'observe', view: 'timeline' },
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

const ROUTE_NAV_METADATA_BY_PATH = Object.freeze({
  '/maple/chat': {
    navTier: 'primary',
    navGroup: 'chat',
    navOrder: 1,
    purpose: 'Operator investigation and governed chat handoff into evidence workflows.',
    operatorTask: 'operator-investigation',
    topologyContext: 'chat',
    proofPriority: 1,
  },
  '/maple/observability': {
    navTier: 'secondary',
    navGroup: 'monitor',
    navOrder: 1,
    purpose: 'Monitor runtime health, alerts, and control-plane posture.',
    operatorTask: 'runtime-observability',
    topologyContext: 'observability',
    proofPriority: 2,
  },
  '/maple/topology': {
    navTier: 'secondary',
    navGroup: 'monitor',
    navOrder: 2,
    purpose: 'Visualize runtime topology, service dependencies, and endpoint reachability.',
    operatorTask: 'runtime-topology',
    topologyContext: 'topology',
    proofPriority: 3,
  },
  '/maple/runs': {
    navTier: 'secondary',
    navGroup: 'monitor',
    navOrder: 3,
    purpose: 'Trace governed executions, run outcomes, and session correlation.',
    operatorTask: 'execution-trace',
    topologyContext: 'runs',
    proofPriority: 4,
  },
  '/maple/forks': {
    navTier: 'secondary',
    navGroup: 'monitor',
    navOrder: 4,
    purpose: 'Triage containment forks and resolve isolated high-risk agent actions.',
    operatorTask: 'containment-triage',
    topologyContext: 'containment',
    proofPriority: 4,
  },
  '/maple/gateway': {
    navTier: 'secondary',
    navGroup: 'firewalls',
    navOrder: 1,
    purpose: 'Unified protection posture across firewall rules, scanning, and mediation.',
    operatorTask: 'security-overview',
    topologyContext: 'gateway',
    proofPriority: 1,
  },
  '/maple/cyber': {
    navTier: 'secondary',
    navGroup: 'firewalls',
    navOrder: 2,
    purpose: 'Investigate incidents, manage quarantine, and enforce suppressions.',
    operatorTask: 'threat-response',
    topologyContext: 'cyber',
    proofPriority: 2,
  },
  '/maple/interventions': {
    navTier: 'secondary',
    navGroup: 'firewalls',
    navOrder: 3,
    purpose: 'Review file mutation plans, approve changes, and promote forked bundles.',
    operatorTask: 'file-interventions',
    topologyContext: 'interventions',
    proofPriority: 3,
  },
  '/maple/policies': {
    navTier: 'secondary',
    navGroup: 'firewalls',
    navOrder: 4,
    purpose: 'Manage context-leakage policy, protected entities, and enforcement evidence.',
    operatorTask: 'policy-enforcement',
    topologyContext: 'policies',
    proofPriority: 4,
  },
  '/maple/agent': {
    navTier: 'secondary',
    navGroup: 'agents',
    navOrder: 1,
    purpose: 'Inspect active agent sessions, execution artifacts, and runtime status.',
    operatorTask: 'agent-sessions',
    topologyContext: 'agent',
    proofPriority: 1,
  },
  '/maple/hitl': {
    navTier: 'secondary',
    navGroup: 'agents',
    navOrder: 2,
    purpose: 'Process pending human-in-the-loop approvals for governed actions.',
    operatorTask: 'approval-queue',
    topologyContext: 'hitl',
    proofPriority: 3,
  },
  '/maple/modifier-approvals': {
    navTier: 'secondary',
    navGroup: 'agents',
    navOrder: 3,
    purpose: 'Review and authorize runtime policy overrides.',
    operatorTask: 'policy-overrides',
    topologyContext: 'overrides',
    proofPriority: 3,
  },
  '/maple/demo': {
    navTier: 'secondary',
    navGroup: 'agents',
    navOrder: 4,
    purpose: 'Execute operator playbooks that exercise governed flows end to end.',
    operatorTask: 'playbook-execution',
    topologyContext: 'playbooks',
    proofPriority: 4,
  },
  '/maple/audit': {
    navTier: 'utility',
    navGroup: 'utility',
    navOrder: 1,
    purpose: 'Investigate immutable audit chains, retention state, and dead-letter replay.',
    operatorTask: 'audit-review',
    topologyContext: 'utility',
    proofPriority: 10,
  },
  '/maple/downstream': {
    navTier: 'utility',
    navGroup: 'utility',
    navOrder: 2,
    purpose: 'Operate connected downstream apps, tools, and mediated dispatch.',
    operatorTask: 'downstream-control',
    topologyContext: 'utility',
    proofPriority: 10,
  },
  '/maple/auth-admin': {
    navTier: 'utility',
    navGroup: 'utility',
    navOrder: 3,
    purpose: 'Operate account access, session security, and credential recovery settings.',
    operatorTask: 'auth-operations',
    topologyContext: 'utility',
    proofPriority: 10,
  },
  '/maple/api-keys': {
    navTier: 'utility',
    navGroup: 'utility',
    navOrder: 4,
    purpose: 'Manage user API keys and organization service accounts.',
    operatorTask: 'credential-lifecycle',
    topologyContext: 'utility',
    proofPriority: 10,
  },
  '/maple/org': {
    navTier: 'utility',
    navGroup: 'utility',
    navOrder: 5,
    purpose: 'Manage organizations, memberships, invites, and roles.',
    operatorTask: 'organization-admin',
    topologyContext: 'utility',
    proofPriority: 10,
  },
  '/maple/integrations': {
    navTier: 'utility',
    navGroup: 'utility',
    navOrder: 6,
    purpose: 'Operate third-party provider connections and OAuth lifecycle.',
    operatorTask: 'integration-operations',
    topologyContext: 'utility',
    proofPriority: 10,
  },
  '/maple/runtime': {
    navTier: 'hidden',
    navGroup: 'utility',
    navOrder: 90,
    purpose: 'Merged into Observability.',
    operatorTask: 'merged-runtime',
    topologyContext: 'utility',
    proofPriority: 99,
  },
  '/maple/admin': {
    navTier: 'hidden',
    navGroup: 'utility',
    navOrder: 91,
    purpose: 'Not a standalone product surface.',
    operatorTask: 'admin-endpoints',
    topologyContext: 'utility',
    proofPriority: 99,
  },
  '/maple/tools': {
    navTier: 'hidden',
    navGroup: 'utility',
    navOrder: 92,
    purpose: 'Merged into Downstream MCP if retained.',
    operatorTask: 'tool-registry',
    topologyContext: 'utility',
    proofPriority: 99,
  },
  '/maple/escalation': {
    navTier: 'hidden',
    navGroup: 'utility',
    navOrder: 93,
    purpose: 'Merged into Organizations or HITL if retained.',
    operatorTask: 'escalation-admin',
    topologyContext: 'utility',
    proofPriority: 99,
  },
  '/maple/desktop': {
    navTier: 'hidden',
    navGroup: 'utility',
    navOrder: 94,
    purpose: 'Merged into Workflow Studio if retained.',
    operatorTask: 'desktop-workflow',
    topologyContext: 'utility',
    proofPriority: 99,
  },
  '/maple/community': {
    navTier: 'hidden',
    navGroup: 'utility',
    navOrder: 95,
    purpose: 'Not surfaced without a distinct operator workflow.',
    operatorTask: 'community-signals',
    topologyContext: 'utility',
    proofPriority: 99,
  },
  '/maple/usage': {
    navTier: 'hidden',
    navGroup: 'utility',
    navOrder: 96,
    purpose: 'Conditional utility surface only.',
    operatorTask: 'usage-billing',
    topologyContext: 'utility',
    proofPriority: 99,
  },
  '/maple/tenants': {
    navTier: 'hidden',
    navGroup: 'utility',
    navOrder: 97,
    purpose: 'Conditional utility surface only.',
    operatorTask: 'tenant-scope',
    topologyContext: 'utility',
    proofPriority: 99,
  },
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
  const navMeta = ROUTE_NAV_METADATA_BY_PATH[route.path] ?? {
    navTier: 'utility',
    navGroup: 'utility',
    navOrder: 99,
    purpose: route.description,
    operatorTask: 'utility-operations',
    topologyContext: 'utility',
    proofPriority: 99,
  }
  const docsViews = ['overview', 'api', 'runbooks', 'route-help']
  const endpoints = uniqueList(
    Array.isArray(route.apiEndpoints)
      ? route.apiEndpoints.filter((endpoint) => typeof endpoint === 'string' && endpoint.startsWith('/'))
      : [],
  )
  const parity = getFrontendAParityForRoute(route.path)

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
    capabilityIds: parity?.capabilityIds ?? [],
    securityDomains: parity?.securityDomains ?? [],
    cliCommands: parity?.cliCommands ?? [],
    legacySource: parity?.legacySource ?? [],
    parityStatus: parity?.parityStatus ?? 'missing',
    svelteSurfaces: parity?.svelteSurfaces ?? [],
    navTier: navMeta.navTier,
    navGroup: navMeta.navGroup,
    navOrder: navMeta.navOrder,
    purpose: navMeta.purpose,
    operatorTask: navMeta.operatorTask,
    topologyContext: navMeta.topologyContext,
    proofPriority: navMeta.proofPriority,
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

export function getClosestMapleRoute(path) {
  const direct = getMapleRoute(path)
  if (direct) {
    return direct
  }
  return (
    MAPLE_ROUTE_REGISTRY
      .filter((route) => path === route.path || path.startsWith(`${route.path}/`))
      .sort((left, right) => right.path.length - left.path.length)[0] ?? null
  )
}

export function getMaplePrimaryRouteForCategory(category) {
  return getMapleRoutesByCategory(category)[0] ?? null
}

export function getMapleDockGroupForPath(path) {
  const route = getClosestMapleRoute(path)
  if (route && ['primary', 'secondary'].includes(route.navTier)) {
    return route.navGroup
  }
  return null
}

export function getMapleRoutesByDockGroup(groupId) {
  return MAPLE_ROUTE_REGISTRY
    .filter((route) => route.navGroup === groupId && route.navTier !== 'utility' && route.navTier !== 'hidden')
    .sort((left, right) => (left.navOrder ?? 99) - (right.navOrder ?? 99))
}

export function getMapleUtilityRoutes() {
  return MAPLE_ROUTE_REGISTRY
    .filter((route) => route.navTier === 'utility')
    .sort((left, right) => (left.navOrder ?? 99) - (right.navOrder ?? 99))
}

export function getMapleRouteForLegacyPath(path) {
  const route = MAPLE_ROUTE_REGISTRY.find((entry) => entry.legacyAliases.includes(path))
  return route ?? null
}

export const MAPLE_WORKSPACE_ROUTE_PATHS = Object.freeze(
  MAPLE_ROUTE_REGISTRY.map((route) => route.path),
)
