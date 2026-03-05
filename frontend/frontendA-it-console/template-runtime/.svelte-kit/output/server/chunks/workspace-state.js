const allSections = {
  "/": [
    { title: "Control Plane", id: "control-plane" },
    { title: "Workflow", id: "workflow" },
    { title: "Live Endpoints", id: "live-endpoints" }
  ],
  "/sdks": [
    { title: "Official libraries", id: "official-libraries" }
  ],
  "/maple/admin": [
    { title: "Endpoints", id: "endpoints" }
  ],
  "/maple/desktop": [
    { title: "Journey", id: "journey" }
  ],
  "/maple/community": [
    { title: "Stats", id: "stats" },
    { title: "Shared traces", id: "shared-traces" }
  ],
  "/maple/gateway": [
    { title: "Status", id: "status" },
    { title: "Effective rules", id: "effective-rules" },
    { title: "Preview tool", id: "preview-tool" },
    { title: "Firewall state", id: "firewall-state" },
    { title: "Streaming chat", id: "streaming-chat" },
    { title: "Firewall chat", id: "firewall-chat" },
    { title: "Capabilities", id: "capabilities" }
  ],
  "/maple/demo": [
    { title: "Sessions", id: "demo-sessions" },
    { title: "Quick actions", id: "quick-actions" },
    { title: "Community actions", id: "community-actions" },
    { title: "Result", id: "result" }
  ],
  "/maple/downstream": [
    { title: "Connected apps", id: "connected-apps" },
    { title: "Dispatch", id: "dispatch" }
  ],
  "/maple/org": [
    { title: "Organizations", id: "org-list" },
    { title: "Members", id: "members" },
    { title: "Invites", id: "invites" },
    { title: "Accept invite", id: "accept-invite" },
    { title: "Roles", id: "roles" }
  ],
  "/maple/modifier-approvals": [
    { title: "Capabilities", id: "capabilities" },
    { title: "Pending approvals", id: "pending-approvals" },
    { title: "Connection", id: "connection" },
    { title: "Execute", id: "execute" }
  ],
  "/maple/observability": [
    { title: "Summary", id: "obs-summary" },
    { title: "SLO signals", id: "slo" },
    { title: "Audit log", id: "audit-log" },
    { title: "SIEM export", id: "siem" },
    { title: "Alert webhooks", id: "alert-webhooks" }
  ],
  "/maple/runs": [
    { title: "Runs list", id: "runs-list" }
  ],
  "/maple/runtime": [
    { title: "Health", id: "health" },
    { title: "Feature capabilities", id: "feature-capabilities" },
    { title: "Runtime status", id: "runtime-status" },
    { title: "Diagnostics", id: "diagnostics" },
    { title: "Logs", id: "logs" },
    { title: "Dependencies", id: "dependencies" },
    { title: "Rate limits", id: "rate-limits" },
    { title: "User profile", id: "user-profile" }
  ],
  "/maple/hitl": [
    { title: "Pending approvals", id: "pending-approvals" },
    { title: "Connection", id: "connection" },
    { title: "Gateway HITL", id: "gateway-hitl" }
  ],
  "/maple/agent": [
    { title: "Agent status", id: "agent-status" },
    { title: "Chat", id: "agent-chat" },
    { title: "Sessions", id: "sessions" }
  ],
  "/maple/tools": [
    { title: "Tools list", id: "tools-list" },
    { title: "Tool policies", id: "tool-policies" },
    { title: "Tool executions", id: "tool-executions" },
    { title: "CLI console", id: "cli-console" }
  ],
  "/maple/escalation": [
    { title: "Escalation chains", id: "escalation-chains" },
    { title: "Break-glass", id: "break-glass" },
    { title: "Step-up auth", id: "step-up-auth" }
  ],
  "/maple/audit": [
    { title: "Audit events", id: "audit-events" },
    { title: "Audit chain", id: "audit-chain" },
    { title: "Retention", id: "retention" },
    { title: "Dead letter", id: "dead-letter" }
  ],
  "/maple/auth-admin": [
    { title: "Session", id: "session" },
    { title: "Login", id: "login" },
    { title: "Register", id: "register" },
    { title: "Google sign-in", id: "google-sign-in" },
    { title: "Password recovery", id: "password-recovery" },
    { title: "Email verification", id: "email-verification" },
    { title: "Logout", id: "logout" }
  ],
  "/maple/api-keys": [
    { title: "API keys", id: "api-keys" },
    { title: "Service accounts", id: "service-accounts" }
  ],
  "/maple/usage": [
    { title: "Entitlements", id: "entitlements" },
    { title: "Usage summary", id: "usage-summary" },
    { title: "Limits", id: "limits" },
    { title: "Billing", id: "billing" },
    { title: "Invoices", id: "invoices" },
    { title: "Limits override", id: "limits-override" }
  ],
  "/maple/tenants": [
    { title: "Tenant bindings", id: "tenant-bindings" },
    { title: "Tenant scope", id: "tenant-scope" },
    { title: "Org tree", id: "org-tree" },
    { title: "Org lifecycle", id: "org-lifecycle" }
  ],
  "/maple/policies": [
    { title: "Active rules", id: "active-rules" },
    { title: "Version history", id: "version-history" },
    { title: "Actions", id: "actions" },
    { title: "Policy operations", id: "policy-ops" }
  ],
  "/maple/integrations": [
    { title: "Catalog", id: "catalog" },
    { title: "Connected integrations", id: "connected" },
    { title: "OAuth actions", id: "oauth-actions" }
  ]
};
const MAPLE_WORKSPACE_CATEGORY_IDS = Object.freeze([
  "chat",
  "observe",
  "admin",
  "firewalls",
  "users",
  "docs"
]);
function isMapleWorkspaceCategory(value) {
  return typeof value === "string" && MAPLE_WORKSPACE_CATEGORY_IDS.includes(
    /** @type {MapleWorkspaceCategory} */
    value
  );
}
const MAPLE_WORKSPACE_PATH_PREFIX = "/maple";
const MAPLE_WORKSPACE_DEFAULT_ROUTE = "/maple/observability";
const MAPLE_WORKSPACE_CATEGORIES = Object.freeze([
  { id: "chat", label: "Chat", description: "Monitoring agent conversation and live recommendations." },
  { id: "observe", label: "Monitor", description: "Live telemetry and runtime snapshots." },
  { id: "admin", label: "System", description: "Identity, integrations, and account operations." },
  { id: "firewalls", label: "Firewalls", description: "Firewall rules, protections, and context leakage controls." },
  { id: "users", label: "Users", description: "User accounts, role assignments, and access governance." }
]);
const LEGACY_DOC_LINKS = Object.freeze([
  { label: "Operations Overview", href: "/" },
  { label: "Quickstart", href: "/quickstart" },
  { label: "SDKs", href: "/sdks" },
  { label: "Messages", href: "/messages" },
  { label: "Webhooks", href: "/webhooks" }
]);
const MAPLE_ROUTE_DEFINITIONS = [
  {
    path: "/maple/observability",
    title: "Observability",
    category: "observe",
    tabLabel: "Observability",
    description: "Monitor SLOs, audit coverage, and alert webhooks in one surface.",
    apiEndpoints: [
      "/api/observability/orchestrations/summary",
      "/api/observability/orchestrations/slo",
      "/api/observability/orchestrations/audit-log",
      "/api/observability/orchestrations/alert-webhooks"
    ],
    preferredView: "live"
  },
  {
    path: "/maple/audit",
    title: "Audit + Traces",
    category: "admin",
    tabLabel: "Audit + Traces",
    description: "Review immutable audit chains, retention state, and dead-letter replay.",
    apiEndpoints: [
      "/api/observability/orchestrations/audit-log",
      "/api/observability/orchestrations/audit-chain",
      "/api/observability/orchestrations/retention",
      "/api/observability/orchestrations/dead-letter"
    ],
    preferredView: "control",
    legacyAliases: ["/maple/policies", "/maple/tenants"]
  },
  {
    path: "/maple/gateway",
    title: "Firewall Dashboard",
    category: "firewalls",
    tabLabel: "Firewall Dashboard",
    description: "Track firewall status, effective rules, and preview live decisions.",
    apiEndpoints: [
      "/api/firewall/rules/effective",
      "/api/firewall/state",
      "/api/firewall/preview",
      "/api/firewall/decision",
      "/api/firewall/chat"
    ],
    preferredView: "cybersecurity"
  },
  {
    path: "/maple/runs",
    title: "Runs",
    category: "observe",
    tabLabel: "Runs",
    description: "Inspect run inventory and execution outcomes across active sessions.",
    apiEndpoints: ["/api/runs"],
    preferredView: "timeline"
  },
  {
    path: "/maple/community",
    title: "Community",
    category: "observe",
    tabLabel: "Community",
    description: "Browse shared trace signals and anonymized network patterns.",
    apiEndpoints: ["/api/community/stats", "/api/community/traces"],
    preferredView: "timeline"
  },
  {
    path: "/maple/hitl",
    title: "HITL Queue",
    category: "admin",
    tabLabel: "HITL Queue",
    description: "Process pending approvals and review high-risk interventions.",
    apiEndpoints: [
      "/api/hitl/approvals",
      "/api/hitl/approvals/watch",
      "/admin/api/approvals",
      "/admin/api/approvals/watch"
    ],
    preferredView: "control"
  },
  {
    path: "/maple/modifier-approvals",
    title: "Modifier Approvals",
    category: "admin",
    tabLabel: "Modifier Approvals",
    description: "Approve or reject modifier actions requiring explicit authorization.",
    apiEndpoints: ["/api/modifier/approvals", "/api/modifier/decision"],
    preferredView: "control"
  },
  {
    path: "/maple/agent",
    title: "Agent Management",
    category: "admin",
    tabLabel: "Agent Management",
    description: "Inspect agent status, message streams, and session context.",
    apiEndpoints: ["/api/openclaw/agent/status", "/api/openclaw/agent/turn"],
    preferredView: "control"
  },
  {
    path: "/maple/demo",
    title: "Demo Playground",
    category: "admin",
    tabLabel: "Demo Playground",
    description: "Run deterministic demos for trace, audit, block, and fork paths.",
    apiEndpoints: ["/api/demo/start", "/api/demo/full", "/api/demo/guard"],
    preferredView: "control"
  },
  {
    path: "/maple/downstream",
    title: "Downstream MCP",
    category: "admin",
    tabLabel: "Downstream MCP",
    description: "Discover connected downstream MCP apps and dispatch tools.",
    apiEndpoints: ["/api/downstream/apps", "/api/downstream/tools", "/api/downstream/dispatch"],
    preferredView: "marketplace"
  },
  {
    path: "/maple/policies",
    title: "Policy Center",
    category: "admin",
    tabLabel: "Policy Center",
    description: "Policy operations surface (currently redirects to audit workflows).",
    apiEndpoints: ["/api/policies", "/admin/api/policies"],
    preferredView: "policy"
  },
  {
    path: "/maple/runtime",
    title: "Runtime",
    category: "admin",
    tabLabel: "Runtime",
    description: "Runtime dependency and capability controls (redirects to observability).",
    apiEndpoints: ["/api/runtime/feature-capabilities", "/api/runtime/status"],
    preferredView: "settings",
    legacyAliases: ["/maple/runtime"]
  },
  {
    path: "/maple/tenants",
    title: "Tenant & Org",
    category: "admin",
    tabLabel: "Tenant & Org",
    description: "Tenant scoping and organizational hierarchy controls.",
    apiEndpoints: ["/api/tenants/bindings", "/api/org/hierarchy"],
    preferredView: "policy"
  },
  {
    path: "/maple/tools",
    title: "Tools Registry",
    category: "admin",
    tabLabel: "Tools Registry",
    description: "Manage tool inventory, policy overlays, and execution telemetry.",
    apiEndpoints: ["/api/tools/registry", "/api/tools/policies", "/api/tools/executions"],
    preferredView: "policy"
  },
  {
    path: "/maple/escalation",
    title: "Escalation",
    category: "admin",
    tabLabel: "Escalation",
    description: "Configure escalation chains, break-glass controls, and step-up auth.",
    apiEndpoints: ["/api/escalation/chains", "/api/escalation/break-glass"],
    preferredView: "policy"
  },
  {
    path: "/maple/org",
    title: "Organizations",
    category: "admin",
    tabLabel: "Organizations",
    description: "Organization membership lifecycle, invites, and roles.",
    apiEndpoints: ["/api/org", "/api/org/invites", "/api/org/roles"],
    preferredView: "settings"
  },
  {
    path: "/maple/admin",
    title: "Admin API",
    category: "admin",
    tabLabel: "Admin API",
    description: "Reference and operate admin API endpoints for policy and audit.",
    apiEndpoints: ["/admin/api/policies", "/admin/api/audit/events", "/admin/api/reload"],
    preferredView: "settings"
  },
  {
    path: "/maple/auth-admin",
    title: "Auth Admin",
    category: "users",
    tabLabel: "Auth Admin",
    description: "Operate login, registration, recovery, and session endpoints.",
    apiEndpoints: ["/api/auth/login", "/api/auth/register", "/api/auth/logout", "/api/auth/me"],
    preferredView: "access"
  },
  {
    path: "/maple/api-keys",
    title: "API Keys",
    category: "admin",
    tabLabel: "API Keys",
    description: "Manage API keys and service accounts for workspace integrations.",
    apiEndpoints: ["/api/auth/api-keys", "/api/auth/service-accounts"],
    preferredView: "settings"
  },
  {
    path: "/maple/integrations",
    title: "Integrations",
    category: "admin",
    tabLabel: "Integrations",
    description: "Connect and manage third-party integrations and OAuth state.",
    apiEndpoints: ["/api/integrations/catalog", "/api/integrations/oauth/connect"],
    preferredView: "marketplace"
  },
  {
    path: "/maple/usage",
    title: "Usage & Billing",
    category: "admin",
    tabLabel: "Usage & Billing",
    description: "Track usage, entitlements, and billing limits for active plans.",
    apiEndpoints: ["/api/billing/subscription", "/api/billing/usage", "/api/billing/invoices"],
    preferredView: "settings"
  },
  {
    path: "/maple/desktop",
    title: "Desktop Studio",
    category: "admin",
    tabLabel: "Desktop Studio",
    description: "Desktop orchestration journey and deployment handoff notes.",
    apiEndpoints: ["/api/openclaw/agent/turn", "/api/hitl/approvals"],
    preferredView: "settings"
  }
];
function uniqueList(values) {
  return Array.from(new Set(values));
}
function toAnchors(path) {
  const sections = Array.isArray(allSections[path]) ? allSections[path] : [];
  return sections.map((section) => ({
    title: section.title,
    id: section.id,
    ...section.tag ? { tag: section.tag } : {}
  }));
}
const ROUTE_SURFACE_BY_PATH = Object.freeze({
  "/maple/observability": { category: "observe", view: "live" },
  "/maple/gateway": { category: "firewalls", view: "cybersecurity" },
  "/maple/runs": { category: "observe", view: "timeline" },
  "/maple/community": { category: "observe", view: "timeline" },
  "/maple/chat": { category: "chat", view: "chat" },
  "/maple/audit": { category: "admin", view: "control" },
  "/maple/hitl": { category: "admin", view: "control" },
  "/maple/modifier-approvals": { category: "admin", view: "control" },
  "/maple/agent": { category: "admin", view: "control" },
  "/maple/demo": { category: "admin", view: "control" },
  "/maple/downstream": { category: "admin", view: "marketplace" },
  "/maple/policies": { category: "admin", view: "control" },
  "/maple/runtime": { category: "admin", view: "control" },
  "/maple/tenants": { category: "admin", view: "control" },
  "/maple/tools": { category: "admin", view: "control" },
  "/maple/escalation": { category: "admin", view: "control" },
  "/maple/org": { category: "admin", view: "control" },
  "/maple/admin": { category: "admin", view: "control" },
  "/maple/auth-admin": { category: "users", view: "access" },
  "/maple/api-keys": { category: "admin", view: "control" },
  "/maple/integrations": { category: "admin", view: "marketplace" },
  "/maple/usage": { category: "admin", view: "control" },
  "/maple/desktop": { category: "admin", view: "control" }
});
const PRIMARY_FUNCTION_BY_SURFACE = Object.freeze({
  "chat:chat": "monitoring-agent-chat",
  "observe:topology": "runtime-topology",
  "observe:live": "monitor-now",
  "observe:timeline": "chronology",
  "observe:forks": "fork-isolation-monitoring",
  "admin:control": "intervention-execution",
  "admin:settings": "system-health",
  "admin:policy": "policy-operations",
  "admin:marketplace": "integration-lifecycle",
  "firewalls:cybersecurity": "firewall-rules",
  "firewalls:rules": "firewall-rules-library",
  "firewalls:context-leakage": "context-leakage-controls",
  "users:access": "user-role-access",
  "docs:overview": "docs-workspace-model",
  "docs:api": "docs-endpoints",
  "docs:runbooks": "docs-response",
  "docs:route-help": "docs-route-context"
});
function normalizeRouteRecord(route) {
  const category = isMapleWorkspaceCategory(route.category) ? route.category : "observe";
  const mappedSurface = ROUTE_SURFACE_BY_PATH[route.path] ?? { category, view: "live" };
  const docsViews = ["overview", "api", "runbooks", "route-help"];
  const endpoints = uniqueList(
    Array.isArray(route.apiEndpoints) ? route.apiEndpoints.filter((endpoint) => typeof endpoint === "string" && endpoint.startsWith("/")) : []
  );
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
    primaryFunction: PRIMARY_FUNCTION_BY_SURFACE[`${mappedSurface.category}:${mappedSurface.view}`] ?? "monitor-now",
    mappedSurface,
    docsContextKey: route.path,
    compatAliasBehavior: "canonicalize-via-query",
    legacyAliasBehavior: "canonicalize-via-query",
    legacyAliases: Array.isArray(route.legacyAliases) ? uniqueList(route.legacyAliases.filter((value) => typeof value === "string" && value.startsWith("/maple"))) : [],
    docsViews
  };
}
const MAPLE_ROUTE_REGISTRY = Object.freeze(
  MAPLE_ROUTE_DEFINITIONS.map(normalizeRouteRecord)
);
const MAPLE_ROUTE_REGISTRY_BY_PATH = new Map(
  MAPLE_ROUTE_REGISTRY.flatMap((route) => [
    [route.path, route],
    ...route.legacyAliases.map((aliasPath) => [aliasPath, route])
  ])
);
function getMapleRoute(path) {
  return MAPLE_ROUTE_REGISTRY_BY_PATH.get(path) ?? null;
}
Object.freeze(
  MAPLE_ROUTE_REGISTRY.map((route) => route.path)
);
const MAPLE_WORKSPACE_DEFAULT_CATEGORY = "observe";
const MAPLE_WORKSPACE_DEFAULT_VIEW = "live";
const MAPLE_WORKSPACE_CATEGORY_VIEWS = Object.freeze({
  observe: Object.freeze(["topology", "live", "timeline", "forks"]),
  chat: Object.freeze(["chat"]),
  admin: Object.freeze(["control", "marketplace"]),
  firewalls: Object.freeze(["cybersecurity", "rules", "context-leakage"]),
  users: Object.freeze(["access"]),
  docs: Object.freeze(["overview", "api", "runbooks", "route-help"])
});
const CATEGORY_ALIASES = Object.freeze({
  monitor: "observe",
  opschat: "chat",
  analyze: "admin",
  intervene: "admin",
  policy: "admin",
  govern: "admin",
  system: "admin",
  firewall: "firewalls",
  firewalls: "firewalls",
  user: "users",
  users: "users"
});
const VIEW_ALIASES = Object.freeze({
  guard: "policy",
  fork: "policy",
  recovery: "policy",
  integrations: "marketplace",
  settings: "control",
  policy: "control",
  cybersecurity: "cybersecurity",
  rules: "rules",
  leakage: "context-leakage",
  contextleakage: "context-leakage",
  context_leakage: "context-leakage",
  actionforks: "forks",
  action_forks: "forks",
  forks: "forks",
  user: "access",
  roles: "access"
});
const SPECIAL_LEGACY_ROUTE_TARGETS = Object.freeze({
  "/maple/policies": "/maple/audit",
  "/maple/runtime": "/maple/observability",
  "/maple/tenants": "/maple/audit"
});
function normalizeWorkspacePath(pathname) {
  if (typeof pathname !== "string" || pathname.trim().length === 0) {
    return "/";
  }
  const withoutQuery = pathname.split("?")[0].split("#")[0];
  if (withoutQuery.length > 1 && withoutQuery.endsWith("/")) {
    return withoutQuery.slice(0, -1);
  }
  return withoutQuery;
}
function normalizeWorkspaceCategory(value) {
  if (typeof value !== "string") {
    return MAPLE_WORKSPACE_DEFAULT_CATEGORY;
  }
  const normalized = String(value).toLowerCase();
  const resolved = CATEGORY_ALIASES[normalized] ?? normalized;
  return resolved in MAPLE_WORKSPACE_CATEGORY_VIEWS ? resolved : MAPLE_WORKSPACE_DEFAULT_CATEGORY;
}
function normalizeWorkspaceView(category, value) {
  const normalizedCategory = normalizeWorkspaceCategory(category);
  const views = MAPLE_WORKSPACE_CATEGORY_VIEWS[normalizedCategory];
  if (typeof value === "string") {
    const normalized = String(value).toLowerCase();
    const resolved = VIEW_ALIASES[normalized] ?? normalized;
    if (views.includes(resolved)) {
      return resolved;
    }
  }
  return views[0];
}
function resolveLegacyRoute(pathname) {
  const normalizedPathname = normalizeWorkspacePath(pathname);
  if (SPECIAL_LEGACY_ROUTE_TARGETS[normalizedPathname]) {
    return SPECIAL_LEGACY_ROUTE_TARGETS[normalizedPathname];
  }
  if (getMapleRoute(normalizedPathname)) {
    return normalizedPathname;
  }
  return MAPLE_WORKSPACE_DEFAULT_ROUTE;
}
function getWorkspaceCategoryForRoute(routeRecord) {
  if (!routeRecord) {
    return MAPLE_WORKSPACE_DEFAULT_CATEGORY;
  }
  return routeRecord.category;
}
function getWorkspaceViewForRoute(routeRecord) {
  if (!routeRecord) {
    return MAPLE_WORKSPACE_DEFAULT_VIEW;
  }
  return normalizeWorkspaceView(
    routeRecord.category,
    routeRecord.preferredView ?? MAPLE_WORKSPACE_DEFAULT_VIEW
  );
}
function resolveWorkspaceState({ pathname, searchParams }) {
  const normalizedPathname = normalizeWorkspacePath(pathname);
  const isCanonicalPath = normalizedPathname === MAPLE_WORKSPACE_PATH_PREFIX;
  const resolvedRoutePath = isCanonicalPath ? searchParams?.get("route") ?? MAPLE_WORKSPACE_DEFAULT_ROUTE : resolveLegacyRoute(normalizedPathname);
  const routeRecord = getMapleRoute(resolvedRoutePath) ?? getMapleRoute(MAPLE_WORKSPACE_DEFAULT_ROUTE);
  const categoryFromQuery = searchParams?.get("category");
  const viewFromQuery = searchParams?.get("view");
  const executionId = searchParams?.get("executionId") ?? "";
  const sessionId = searchParams?.get("sessionId") ?? "";
  const preserveLegacyAnalyzeTopology = typeof categoryFromQuery === "string" && ["analyze", "intervene"].includes(categoryFromQuery.toLowerCase()) && typeof viewFromQuery === "string" && viewFromQuery.toLowerCase() === "topology";
  const preserveLegacyMonitorChat = typeof categoryFromQuery === "string" && categoryFromQuery.toLowerCase() === "monitor" && typeof viewFromQuery === "string" && viewFromQuery.toLowerCase() === "chat";
  const category = preserveLegacyAnalyzeTopology ? "observe" : preserveLegacyMonitorChat ? "chat" : categoryFromQuery ? normalizeWorkspaceCategory(categoryFromQuery) : getWorkspaceCategoryForRoute(routeRecord);
  const view = viewFromQuery ? preserveLegacyAnalyzeTopology ? "topology" : preserveLegacyMonitorChat ? "chat" : normalizeWorkspaceView(category, viewFromQuery) : getWorkspaceViewForRoute(routeRecord);
  return {
    category,
    view,
    routePath: routeRecord?.path ?? MAPLE_WORKSPACE_DEFAULT_ROUTE,
    routeRecord,
    executionId,
    sessionId,
    isCanonicalPath,
    normalizedPathname
  };
}
function buildWorkspaceHref(state) {
  const params = new URLSearchParams();
  params.set("category", normalizeWorkspaceCategory(state.category));
  params.set("view", normalizeWorkspaceView(state.category, state.view));
  params.set("route", state.routePath || MAPLE_WORKSPACE_DEFAULT_ROUTE);
  if (state.executionId) {
    params.set("executionId", state.executionId);
  }
  if (state.sessionId) {
    params.set("sessionId", state.sessionId);
  }
  return `${MAPLE_WORKSPACE_PATH_PREFIX}?${params.toString()}`;
}
export {
  MAPLE_ROUTE_REGISTRY as M,
  MAPLE_WORKSPACE_CATEGORIES as a,
  buildWorkspaceHref as b,
  resolveWorkspaceState as r
};
