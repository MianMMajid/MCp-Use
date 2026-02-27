(() => {
  const API_KEY_STORAGE_KEY = "maple_desktop_api_key";
  const INTEGRATIONS_STORAGE_KEY = "maple_desktop_integrations";
  const WORKFORCE_EMPLOYEES_STORAGE_KEY = "maple_desktop_workforce_employees";
  const WORKFORCE_TASKS_STORAGE_KEY = "maple_desktop_workforce_tasks";
  const MAX_STREAM_TEXT = 120000;
  const INTEGRATION_CATALOG = [
    { id: "google-workspace", name: "Google Workspace", domain: "Productivity" },
    { id: "slack", name: "Slack", domain: "Communication" },
    { id: "notion", name: "Notion", domain: "Knowledge" },
    { id: "github", name: "GitHub", domain: "Engineering" },
    { id: "jira", name: "Jira", domain: "Project Management" },
    { id: "linear", name: "Linear", domain: "Project Management" },
    { id: "salesforce", name: "Salesforce", domain: "CRM" },
    { id: "hubspot", name: "HubSpot", domain: "CRM" },
    { id: "postgres", name: "PostgreSQL", domain: "Data" },
    { id: "stripe", name: "Stripe", domain: "Billing" },
    { id: "twilio", name: "Twilio", domain: "Messaging" },
    { id: "sendgrid", name: "SendGrid", domain: "Email" },
    { id: "openai", name: "OpenAI", domain: "Model Provider" },
    { id: "anthropic", name: "Anthropic", domain: "Model Provider" },
    { id: "browser", name: "Web Browser", domain: "Research" },
    { id: "filesystem", name: "Filesystem", domain: "Runtime" },
  ];
  const APPLICABLE_ENDPOINTS = [
    { category: "auth", method: "POST", path: "/api/auth/login", body: { username: "demo", password: "password" }, description: "Username/password login." },
    { category: "auth", method: "POST", path: "/api/auth/register", body: { username: "demo", email: "demo@example.com", password: "password123" }, description: "Register account." },
    { category: "auth", method: "POST", path: "/api/auth/logout", body: {}, description: "Logout session." },
    { category: "auth", method: "GET", path: "/api/auth/me", description: "Current auth context." },
    { category: "auth", method: "GET", path: "/api/auth/google/client-id", description: "Google client ID metadata." },
    { category: "auth", method: "POST", path: "/api/auth/google", body: { credential: "" }, description: "Google sign in." },
    { category: "auth", method: "POST", path: "/api/auth/forgot-password", body: { email: "demo@example.com", redirectUrl: "https://mayple.cloud/reset-password" }, description: "Begin password recovery." },
    { category: "auth", method: "POST", path: "/api/auth/password-reset", body: { email: "demo@example.com", redirectUrl: "https://mayple.cloud/reset-password" }, description: "Legacy forgot-password alias." },
    { category: "auth", method: "POST", path: "/api/auth/reset-password", body: { token: "", newPassword: "new-password-123" }, description: "Confirm password reset." },
    { category: "auth", method: "POST", path: "/api/auth/verify-email/request", body: { email: "demo@example.com" }, description: "Request verify email token." },
    { category: "auth", method: "POST", path: "/api/auth/verify-email/confirm", body: { token: "" }, description: "Confirm email verification." },
    { category: "auth", method: "POST", path: "/api/auth/change-password", body: { currentPassword: "old-pass", newPassword: "new-pass-123" }, description: "Change account password." },

    { category: "account", method: "GET", path: "/api/user/profile", description: "Current user profile." },
    { category: "account", method: "POST", path: "/api/user/change-password", body: { currentPassword: "old-pass", newPassword: "new-pass-123" }, description: "User password endpoint alias." },
    { category: "billing", method: "GET", path: "/api/billing/subscription", description: "Current subscription state." },
    { category: "billing", method: "POST", path: "/api/billing/create-checkout-session", body: { plan: "pro", returnUrl: "https://mayple.cloud/account" }, description: "Create Stripe checkout session." },
    { category: "billing", method: "POST", path: "/api/billing/portal-session", body: { returnUrl: "https://mayple.cloud/account" }, description: "Create Stripe customer portal session." },
    { category: "billing", method: "GET", path: "/api/billing/invoices", query: { limit: 20 }, description: "List invoices." },
    { category: "billing", method: "POST", path: "/api/billing/subscription/cancel", body: {}, description: "Cancel subscription." },
    { category: "billing", method: "POST", path: "/api/billing/subscription/resume", body: {}, description: "Resume subscription." },
    { category: "integration", method: "GET", path: "/api/integrations/catalog", description: "Integration provider catalog." },
    { category: "integration", method: "GET", path: "/api/integrations", description: "List user integration connections." },
    { category: "integration", method: "POST", path: "/api/integrations/:provider/connect", params: { provider: "github" }, body: { credential: "token", scopes: ["repo:read"] }, description: "Connect integration provider." },
    { category: "integration", method: "POST", path: "/api/integrations/:provider/disconnect", params: { provider: "github" }, body: {}, description: "Disconnect integration provider." },

    { category: "org", method: "GET", path: "/api/org", description: "List organizations." },
    { category: "org", method: "POST", path: "/api/org", body: { name: "My Org" }, description: "Create organization." },
    { category: "org", method: "PATCH", path: "/api/org/:orgId", params: { orgId: "org_123" }, body: { name: "Renamed Org" }, description: "Update organization." },
    { category: "org", method: "GET", path: "/api/org/:orgId/members", params: { orgId: "org_123" }, description: "List organization members." },
    { category: "org", method: "POST", path: "/api/org/:orgId/invites", params: { orgId: "org_123" }, body: { email: "member@example.com", roleId: "role_member" }, description: "Create org invite." },
    { category: "org", method: "POST", path: "/api/org/invites/:inviteId/accept", params: { inviteId: "invite_123" }, body: {}, description: "Accept org invite." },
    { category: "org", method: "DELETE", path: "/api/org/:orgId/members/:userId", params: { orgId: "org_123", userId: "user_123" }, description: "Remove org member." },
    { category: "org", method: "GET", path: "/api/org/:orgId/roles", params: { orgId: "org_123" }, description: "List org roles." },
    { category: "org", method: "POST", path: "/api/org/:orgId/roles/:roleId/assign", params: { orgId: "org_123", roleId: "role_member" }, body: { userId: "user_123" }, description: "Assign org role." },
    { category: "org", method: "GET", path: "/api/user/api-keys", description: "List personal API keys." },
    { category: "org", method: "POST", path: "/api/user/api-keys", body: { label: "Desktop key", scopes: ["*"] }, description: "Create personal API key." },
    { category: "org", method: "DELETE", path: "/api/user/api-keys/:keyId", params: { keyId: "key_123" }, description: "Delete personal API key." },
    { category: "org", method: "GET", path: "/api/org/:orgId/service-accounts", params: { orgId: "org_123" }, description: "List service accounts." },
    { category: "org", method: "POST", path: "/api/org/:orgId/service-accounts", params: { orgId: "org_123" }, body: { name: "CI Bot" }, description: "Create service account." },
    { category: "org", method: "POST", path: "/api/org/:orgId/service-accounts/:id/keys", params: { orgId: "org_123", id: "svc_123" }, body: { label: "runner-key" }, description: "Create service account key." },
    { category: "org", method: "DELETE", path: "/api/org/:orgId/service-accounts/:id/keys/:keyId", params: { orgId: "org_123", id: "svc_123", keyId: "key_123" }, description: "Delete service account key." },
    { category: "org", method: "GET", path: "/api/entitlements", description: "Resolve account entitlements." },
    { category: "org", method: "GET", path: "/api/usage/summary", description: "Usage summary." },
    { category: "org", method: "GET", path: "/api/usage/timeseries", query: { period: "30d" }, description: "Usage timeseries." },
    { category: "org", method: "GET", path: "/api/limits", description: "Current limits." },
    { category: "org", method: "POST", path: "/api/limits/override", body: { limitKey: "tool_calls_per_day", value: 1000 }, description: "Request limit override." },

    { category: "openclaw", method: "GET", path: "/api/openclaw/agent/status", description: "Agent runtime status." },
    { category: "openclaw", method: "GET", path: "/api/openclaw/agent/sessions", query: { limit: 20 }, description: "List agent sessions." },
    { category: "openclaw", method: "GET", path: "/api/openclaw/agent/sessions/:sessionId", params: { sessionId: "session_123" }, description: "Get session details." },
    { category: "openclaw", method: "POST", path: "/api/openclaw/agent/sessions/:sessionId/cancel", params: { sessionId: "session_123" }, body: {}, description: "Cancel session." },
    { category: "openclaw", method: "GET", path: "/api/openclaw/agent/sessions/:sessionId/stream", params: { sessionId: "session_123" }, sse: true, description: "Watch session events." },
    { category: "openclaw", method: "GET", path: "/api/openclaw/agent/runs/:runId/artifacts", params: { runId: "run_123" }, description: "Fetch run artifacts." },
    { category: "openclaw", method: "POST", path: "/api/openclaw/agent/turn", body: { message: "Summarize current alerts.", timeoutSeconds: 120, deliver: false }, description: "Single turn orchestration." },
    { category: "openclaw", method: "POST", path: "/api/openclaw/agent/longform", body: { objective: "Produce mitigation plan.", maxTurns: 4, timeoutSeconds: 180, deliver: false }, description: "Longform orchestration." },
    { category: "openclaw", method: "GET", path: "/api/openclaw/cli/tools", description: "List OpenClaw CLI tools." },
    { category: "openclaw", method: "GET", path: "/api/openclaw/cli/catalog", description: "Get CLI catalog metadata." },
    { category: "openclaw", method: "GET", path: "/api/openclaw/cli/:tool/help", params: { tool: "agent" }, query: { timeoutSeconds: 60, parseJson: false }, description: "CLI tool help." },
    { category: "openclaw", method: "POST", path: "/api/openclaw/cli/:tool/exec", params: { tool: "agent" }, body: { args: ["--help"], timeoutSeconds: 60 }, description: "Execute CLI tool." },
    { category: "openclaw", method: "POST", path: "/api/openclaw/cli/exec", body: { tool: "agent", args: ["--help"], timeoutSeconds: 60 }, description: "Generic CLI execution." },

    { category: "chat", method: "GET", path: "/api/chat/capabilities", description: "Chat capability status." },
    { category: "chat", method: "POST", path: "/api/chat/stream", body: { messages: [{ role: "user", content: "Hello" }] }, sse: true, description: "Streaming chat endpoint." },
    { category: "chat", method: "POST", path: "/api/firewall/chat", body: { message: "What can you do?" }, description: "Synchronous chat endpoint." },
    { category: "chat", method: "GET", path: "/api/runtime/feature-capabilities", description: "Runtime feature flags." },
    { category: "chat", method: "GET", path: "/api/firewall/state", description: "Firewall state snapshot." },
    { category: "chat", method: "POST", path: "/api/firewall/decision", body: { step: { action: "connect", toolName: "browser.open", input: "https://example.com" } }, description: "Evaluate firewall decision." },
    { category: "chat", method: "POST", path: "/api/firewall/preview", body: { step: { action: "connect", toolName: "browser.open", input: "https://example.com" } }, description: "Preview firewall decision." },

    { category: "hitl", method: "GET", path: "/api/hitl/approvals", query: { sessionId: "" }, description: "List pending HITL approvals." },
    { category: "hitl", method: "GET", path: "/api/hitl/approvals/watch", query: { sessionId: "" }, sse: true, description: "Watch HITL approvals stream." },
    { category: "hitl", method: "POST", path: "/api/hitl/approvals/decision", body: { traceId: "", stepIndex: 0, action: "allow", reason: "" }, description: "Submit HITL decision." },

    { category: "ops", method: "GET", path: "/api/downstream/apps", description: "List downstream applications." },
    { category: "ops", method: "GET", path: "/api/downstream/tools", description: "List downstream tools." },
    { category: "ops", method: "POST", path: "/api/downstream/dispatch", body: { appId: "", toolName: "", input: {} }, description: "Dispatch downstream tool call." },
    { category: "ops", method: "GET", path: "/api/traces", query: { limit: 20 }, description: "List traces." },
    { category: "ops", method: "GET", path: "/api/trace", query: { traceId: "trace_123" }, description: "Legacy trace lookup endpoint." },
    { category: "ops", method: "GET", path: "/api/traces/:traceId", params: { traceId: "trace_123" }, description: "Get single trace." },
    { category: "ops", method: "GET", path: "/api/traces/search", query: { q: "", limit: 20 }, description: "Search traces." },
    { category: "ops", method: "POST", path: "/api/traces/export", body: { format: "json", traceIds: [] }, description: "Export traces." },
    { category: "ops", method: "POST", path: "/api/traces/clear", body: {}, description: "Clear trace store." },
    { category: "ops", method: "GET", path: "/api/runs", query: { limit: 20 }, description: "List runs." },
    { category: "ops", method: "GET", path: "/api/runs/:runId", params: { runId: "run_123" }, description: "Get run details." },
    { category: "ops", method: "GET", path: "/api/runs/:runId/timeline", params: { runId: "run_123" }, description: "Get run timeline." },
    { category: "ops", method: "GET", path: "/api/runtime/dependencies", description: "Dependency health." },
    { category: "ops", method: "GET", path: "/api/runtime/diag", description: "Runtime diagnostics." },
    { category: "ops", method: "GET", path: "/api/runtime/logs", query: { limit: 200 }, description: "Runtime log tail." },
    { category: "ops", method: "GET", path: "/api/community/stats", description: "Community trace stats." },
    { category: "ops", method: "GET", path: "/api/community/traces", query: { limit: 20 }, description: "Community traces feed." },
    { category: "ops", method: "GET", path: "/api/audit/events", query: { limit: 50 }, description: "Gateway audit events query." },
    { category: "ops", method: "GET", path: "/api/tools/registry", description: "Tool registry list." },
    { category: "ops", method: "POST", path: "/api/tools/registry", body: { toolId: "custom.tool", name: "custom.tool", description: "", schema: {} }, description: "Upsert registry tool." },
    { category: "ops", method: "GET", path: "/api/tools/registry/:toolId", params: { toolId: "custom.tool" }, description: "Get registry tool." },
    { category: "ops", method: "PATCH", path: "/api/tools/registry/:toolId", params: { toolId: "custom.tool" }, body: { description: "Updated description" }, description: "Patch registry tool." },
    { category: "ops", method: "GET", path: "/api/tools/policies", description: "List tool policies." },
    { category: "ops", method: "POST", path: "/api/tools/policies/validate", body: { policy: { policyId: "desktop-policy", mode: "allowlist", rules: [] }, persist: false }, description: "Validate tool policy." },
    { category: "ops", method: "GET", path: "/api/tools/executions", query: { limit: 50 }, description: "List tool executions." },
    { category: "ops", method: "GET", path: "/api/tools/executions/:executionId", params: { executionId: "trace_123:1" }, description: "Get execution details." },

    { category: "admin", method: "GET", path: "/admin/api/policies", description: "Admin policy list." },
    { category: "admin", method: "GET", path: "/admin/api/policies/versions", description: "Admin policy versions." },
    { category: "admin", method: "POST", path: "/admin/api/policies/versions/:versionId/activate", params: { versionId: "version_123" }, body: {}, description: "Activate policy version." },
    { category: "admin", method: "POST", path: "/admin/api/policies/validate", body: { policy: { rules: [] } }, description: "Validate policy payload." },
    { category: "admin", method: "POST", path: "/admin/api/policies/reload", body: {}, description: "Reload policies." },
    { category: "admin", method: "GET", path: "/admin/api/audit", query: { limit: 50 }, description: "Admin audit query." },
    { category: "admin", method: "POST", path: "/admin/api/audit/export", body: { format: "json", limit: 100 }, description: "Export admin audit data." },
    { category: "admin", method: "GET", path: "/admin/api/audit/schemas", description: "Audit schema metadata." },
    { category: "admin", method: "GET", path: "/admin/api/compliance/reports", description: "Compliance reports." },
    { category: "admin", method: "GET", path: "/admin/api/approvals", query: { session_id: "" }, description: "Admin approval list." },
    { category: "admin", method: "GET", path: "/admin/api/approvals/watch", query: { session_id: "" }, sse: true, description: "Admin approval stream." },
    { category: "admin", method: "POST", path: "/admin/api/approvals/decision", body: { traceId: "", stepIndex: 0, action: "allow", reason: "" }, description: "Admin submit approval decision." },
  ];
  const EXPLICIT_UI_ENDPOINT_KEYS = new Set([
    "GET /api/runtime/feature-capabilities",
    "GET /api/openclaw/agent/status",
    "POST /api/openclaw/agent/turn",
    "POST /api/openclaw/agent/longform",
    "GET /api/openclaw/agent/sessions",
    "GET /api/openclaw/agent/sessions/:sessionId",
    "POST /api/openclaw/agent/sessions/:sessionId/cancel",
    "GET /api/openclaw/agent/sessions/:sessionId/stream",
    "GET /api/openclaw/agent/runs/:runId/artifacts",
    "GET /api/openclaw/cli/tools",
    "GET /api/openclaw/cli/catalog",
    "GET /api/openclaw/cli/:tool/help",
    "POST /api/openclaw/cli/:tool/exec",
    "POST /api/openclaw/cli/exec",
    "GET /api/chat/capabilities",
    "POST /api/chat/stream",
    "POST /api/firewall/chat",
    "POST /api/auth/login",
    "POST /api/auth/register",
    "POST /api/auth/logout",
    "GET /api/auth/me",
    "GET /api/auth/google/client-id",
    "POST /api/auth/google",
    "POST /api/auth/forgot-password",
    "POST /api/auth/reset-password",
    "POST /api/auth/verify-email/request",
    "POST /api/auth/verify-email/confirm",
    "POST /api/auth/change-password",
    "GET /api/user/profile",
    "GET /api/billing/subscription",
    "POST /api/billing/create-checkout-session",
    "POST /api/billing/portal-session",
    "GET /api/billing/invoices",
    "POST /api/billing/subscription/cancel",
    "POST /api/billing/subscription/resume",
    "GET /api/integrations/catalog",
    "GET /api/integrations",
    "POST /api/integrations/:provider/connect",
    "POST /api/integrations/:provider/disconnect",
    "GET /api/hitl/approvals",
    "GET /api/hitl/approvals/watch",
    "POST /api/hitl/approvals/decision",
    "GET /api/runtime/dependencies",
    "GET /api/runtime/diag",
    "GET /api/runtime/logs",
    "GET /api/traces/search",
    "POST /api/traces/export",
    "GET /api/runs",
    "GET /api/runs/:runId",
    "GET /api/runs/:runId/timeline",
    "GET /api/tools/registry",
    "GET /api/tools/registry/:toolId",
    "GET /api/tools/policies",
    "POST /api/tools/policies/validate",
    "GET /api/tools/executions",
    "GET /api/tools/executions/:executionId",
    "GET /admin/api/policies",
    "GET /admin/api/policies/versions",
    "POST /admin/api/policies/versions/:versionId/activate",
    "POST /admin/api/policies/validate",
    "POST /admin/api/policies/reload",
    "GET /admin/api/audit",
    "POST /admin/api/audit/export",
    "GET /admin/api/audit/schemas",
    "GET /admin/api/compliance/reports",
    "GET /admin/api/approvals",
    "GET /admin/api/approvals/watch",
    "POST /admin/api/approvals/decision",
  ]);

  const els = {
    statusBadge: document.getElementById("statusBadge"),
    modeValue: document.getElementById("modeValue"),
    gatewayValue: document.getElementById("gatewayValue"),
    healthValue: document.getElementById("healthValue"),
    capabilityValue: document.getElementById("capabilityValue"),
    pidValue: document.getElementById("pidValue"),
    bridgeMeta: document.getElementById("bridgeMeta"),
    gatewayFrame: document.getElementById("gatewayFrame"),
    bridgeWarning: document.getElementById("bridgeWarning"),
    runtimeLogs: document.getElementById("runtimeLogs"),
    capabilitiesJson: document.getElementById("capabilitiesJson"),
    apiKeyInput: document.getElementById("apiKeyInput"),

    refreshBtn: document.getElementById("refreshBtn"),
    startBtn: document.getElementById("startBtn"),
    restartBtn: document.getElementById("restartBtn"),
    stopBtn: document.getElementById("stopBtn"),
    openGatewayBtn: document.getElementById("openGatewayBtn"),
    refreshCapabilitiesBtn: document.getElementById("refreshCapabilitiesBtn"),
    saveApiKeyBtn: document.getElementById("saveApiKeyBtn"),
    clearApiKeyBtn: document.getElementById("clearApiKeyBtn"),

    agentStatusBtn: document.getElementById("agentStatusBtn"),
    agentStatusOut: document.getElementById("agentStatusOut"),
    turnMessage: document.getElementById("turnMessage"),
    turnSessionId: document.getElementById("turnSessionId"),
    turnAgentId: document.getElementById("turnAgentId"),
    turnTo: document.getElementById("turnTo"),
    turnThinking: document.getElementById("turnThinking"),
    turnTimeout: document.getElementById("turnTimeout"),
    turnDeliver: document.getElementById("turnDeliver"),
    turnRunBtn: document.getElementById("turnRunBtn"),
    turnOut: document.getElementById("turnOut"),

    longObjective: document.getElementById("longObjective"),
    longSessionId: document.getElementById("longSessionId"),
    longAgentId: document.getElementById("longAgentId"),
    longTo: document.getElementById("longTo"),
    longThinking: document.getElementById("longThinking"),
    longTimeout: document.getElementById("longTimeout"),
    longTurns: document.getElementById("longTurns"),
    longDeliver: document.getElementById("longDeliver"),
    longRunBtn: document.getElementById("longRunBtn"),
    longOut: document.getElementById("longOut"),

    sessionsLimit: document.getElementById("sessionsLimit"),
    sessionsCursor: document.getElementById("sessionsCursor"),
    refreshSessionsBtn: document.getElementById("refreshSessionsBtn"),
    sessionSelect: document.getElementById("sessionSelect"),
    sessionLoadBtn: document.getElementById("sessionLoadBtn"),
    sessionCancelBtn: document.getElementById("sessionCancelBtn"),
    sessionStreamBtn: document.getElementById("sessionStreamBtn"),
    sessionStopStreamBtn: document.getElementById("sessionStopStreamBtn"),
    sessionDetailOut: document.getElementById("sessionDetailOut"),
    sessionEventsOut: document.getElementById("sessionEventsOut"),

    artifactRunId: document.getElementById("artifactRunId"),
    artifactLoadBtn: document.getElementById("artifactLoadBtn"),
    artifactOut: document.getElementById("artifactOut"),

    cliRefreshBtn: document.getElementById("cliRefreshBtn"),
    cliCatalogBtn: document.getElementById("cliCatalogBtn"),
    cliToolSelect: document.getElementById("cliToolSelect"),
    cliArgs: document.getElementById("cliArgs"),
    cliProfile: document.getElementById("cliProfile"),
    cliTimeout: document.getElementById("cliTimeout"),
    cliDev: document.getElementById("cliDev"),
    cliNoColor: document.getElementById("cliNoColor"),
    cliJson: document.getElementById("cliJson"),
    cliParseJson: document.getElementById("cliParseJson"),
    cliPlain: document.getElementById("cliPlain"),
    cliHelpBtn: document.getElementById("cliHelpBtn"),
    cliExecBtn: document.getElementById("cliExecBtn"),
    cliGenericExecBtn: document.getElementById("cliGenericExecBtn"),
    cliOut: document.getElementById("cliOut"),
    cliCatalogOut: document.getElementById("cliCatalogOut"),

    chatCapabilitiesBtn: document.getElementById("chatCapabilitiesBtn"),
    chatPrompt: document.getElementById("chatPrompt"),
    chatMode: document.getElementById("chatMode"),
    orchestrationMode: document.getElementById("orchestrationMode"),
    orchestrateBtn: document.getElementById("orchestrateBtn"),
    chatSendBtn: document.getElementById("chatSendBtn"),
    chatOut: document.getElementById("chatOut"),
    chatTimeline: document.getElementById("chatTimeline"),
    chatStatus: document.getElementById("chatStatus"),
    integrationSearch: document.getElementById("integrationSearch"),
    integrationList: document.getElementById("integrationList"),
    integrationApplyBtn: document.getElementById("integrationApplyBtn"),
    integrationClearBtn: document.getElementById("integrationClearBtn"),
    integrationSelected: document.getElementById("integrationSelected"),
    orchestrationStatus: document.getElementById("orchestrationStatus"),
    journeyStatus: document.getElementById("journeyStatus"),
    journeyProvider: document.getElementById("journeyProvider"),
    journeyIntegrationCredential: document.getElementById("journeyIntegrationCredential"),
    journeySignInBtn: document.getElementById("journeySignInBtn"),
    journeyConnectBtn: document.getElementById("journeyConnectBtn"),
    journeyRunBtn: document.getElementById("journeyRunBtn"),
    journeyHitlBtn: document.getElementById("journeyHitlBtn"),
    journeyBillingBtn: document.getElementById("journeyBillingBtn"),
    journeyRunAllBtn: document.getElementById("journeyRunAllBtn"),
    journeyOut: document.getElementById("journeyOut"),
    journeyStepSignin: document.getElementById("journeyStepSignin"),
    journeyStepIntegrations: document.getElementById("journeyStepIntegrations"),
    journeyStepRun: document.getElementById("journeyStepRun"),
    journeyStepHitl: document.getElementById("journeyStepHitl"),
    journeyStepBilling: document.getElementById("journeyStepBilling"),

    identityUsername: document.getElementById("identityUsername"),
    identityEmail: document.getElementById("identityEmail"),
    identityPassword: document.getElementById("identityPassword"),
    identityNewPassword: document.getElementById("identityNewPassword"),
    identityCredential: document.getElementById("identityCredential"),
    identityResetToken: document.getElementById("identityResetToken"),
    identityVerificationCode: document.getElementById("identityVerificationCode"),
    billingPlan: document.getElementById("billingPlan"),
    billingReturnUrl: document.getElementById("billingReturnUrl"),
    billingInvoiceLimit: document.getElementById("billingInvoiceLimit"),
    authLoginBtn: document.getElementById("authLoginBtn"),
    authRegisterBtn: document.getElementById("authRegisterBtn"),
    authLogoutBtn: document.getElementById("authLogoutBtn"),
    authMeBtn: document.getElementById("authMeBtn"),
    authGoogleClientBtn: document.getElementById("authGoogleClientBtn"),
    authGoogleSigninBtn: document.getElementById("authGoogleSigninBtn"),
    authForgotBtn: document.getElementById("authForgotBtn"),
    authResetBtn: document.getElementById("authResetBtn"),
    authVerifyReqBtn: document.getElementById("authVerifyReqBtn"),
    authVerifyConfirmBtn: document.getElementById("authVerifyConfirmBtn"),
    authChangePasswordBtn: document.getElementById("authChangePasswordBtn"),
    userProfileBtn: document.getElementById("userProfileBtn"),
    billingSubscriptionBtn: document.getElementById("billingSubscriptionBtn"),
    billingCheckoutBtn: document.getElementById("billingCheckoutBtn"),
    billingPortalBtn: document.getElementById("billingPortalBtn"),
    billingInvoicesBtn: document.getElementById("billingInvoicesBtn"),
    billingCancelBtn: document.getElementById("billingCancelBtn"),
    billingResumeBtn: document.getElementById("billingResumeBtn"),
    identityOut: document.getElementById("identityOut"),

    hitlSessionId: document.getElementById("hitlSessionId"),
    hitlTraceId: document.getElementById("hitlTraceId"),
    hitlStepIndex: document.getElementById("hitlStepIndex"),
    hitlAction: document.getElementById("hitlAction"),
    hitlReason: document.getElementById("hitlReason"),
    hitlListBtn: document.getElementById("hitlListBtn"),
    hitlWatchBtn: document.getElementById("hitlWatchBtn"),
    hitlStopWatchBtn: document.getElementById("hitlStopWatchBtn"),
    hitlDecisionBtn: document.getElementById("hitlDecisionBtn"),
    hitlOut: document.getElementById("hitlOut"),
    hitlStreamOut: document.getElementById("hitlStreamOut"),

    opsLimit: document.getElementById("opsLimit"),
    opsCursor: document.getElementById("opsCursor"),
    opsQuery: document.getElementById("opsQuery"),
    opsRunId: document.getElementById("opsRunId"),
    opsToolId: document.getElementById("opsToolId"),
    opsExecutionId: document.getElementById("opsExecutionId"),
    opsTraceIds: document.getElementById("opsTraceIds"),
    opsToolPolicy: document.getElementById("opsToolPolicy"),
    opsRuntimeDepsBtn: document.getElementById("opsRuntimeDepsBtn"),
    opsRuntimeDiagBtn: document.getElementById("opsRuntimeDiagBtn"),
    opsRuntimeLogsBtn: document.getElementById("opsRuntimeLogsBtn"),
    opsTracesSearchBtn: document.getElementById("opsTracesSearchBtn"),
    opsTracesExportBtn: document.getElementById("opsTracesExportBtn"),
    opsRunsListBtn: document.getElementById("opsRunsListBtn"),
    opsRunDetailBtn: document.getElementById("opsRunDetailBtn"),
    opsRunTimelineBtn: document.getElementById("opsRunTimelineBtn"),
    opsToolsRegistryBtn: document.getElementById("opsToolsRegistryBtn"),
    opsToolDetailBtn: document.getElementById("opsToolDetailBtn"),
    opsToolsPoliciesBtn: document.getElementById("opsToolsPoliciesBtn"),
    opsToolsValidateBtn: document.getElementById("opsToolsValidateBtn"),
    opsToolsExecutionsBtn: document.getElementById("opsToolsExecutionsBtn"),
    opsExecutionDetailBtn: document.getElementById("opsExecutionDetailBtn"),
    opsOut: document.getElementById("opsOut"),

    adminVersionId: document.getElementById("adminVersionId"),
    adminPolicyJson: document.getElementById("adminPolicyJson"),
    adminLimit: document.getElementById("adminLimit"),
    adminCursor: document.getElementById("adminCursor"),
    adminTraceId: document.getElementById("adminTraceId"),
    adminStepIndex: document.getElementById("adminStepIndex"),
    adminDecision: document.getElementById("adminDecision"),
    adminReason: document.getElementById("adminReason"),
    adminPoliciesBtn: document.getElementById("adminPoliciesBtn"),
    adminPolicyVersionsBtn: document.getElementById("adminPolicyVersionsBtn"),
    adminPolicyActivateBtn: document.getElementById("adminPolicyActivateBtn"),
    adminPolicyValidateBtn: document.getElementById("adminPolicyValidateBtn"),
    adminPolicyReloadBtn: document.getElementById("adminPolicyReloadBtn"),
    adminAuditBtn: document.getElementById("adminAuditBtn"),
    adminAuditExportBtn: document.getElementById("adminAuditExportBtn"),
    adminAuditSchemasBtn: document.getElementById("adminAuditSchemasBtn"),
    adminComplianceBtn: document.getElementById("adminComplianceBtn"),
    adminApprovalsBtn: document.getElementById("adminApprovalsBtn"),
    adminWatchBtn: document.getElementById("adminWatchBtn"),
    adminStopWatchBtn: document.getElementById("adminStopWatchBtn"),
    adminDecisionBtn: document.getElementById("adminDecisionBtn"),
    adminOut: document.getElementById("adminOut"),
    adminStreamOut: document.getElementById("adminStreamOut"),

    activityRebuildBtn: document.getElementById("activityRebuildBtn"),
    activityClearBtn: document.getElementById("activityClearBtn"),
    activityTree: document.getElementById("activityTree"),
    activitySummaryOut: document.getElementById("activitySummaryOut"),
    workforceEmployeeName: document.getElementById("workforceEmployeeName"),
    workforceEmployeeRole: document.getElementById("workforceEmployeeRole"),
    workforceEmployeeAgentId: document.getElementById("workforceEmployeeAgentId"),
    workforceExecutionMode: document.getElementById("workforceExecutionMode"),
    workforceAddEmployeeBtn: document.getElementById("workforceAddEmployeeBtn"),
    workforceRemoveEmployeeBtn: document.getElementById("workforceRemoveEmployeeBtn"),
    workforceRunQueueBtn: document.getElementById("workforceRunQueueBtn"),
    workforceClearQueueBtn: document.getElementById("workforceClearQueueBtn"),
    workforceEmployeeSelect: document.getElementById("workforceEmployeeSelect"),
    workforceTaskInput: document.getElementById("workforceTaskInput"),
    workforceAssignTaskBtn: document.getElementById("workforceAssignTaskBtn"),
    workforceRunTaskBtn: document.getElementById("workforceRunTaskBtn"),
    workforceTaskSelect: document.getElementById("workforceTaskSelect"),
    workforceOut: document.getElementById("workforceOut"),

    endpointCategory: document.getElementById("endpointCategory"),
    endpointAction: document.getElementById("endpointAction"),
    endpointPathParams: document.getElementById("endpointPathParams"),
    endpointQueryJson: document.getElementById("endpointQueryJson"),
    endpointBodyJson: document.getElementById("endpointBodyJson"),
    endpointLoadTemplateBtn: document.getElementById("endpointLoadTemplateBtn"),
    endpointRunBtn: document.getElementById("endpointRunBtn"),
    endpointStopStreamBtn: document.getElementById("endpointStopStreamBtn"),
    endpointToApiLabBtn: document.getElementById("endpointToApiLabBtn"),
    endpointAuditBtn: document.getElementById("endpointAuditBtn"),
    endpointOut: document.getElementById("endpointOut"),
    endpointAuditOut: document.getElementById("endpointAuditOut"),

    apiMethod: document.getElementById("apiMethod"),
    apiPath: document.getElementById("apiPath"),
    apiBody: document.getElementById("apiBody"),
    apiSendBtn: document.getElementById("apiSendBtn"),
    apiOut: document.getElementById("apiOut"),

    updateBanner: document.getElementById("updateBanner"),
    updateVersion: document.getElementById("updateVersion"),
    updateBtn: document.getElementById("updateBtn"),
  };

  const desktopApi = window.mapleDesktop ?? null;

  const state = {
    config: null,
    requestBases: [],
    adminRequestBases: [],
    gatewayUrl: "",
    chatHistory: [],
    streamControllers: new Map(),
    sessionMap: new Map(),
    selectedIntegrations: new Set(),
    integrationConnections: new Map(),
    workforceEmployees: [],
    workforceTasks: [],
    workforceRunning: false,
    integrationFilter: "",
    featureCapabilities: {},
    journeyStepState: {
      signin: "pending",
      integrations: "pending",
      run: "pending",
      hitl: "pending",
      billing: "pending",
    },
    activityRoot: null,
    activityEventCount: 0,
    endpointCategory: "",
    endpointPath: "",
  };

  function asString(value) {
    if (typeof value !== "string") {
      return "";
    }
    return value.trim();
  }

  function safeJsonParse(rawText) {
    if (typeof rawText !== "string") {
      return null;
    }
    try {
      return JSON.parse(rawText);
    } catch {
      return null;
    }
  }

  function asBooleanFromSelect(value) {
    return String(value).trim().toLowerCase() === "true";
  }

  function asInt(value, fallback = 0) {
    const parsed = Number.parseInt(String(value ?? ""), 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function clampInt(value, min, max, fallback) {
    const parsed = asInt(value, fallback);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.max(min, Math.min(max, parsed));
  }

  function pretty(value) {
    if (typeof value === "string") {
      return value;
    }
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  function stringifyContent(value) {
    if (typeof value === "string") {
      return value;
    }
    if (value === null || typeof value === "undefined") {
      return "";
    }
    return pretty(value);
  }

  function setText(node, value) {
    if (!node) {
      return;
    }
    node.textContent = String(value ?? "");
  }

  function setBadge(label, className = "") {
    if (!els.statusBadge) {
      return;
    }
    els.statusBadge.textContent = label;
    els.statusBadge.className = `badge ${className}`.trim();
  }

  function setOutput(node, value) {
    if (!node) {
      return;
    }
    node.textContent = pretty(value);
  }

  function appendOutput(node, value) {
    if (!node) {
      return;
    }
    const next = `${node.textContent}\n${pretty(value)}`;
    node.textContent = next.length > MAX_STREAM_TEXT ? next.slice(next.length - MAX_STREAM_TEXT) : next;
    node.scrollTop = node.scrollHeight;
  }

  function setNodeDisabled(node, disabled, reason = "") {
    if (!node) {
      return;
    }
    node.disabled = Boolean(disabled);
    if (disabled && reason) {
      node.title = reason;
      return;
    }
    node.removeAttribute("title");
  }

  function featureRecord(featureName) {
    const entry = state.featureCapabilities?.[featureName];
    return entry && typeof entry === "object"
      ? entry
      : { enabled: false, reason: "Capability data unavailable." };
  }

  function featureEnabled(featureName) {
    return featureRecord(featureName).enabled !== false;
  }

  function setJourneyStepState(stepKey, nextState) {
    const key = asString(stepKey);
    if (!key) {
      return;
    }
    state.journeyStepState[key] = asString(nextState) || "pending";
  }

  function renderJourneySteps() {
    const stepNodes = [
      ["signin", els.journeyStepSignin],
      ["integrations", els.journeyStepIntegrations],
      ["run", els.journeyStepRun],
      ["hitl", els.journeyStepHitl],
      ["billing", els.journeyStepBilling],
    ];
    for (const [stepKey, node] of stepNodes) {
      if (!node) {
        continue;
      }
      const stateValue = asString(state.journeyStepState?.[stepKey] || "pending");
      node.classList.remove("done", "active", "blocked");
      if (stateValue === "done") {
        node.classList.add("done");
      } else if (stateValue === "active") {
        node.classList.add("active");
      } else if (stateValue === "blocked" || stateValue === "error") {
        node.classList.add("blocked");
      }
      const stateLabel = node.querySelector(".state");
      if (stateLabel) {
        stateLabel.textContent = stateValue;
      }
    }
  }

  function setJourneyStatus(message) {
    setText(els.journeyStatus, message || "Ready to begin.");
  }

  function applyCapabilityGates() {
    const openclaw = featureRecord("openclawAgent");
    const chat = featureRecord("chatOrchestration");
    const hitl = featureRecord("hitlApprovals");
    const billing = featureRecord("billing");
    const authSession = featureRecord("authSession");
    const integrations = featureRecord("integrations");
    const googleAuth = featureRecord("googleAuth");

    const authUnavailableReason = authSession.enabled ? "" : authSession.reason;
    setNodeDisabled(els.authLoginBtn, !authSession.enabled, authUnavailableReason);
    setNodeDisabled(els.authRegisterBtn, !authSession.enabled, authUnavailableReason);
    setNodeDisabled(els.authLogoutBtn, !authSession.enabled, authUnavailableReason);
    setNodeDisabled(els.authMeBtn, !authSession.enabled, authUnavailableReason);
    setNodeDisabled(els.userProfileBtn, !authSession.enabled, authUnavailableReason);
    setNodeDisabled(els.authGoogleSigninBtn, !googleAuth.enabled, googleAuth.reason);

    const runUnavailableReason = openclaw.enabled ? "" : openclaw.reason;
    setNodeDisabled(els.turnRunBtn, !openclaw.enabled, runUnavailableReason);
    setNodeDisabled(els.longRunBtn, !openclaw.enabled, runUnavailableReason);
    setNodeDisabled(els.agentStatusBtn, !openclaw.enabled, runUnavailableReason);
    setNodeDisabled(els.refreshSessionsBtn, !openclaw.enabled, runUnavailableReason);

    const chatEnabled = chat.enabled || openclaw.enabled;
    const chatReason = chatEnabled ? "" : chat.reason || openclaw.reason;
    setNodeDisabled(els.chatSendBtn, !chatEnabled, chatReason);
    setNodeDisabled(els.orchestrateBtn, !chatEnabled && !openclaw.enabled, chatReason);

    const hitlReason = hitl.enabled ? "" : hitl.reason;
    setNodeDisabled(els.hitlListBtn, !hitl.enabled, hitlReason);
    setNodeDisabled(els.hitlWatchBtn, !hitl.enabled, hitlReason);
    setNodeDisabled(els.hitlDecisionBtn, !hitl.enabled, hitlReason);

    const billingReason = billing.enabled ? "" : billing.reason;
    setNodeDisabled(els.billingSubscriptionBtn, !billing.enabled, billingReason);
    setNodeDisabled(els.billingCheckoutBtn, !billing.enabled, billingReason);
    setNodeDisabled(els.billingPortalBtn, !billing.enabled, billingReason);
    setNodeDisabled(els.billingInvoicesBtn, !billing.enabled, billingReason);
    setNodeDisabled(els.billingCancelBtn, !billing.enabled, billingReason);
    setNodeDisabled(els.billingResumeBtn, !billing.enabled, billingReason);

    setNodeDisabled(els.journeySignInBtn, !authSession.enabled, authUnavailableReason);
    setNodeDisabled(
      els.integrationApplyBtn,
      !(authSession.enabled && integrations.enabled),
      integrations.reason || authUnavailableReason
    );
    setNodeDisabled(
      els.journeyConnectBtn,
      !(authSession.enabled && integrations.enabled),
      integrations.reason || authUnavailableReason
    );
    setNodeDisabled(
      els.journeyProvider,
      !(authSession.enabled && integrations.enabled),
      integrations.reason || authUnavailableReason
    );
    setNodeDisabled(els.journeyRunBtn, !openclaw.enabled, runUnavailableReason);
    setNodeDisabled(els.journeyHitlBtn, !hitl.enabled, hitlReason);
    setNodeDisabled(els.journeyBillingBtn, !billing.enabled, billingReason);
    setNodeDisabled(
      els.journeyRunAllBtn,
      !(authSession.enabled && openclaw.enabled),
      "Journey requires authentication and OpenClaw runtime."
    );

    const workforceRunEnabled = openclaw.enabled || chat.enabled;
    const workforceRunReason = workforceRunEnabled
      ? ""
      : openclaw.reason || chat.reason || "No orchestration backend is available.";
    setNodeDisabled(
      els.workforceRunQueueBtn,
      state.workforceRunning || !workforceRunEnabled,
      state.workforceRunning ? "Queue is currently running." : workforceRunReason
    );
    setNodeDisabled(
      els.workforceRunTaskBtn,
      state.workforceRunning || !workforceRunEnabled,
      state.workforceRunning ? "Queue is currently running." : workforceRunReason
    );
  }

  function renderChatTimeline() {
    if (!els.chatTimeline) {
      return;
    }
    const root = els.chatTimeline;
    root.innerHTML = "";
    if (!Array.isArray(state.chatHistory) || state.chatHistory.length === 0) {
      const empty = document.createElement("article");
      empty.className = "chat-item system";
      empty.textContent = "Start a conversation to orchestrate OpenClaw agents.";
      root.appendChild(empty);
      return;
    }
    for (const entry of state.chatHistory) {
      const role = asString(entry?.role) || "assistant";
      const item = document.createElement("article");
      item.className = `chat-item ${role === "user" ? "user" : role === "assistant" ? "assistant" : "system"}`;

      const roleLabel = document.createElement("div");
      roleLabel.className = "chat-role";
      roleLabel.textContent = role;
      item.appendChild(roleLabel);

      const body = document.createElement("div");
      body.textContent = stringifyContent(entry?.content);
      item.appendChild(body);

      root.appendChild(item);
    }
    root.scrollTop = root.scrollHeight;
  }

  function refreshChatViews() {
    setOutput(els.chatOut, state.chatHistory);
    renderChatTimeline();
  }

  function pushChatMessage(role, content) {
    state.chatHistory.push({
      role,
      content: stringifyContent(content),
      createdAt: new Date().toISOString(),
    });
    refreshChatViews();
  }

  function activityRootNode() {
    if (!state.activityRoot) {
      state.activityRoot = {
        key: "root",
        label: "Agent Runtime",
        kind: "root",
        meta: "",
        children: [],
      };
    }
    return state.activityRoot;
  }

  function clipText(value, max = 180) {
    const text = stringifyContent(value);
    if (text.length <= max) {
      return text;
    }
    return `${text.slice(0, max - 3)}...`;
  }

  function integrationNames() {
    return INTEGRATION_CATALOG
      .filter((entry) => state.selectedIntegrations.has(entry.id))
      .map((entry) => entry.name);
  }

  function selectedIntegrationProviders() {
    return INTEGRATION_CATALOG
      .filter((entry) => state.selectedIntegrations.has(entry.id))
      .map((entry) => entry.id);
  }

  function integrationHintText() {
    const providers = selectedIntegrationProviders();
    if (providers.length === 0) {
      return "";
    }
    return `[Connected integrations: ${providers.join(", ")}]`;
  }

  function applyIntegrationContext(text) {
    const prompt = asString(text);
    if (!prompt) {
      return prompt;
    }
    const hint = integrationHintText();
    if (!hint) {
      return prompt;
    }
    if (prompt.includes("[Connected integrations:")) {
      return prompt;
    }
    return `${prompt}\n\n${hint}`;
  }

  function setOrchestrationStatus(message) {
    setText(els.orchestrationStatus, message || "No integration context applied yet.");
  }

  function persistSelectedIntegrations() {
    const ids = Array.from(state.selectedIntegrations.values());
    localStorage.setItem(INTEGRATIONS_STORAGE_KEY, JSON.stringify(ids));
  }

  function loadStoredIntegrations() {
    const raw = localStorage.getItem(INTEGRATIONS_STORAGE_KEY);
    const parsed = safeJsonParse(raw || "[]");
    const selected = Array.isArray(parsed) ? parsed : [];
    state.selectedIntegrations = new Set(
      selected
        .map((entry) => asString(entry))
        .filter((entry) => entry.length > 0)
    );
  }

  function populateJourneyProviderOptions() {
    if (!els.journeyProvider) {
      return;
    }
    const previous = asString(els.journeyProvider.value);
    els.journeyProvider.innerHTML = "";
    for (const entry of INTEGRATION_CATALOG) {
      const option = document.createElement("option");
      option.value = entry.id;
      const connected = state.integrationConnections.get(entry.id)?.status === "connected";
      option.textContent = connected ? `${entry.name} (connected)` : entry.name;
      els.journeyProvider.appendChild(option);
    }
    if (previous && INTEGRATION_CATALOG.some((entry) => entry.id === previous)) {
      els.journeyProvider.value = previous;
      return;
    }
    if (INTEGRATION_CATALOG.length > 0) {
      els.journeyProvider.value = INTEGRATION_CATALOG[0].id;
    }
  }

  async function refreshIntegrationConnections() {
    const response = await apiRequest("/api/integrations");
    const items = Array.isArray(response.data?.items) ? response.data.items : [];
    state.integrationConnections.clear();
    for (const item of items) {
      const provider = asString(item.provider);
      if (!provider) {
        continue;
      }
      state.integrationConnections.set(provider, item);
      if (item.status === "connected" && !state.selectedIntegrations.has(provider)) {
        state.selectedIntegrations.add(provider);
      }
    }
    const connectedCount = items.filter((item) => asString(item.status) === "connected").length;
    setJourneyStepState("integrations", connectedCount > 0 ? "done" : "pending");
    renderJourneySteps();
    persistSelectedIntegrations();
    populateJourneyProviderOptions();
    renderIntegrationList();
    renderSelectedIntegrationChips();
    appendOutput(els.journeyOut, {
      event: "integrations.refresh",
      count: items.length,
    });
    return response;
  }

  async function connectIntegration(provider, credential, scopes = []) {
    const normalizedProvider = asString(provider);
    if (!normalizedProvider) {
      throw new Error("Integration provider is required.");
    }
    const normalizedCredential = asString(credential);
    if (!normalizedCredential) {
      throw new Error("Integration credential is required.");
    }
    const payload = {
      credential: normalizedCredential,
      scopes: Array.isArray(scopes) ? scopes : [],
      connectedVia: "desktop-journey",
    };
    const response = await apiRequest(
      `/api/integrations/${encodeURIComponent(normalizedProvider)}/connect`,
      {
        method: "POST",
        body: payload,
      }
    );
    const integration = response.data?.integration;
    if (integration && asString(integration.provider)) {
      state.integrationConnections.set(asString(integration.provider), integration);
      state.selectedIntegrations.add(asString(integration.provider));
      persistSelectedIntegrations();
      populateJourneyProviderOptions();
      renderIntegrationList();
      renderSelectedIntegrationChips();
      setJourneyStepState("integrations", "done");
      renderJourneySteps();
    }
    return response;
  }

  async function disconnectIntegration(provider) {
    const normalizedProvider = asString(provider);
    if (!normalizedProvider) {
      throw new Error("Integration provider is required.");
    }
    const response = await apiRequest(
      `/api/integrations/${encodeURIComponent(normalizedProvider)}/disconnect`,
      {
        method: "POST",
        body: {},
      }
    );
    const integration = response.data?.integration;
    if (integration && asString(integration.provider)) {
      state.integrationConnections.set(asString(integration.provider), integration);
    }
    state.selectedIntegrations.delete(normalizedProvider);
    persistSelectedIntegrations();
    populateJourneyProviderOptions();
    renderIntegrationList();
    renderSelectedIntegrationChips();
    setJourneyStepState("integrations", "pending");
    renderJourneySteps();
    return response;
  }

  function renderSelectedIntegrationChips() {
    if (!els.integrationSelected) {
      return;
    }
    els.integrationSelected.innerHTML = "";
    const names = integrationNames();
    if (names.length === 0) {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = "No integrations selected";
      els.integrationSelected.appendChild(chip);
      setOrchestrationStatus("No integration context applied yet.");
      return;
    }
    for (const name of names) {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = name;
      els.integrationSelected.appendChild(chip);
    }
    setOrchestrationStatus(`Integration context active: ${names.join(", ")}`);
  }

  function renderIntegrationList() {
    if (!els.integrationList) {
      return;
    }
    const filter = state.integrationFilter.toLowerCase();
    els.integrationList.innerHTML = "";
    const filtered = INTEGRATION_CATALOG.filter((entry) => {
      if (!filter) {
        return true;
      }
      return (
        entry.name.toLowerCase().includes(filter) ||
        entry.domain.toLowerCase().includes(filter) ||
        entry.id.toLowerCase().includes(filter)
      );
    });
    for (const entry of filtered) {
      const label = document.createElement("label");
      label.className = "integration-item";
      label.setAttribute("for", `integration-${entry.id}`);

      const input = document.createElement("input");
      input.type = "checkbox";
      input.id = `integration-${entry.id}`;
      input.checked = state.selectedIntegrations.has(entry.id);
      input.addEventListener("change", () => {
        if (input.checked) {
          state.selectedIntegrations.add(entry.id);
        } else {
          state.selectedIntegrations.delete(entry.id);
        }
        persistSelectedIntegrations();
        renderSelectedIntegrationChips();
        populateJourneyProviderOptions();
      });

      const text = document.createElement("span");
      const integrationState = state.integrationConnections.get(entry.id);
      const connected = integrationState?.status === "connected";
      text.textContent = connected
        ? `${entry.name} · ${entry.domain} · connected`
        : `${entry.name} · ${entry.domain}`;

      label.appendChild(input);
      label.appendChild(text);
      els.integrationList.appendChild(label);
    }
    if (filtered.length === 0) {
      const empty = document.createElement("div");
      empty.className = "muted";
      empty.textContent = "No matching integrations";
      els.integrationList.appendChild(empty);
    }
    renderSelectedIntegrationChips();
  }

  function newWorkforceId(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function normalizeWorkforceEmployee(raw, index) {
    const name = asString(raw?.name) || `Employee ${index + 1}`;
    return {
      id: asString(raw?.id) || newWorkforceId("emp"),
      name,
      role: asString(raw?.role) || "Generalist",
      agentId: asString(raw?.agentId),
      createdAt: asString(raw?.createdAt) || new Date().toISOString(),
      lastTaskAt: asString(raw?.lastTaskAt),
      lastStatus: asString(raw?.lastStatus) || "idle",
      lastSessionId: asString(raw?.lastSessionId),
      lastRunId: asString(raw?.lastRunId),
      completedTasks: clampInt(raw?.completedTasks, 0, 1000000, 0),
      failedTasks: clampInt(raw?.failedTasks, 0, 1000000, 0),
    };
  }

  function normalizeWorkforceTask(raw, index) {
    return {
      id: asString(raw?.id) || newWorkforceId("task"),
      employeeId: asString(raw?.employeeId),
      text: asString(raw?.text) || `Task ${index + 1}`,
      status: asString(raw?.status) || "queued",
      mode: asString(raw?.mode),
      createdAt: asString(raw?.createdAt) || new Date().toISOString(),
      startedAt: asString(raw?.startedAt),
      completedAt: asString(raw?.completedAt),
      responseStatus: clampInt(raw?.responseStatus, 0, 999, 0),
      sessionId: asString(raw?.sessionId),
      runId: asString(raw?.runId),
      resultPreview: asString(raw?.resultPreview),
      error: asString(raw?.error),
    };
  }

  function loadWorkforceState() {
    const storedEmployees = safeJsonParse(
      localStorage.getItem(WORKFORCE_EMPLOYEES_STORAGE_KEY) || "[]"
    );
    const storedTasks = safeJsonParse(
      localStorage.getItem(WORKFORCE_TASKS_STORAGE_KEY) || "[]"
    );
    const employees = Array.isArray(storedEmployees)
      ? storedEmployees.map((entry, index) => normalizeWorkforceEmployee(entry, index))
      : [];
    const tasks = Array.isArray(storedTasks)
      ? storedTasks.map((entry, index) => normalizeWorkforceTask(entry, index))
      : [];
    state.workforceEmployees = employees.slice(0, 100);
    state.workforceTasks = tasks.slice(0, 500);
  }

  function persistWorkforceState() {
    localStorage.setItem(
      WORKFORCE_EMPLOYEES_STORAGE_KEY,
      JSON.stringify(state.workforceEmployees)
    );
    localStorage.setItem(
      WORKFORCE_TASKS_STORAGE_KEY,
      JSON.stringify(state.workforceTasks)
    );
  }

  function workforceEmployeeById(employeeId) {
    const id = asString(employeeId);
    return state.workforceEmployees.find((entry) => entry.id === id) || null;
  }

  function selectedWorkforceEmployeeId() {
    return asString(els.workforceEmployeeSelect?.value);
  }

  function selectedWorkforceTaskId() {
    return asString(els.workforceTaskSelect?.value);
  }

  function workforceSummary(extra = {}) {
    const queued = state.workforceTasks.filter((entry) => entry.status === "queued")
      .length;
    const running = state.workforceTasks.filter((entry) => entry.status === "running")
      .length;
    const done = state.workforceTasks.filter((entry) => entry.status === "done").length;
    const failed = state.workforceTasks.filter((entry) => entry.status === "failed")
      .length;
    return {
      generatedAt: new Date().toISOString(),
      workforce: {
        employees: state.workforceEmployees.length,
        queued,
        running,
        done,
        failed,
        executionMode: asString(els.workforceExecutionMode?.value || "auto"),
      },
      ...extra,
    };
  }

  function renderWorkforceEmployees() {
    if (!els.workforceEmployeeSelect) {
      return;
    }
    const previous = asString(els.workforceEmployeeSelect.value);
    els.workforceEmployeeSelect.innerHTML = "";
    for (const employee of state.workforceEmployees) {
      const option = document.createElement("option");
      option.value = employee.id;
      option.textContent = `${employee.name} · ${employee.role} · ok:${employee.completedTasks} err:${employee.failedTasks}`;
      if (employee.id === previous) {
        option.selected = true;
      }
      els.workforceEmployeeSelect.appendChild(option);
    }
    if (!asString(els.workforceEmployeeSelect.value) && state.workforceEmployees[0]) {
      els.workforceEmployeeSelect.value = state.workforceEmployees[0].id;
    }
  }

  function renderWorkforceTasks() {
    if (!els.workforceTaskSelect) {
      return;
    }
    const previous = asString(els.workforceTaskSelect.value);
    els.workforceTaskSelect.innerHTML = "";
    const tasks = [...state.workforceTasks].sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt)
    );
    for (const task of tasks) {
      const employee = workforceEmployeeById(task.employeeId);
      const option = document.createElement("option");
      option.value = task.id;
      const assignee = employee ? employee.name : "Unassigned";
      option.textContent = `[${task.status}] ${assignee} · ${clipText(task.text, 80)}`;
      if (task.id === previous) {
        option.selected = true;
      }
      els.workforceTaskSelect.appendChild(option);
    }
    if (!asString(els.workforceTaskSelect.value) && tasks[0]) {
      els.workforceTaskSelect.value = tasks[0].id;
    }
  }

  function renderWorkforceBoard(extraSummary = null) {
    renderWorkforceEmployees();
    renderWorkforceTasks();
    setOutput(els.workforceOut, workforceSummary(extraSummary || {}));
  }

  function addWorkforceEmployee() {
    const name = asString(els.workforceEmployeeName?.value);
    const role = asString(els.workforceEmployeeRole?.value) || "Generalist";
    const agentId = asString(els.workforceEmployeeAgentId?.value);
    if (!name) {
      renderWorkforceBoard({ ok: false, error: "Employee name is required." });
      return;
    }
    const employee = normalizeWorkforceEmployee(
      {
        id: newWorkforceId("emp"),
        name,
        role,
        agentId,
        createdAt: new Date().toISOString(),
      },
      state.workforceEmployees.length
    );
    state.workforceEmployees.push(employee);
    if (state.workforceEmployees.length > 100) {
      state.workforceEmployees = state.workforceEmployees.slice(
        state.workforceEmployees.length - 100
      );
    }
    persistWorkforceState();
    renderWorkforceBoard({
      event: "workforce.employee.added",
      employee,
    });
  }

  function removeSelectedWorkforceEmployee() {
    const employeeId = selectedWorkforceEmployeeId();
    if (!employeeId) {
      renderWorkforceBoard({ ok: false, error: "Select an employee to remove." });
      return;
    }
    const employee = workforceEmployeeById(employeeId);
    state.workforceEmployees = state.workforceEmployees.filter(
      (entry) => entry.id !== employeeId
    );
    state.workforceTasks = state.workforceTasks.filter(
      (task) => task.employeeId !== employeeId || task.status === "done"
    );
    persistWorkforceState();
    renderWorkforceBoard({
      event: "workforce.employee.removed",
      employee,
    });
  }

  function assignWorkforceTask() {
    const employeeId = selectedWorkforceEmployeeId();
    const taskText = asString(els.workforceTaskInput?.value);
    const employee = workforceEmployeeById(employeeId);
    if (!employee) {
      renderWorkforceBoard({ ok: false, error: "Select an employee first." });
      return;
    }
    if (!taskText) {
      renderWorkforceBoard({ ok: false, error: "Task text is required." });
      return;
    }
    const task = normalizeWorkforceTask(
      {
        id: newWorkforceId("task"),
        employeeId,
        text: taskText,
        status: "queued",
        createdAt: new Date().toISOString(),
      },
      state.workforceTasks.length
    );
    state.workforceTasks.push(task);
    if (state.workforceTasks.length > 500) {
      state.workforceTasks = state.workforceTasks.slice(
        state.workforceTasks.length - 500
      );
    }
    if (els.workforceTaskInput) {
      els.workforceTaskInput.value = "";
    }
    persistWorkforceState();
    renderWorkforceBoard({
      event: "workforce.task.assigned",
      task,
      employee: {
        id: employee.id,
        name: employee.name,
      },
    });
  }

  function resolveWorkforceExecutionMode() {
    const selected = asString(els.workforceExecutionMode?.value || "auto");
    if (selected === "openclaw" || selected === "chat") {
      return selected;
    }
    if (featureEnabled("openclawAgent")) {
      return "openclaw";
    }
    return "chat";
  }

  async function runWorkforceTaskById(taskId) {
    const normalizedTaskId = asString(taskId);
    const task = state.workforceTasks.find((entry) => entry.id === normalizedTaskId);
    if (!task) {
      throw new Error("Task not found.");
    }
    const employee = workforceEmployeeById(task.employeeId);
    if (!employee) {
      task.status = "failed";
      task.error = "Employee not found.";
      task.completedAt = new Date().toISOString();
      persistWorkforceState();
      renderWorkforceBoard({
        event: "workforce.task.failed",
        task,
      });
      return task;
    }
    const executionMode = resolveWorkforceExecutionMode();
    if (executionMode === "openclaw" && !featureEnabled("openclawAgent")) {
      throw new Error(featureRecord("openclawAgent").reason || "OpenClaw unavailable.");
    }
    if (executionMode === "chat" && !featureEnabled("chatOrchestration")) {
      throw new Error(featureRecord("chatOrchestration").reason || "Chat unavailable.");
    }

    task.status = "running";
    task.startedAt = new Date().toISOString();
    task.completedAt = "";
    task.error = "";
    task.mode = executionMode;
    employee.lastStatus = "running";
    employee.lastTaskAt = task.startedAt;
    persistWorkforceState();
    renderWorkforceBoard({
      event: "workforce.task.running",
      task: {
        id: task.id,
        employeeId: task.employeeId,
        mode: executionMode,
      },
    });

    const prompt = applyIntegrationContext(
      `[Employee ${employee.name} | ${employee.role}] Minor task: ${task.text}`
    );
    pushChatMessage("user", `[${employee.name}] ${task.text}`);
    addActivityEvent({
      sessionId: employee.lastSessionId,
      agentId: employee.agentId,
      phase: "workforce.task.start",
      detail: `${employee.name}: ${task.text}`,
      status: "running",
    });

    try {
      let response;
      if (executionMode === "openclaw") {
        response = await apiRequest("/api/openclaw/agent/turn", {
          method: "POST",
          body: {
            message: prompt,
            sessionId: employee.lastSessionId || undefined,
            agentId: employee.agentId || undefined,
            timeoutSeconds: 120,
            deliver: false,
          },
          timeoutMs: 180000,
        });
      } else {
        response = await apiRequest("/api/firewall/chat", {
          method: "POST",
          body: {
            message: prompt,
          },
          timeoutMs: 120000,
        });
      }

      const reply = asString(
        response.data?.reply ||
          response.data?.output ||
          response.data?.summary ||
          response.data?.message
      );

      task.status = response.ok ? "done" : "failed";
      task.completedAt = new Date().toISOString();
      task.responseStatus = response.status;
      task.sessionId = asString(response.data?.sessionId) || task.sessionId;
      task.runId = asString(response.data?.runId) || task.runId;
      task.resultPreview = clipText(reply || pretty(response.data), 220);
      task.error = response.ok
        ? ""
        : asString(response.data?.error || response.data?.reason || `HTTP ${response.status}`);

      employee.lastStatus = task.status;
      employee.lastTaskAt = task.completedAt;
      employee.lastSessionId = task.sessionId || employee.lastSessionId;
      employee.lastRunId = task.runId || employee.lastRunId;
      if (response.ok) {
        employee.completedTasks += 1;
      } else {
        employee.failedTasks += 1;
      }

      if (reply) {
        pushChatMessage(
          "assistant",
          `[${employee.name}] ${reply}`
        );
      }
      addActivityEvent({
        sessionId: task.sessionId || employee.lastSessionId,
        runId: task.runId,
        agentId: employee.agentId,
        phase: "workforce.task.complete",
        detail: `${employee.name}: ${task.resultPreview || task.text}`,
        status: task.status === "done" ? "completed" : "error",
        payload: response.data,
      });
      persistWorkforceState();
      renderWorkforceBoard({
        event: "workforce.task.completed",
        task,
      });
      return task;
    } catch (error) {
      task.status = "failed";
      task.completedAt = new Date().toISOString();
      task.error = error instanceof Error ? error.message : String(error);
      employee.lastStatus = "failed";
      employee.lastTaskAt = task.completedAt;
      employee.failedTasks += 1;
      addActivityEvent({
        sessionId: employee.lastSessionId,
        agentId: employee.agentId,
        phase: "workforce.task.error",
        detail: `${employee.name}: ${task.error}`,
        status: "error",
      });
      persistWorkforceState();
      renderWorkforceBoard({
        event: "workforce.task.failed",
        task,
      });
      return task;
    }
  }

  async function runSelectedWorkforceTask() {
    const taskId = selectedWorkforceTaskId();
    if (!taskId) {
      renderWorkforceBoard({ ok: false, error: "Select a task to run." });
      return;
    }
    await runWorkforceTaskById(taskId);
  }

  async function runWorkforceQueue() {
    if (state.workforceRunning) {
      return;
    }
    const queued = state.workforceTasks.filter((entry) => entry.status === "queued");
    if (queued.length === 0) {
      renderWorkforceBoard({ event: "workforce.queue.idle", detail: "No queued tasks." });
      return;
    }
    state.workforceRunning = true;
    setNodeDisabled(els.workforceRunQueueBtn, true, "Queue is running.");
    try {
      for (const task of queued) {
        // eslint-disable-next-line no-await-in-loop
        await runWorkforceTaskById(task.id);
      }
      renderWorkforceBoard({
        event: "workforce.queue.complete",
        processed: queued.length,
      });
    } finally {
      state.workforceRunning = false;
      applyCapabilityGates();
    }
  }

  function clearWorkforceQueue() {
    state.workforceTasks = [];
    persistWorkforceState();
    renderWorkforceBoard({ event: "workforce.queue.cleared" });
  }

  function upsertActivityChild(parent, key, properties) {
    let node = parent.children.find((entry) => entry.key === key);
    if (!node) {
      node = {
        key,
        label: properties.label || key,
        kind: properties.kind || "event",
        meta: properties.meta || "",
        children: [],
      };
      parent.children.push(node);
    } else {
      if (properties.label) {
        node.label = properties.label;
      }
      if (properties.meta) {
        node.meta = properties.meta;
      }
    }
    return node;
  }

  function renderActivityNode(node) {
    const item = document.createElement("li");
    item.className = `tree-node kind-${node.kind || "event"}`;
    const label = document.createElement("div");
    label.className = "tree-label";
    label.textContent = node.meta ? `${node.label} (${node.meta})` : node.label;
    item.appendChild(label);
    if (Array.isArray(node.children) && node.children.length > 0) {
      const childList = document.createElement("ul");
      for (const child of node.children) {
        childList.appendChild(renderActivityNode(child));
      }
      item.appendChild(childList);
    }
    return item;
  }

  function renderActivityTree() {
    if (!els.activityTree) {
      return;
    }
    const root = activityRootNode();
    els.activityTree.innerHTML = "";
    els.activityTree.appendChild(renderActivityNode(root));
    setOutput(els.activitySummaryOut, {
      sessions: root.children.length,
      events: state.activityEventCount,
      selectedIntegrations: integrationNames(),
      generatedAt: new Date().toISOString(),
    });
  }

  function resetActivityTree() {
    state.activityEventCount = 0;
    state.activityRoot = {
      key: "root",
      label: "Agent Runtime",
      kind: "root",
      meta: "",
      children: [],
    };
    renderActivityTree();
  }

  function summarizeEventPayload(value) {
    if (value && typeof value === "object") {
      return (
        asString(value.summary) ||
        asString(value.message) ||
        asString(value.content) ||
        asString(value.status) ||
        clipText(pretty(value), 140)
      );
    }
    return clipText(value, 140);
  }

  function addActivityEvent(event) {
    const root = activityRootNode();
    const sessionId = asString(event.sessionId);
    const runId = asString(event.runId);
    const agentId = asString(event.agentId);
    const phase = asString(event.phase) || "event";
    const detail = clipText(event.detail || summarizeEventPayload(event.payload), 180);
    const status = asString(event.status);

    const sessionKey = sessionId ? `session:${sessionId}` : "session:unscoped";
    const sessionNode = upsertActivityChild(root, sessionKey, {
      label: sessionId ? `Session ${sessionId}` : "Session unscoped",
      kind: "session",
      meta: status,
    });

    let cursor = sessionNode;
    if (runId) {
      cursor = upsertActivityChild(cursor, `run:${runId}`, {
        label: `Run ${runId}`,
        kind: "run",
        meta: status,
      });
    }
    if (agentId) {
      cursor = upsertActivityChild(cursor, `agent:${agentId}`, {
        label: `Agent ${agentId}`,
        kind: "agent",
      });
    }

    state.activityEventCount += 1;
    cursor.children.push({
      key: `event:${Date.now()}:${state.activityEventCount}`,
      label: `${phase}${detail ? ` - ${detail}` : ""}`,
      kind: "event",
      meta: status,
      children: [],
    });

    if (cursor.children.length > 30) {
      cursor.children = cursor.children.slice(cursor.children.length - 30);
    }
    if (root.children.length > 30) {
      root.children = root.children.slice(root.children.length - 30);
    }
    renderActivityTree();
  }

  function syncActivitySessions(items) {
    const root = activityRootNode();
    for (const item of items) {
      const sessionId = asString(item.sessionId || item.id);
      if (!sessionId) {
        continue;
      }
      const sessionNode = upsertActivityChild(root, `session:${sessionId}`, {
        label: `Session ${sessionId}`,
        kind: "session",
        meta: asString(item.status || "unknown"),
      });
      const runId = asString(item.runId);
      if (runId) {
        upsertActivityChild(sessionNode, `run:${runId}`, {
          label: `Run ${runId}`,
          kind: "run",
          meta: asString(item.status || ""),
        });
      }
    }
    renderActivityTree();
  }

  function rebuildActivityFromSessions() {
    resetActivityTree();
    for (const item of state.sessionMap.values()) {
      addActivityEvent({
        sessionId: asString(item.sessionId || item.id),
        runId: asString(item.runId || ""),
        agentId: asString(item.agentId || ""),
        phase: "session.sync",
        detail: `${asString(item.status || "unknown")} @ ${asString(item.updatedAt || item.startedAt || "")}`,
        status: asString(item.status || ""),
      });
    }
  }

  function endpointKey(method, path) {
    return `${String(method || "GET").toUpperCase()} ${String(path || "").trim()}`;
  }

  function endpointCategories() {
    return [...new Set(APPLICABLE_ENDPOINTS.map((entry) => entry.category))].sort((a, b) => a.localeCompare(b));
  }

  function filteredEndpointsForCategory(category) {
    const selected = asString(category);
    if (!selected) {
      return APPLICABLE_ENDPOINTS;
    }
    return APPLICABLE_ENDPOINTS.filter((entry) => entry.category === selected);
  }

  function parseJsonObjectInput(raw, fallback = {}) {
    const trimmed = asString(raw);
    if (!trimmed) {
      return fallback;
    }
    const parsed = safeJsonParse(trimmed);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed;
  }

  function selectedEndpointDefinition() {
    const key = asString(els.endpointAction?.value);
    return APPLICABLE_ENDPOINTS.find((entry) => endpointKey(entry.method, entry.path) === key) || null;
  }

  function renderEndpointCategories() {
    if (!els.endpointCategory) {
      return;
    }
    const categories = endpointCategories();
    if (!state.endpointCategory || !categories.includes(state.endpointCategory)) {
      state.endpointCategory = categories[0] || "";
    }
    els.endpointCategory.innerHTML = "";
    for (const category of categories) {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = `${category} (${filteredEndpointsForCategory(category).length})`;
      if (category === state.endpointCategory) {
        option.selected = true;
      }
      els.endpointCategory.appendChild(option);
    }
  }

  function renderEndpointActions() {
    if (!els.endpointAction) {
      return;
    }
    const selectedCategory = asString(els.endpointCategory?.value) || state.endpointCategory;
    state.endpointCategory = selectedCategory;
    const endpoints = filteredEndpointsForCategory(selectedCategory);
    if (!state.endpointPath || !endpoints.find((entry) => endpointKey(entry.method, entry.path) === state.endpointPath)) {
      state.endpointPath = endpoints[0] ? endpointKey(endpoints[0].method, endpoints[0].path) : "";
    }
    els.endpointAction.innerHTML = "";
    for (const endpoint of endpoints) {
      const key = endpointKey(endpoint.method, endpoint.path);
      const option = document.createElement("option");
      option.value = key;
      option.textContent = `${endpoint.method} ${endpoint.path}`;
      if (key === state.endpointPath) {
        option.selected = true;
      }
      els.endpointAction.appendChild(option);
    }
    const chosen = selectedEndpointDefinition();
    if (chosen) {
      populateEndpointTemplates(chosen, false);
    }
  }

  function populateEndpointTemplates(endpoint, force) {
    if (!endpoint) {
      return;
    }
    const shouldWrite = (node) => Boolean(node) && (force || !asString(node.value));
    if (els.endpointPathParams && shouldWrite(els.endpointPathParams)) {
      els.endpointPathParams.value = pretty(endpoint.params || {});
    }
    if (els.endpointQueryJson && shouldWrite(els.endpointQueryJson)) {
      els.endpointQueryJson.value = pretty(endpoint.query || {});
    }
    if (els.endpointBodyJson && shouldWrite(els.endpointBodyJson)) {
      els.endpointBodyJson.value = pretty(endpoint.body || {});
    }
    setOutput(els.endpointOut, {
      selected: endpointKey(endpoint.method, endpoint.path),
      category: endpoint.category,
      description: endpoint.description || "",
      sse: Boolean(endpoint.sse),
    });
  }

  function resolveEndpointPath(endpoint, paramsObject, queryObject) {
    let path = endpoint.path;
    path = path.replace(/:([A-Za-z0-9_]+)/g, (_, paramName) => {
      const value = asString(paramsObject[paramName]);
      if (!value) {
        throw new Error(`Missing path param "${paramName}"`);
      }
      return encodeURIComponent(value);
    });

    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(queryObject || {})) {
      if (value === null || typeof value === "undefined") {
        continue;
      }
      const serialized = String(value).trim();
      if (!serialized) {
        continue;
      }
      query.set(key, serialized);
    }
    const queryString = query.toString();
    return queryString ? `${path}?${queryString}` : path;
  }

  function endpointBaseCandidates(endpoint) {
    return endpoint.path.startsWith("/admin/api/") ? state.adminRequestBases : state.requestBases;
  }

  async function executeEndpointCatalogEntry() {
    const endpoint = selectedEndpointDefinition();
    if (!endpoint) {
      setOutput(els.endpointOut, { ok: false, error: "Select an endpoint." });
      return;
    }
    const paramsObject = parseJsonObjectInput(els.endpointPathParams?.value, {});
    const queryObject = parseJsonObjectInput(els.endpointQueryJson?.value, {});
    const bodyObject = parseJsonObjectInput(els.endpointBodyJson?.value, {});
    if (!paramsObject) {
      setOutput(els.endpointOut, { ok: false, error: "Path params must be valid JSON object." });
      return;
    }
    if (!queryObject) {
      setOutput(els.endpointOut, { ok: false, error: "Query params must be valid JSON object." });
      return;
    }
    if (!bodyObject) {
      setOutput(els.endpointOut, { ok: false, error: "Body must be valid JSON object." });
      return;
    }
    const path = resolveEndpointPath(endpoint, paramsObject, queryObject);
    const method = String(endpoint.method || "GET").toUpperCase();
    const baseCandidates = endpointBaseCandidates(endpoint);

    if (endpoint.sse) {
      stopStream("endpoint-runner-stream");
      const streamEvents = [];
      setOutput(els.endpointOut, {
        event: "stream.start",
        endpoint: endpointKey(method, endpoint.path),
        path,
      });
      try {
        await apiStream(path, {
          streamKey: "endpoint-runner-stream",
          method,
          body: method === "GET" || method === "HEAD" ? undefined : bodyObject,
          baseCandidates,
          requireEventStream: true,
          timeoutMs: 300000,
          onEvent: (event) => {
            streamEvents.push(event);
            if (streamEvents.length > 80) {
              streamEvents.shift();
            }
            setOutput(els.endpointOut, {
              event: "stream.update",
              endpoint: endpointKey(method, endpoint.path),
              path,
              count: streamEvents.length,
              last: event,
              events: streamEvents,
            });
            addActivityEvent({
              sessionId: asString(event?.data?.sessionId || event?.data?.session_id || ""),
              runId: asString(event?.data?.runId || event?.data?.run_id || ""),
              agentId: asString(event?.data?.agentId || event?.data?.agent_id || ""),
              phase: `endpoint.${endpoint.path}`,
              detail: `${event.event}: ${summarizeEventPayload(event.data)}`,
              status: event.event === "error" ? "error" : "streaming",
              payload: event.data,
            });
          },
        });
      } catch (error) {
        if (!(error instanceof Error) || error.name !== "AbortError") {
          setOutput(els.endpointOut, {
            event: "stream.error",
            endpoint: endpointKey(method, endpoint.path),
            path,
            error: error instanceof Error ? error.message : String(error),
          });
          return;
        }
      }
      return;
    }

    const response = await apiRequest(path, {
      method,
      body: method === "GET" || method === "HEAD" ? undefined : bodyObject,
      timeoutMs: 180000,
      baseCandidates,
      validateResponse: endpoint.path.startsWith("/admin/api/")
        ? (result) => result.contentType.toLowerCase().includes("application/json") || !looksLikeHtml(result.text)
        : undefined,
    });

    setOutput(els.endpointOut, {
      event: "request.complete",
      endpoint: endpointKey(method, endpoint.path),
      path,
      ok: response.ok,
      status: response.status,
      url: response.url,
      data: response.data,
    });
    addActivityEvent({
      sessionId: asString(response.data?.sessionId || response.data?.session_id || ""),
      runId: asString(response.data?.runId || response.data?.run_id || ""),
      agentId: asString(response.data?.agentId || response.data?.agent_id || ""),
      phase: `endpoint.${endpoint.path}`,
      detail: `${method} ${path} -> ${response.status}`,
      status: response.ok ? "completed" : "error",
      payload: response.data,
    });
  }

  function pushEndpointToApiLab() {
    const endpoint = selectedEndpointDefinition();
    if (!endpoint) {
      return;
    }
    const paramsObject = parseJsonObjectInput(els.endpointPathParams?.value, endpoint.params || {}) || {};
    const queryObject = parseJsonObjectInput(els.endpointQueryJson?.value, endpoint.query || {}) || {};
    const path = resolveEndpointPath(endpoint, paramsObject, queryObject);
    if (els.apiMethod) {
      els.apiMethod.value = String(endpoint.method || "GET").toUpperCase();
    }
    if (els.apiPath) {
      els.apiPath.value = path;
    }
    if (els.apiBody) {
      els.apiBody.value = pretty(endpoint.body || {});
    }
    setOutput(els.endpointOut, {
      event: "api_lab.sync",
      endpoint: endpointKey(endpoint.method, endpoint.path),
      path,
    });
  }

  function runEndpointCoverageAudit() {
    const applicableKeys = APPLICABLE_ENDPOINTS.map((entry) => endpointKey(entry.method, entry.path));
    const explicitCovered = applicableKeys.filter((key) => EXPLICIT_UI_ENDPOINT_KEYS.has(key));
    const notExplicit = applicableKeys.filter((key) => !EXPLICIT_UI_ENDPOINT_KEYS.has(key));
    const byCategory = {};
    for (const endpoint of APPLICABLE_ENDPOINTS) {
      if (!byCategory[endpoint.category]) {
        byCategory[endpoint.category] = { total: 0, explicit: 0 };
      }
      byCategory[endpoint.category].total += 1;
      if (EXPLICIT_UI_ENDPOINT_KEYS.has(endpointKey(endpoint.method, endpoint.path))) {
        byCategory[endpoint.category].explicit += 1;
      }
    }
    setOutput(els.endpointAuditOut, {
      generatedAt: new Date().toISOString(),
      applicableEndpoints: applicableKeys.length,
      explicitGuiEndpoints: explicitCovered.length,
      endpointCatalogEnabled: applicableKeys.length,
      explicitCoveragePct: `${Math.round((explicitCovered.length / Math.max(1, applicableKeys.length)) * 100)}%`,
      byCategory,
      endpointsOnlyViaCatalog: notExplicit,
    });
  }

  function normalizeGatewayUrl(rawUrl) {
    const configured = asString(rawUrl);
    if (configured) {
      return configured;
    }
    if (window.location && (window.location.protocol === "http:" || window.location.protocol === "https:")) {
      return `${window.location.origin}/judge`;
    }
    return "http://127.0.0.1:3000/judge";
  }

  function normalizeGatewayOrigin(rawUrl) {
    try {
      return new URL(rawUrl).origin;
    } catch {
      return "";
    }
  }

  function buildRequestBases(gatewayUrl) {
    const bases = [];
    if (window.location && (window.location.protocol === "http:" || window.location.protocol === "https:")) {
      bases.push("");
    }

    const gatewayOrigin = normalizeGatewayOrigin(gatewayUrl);
    if (gatewayOrigin) {
      bases.push(gatewayOrigin);
      if (gatewayOrigin.startsWith("http://")) {
        bases.push(`https://${gatewayOrigin.slice("http://".length)}`);
      }
      if (gatewayOrigin.startsWith("https://")) {
        bases.push(`http://${gatewayOrigin.slice("https://".length)}`);
      }
    }

    bases.push("http://127.0.0.1:3000", "https://127.0.0.1:3000", "http://localhost:3000", "https://localhost:3000");
    return [...new Set(bases.filter((entry) => typeof entry === "string"))];
  }

  function buildAdminRequestBases(adminApiUrl) {
    const bases = [];
    if (window.location && (window.location.protocol === "http:" || window.location.protocol === "https:")) {
      bases.push("");
    }

    const adminOrigin = normalizeGatewayOrigin(adminApiUrl);
    if (adminOrigin) {
      bases.push(adminOrigin);
      if (adminOrigin.startsWith("http://")) {
        bases.push(`https://${adminOrigin.slice("http://".length)}`);
      }
      if (adminOrigin.startsWith("https://")) {
        bases.push(`http://${adminOrigin.slice("https://".length)}`);
      }
    }

    bases.push("https://127.0.0.1:4001", "https://localhost:4001", "http://127.0.0.1:4001", "http://localhost:4001");
    return [...new Set(bases.filter((entry) => typeof entry === "string"))];
  }

  function stopStream(streamKey) {
    const key = asString(streamKey) || "default";
    const controller = state.streamControllers.get(key);
    if (controller) {
      controller.abort();
      state.streamControllers.delete(key);
    }
  }

  function headersWithAuth(includeJson = true) {
    const headers = {};
    if (includeJson) {
      headers["content-type"] = "application/json";
    }
    const apiKey = asString(els.apiKeyInput?.value);
    if (apiKey) {
      headers["x-api-key"] = apiKey;
    }
    return headers;
  }

  async function apiRequest(path, options = {}) {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const method = options.method ?? "GET";
    const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 20000;
    const payload = options.body;
    const baseCandidates = Array.isArray(options.baseCandidates) && options.baseCandidates.length > 0
      ? options.baseCandidates
      : state.requestBases;
    const validateResponse = typeof options.validateResponse === "function" ? options.validateResponse : null;
    let lastError = null;

    for (const base of baseCandidates) {
      const url = `${base}${normalizedPath}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, {
          method,
          credentials: "include",
          cache: "no-store",
          headers: headersWithAuth(payload !== undefined || method !== "GET"),
          body: payload !== undefined ? JSON.stringify(payload) : undefined,
          signal: controller.signal,
        });
        clearTimeout(timeout);
        const text = await response.text();
        const parsed = safeJsonParse(text);
        const result = {
          ok: response.ok,
          status: response.status,
          text,
          data: parsed ?? text,
          contentType: response.headers.get("content-type") || "",
          url,
        };
        if (validateResponse && validateResponse(result) !== true) {
          lastError = new Error(`Response rejected for ${url}`);
          continue;
        }
        return result;
      } catch (error) {
        clearTimeout(timeout);
        lastError = error;
      }
    }

    throw new Error(lastError instanceof Error ? lastError.message : "Request failed across all gateway bases.");
  }

  async function apiStream(path, options = {}) {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const method = options.method ?? "GET";
    const payload = options.body;
    const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 120000;
    const streamKey = asString(options.streamKey) || "default";
    const baseCandidates = Array.isArray(options.baseCandidates) && options.baseCandidates.length > 0
      ? options.baseCandidates
      : state.requestBases;
    const requireEventStream = options.requireEventStream !== false;
    const onEvent = typeof options.onEvent === "function" ? options.onEvent : () => {};
    let lastError = null;

    for (const base of baseCandidates) {
      const url = `${base}${normalizedPath}`;
      const controller = new AbortController();
      stopStream(streamKey);
      state.streamControllers.set(streamKey, controller);
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          method,
          credentials: "include",
          cache: "no-store",
          headers: {
            ...headersWithAuth(payload !== undefined || method !== "GET"),
            accept: "text/event-stream",
          },
          body: payload !== undefined ? JSON.stringify(payload) : undefined,
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          clearTimeout(timeout);
          const bodyText = await response.text();
          throw new Error(`SSE ${response.status}: ${bodyText || "empty body"}`);
        }

        const contentType = String(response.headers.get("content-type") || "").toLowerCase();
        if (requireEventStream && !contentType.includes("text/event-stream")) {
          const bodyText = await response.text();
          throw new Error(`SSE content-type mismatch: ${contentType || "unknown"}; body=${bodyText.slice(0, 120)}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          ({ remainder: buffer } = consumeSseBuffer(buffer, onEvent));
        }

        clearTimeout(timeout);
        if (state.streamControllers.get(streamKey) === controller) {
          state.streamControllers.delete(streamKey);
        }
        return;
      } catch (error) {
        clearTimeout(timeout);
        if (state.streamControllers.get(streamKey) === controller) {
          state.streamControllers.delete(streamKey);
        }
        lastError = error;
        if (error instanceof Error && error.name === "AbortError") {
          throw error;
        }
      }
    }

    throw new Error(lastError instanceof Error ? lastError.message : "SSE failed across all gateway bases.");
  }

  async function runApi(node, event, path, options = {}) {
    const response = await apiRequest(path, options);
    setOutput(node, {
      event,
      ok: response.ok,
      status: response.status,
      url: response.url,
      data: response.data,
    });
    return response;
  }

  async function openExternalUrl(url) {
    const normalized = asString(url);
    if (!normalized) {
      return false;
    }
    if (desktopApi?.openExternal) {
      await desktopApi.openExternal(normalized);
      return true;
    }
    window.open(normalized, "_blank", "noopener");
    return true;
  }

  function looksLikeHtml(text) {
    const value = String(text ?? "").trimStart().toLowerCase();
    return value.startsWith("<!doctype html") || value.startsWith("<html");
  }

  async function runAdminApi(node, event, path, options = {}) {
    const response = await apiRequest(path, {
      ...options,
      baseCandidates: state.adminRequestBases,
      validateResponse: (result) => {
        if (result.contentType.toLowerCase().includes("application/json")) {
          return true;
        }
        return !looksLikeHtml(result.text);
      },
    });
    setOutput(node, {
      event,
      ok: response.ok,
      status: response.status,
      url: response.url,
      data: response.data,
    });
    return response;
  }

  function consumeSseBuffer(buffer, onEvent) {
    let working = buffer.replace(/\r\n/g, "\n");
    while (true) {
      const splitIndex = working.indexOf("\n\n");
      if (splitIndex < 0) {
        break;
      }
      const frame = working.slice(0, splitIndex);
      working = working.slice(splitIndex + 2);

      let eventName = "message";
      const dataLines = [];
      for (const rawLine of frame.split(/\r?\n/)) {
        if (!rawLine || rawLine.startsWith(":")) {
          continue;
        }
        if (rawLine.startsWith("event:")) {
          eventName = rawLine.slice(6).trim() || "message";
          continue;
        }
        if (rawLine.startsWith("data:")) {
          dataLines.push(rawLine.slice(5).trimStart());
        }
      }

      if (dataLines.length === 0) {
        continue;
      }

      const rawData = dataLines.join("\n");
      const parsed = safeJsonParse(rawData);
      onEvent({ event: eventName, data: parsed ?? rawData, raw: rawData });
    }

    return { remainder: working };
  }

  function parseArgsInput(raw) {
    const input = asString(raw);
    if (!input) {
      return [];
    }
    const json = safeJsonParse(input);
    if (Array.isArray(json)) {
      return json.map((entry) => String(entry));
    }
    return input
      .split(/\n|\s+/g)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }

  function selectedSessionId() {
    return asString(els.sessionSelect?.value);
  }

  async function loadDesktopConfig() {
    const fallbackConfig = {
      gatewayUrl:
        window.location && (window.location.protocol === "http:" || window.location.protocol === "https:")
          ? `${window.location.origin}/judge`
          : "http://127.0.0.1:3000/judge",
      adminApiUrl:
        window.location && (window.location.protocol === "http:" || window.location.protocol === "https:")
          ? window.location.origin
          : "https://127.0.0.1:4001",
      mode: "external",
      healthUrl:
        window.location && (window.location.protocol === "http:" || window.location.protocol === "https:")
          ? `${window.location.origin}/health`
          : "http://127.0.0.1:3000/health",
    };

    let config = fallbackConfig;
    if (desktopApi?.getConfig) {
      try {
        const resolved = await desktopApi.getConfig();
        config = {
          ...fallbackConfig,
          ...(resolved || {}),
        };
      } catch {
        config = fallbackConfig;
      }
    }

    config.gatewayUrl = normalizeGatewayUrl(config.gatewayUrl);
    state.config = config;
    state.gatewayUrl = config.gatewayUrl;
    state.requestBases = buildRequestBases(config.gatewayUrl);
    state.adminRequestBases = buildAdminRequestBases(config.adminApiUrl || config.gatewayUrl);

    setText(els.modeValue, config.mode ?? "-");
    setText(els.gatewayValue, config.gatewayUrl ?? "-");
    setText(els.healthValue, config.healthUrl ?? "-");

    if (els.gatewayFrame) {
      els.gatewayFrame.src = config.gatewayUrl;
    }
  }

  async function refreshRuntime() {
    if (desktopApi?.getStatus) {
      try {
        const status = await desktopApi.getStatus();
        setText(els.pidValue, status?.pid ? String(status.pid) : "-");
        if (status?.running && status?.healthy) {
          setBadge("Running + Healthy", "ok");
        } else if (status?.running) {
          setBadge("Running", "warn");
        } else if (status?.mode === "managed") {
          setBadge("Stopped", "danger");
        } else {
          setBadge("External mode", "");
        }
      } catch (error) {
        setBadge("Runtime status error", "danger");
        setText(els.pidValue, "-");
        appendOutput(els.runtimeLogs, error instanceof Error ? error.message : String(error));
      }
    }

    if (desktopApi?.getLogs) {
      try {
        const logs = await desktopApi.getLogs(250);
        setOutput(els.runtimeLogs, Array.isArray(logs) ? logs.join("\n") : String(logs));
      } catch {
        setOutput(els.runtimeLogs, "Runtime log stream unavailable.");
      }
    } else {
      setOutput(els.runtimeLogs, "Desktop IPC unavailable in browser shell mode.");
    }
  }

  async function refreshCapabilities() {
    try {
      const response = await apiRequest("/api/runtime/feature-capabilities");
      setOutput(els.capabilitiesJson, response.data);
      const features = response.data?.features ?? {};
      state.featureCapabilities = features;
      const total = Object.keys(features).length;
      const enabled = Object.values(features).filter((entry) => entry && entry.enabled === true).length;
      setText(els.capabilityValue, `${enabled}/${total} enabled`);
      applyCapabilityGates();
    } catch (error) {
      setText(els.capabilityValue, "Unavailable");
      setOutput(els.capabilitiesJson, { ok: false, error: error instanceof Error ? error.message : String(error) });
      state.featureCapabilities = {};
      applyCapabilityGates();
    }
  }

  async function refreshAgentStatus() {
    try {
      const response = await apiRequest("/api/openclaw/agent/status");
      setOutput(els.agentStatusOut, response.data);
    } catch (error) {
      setOutput(els.agentStatusOut, { ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  async function runTurn() {
    const chatPrompt = asString(els.chatPrompt?.value);
    const explicitMessage = asString(els.turnMessage?.value);
    const resolvedMessage = explicitMessage || chatPrompt;
    const enrichedMessage = applyIntegrationContext(resolvedMessage);

    if (!explicitMessage && resolvedMessage && els.turnMessage) {
      els.turnMessage.value = enrichedMessage;
    }

    const payload = {
      message: enrichedMessage,
      sessionId: asString(els.turnSessionId?.value) || undefined,
      agentId: asString(els.turnAgentId?.value) || undefined,
      to: asString(els.turnTo?.value) || undefined,
      thinking: asString(els.turnThinking?.value) || undefined,
      timeoutSeconds: Number.parseInt(String(els.turnTimeout?.value || "120"), 10),
      deliver: asBooleanFromSelect(els.turnDeliver?.value),
    };

    if (!payload.message) {
      setOutput(els.turnOut, { ok: false, error: "message is required" });
      return;
    }

    pushChatMessage("user", resolvedMessage);
    setText(els.chatStatus, "Running agent turn...");
    addActivityEvent({
      sessionId: payload.sessionId,
      agentId: payload.agentId,
      phase: "turn.start",
      detail: resolvedMessage,
      status: "running",
    });

    const response = await apiRequest("/api/openclaw/agent/turn", {
      method: "POST",
      body: payload,
      timeoutMs: 180000,
    });
    setOutput(els.turnOut, response.data);
    pushChatMessage("assistant", response.data?.output || response.data?.summary || pretty(response.data));
    if (response.data?.runId) {
      els.artifactRunId.value = String(response.data.runId);
    }
    if (response.data?.sessionId) {
      els.turnSessionId.value = String(response.data.sessionId);
      if (els.longSessionId) {
        els.longSessionId.value = String(response.data.sessionId);
      }
    }
    addActivityEvent({
      sessionId: response.data?.sessionId || payload.sessionId,
      runId: response.data?.runId,
      agentId: payload.agentId || response.data?.agentId,
      phase: "turn.complete",
      detail: response.data?.summary || response.data?.output || "Turn completed",
      status: response.ok ? "completed" : "error",
      payload: response.data,
    });
    setText(els.chatStatus, response.ok ? "Agent turn completed." : `Agent turn failed (${response.status}).`);
    await refreshSessions();
    await autoQueueHitlForSession(asString(response.data?.sessionId) || payload.sessionId || "");
    setJourneyStepState("run", response.ok ? "done" : "blocked");
    renderJourneySteps();
  }

  async function runLongform() {
    const chatPrompt = asString(els.chatPrompt?.value);
    const explicitObjective = asString(els.longObjective?.value);
    const resolvedObjective = explicitObjective || chatPrompt;
    const enrichedObjective = applyIntegrationContext(resolvedObjective);

    if (!explicitObjective && resolvedObjective && els.longObjective) {
      els.longObjective.value = enrichedObjective;
    }

    const payload = {
      objective: enrichedObjective,
      sessionId: asString(els.longSessionId?.value) || undefined,
      agentId: asString(els.longAgentId?.value) || undefined,
      to: asString(els.longTo?.value) || undefined,
      thinking: asString(els.longThinking?.value) || undefined,
      timeoutSeconds: Number.parseInt(String(els.longTimeout?.value || "180"), 10),
      maxTurns: Number.parseInt(String(els.longTurns?.value || "4"), 10),
      deliver: asBooleanFromSelect(els.longDeliver?.value),
    };

    if (!payload.objective) {
      setOutput(els.longOut, { ok: false, error: "objective is required" });
      return;
    }

    pushChatMessage("user", `Longform objective: ${resolvedObjective}`);
    setText(els.chatStatus, "Running longform orchestration...");
    addActivityEvent({
      sessionId: payload.sessionId,
      agentId: payload.agentId,
      phase: "longform.start",
      detail: resolvedObjective,
      status: "running",
    });

    const response = await apiRequest("/api/openclaw/agent/longform", {
      method: "POST",
      body: payload,
      timeoutMs: 240000,
    });
    setOutput(els.longOut, response.data);
    pushChatMessage("assistant", response.data?.output || response.data?.summary || pretty(response.data));
    if (response.data?.runId) {
      els.artifactRunId.value = String(response.data.runId);
    }
    if (response.data?.sessionId) {
      els.longSessionId.value = String(response.data.sessionId);
      if (els.turnSessionId) {
        els.turnSessionId.value = String(response.data.sessionId);
      }
    }
    addActivityEvent({
      sessionId: response.data?.sessionId || payload.sessionId,
      runId: response.data?.runId,
      agentId: payload.agentId || response.data?.agentId,
      phase: "longform.complete",
      detail: response.data?.summary || response.data?.output || "Longform completed",
      status: response.ok ? "completed" : "error",
      payload: response.data,
    });
    setText(els.chatStatus, response.ok ? "Longform run completed." : `Longform run failed (${response.status}).`);
    await refreshSessions();
    await autoQueueHitlForSession(asString(response.data?.sessionId) || payload.sessionId || "");
    setJourneyStepState("run", response.ok ? "done" : "blocked");
    renderJourneySteps();
  }

  async function autoQueueHitlForSession(sessionId) {
    const normalizedSession = asString(sessionId);
    if (!normalizedSession || !featureEnabled("hitlApprovals")) {
      return;
    }
    if (els.hitlSessionId) {
      els.hitlSessionId.value = normalizedSession;
    }
    try {
      const response = await listHitlApprovals();
      const approvals = Array.isArray(response?.data?.data?.approvals)
        ? response.data.data.approvals
        : Array.isArray(response?.data?.approvals)
          ? response.data.approvals
          : [];
      if (approvals.length > 0) {
        await startHitlWatch();
        setJourneyStepState("hitl", "active");
        setJourneyStatus(`HITL approvals waiting (${approvals.length}).`);
      } else {
        setJourneyStepState("hitl", "done");
      }
      renderJourneySteps();
    } catch (error) {
      appendOutput(els.hitlOut, {
        event: "hitl.auto_queue_failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function refreshSessions() {
    const limit = Number.parseInt(String(els.sessionsLimit?.value || "20"), 10);
    const cursor = asString(els.sessionsCursor?.value);
    const query = new URLSearchParams();
    if (Number.isFinite(limit) && limit > 0) {
      query.set("limit", String(limit));
    }
    if (cursor) {
      query.set("cursor", cursor);
    }

    const response = await apiRequest(`/api/openclaw/agent/sessions${query.toString() ? `?${query.toString()}` : ""}`);
    const items = Array.isArray(response.data?.items) ? response.data.items : [];
    state.sessionMap.clear();
    if (els.sessionSelect) {
      els.sessionSelect.innerHTML = "";
      for (const item of items) {
        const sessionId = asString(item.sessionId || item.id);
        if (!sessionId) {
          continue;
        }
        state.sessionMap.set(sessionId, item);
        const option = document.createElement("option");
        option.value = sessionId;
        option.textContent = `${sessionId} | ${item.status || "unknown"} | ${item.updatedAt || item.startedAt || ""}`;
        els.sessionSelect.appendChild(option);
      }
    }
    if (response.data?.nextCursor) {
      els.sessionsCursor.value = String(response.data.nextCursor);
    }
    setOutput(els.sessionDetailOut, response.data);
    syncActivitySessions(items);
  }

  async function loadSessionDetail() {
    const sessionId = selectedSessionId();
    if (!sessionId) {
      setOutput(els.sessionDetailOut, { ok: false, error: "Select a session." });
      return;
    }
    const response = await apiRequest(`/api/openclaw/agent/sessions/${encodeURIComponent(sessionId)}`);
    setOutput(els.sessionDetailOut, response.data);
  }

  async function cancelSession() {
    const sessionId = selectedSessionId();
    if (!sessionId) {
      setOutput(els.sessionDetailOut, { ok: false, error: "Select a session." });
      return;
    }
    const response = await apiRequest(`/api/openclaw/agent/sessions/${encodeURIComponent(sessionId)}/cancel`, {
      method: "POST",
      body: {},
    });
    setOutput(els.sessionDetailOut, response.data);
    await refreshSessions();
  }

  function stopSessionStream() {
    stopStream("session-watch");
    appendOutput(els.sessionEventsOut, { event: "stream", status: "stopped" });
  }

  async function startSessionStream() {
    const sessionId = selectedSessionId();
    if (!sessionId) {
      setOutput(els.sessionEventsOut, { ok: false, error: "Select a session." });
      return;
    }

    stopSessionStream();
    setOutput(els.sessionEventsOut, `[streaming ${sessionId}]`);

    try {
      await apiStream(`/api/openclaw/agent/sessions/${encodeURIComponent(sessionId)}/stream`, {
        streamKey: "session-watch",
        onEvent: (entry) => {
          appendOutput(els.sessionEventsOut, entry);
          addActivityEvent({
            sessionId,
            runId: asString(entry?.data?.runId || entry?.data?.run_id || ""),
            agentId: asString(entry?.data?.agentId || entry?.data?.agent_id || ""),
            phase: `session.${asString(entry.event) || "event"}`,
            detail: summarizeEventPayload(entry.data),
            status: entry.event === "error" ? "error" : entry.event === "done" ? "completed" : "streaming",
            payload: entry.data,
          });
          if (entry.event === "done") {
            stopSessionStream();
          }
        },
        timeoutMs: 180000,
      });
    } catch (error) {
      if (!(error instanceof Error) || error.name !== "AbortError") {
        throw error;
      }
    }
  }

  async function loadArtifacts() {
    const runId = asString(els.artifactRunId?.value);
    if (!runId) {
      setOutput(els.artifactOut, { ok: false, error: "runId is required" });
      return;
    }
    const response = await apiRequest(`/api/openclaw/agent/runs/${encodeURIComponent(runId)}/artifacts`);
    setOutput(els.artifactOut, response.data);
  }

  async function refreshCliTools() {
    const response = await apiRequest("/api/openclaw/cli/tools");
    const tools = Array.isArray(response.data?.tools) ? response.data.tools : [];
    if (els.cliToolSelect) {
      els.cliToolSelect.innerHTML = "";
      for (const tool of tools) {
        const option = document.createElement("option");
        option.value = String(tool.tool);
        option.textContent = `${tool.tool} - ${tool.description || ""}`;
        els.cliToolSelect.appendChild(option);
      }
    }
    setOutput(els.cliOut, response.data);
  }

  async function loadCliCatalog() {
    const response = await apiRequest("/api/openclaw/cli/catalog");
    setOutput(els.cliCatalogOut, response.data);
  }

  function cliPayload() {
    return {
      args: parseArgsInput(els.cliArgs?.value),
      profile: asString(els.cliProfile?.value) || undefined,
      timeoutSeconds: Number.parseInt(String(els.cliTimeout?.value || "60"), 10),
      dev: asBooleanFromSelect(els.cliDev?.value),
      noColor: asBooleanFromSelect(els.cliNoColor?.value),
      json: asBooleanFromSelect(els.cliJson?.value),
      parseJson: asBooleanFromSelect(els.cliParseJson?.value),
      plain: asBooleanFromSelect(els.cliPlain?.value),
    };
  }

  async function cliHelp() {
    const tool = asString(els.cliToolSelect?.value);
    if (!tool) {
      setOutput(els.cliOut, { ok: false, error: "Select a tool." });
      return;
    }
    const params = new URLSearchParams();
    const payload = cliPayload();
    if (payload.profile) {
      params.set("profile", payload.profile);
    }
    params.set("timeoutSeconds", String(payload.timeoutSeconds || 60));
    params.set("dev", String(Boolean(payload.dev)));
    params.set("noColor", String(Boolean(payload.noColor)));
    params.set("json", String(Boolean(payload.json)));
    params.set("parseJson", String(Boolean(payload.parseJson)));

    const response = await apiRequest(`/api/openclaw/cli/${encodeURIComponent(tool)}/help?${params.toString()}`);
    setOutput(els.cliOut, response.data);
  }

  async function cliExec() {
    const tool = asString(els.cliToolSelect?.value);
    if (!tool) {
      setOutput(els.cliOut, { ok: false, error: "Select a tool." });
      return;
    }
    const response = await apiRequest(`/api/openclaw/cli/${encodeURIComponent(tool)}/exec`, {
      method: "POST",
      body: cliPayload(),
      timeoutMs: 180000,
    });
    setOutput(els.cliOut, response.data);
  }

  async function cliGenericExec() {
    const tool = asString(els.cliToolSelect?.value);
    if (!tool) {
      setOutput(els.cliOut, { ok: false, error: "Select a tool." });
      return;
    }
    const response = await apiRequest("/api/openclaw/cli/exec", {
      method: "POST",
      body: {
        tool,
        ...cliPayload(),
      },
      timeoutMs: 180000,
    });
    setOutput(els.cliOut, response.data);
  }

  async function refreshChatCapabilities() {
    const response = await apiRequest("/api/chat/capabilities");
    pushChatMessage("system", `Chat capabilities: ${pretty(response.data)}`);
  }

  async function sendChat() {
    const prompt = asString(els.chatPrompt?.value);
    if (!prompt) {
      pushChatMessage("system", "Prompt is required.");
      return;
    }

    const mode = asString(els.chatMode?.value) || "stream";
    const enrichedPrompt = applyIntegrationContext(prompt);
    pushChatMessage("user", prompt);
    setText(els.chatStatus, mode === "stream" ? "Streaming chat response..." : "Requesting chat response...");
    addActivityEvent({
      sessionId: asString(els.turnSessionId?.value || els.longSessionId?.value),
      agentId: asString(els.turnAgentId?.value || els.longAgentId?.value),
      phase: "chat.start",
      detail: prompt,
      status: "running",
    });

    if (mode === "stream") {
      let full = "";
      const assistantDraft = { role: "assistant", content: "" };
      state.chatHistory.push(assistantDraft);
      refreshChatViews();
      const requestMessages = state.chatHistory
        .filter((entry) => entry !== assistantDraft)
        .slice(-20)
        .map((entry, index, source) => {
          if (index === source.length - 1 && entry.role === "user") {
            return { ...entry, content: enrichedPrompt };
          }
          return entry;
        });
      try {
        await apiStream("/api/chat/stream", {
          streamKey: "chat-stream",
          method: "POST",
          body: { messages: requestMessages },
          timeoutMs: 120000,
          onEvent: (entry) => {
            if (entry.raw === "[DONE]") {
              return;
            }
            if (entry.data && typeof entry.data === "object" && typeof entry.data.content === "string") {
              full += entry.data.content;
              assistantDraft.content = full;
              refreshChatViews();
            }
          },
        });

        if (full) {
          assistantDraft.content = full;
          refreshChatViews();
          setText(els.chatStatus, "Chat stream completed.");
          addActivityEvent({
            sessionId: asString(els.turnSessionId?.value || els.longSessionId?.value),
            agentId: asString(els.turnAgentId?.value || els.longAgentId?.value),
            phase: "chat.complete",
            detail: full,
            status: "completed",
          });
          return;
        }
        state.chatHistory = state.chatHistory.filter((entry) => entry !== assistantDraft);
        refreshChatViews();
      } catch (error) {
        state.chatHistory = state.chatHistory.filter((entry) => entry !== assistantDraft);
        refreshChatViews();
        pushChatMessage("system", `Chat stream error: ${error instanceof Error ? error.message : String(error)}`);
        setText(els.chatStatus, "Chat stream failed; using sync fallback.");
        addActivityEvent({
          sessionId: asString(els.turnSessionId?.value || els.longSessionId?.value),
          agentId: asString(els.turnAgentId?.value || els.longAgentId?.value),
          phase: "chat.error",
          detail: error instanceof Error ? error.message : String(error),
          status: "error",
        });
      }
    }

    const response = await apiRequest("/api/firewall/chat", {
      method: "POST",
      body: { message: enrichedPrompt },
      timeoutMs: 120000,
    });
    const reply = asString(response.data?.reply || response.data?.message);
    pushChatMessage("assistant", reply || pretty(response.data));
    setText(els.chatStatus, response.ok ? "Chat response received." : `Chat fallback returned ${response.status}.`);
    addActivityEvent({
      sessionId: asString(els.turnSessionId?.value || els.longSessionId?.value),
      agentId: asString(els.turnAgentId?.value || els.longAgentId?.value),
      phase: "chat.fallback",
      detail: reply || response.data?.message || "Chat fallback response",
      status: response.ok ? "completed" : "error",
      payload: response.data,
    });
  }

  async function runSelectedOrchestrationMode() {
    const mode = asString(els.orchestrationMode?.value) || "chat";
    if (mode === "turn") {
      await runTurn();
      return;
    }
    if (mode === "longform") {
      await runLongform();
      return;
    }
    await sendChat();
  }

  function splitCsvValues(raw) {
    return String(raw ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }

  function parseJsonInput(rawText, fallback = {}) {
    const trimmed = asString(rawText);
    if (!trimmed) {
      return fallback;
    }
    const parsed = safeJsonParse(trimmed);
    return parsed === null ? null : parsed;
  }

  async function runIdentityAction(action) {
    const username = asString(els.identityUsername?.value);
    const email = asString(els.identityEmail?.value);
    const password = asString(els.identityPassword?.value);
    const newPassword = asString(els.identityNewPassword?.value);
    const credential = asString(els.identityCredential?.value);
    const token = asString(els.identityResetToken?.value);
    const code = asString(els.identityVerificationCode?.value);
    const plan = asString(els.billingPlan?.value) || "free";
    const returnUrl = asString(els.billingReturnUrl?.value);
    const recoveryRedirectUrl = returnUrl || "https://mayple.cloud/reset-password";
    const invoiceLimit = clampInt(els.billingInvoiceLimit?.value, 1, 100, 20);

    if (action === "auth.login") {
      if (!username || !password) {
        setOutput(els.identityOut, { ok: false, error: "username and password are required." });
        return;
      }
      return runApi(els.identityOut, action, "/api/auth/login", {
        method: "POST",
        body: { username, password },
      });
    }

    if (action === "auth.register") {
      if (!username || !password) {
        setOutput(els.identityOut, { ok: false, error: "username and password are required." });
        return;
      }
      return runApi(els.identityOut, action, "/api/auth/register", {
        method: "POST",
        body: { username, email, password },
      });
    }

    if (action === "auth.logout") {
      return runApi(els.identityOut, action, "/api/auth/logout", { method: "POST", body: {} });
    }

    if (action === "auth.me") {
      return runApi(els.identityOut, action, "/api/auth/me");
    }

    if (action === "auth.google_client_id") {
      return runApi(els.identityOut, action, "/api/auth/google/client-id");
    }

    if (action === "auth.google") {
      if (!credential) {
        setOutput(els.identityOut, { ok: false, error: "Google credential is required." });
        return;
      }
      return runApi(els.identityOut, action, "/api/auth/google", {
        method: "POST",
        body: { credential },
      });
    }

    if (action === "auth.forgot_password") {
      if (!email) {
        setOutput(els.identityOut, { ok: false, error: "email is required." });
        return;
      }
      return runApi(els.identityOut, action, "/api/auth/forgot-password", {
        method: "POST",
        body: {
          email,
          redirectUrl: recoveryRedirectUrl,
        },
      });
    }

    if (action === "auth.reset_password") {
      if (!token || !newPassword) {
        setOutput(els.identityOut, { ok: false, error: "token and newPassword are required." });
        return;
      }
      return runApi(els.identityOut, action, "/api/auth/reset-password", {
        method: "POST",
        body: {
          token,
          newPassword,
        },
      });
    }

    if (action === "auth.verify_email_request") {
      if (!email) {
        setOutput(els.identityOut, { ok: false, error: "email is required." });
        return;
      }
      return runApi(els.identityOut, action, "/api/auth/verify-email/request", {
        method: "POST",
        body: { email },
      });
    }

    if (action === "auth.verify_email_confirm") {
      if (!token && !code) {
        setOutput(els.identityOut, { ok: false, error: "token or code is required." });
        return;
      }
      return runApi(els.identityOut, action, "/api/auth/verify-email/confirm", {
        method: "POST",
        body: { token, code, email },
      });
    }

    if (action === "user.change_password") {
      if (!password || !newPassword) {
        setOutput(els.identityOut, { ok: false, error: "current and new passwords are required." });
        return;
      }
      return runApi(els.identityOut, action, "/api/auth/change-password", {
        method: "POST",
        body: { currentPassword: password, newPassword },
      });
    }

    if (action === "user.profile") {
      return runApi(els.identityOut, action, "/api/user/profile");
    }

    if (action === "billing.subscription") {
      return runApi(els.identityOut, action, "/api/billing/subscription");
    }

    if (action === "billing.checkout") {
      const response = await runApi(
        els.identityOut,
        action,
        "/api/billing/create-checkout-session",
        {
          method: "POST",
          body: {
            plan,
            returnUrl,
            successUrl: returnUrl,
            cancelUrl: returnUrl,
          },
        }
      );
      const checkoutUrl = asString(response.data?.data?.url) || asString(response.data?.url);
      if (checkoutUrl) {
        await openExternalUrl(checkoutUrl);
        appendOutput(els.identityOut, { event: "billing.checkout.redirect", url: checkoutUrl });
      }
      return response;
    }

    if (action === "billing.portal") {
      const response = await runApi(els.identityOut, action, "/api/billing/portal-session", {
        method: "POST",
        body: {
          returnUrl,
        },
      });
      const portalUrl = asString(response.data?.data?.url) || asString(response.data?.url);
      if (portalUrl) {
        await openExternalUrl(portalUrl);
        appendOutput(els.identityOut, { event: "billing.portal.redirect", url: portalUrl });
      }
      return response;
    }

    if (action === "billing.invoices") {
      const params = new URLSearchParams();
      params.set("limit", String(invoiceLimit));
      return runApi(els.identityOut, action, `/api/billing/invoices?${params.toString()}`);
    }

    if (action === "billing.cancel") {
      return runApi(els.identityOut, action, "/api/billing/subscription/cancel", {
        method: "POST",
        body: {},
      });
    }

    if (action === "billing.resume") {
      return runApi(els.identityOut, action, "/api/billing/subscription/resume", {
        method: "POST",
        body: {},
      });
    }

    return null;
  }

  function extractApprovalsFromResponse(response) {
    if (!response || typeof response !== "object") {
      return [];
    }
    const payload = response.data;
    if (!payload || typeof payload !== "object") {
      return [];
    }
    if (Array.isArray(payload.approvals)) {
      return payload.approvals;
    }
    if (payload.data && typeof payload.data === "object" && Array.isArray(payload.data.approvals)) {
      return payload.data.approvals;
    }
    return [];
  }

  function journeyProvider() {
    const selected = asString(els.journeyProvider?.value);
    if (selected) {
      return selected;
    }
    const firstSelected = selectedIntegrationProviders()[0];
    if (firstSelected) {
      return firstSelected;
    }
    return INTEGRATION_CATALOG[0]?.id || "";
  }

  async function runJourneySignInStep() {
    if (!featureEnabled("authSession")) {
      throw new Error(featureRecord("authSession").reason || "Authentication unavailable.");
    }
    setJourneyStepState("signin", "active");
    renderJourneySteps();
    setJourneyStatus("Signing in...");
    let response;
    if (asString(els.identityUsername?.value) && asString(els.identityPassword?.value)) {
      response = await runIdentityAction("auth.login");
    } else if (asString(els.identityCredential?.value)) {
      response = await runIdentityAction("auth.google");
    } else {
      throw new Error("Provide username/password or Google credential.");
    }
    if (!response?.ok) {
      setJourneyStepState("signin", "blocked");
      renderJourneySteps();
      throw new Error(`Sign-in failed (HTTP ${response?.status ?? "unknown"}).`);
    }
    try {
      await refreshIntegrationConnections();
    } catch {
      // integration list refresh is best effort after auth
    }
    setJourneyStepState("signin", "done");
    renderJourneySteps();
    setJourneyStatus("Sign-in completed.");
    appendOutput(els.journeyOut, { step: "signin", status: "done", response: response.data });
    return response;
  }

  async function runJourneyIntegrationStep() {
    if (!featureEnabled("integrations")) {
      throw new Error(featureRecord("integrations").reason || "Integrations are unavailable.");
    }
    setJourneyStepState("integrations", "active");
    renderJourneySteps();
    setJourneyStatus("Connecting integration...");
    const provider = journeyProvider();
    const credential =
      asString(els.journeyIntegrationCredential?.value) || asString(els.identityCredential?.value);
    const response = await connectIntegration(provider, credential, ["agent:execute"]);
    await refreshIntegrationConnections();
    if (!response?.ok) {
      setJourneyStepState("integrations", "blocked");
      renderJourneySteps();
      throw new Error(`Integration connect failed (HTTP ${response?.status ?? "unknown"}).`);
    }
    setJourneyStepState("integrations", "done");
    renderJourneySteps();
    setJourneyStatus(`Integration connected: ${provider}.`);
    appendOutput(els.journeyOut, { step: "integrations", status: "done", response: response.data });
    return response;
  }

  async function runJourneyAgentStep() {
    if (!featureEnabled("openclawAgent")) {
      throw new Error(featureRecord("openclawAgent").reason || "OpenClaw runtime unavailable.");
    }
    setJourneyStepState("run", "active");
    renderJourneySteps();
    setJourneyStatus("Running agent...");
    if (!asString(els.chatPrompt?.value) && els.chatPrompt) {
      els.chatPrompt.value =
        "Use the connected integrations and summarize available actions for this workspace.";
    }
    await runTurn();
    setJourneyStepState("run", "done");
    renderJourneySteps();
    setJourneyStatus("Agent run completed.");
    appendOutput(els.journeyOut, { step: "run", status: "done" });
  }

  async function runJourneyHitlStep() {
    if (!featureEnabled("hitlApprovals")) {
      throw new Error(featureRecord("hitlApprovals").reason || "HITL approvals unavailable.");
    }
    setJourneyStepState("hitl", "active");
    renderJourneySteps();
    setJourneyStatus("Checking HITL approvals...");
    const listed = await listHitlApprovals();
    if (!listed?.ok) {
      throw new Error(`HITL list failed (HTTP ${listed?.status ?? "unknown"}).`);
    }
    const approvals = extractApprovalsFromResponse(listed);
    if (approvals.length === 0) {
      setJourneyStepState("hitl", "done");
      renderJourneySteps();
      setJourneyStatus("No pending HITL approvals.");
      appendOutput(els.journeyOut, { step: "hitl", status: "done", approvals: 0 });
      return listed;
    }

    const first = approvals[0];
    if (els.hitlTraceId) {
      els.hitlTraceId.value = asString(first.traceId || first.trace_id);
    }
    if (els.hitlStepIndex) {
      els.hitlStepIndex.value = String(
        clampInt(first.stepIndex ?? first.step_index ?? 0, 0, 100000, 0)
      );
    }
    if (els.hitlAction) {
      els.hitlAction.value = "allow";
    }
    if (els.hitlReason) {
      els.hitlReason.value = "Approved via guided user journey";
    }
    await submitHitlDecision();
    setJourneyStepState("hitl", "done");
    renderJourneySteps();
    setJourneyStatus("HITL approval submitted.");
    appendOutput(els.journeyOut, { step: "hitl", status: "done", approvalsResolved: 1 });
    return listed;
  }

  async function runJourneyBillingStep() {
    if (!featureEnabled("billing")) {
      throw new Error(featureRecord("billing").reason || "Billing unavailable.");
    }
    setJourneyStepState("billing", "active");
    renderJourneySteps();
    setJourneyStatus("Preparing billing checkout...");
    const response = await runIdentityAction("billing.checkout");
    if (!response?.ok) {
      setJourneyStepState("billing", "blocked");
      renderJourneySteps();
      throw new Error(`Billing step failed (HTTP ${response?.status ?? "unknown"}).`);
    }
    setJourneyStepState("billing", "done");
    renderJourneySteps();
    setJourneyStatus("Billing checkout started.");
    appendOutput(els.journeyOut, { step: "billing", status: "done", response: response.data });
    return response;
  }

  async function runFullJourney() {
    setOutput(els.journeyOut, { event: "journey.start", at: new Date().toISOString() });
    await runJourneySignInStep();
    await runJourneyIntegrationStep();
    await runJourneyAgentStep();
    await runJourneyHitlStep();
    await runJourneyBillingStep();
    appendOutput(els.journeyOut, { event: "journey.complete", at: new Date().toISOString() });
    setJourneyStatus("Full journey completed.");
  }

  async function refreshAuthJourneyState() {
    try {
      const response = await apiRequest("/api/auth/me");
      const authenticated = Boolean(response.data?.authenticated);
      setJourneyStepState("signin", authenticated ? "done" : "pending");
      renderJourneySteps();
      if (authenticated) {
        setJourneyStatus("Authenticated.");
      }
      return response;
    } catch {
      setJourneyStepState("signin", "pending");
      renderJourneySteps();
      return null;
    }
  }

  async function listHitlApprovals() {
    const sessionId = asString(els.hitlSessionId?.value);
    const params = new URLSearchParams();
    if (sessionId) {
      params.set("sessionId", sessionId);
    }
    const path = params.toString() ? `/api/hitl/approvals?${params.toString()}` : "/api/hitl/approvals";
    return runApi(els.hitlOut, "hitl.list", path);
  }

  function stopHitlWatch() {
    stopStream("hitl-watch");
    appendOutput(els.hitlStreamOut, { event: "watch", status: "stopped" });
  }

  async function startHitlWatch() {
    stopHitlWatch();
    setOutput(els.hitlStreamOut, "[watching hitl approvals]");
    const sessionId = asString(els.hitlSessionId?.value);
    const params = new URLSearchParams();
    if (sessionId) {
      params.set("sessionId", sessionId);
    }
    const path = params.toString() ? `/api/hitl/approvals/watch?${params.toString()}` : "/api/hitl/approvals/watch";
    return apiStream(path, {
      streamKey: "hitl-watch",
      timeoutMs: 300000,
      onEvent: (event) => appendOutput(els.hitlStreamOut, event),
    });
  }

  async function submitHitlDecision() {
    const traceId = asString(els.hitlTraceId?.value);
    const stepIndex = clampInt(els.hitlStepIndex?.value, 0, 100000, 0);
    const action = asString(els.hitlAction?.value) || "allow";
    const reason = asString(els.hitlReason?.value);
    if (!traceId) {
      setOutput(els.hitlOut, { ok: false, error: "traceId is required." });
      return;
    }
    return runApi(els.hitlOut, "hitl.decision", "/api/hitl/approvals/decision", {
      method: "POST",
      body: {
        traceId,
        stepIndex,
        action,
        reason,
      },
    });
  }

  function buildOpsParams() {
    const params = new URLSearchParams();
    params.set("limit", String(clampInt(els.opsLimit?.value, 1, 500, 20)));
    const cursor = asString(els.opsCursor?.value);
    if (cursor) {
      params.set("cursor", cursor);
    }
    return params;
  }

  async function runOpsAction(action) {
    const query = asString(els.opsQuery?.value);
    const runId = asString(els.opsRunId?.value);
    const toolId = asString(els.opsToolId?.value);
    const executionId = asString(els.opsExecutionId?.value);
    const traceIds = splitCsvValues(els.opsTraceIds?.value);
    const policy = parseJsonInput(els.opsToolPolicy?.value, {
      policyId: "desktop-policy",
      mode: "allowlist",
      rules: [],
    });
    if (policy === null) {
      setOutput(els.opsOut, { ok: false, error: "Tool policy must be valid JSON." });
      return;
    }

    if (action === "runtime.dependencies") {
      await runApi(els.opsOut, action, "/api/runtime/dependencies");
      return;
    }
    if (action === "runtime.diag") {
      await runApi(els.opsOut, action, "/api/runtime/diag");
      return;
    }
    if (action === "runtime.logs") {
      const params = buildOpsParams();
      await runApi(els.opsOut, action, `/api/runtime/logs?${params.toString()}`);
      return;
    }
    if (action === "traces.search") {
      const params = buildOpsParams();
      if (query) {
        params.set("q", query);
      }
      await runApi(els.opsOut, action, `/api/traces/search?${params.toString()}`);
      return;
    }
    if (action === "traces.export") {
      await runApi(els.opsOut, action, "/api/traces/export", {
        method: "POST",
        body: {
          format: "json",
          traceIds,
        },
      });
      return;
    }
    if (action === "runs.list") {
      const params = buildOpsParams();
      await runApi(els.opsOut, action, `/api/runs?${params.toString()}`);
      return;
    }
    if (action === "runs.detail") {
      if (!runId) {
        setOutput(els.opsOut, { ok: false, error: "runId is required." });
        return;
      }
      await runApi(els.opsOut, action, `/api/runs/${encodeURIComponent(runId)}`);
      return;
    }
    if (action === "runs.timeline") {
      if (!runId) {
        setOutput(els.opsOut, { ok: false, error: "runId is required." });
        return;
      }
      await runApi(els.opsOut, action, `/api/runs/${encodeURIComponent(runId)}/timeline`);
      return;
    }
    if (action === "tools.registry.list") {
      await runApi(els.opsOut, action, "/api/tools/registry");
      return;
    }
    if (action === "tools.registry.detail") {
      if (!toolId) {
        setOutput(els.opsOut, { ok: false, error: "toolId is required." });
        return;
      }
      await runApi(els.opsOut, action, `/api/tools/registry/${encodeURIComponent(toolId)}`);
      return;
    }
    if (action === "tools.policies.list") {
      await runApi(els.opsOut, action, "/api/tools/policies");
      return;
    }
    if (action === "tools.policies.validate") {
      await runApi(els.opsOut, action, "/api/tools/policies/validate", {
        method: "POST",
        body: {
          policy,
          persist: false,
        },
      });
      return;
    }
    if (action === "tools.executions.list") {
      const params = buildOpsParams();
      await runApi(els.opsOut, action, `/api/tools/executions?${params.toString()}`);
      return;
    }
    if (action === "tools.executions.detail") {
      if (!executionId) {
        setOutput(els.opsOut, { ok: false, error: "executionId is required." });
        return;
      }
      await runApi(els.opsOut, action, `/api/tools/executions/${encodeURIComponent(executionId)}`);
    }
  }

  function stopAdminWatch() {
    stopStream("admin-watch");
    appendOutput(els.adminStreamOut, { event: "watch", status: "stopped" });
  }

  async function startAdminWatch() {
    stopAdminWatch();
    setOutput(els.adminStreamOut, "[watching admin approvals]");
    const sessionId = asString(els.hitlSessionId?.value);
    const params = new URLSearchParams();
    if (sessionId) {
      params.set("session_id", sessionId);
    }
    const path = params.toString() ? `/admin/api/approvals/watch?${params.toString()}` : "/admin/api/approvals/watch";
    await apiStream(path, {
      streamKey: "admin-watch",
      baseCandidates: state.adminRequestBases,
      requireEventStream: true,
      timeoutMs: 300000,
      onEvent: (event) => appendOutput(els.adminStreamOut, event),
    });
  }

  async function runAdminAction(action) {
    const versionId = asString(els.adminVersionId?.value);
    const limit = clampInt(els.adminLimit?.value, 1, 500, 50);
    const cursor = asString(els.adminCursor?.value);
    const traceId = asString(els.adminTraceId?.value);
    const stepIndex = clampInt(els.adminStepIndex?.value, 0, 100000, 0);
    const decision = asString(els.adminDecision?.value) || "allow";
    const reason = asString(els.adminReason?.value);
    const policy = parseJsonInput(els.adminPolicyJson?.value, { rules: [] });
    if (policy === null) {
      setOutput(els.adminOut, { ok: false, error: "Policy JSON must be valid." });
      return;
    }

    if (action === "admin.policies") {
      await runAdminApi(els.adminOut, action, "/admin/api/policies");
      return;
    }
    if (action === "admin.policy_versions") {
      await runAdminApi(els.adminOut, action, "/admin/api/policies/versions");
      return;
    }
    if (action === "admin.policy_activate") {
      if (!versionId) {
        setOutput(els.adminOut, { ok: false, error: "versionId is required." });
        return;
      }
      await runAdminApi(
        els.adminOut,
        action,
        `/admin/api/policies/versions/${encodeURIComponent(versionId)}/activate`,
        { method: "POST", body: {} }
      );
      return;
    }
    if (action === "admin.policy_validate") {
      await runAdminApi(els.adminOut, action, "/admin/api/policies/validate", {
        method: "POST",
        body: {
          policy,
        },
      });
      return;
    }
    if (action === "admin.policy_reload") {
      await runAdminApi(els.adminOut, action, "/admin/api/policies/reload", {
        method: "POST",
        body: {},
      });
      return;
    }
    if (action === "admin.audit") {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      if (cursor) {
        params.set("cursor", cursor);
      }
      await runAdminApi(els.adminOut, action, `/admin/api/audit?${params.toString()}`);
      return;
    }
    if (action === "admin.audit_export") {
      await runAdminApi(els.adminOut, action, "/admin/api/audit/export", {
        method: "POST",
        body: {
          format: "json",
          traceId,
          limit,
        },
      });
      return;
    }
    if (action === "admin.audit_schemas") {
      await runAdminApi(els.adminOut, action, "/admin/api/audit/schemas");
      return;
    }
    if (action === "admin.compliance_reports") {
      await runAdminApi(els.adminOut, action, "/admin/api/compliance/reports");
      return;
    }
    if (action === "admin.approvals") {
      const params = new URLSearchParams();
      const sessionId = asString(els.hitlSessionId?.value);
      if (sessionId) {
        params.set("session_id", sessionId);
      }
      const path = params.toString() ? `/admin/api/approvals?${params.toString()}` : "/admin/api/approvals";
      await runAdminApi(els.adminOut, action, path);
      return;
    }
    if (action === "admin.approval_decision") {
      if (!traceId) {
        setOutput(els.adminOut, { ok: false, error: "traceId is required." });
        return;
      }
      await runAdminApi(els.adminOut, action, "/admin/api/approvals/decision", {
        method: "POST",
        body: {
          traceId,
          stepIndex,
          action: decision,
          reason,
        },
      });
    }
  }

  async function sendApiLabRequest() {
    const method = asString(els.apiMethod?.value || "GET").toUpperCase();
    const path = asString(els.apiPath?.value || "/api/runtime/feature-capabilities");
    const isAdminPath = path.startsWith("/admin/api/");
    let body = undefined;

    if (method !== "GET" && method !== "HEAD") {
      const bodyText = asString(els.apiBody?.value);
      if (bodyText) {
        const parsed = safeJsonParse(bodyText);
        if (parsed === null) {
          setOutput(els.apiOut, { ok: false, error: "Body must be valid JSON." });
          return;
        }
        body = parsed;
      } else {
        body = {};
      }
    }

    const response = await apiRequest(path, {
      method,
      body,
      timeoutMs: 120000,
      baseCandidates: isAdminPath ? state.adminRequestBases : undefined,
      validateResponse: isAdminPath
        ? (result) => result.contentType.toLowerCase().includes("application/json") || !looksLikeHtml(result.text)
        : undefined,
    });

    setOutput(els.apiOut, {
      ok: response.ok,
      status: response.status,
      url: response.url,
      data: response.data,
    });
  }

  async function loadStoredApiKey() {
    let stored = "";
    if (desktopApi?.getApiKey) {
      try {
        const secure = await desktopApi.getApiKey();
        stored = asString(secure?.value || secure?.apiKey);
      } catch {
        stored = "";
      }
    }
    if (!stored) {
      stored = asString(localStorage.getItem(API_KEY_STORAGE_KEY));
    }
    if (els.apiKeyInput) {
      els.apiKeyInput.value = stored;
    }
  }

  async function persistApiKey() {
    const key = asString(els.apiKeyInput?.value);
    if (!key) {
      await clearStoredApiKey();
      return;
    }
    if (desktopApi?.setApiKey) {
      try {
        await desktopApi.setApiKey(key);
      } catch (error) {
        appendOutput(els.capabilitiesJson, {
          event: "apiKey.secure_store_failed",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    localStorage.setItem(API_KEY_STORAGE_KEY, key);
  }

  async function clearStoredApiKey() {
    if (desktopApi?.clearApiKey) {
      try {
        await desktopApi.clearApiKey();
      } catch {
        // best effort
      }
    }
    localStorage.removeItem(API_KEY_STORAGE_KEY);
  }

  function wireDesktopButtons() {
    els.refreshBtn?.addEventListener("click", async () => {
      await refreshRuntime();
      await refreshCapabilities();
      await refreshAgentStatus();
    });

    els.startBtn?.addEventListener("click", async () => {
      if (!desktopApi?.startRuntime) {
        return;
      }
      await desktopApi.startRuntime();
      await refreshRuntime();
    });

    els.stopBtn?.addEventListener("click", async () => {
      if (!desktopApi?.stopRuntime) {
        return;
      }
      await desktopApi.stopRuntime();
      await refreshRuntime();
    });

    els.restartBtn?.addEventListener("click", async () => {
      if (!desktopApi?.stopRuntime || !desktopApi?.startRuntime) {
        return;
      }
      await desktopApi.stopRuntime();
      await new Promise((resolve) => setTimeout(resolve, 500));
      await desktopApi.startRuntime();
      await refreshRuntime();
    });

    els.openGatewayBtn?.addEventListener("click", async () => {
      if (desktopApi?.openExternal) {
        await desktopApi.openExternal(state.gatewayUrl);
        return;
      }
      window.open(state.gatewayUrl, "_blank", "noopener");
    });
  }

  function wireAuthButtons() {
    els.saveApiKeyBtn?.addEventListener("click", async () => {
      await persistApiKey();
      appendOutput(els.capabilitiesJson, { event: "apiKey.saved" });
    });

    els.clearApiKeyBtn?.addEventListener("click", async () => {
      if (els.apiKeyInput) {
        els.apiKeyInput.value = "";
      }
      await clearStoredApiKey();
      appendOutput(els.capabilitiesJson, { event: "apiKey.cleared" });
    });

    els.refreshCapabilitiesBtn?.addEventListener("click", async () => {
      await persistApiKey();
      await refreshCapabilities();
    });
  }

  function wireAgentButtons() {
    els.agentStatusBtn?.addEventListener("click", async () => {
      try {
        await refreshAgentStatus();
      } catch (error) {
        setOutput(els.agentStatusOut, { ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    });

    els.turnRunBtn?.addEventListener("click", async () => {
      try {
        await runTurn();
      } catch (error) {
        setOutput(els.turnOut, { ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    });

    els.longRunBtn?.addEventListener("click", async () => {
      try {
        await runLongform();
      } catch (error) {
        setOutput(els.longOut, { ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    });

    els.artifactLoadBtn?.addEventListener("click", async () => {
      try {
        await loadArtifacts();
      } catch (error) {
        setOutput(els.artifactOut, { ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    });
  }

  function wireSessionButtons() {
    els.sessionSelect?.addEventListener("change", () => {
      const sessionId = selectedSessionId();
      if (!sessionId) {
        return;
      }
      if (els.turnSessionId) {
        els.turnSessionId.value = sessionId;
      }
      if (els.longSessionId) {
        els.longSessionId.value = sessionId;
      }
      if (els.hitlSessionId) {
        els.hitlSessionId.value = sessionId;
      }
    });

    els.refreshSessionsBtn?.addEventListener("click", async () => {
      try {
        await refreshSessions();
      } catch (error) {
        setOutput(els.sessionDetailOut, { ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    });

    els.sessionLoadBtn?.addEventListener("click", async () => {
      try {
        await loadSessionDetail();
      } catch (error) {
        setOutput(els.sessionDetailOut, { ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    });

    els.sessionCancelBtn?.addEventListener("click", async () => {
      try {
        await cancelSession();
      } catch (error) {
        setOutput(els.sessionDetailOut, { ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    });

    els.sessionStreamBtn?.addEventListener("click", async () => {
      try {
        await startSessionStream();
      } catch (error) {
        appendOutput(els.sessionEventsOut, { event: "stream.error", error: error instanceof Error ? error.message : String(error) });
      }
    });

    els.sessionStopStreamBtn?.addEventListener("click", () => {
      stopSessionStream();
    });
  }

  function wireCliButtons() {
    els.cliRefreshBtn?.addEventListener("click", async () => {
      try {
        await refreshCliTools();
      } catch (error) {
        setOutput(els.cliOut, { ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    });

    els.cliCatalogBtn?.addEventListener("click", async () => {
      try {
        await loadCliCatalog();
      } catch (error) {
        setOutput(els.cliCatalogOut, { ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    });

    els.cliHelpBtn?.addEventListener("click", async () => {
      try {
        await cliHelp();
      } catch (error) {
        setOutput(els.cliOut, { ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    });

    els.cliExecBtn?.addEventListener("click", async () => {
      try {
        await cliExec();
      } catch (error) {
        setOutput(els.cliOut, { ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    });

    els.cliGenericExecBtn?.addEventListener("click", async () => {
      try {
        await cliGenericExec();
      } catch (error) {
        setOutput(els.cliOut, { ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    });
  }

  function wireChatAndApiLab() {
    els.orchestrateBtn?.addEventListener("click", async () => {
      try {
        await runSelectedOrchestrationMode();
      } catch (error) {
        pushChatMessage("system", `Orchestration error: ${error instanceof Error ? error.message : String(error)}`);
      }
    });

    els.chatCapabilitiesBtn?.addEventListener("click", async () => {
      try {
        await refreshChatCapabilities();
      } catch (error) {
        appendOutput(els.chatOut, { event: "chat.capabilities.error", error: error instanceof Error ? error.message : String(error) });
      }
    });

    els.chatSendBtn?.addEventListener("click", async () => {
      try {
        await sendChat();
      } catch (error) {
        appendOutput(els.chatOut, { event: "chat.error", error: error instanceof Error ? error.message : String(error) });
      }
    });

    els.apiSendBtn?.addEventListener("click", async () => {
      try {
        await sendApiLabRequest();
      } catch (error) {
        setOutput(els.apiOut, { ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    });
  }

  function wireIntegrationControls() {
    els.integrationSearch?.addEventListener("input", () => {
      state.integrationFilter = asString(els.integrationSearch?.value);
      renderIntegrationList();
    });

    els.integrationApplyBtn?.addEventListener("click", async () => {
      try {
        const names = integrationNames();
        if (names.length === 0) {
          pushChatMessage("system", "No integrations selected. Agent will use default tool routing.");
          return;
        }
        const providers = selectedIntegrationProviders();
        const credential =
          asString(els.journeyIntegrationCredential?.value) ||
          asString(els.identityCredential?.value);
        let connectedCount = 0;
        for (const provider of providers) {
          const existing = state.integrationConnections.get(provider);
          if (existing?.status === "connected") {
            continue;
          }
          if (!credential) {
            appendOutput(els.journeyOut, {
              step: "integrations",
              status: "skipped_connect",
              provider,
              reason: "Missing credential for backend integration connect.",
            });
            continue;
          }
          await connectIntegration(provider, credential, ["agent:execute"]);
          connectedCount += 1;
        }
        pushChatMessage(
          "system",
          `Applied integration context: ${names.join(", ")}${connectedCount > 0 ? ` (${connectedCount} connected)` : ""}`
        );
        setOrchestrationStatus(`Integration context active: ${names.join(", ")}`);
      } catch (error) {
        appendOutput(els.journeyOut, {
          step: "integrations",
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    els.integrationClearBtn?.addEventListener("click", () => {
      state.selectedIntegrations.clear();
      persistSelectedIntegrations();
      renderIntegrationList();
      setOrchestrationStatus("Integration context cleared.");
      setJourneyStepState("integrations", "pending");
      renderJourneySteps();
    });
  }

  function wireWorkforceControls() {
    renderWorkforceBoard({ event: "workforce.ready" });

    els.workforceAddEmployeeBtn?.addEventListener("click", () => {
      addWorkforceEmployee();
    });

    els.workforceRemoveEmployeeBtn?.addEventListener("click", () => {
      removeSelectedWorkforceEmployee();
    });

    els.workforceAssignTaskBtn?.addEventListener("click", () => {
      assignWorkforceTask();
    });

    els.workforceRunTaskBtn?.addEventListener("click", async () => {
      try {
        await runSelectedWorkforceTask();
      } catch (error) {
        renderWorkforceBoard({
          event: "workforce.task.failed",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    els.workforceRunQueueBtn?.addEventListener("click", async () => {
      try {
        await runWorkforceQueue();
      } catch (error) {
        renderWorkforceBoard({
          event: "workforce.queue.failed",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    els.workforceClearQueueBtn?.addEventListener("click", () => {
      clearWorkforceQueue();
    });

    els.workforceEmployeeSelect?.addEventListener("change", () => {
      const employee = workforceEmployeeById(selectedWorkforceEmployeeId());
      if (!employee) {
        return;
      }
      if (els.workforceEmployeeName) {
        els.workforceEmployeeName.value = employee.name;
      }
      if (els.workforceEmployeeRole) {
        els.workforceEmployeeRole.value = employee.role;
      }
      if (els.workforceEmployeeAgentId) {
        els.workforceEmployeeAgentId.value = employee.agentId || "";
      }
      renderWorkforceBoard({
        event: "workforce.employee.selected",
        employee,
      });
    });

    els.workforceTaskSelect?.addEventListener("change", () => {
      const taskId = selectedWorkforceTaskId();
      const task = state.workforceTasks.find((entry) => entry.id === taskId) || null;
      renderWorkforceBoard({
        event: "workforce.task.selected",
        task,
      });
    });
  }

  function wireJourneyControls() {
    populateJourneyProviderOptions();
    renderJourneySteps();
    setJourneyStatus("Ready to begin.");

    els.journeyProvider?.addEventListener("change", () => {
      const provider = asString(els.journeyProvider?.value);
      if (!provider) {
        return;
      }
      state.selectedIntegrations.add(provider);
      persistSelectedIntegrations();
      renderIntegrationList();
      renderSelectedIntegrationChips();
    });

    const runStep = async (name, fn) => {
      try {
        await fn();
      } catch (error) {
        if (
          name === "signin" ||
          name === "integrations" ||
          name === "run" ||
          name === "hitl" ||
          name === "billing"
        ) {
          setJourneyStepState(name, "blocked");
          renderJourneySteps();
        }
        setJourneyStatus(`${name} failed.`);
        appendOutput(els.journeyOut, {
          step: name,
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };

    els.journeySignInBtn?.addEventListener("click", () =>
      runStep("signin", runJourneySignInStep)
    );
    els.journeyConnectBtn?.addEventListener("click", () =>
      runStep("integrations", runJourneyIntegrationStep)
    );
    els.journeyRunBtn?.addEventListener("click", () =>
      runStep("run", runJourneyAgentStep)
    );
    els.journeyHitlBtn?.addEventListener("click", () =>
      runStep("hitl", runJourneyHitlStep)
    );
    els.journeyBillingBtn?.addEventListener("click", () =>
      runStep("billing", runJourneyBillingStep)
    );
    els.journeyRunAllBtn?.addEventListener("click", () =>
      runStep("journey_all", runFullJourney)
    );
  }

  function wireActivityTreeControls() {
    els.activityRebuildBtn?.addEventListener("click", () => {
      rebuildActivityFromSessions();
    });

    els.activityClearBtn?.addEventListener("click", () => {
      resetActivityTree();
    });
  }

  function wireEndpointCatalogControls() {
    renderEndpointCategories();
    renderEndpointActions();
    runEndpointCoverageAudit();

    els.endpointCategory?.addEventListener("change", () => {
      state.endpointCategory = asString(els.endpointCategory?.value);
      state.endpointPath = "";
      renderEndpointActions();
    });

    els.endpointAction?.addEventListener("change", () => {
      state.endpointPath = asString(els.endpointAction?.value);
      const endpoint = selectedEndpointDefinition();
      if (endpoint) {
        populateEndpointTemplates(endpoint, false);
      }
    });

    els.endpointLoadTemplateBtn?.addEventListener("click", () => {
      const endpoint = selectedEndpointDefinition();
      if (endpoint) {
        populateEndpointTemplates(endpoint, true);
      }
    });

    els.endpointRunBtn?.addEventListener("click", async () => {
      try {
        await executeEndpointCatalogEntry();
      } catch (error) {
        setOutput(els.endpointOut, {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    els.endpointStopStreamBtn?.addEventListener("click", () => {
      stopStream("endpoint-runner-stream");
      appendOutput(els.endpointOut, { event: "stream.stop" });
    });

    els.endpointToApiLabBtn?.addEventListener("click", () => {
      try {
        pushEndpointToApiLab();
      } catch (error) {
        setOutput(els.endpointOut, {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    els.endpointAuditBtn?.addEventListener("click", () => {
      runEndpointCoverageAudit();
    });
  }

  function wireIdentityButtons() {
    const invoke = async (action) => {
      try {
        const response = await runIdentityAction(action);
        if (action === "auth.logout") {
          await refreshAuthJourneyState();
          await refreshIntegrationConnections();
          return;
        }
        if (
          (action === "auth.login" || action === "auth.register" || action === "auth.google") &&
          response?.ok
        ) {
          await refreshIntegrationConnections();
          await refreshAuthJourneyState();
        }
        if ((action === "billing.checkout" || action === "billing.portal") && response?.ok) {
          setJourneyStepState("billing", "done");
          renderJourneySteps();
        }
      } catch (error) {
        setOutput(els.identityOut, { ok: false, action, error: error instanceof Error ? error.message : String(error) });
      }
    };

    els.authLoginBtn?.addEventListener("click", () => invoke("auth.login"));
    els.authRegisterBtn?.addEventListener("click", () => invoke("auth.register"));
    els.authLogoutBtn?.addEventListener("click", () => invoke("auth.logout"));
    els.authMeBtn?.addEventListener("click", () => invoke("auth.me"));
    els.authGoogleClientBtn?.addEventListener("click", () => invoke("auth.google_client_id"));
    els.authGoogleSigninBtn?.addEventListener("click", () => invoke("auth.google"));
    els.authForgotBtn?.addEventListener("click", () => invoke("auth.forgot_password"));
    els.authResetBtn?.addEventListener("click", () => invoke("auth.reset_password"));
    els.authVerifyReqBtn?.addEventListener("click", () => invoke("auth.verify_email_request"));
    els.authVerifyConfirmBtn?.addEventListener("click", () => invoke("auth.verify_email_confirm"));
    els.authChangePasswordBtn?.addEventListener("click", () => invoke("user.change_password"));
    els.userProfileBtn?.addEventListener("click", () => invoke("user.profile"));
    els.billingSubscriptionBtn?.addEventListener("click", () => invoke("billing.subscription"));
    els.billingCheckoutBtn?.addEventListener("click", () => invoke("billing.checkout"));
    els.billingPortalBtn?.addEventListener("click", () => invoke("billing.portal"));
    els.billingInvoicesBtn?.addEventListener("click", () => invoke("billing.invoices"));
    els.billingCancelBtn?.addEventListener("click", () => invoke("billing.cancel"));
    els.billingResumeBtn?.addEventListener("click", () => invoke("billing.resume"));
  }

  function wireHitlButtons() {
    els.hitlListBtn?.addEventListener("click", async () => {
      try {
        const response = await listHitlApprovals();
        const approvals = extractApprovalsFromResponse(response);
        setJourneyStepState("hitl", approvals.length > 0 ? "active" : "done");
        renderJourneySteps();
      } catch (error) {
        setOutput(els.hitlOut, { ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    });

    els.hitlWatchBtn?.addEventListener("click", async () => {
      try {
        await startHitlWatch();
      } catch (error) {
        if (!(error instanceof Error) || error.name !== "AbortError") {
          appendOutput(els.hitlStreamOut, { event: "watch.error", error: error instanceof Error ? error.message : String(error) });
        }
      }
    });

    els.hitlStopWatchBtn?.addEventListener("click", () => {
      stopHitlWatch();
    });

    els.hitlDecisionBtn?.addEventListener("click", async () => {
      try {
        await submitHitlDecision();
        setJourneyStepState("hitl", "done");
        renderJourneySteps();
      } catch (error) {
        setOutput(els.hitlOut, { ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    });
  }

  function wireOpsButtons() {
    const invoke = async (action) => {
      try {
        await runOpsAction(action);
      } catch (error) {
        setOutput(els.opsOut, { ok: false, action, error: error instanceof Error ? error.message : String(error) });
      }
    };

    els.opsRuntimeDepsBtn?.addEventListener("click", () => invoke("runtime.dependencies"));
    els.opsRuntimeDiagBtn?.addEventListener("click", () => invoke("runtime.diag"));
    els.opsRuntimeLogsBtn?.addEventListener("click", () => invoke("runtime.logs"));
    els.opsTracesSearchBtn?.addEventListener("click", () => invoke("traces.search"));
    els.opsTracesExportBtn?.addEventListener("click", () => invoke("traces.export"));
    els.opsRunsListBtn?.addEventListener("click", () => invoke("runs.list"));
    els.opsRunDetailBtn?.addEventListener("click", () => invoke("runs.detail"));
    els.opsRunTimelineBtn?.addEventListener("click", () => invoke("runs.timeline"));
    els.opsToolsRegistryBtn?.addEventListener("click", () => invoke("tools.registry.list"));
    els.opsToolDetailBtn?.addEventListener("click", () => invoke("tools.registry.detail"));
    els.opsToolsPoliciesBtn?.addEventListener("click", () => invoke("tools.policies.list"));
    els.opsToolsValidateBtn?.addEventListener("click", () => invoke("tools.policies.validate"));
    els.opsToolsExecutionsBtn?.addEventListener("click", () => invoke("tools.executions.list"));
    els.opsExecutionDetailBtn?.addEventListener("click", () => invoke("tools.executions.detail"));
  }

  function wireAdminButtons() {
    const invoke = async (action) => {
      try {
        await runAdminAction(action);
      } catch (error) {
        setOutput(els.adminOut, { ok: false, action, error: error instanceof Error ? error.message : String(error) });
      }
    };

    els.adminPoliciesBtn?.addEventListener("click", () => invoke("admin.policies"));
    els.adminPolicyVersionsBtn?.addEventListener("click", () => invoke("admin.policy_versions"));
    els.adminPolicyActivateBtn?.addEventListener("click", () => invoke("admin.policy_activate"));
    els.adminPolicyValidateBtn?.addEventListener("click", () => invoke("admin.policy_validate"));
    els.adminPolicyReloadBtn?.addEventListener("click", () => invoke("admin.policy_reload"));
    els.adminAuditBtn?.addEventListener("click", () => invoke("admin.audit"));
    els.adminAuditExportBtn?.addEventListener("click", () => invoke("admin.audit_export"));
    els.adminAuditSchemasBtn?.addEventListener("click", () => invoke("admin.audit_schemas"));
    els.adminComplianceBtn?.addEventListener("click", () => invoke("admin.compliance_reports"));
    els.adminApprovalsBtn?.addEventListener("click", () => invoke("admin.approvals"));
    els.adminDecisionBtn?.addEventListener("click", () => invoke("admin.approval_decision"));

    els.adminWatchBtn?.addEventListener("click", async () => {
      try {
        await startAdminWatch();
      } catch (error) {
        if (!(error instanceof Error) || error.name !== "AbortError") {
          appendOutput(els.adminStreamOut, { event: "watch.error", error: error instanceof Error ? error.message : String(error) });
        }
      }
    });

    els.adminStopWatchBtn?.addEventListener("click", () => {
      stopAdminWatch();
    });
  }

  function wireUpdateNotifications() {
    if (desktopApi?.onUpdateAvailable) {
      const cleanup = desktopApi.onUpdateAvailable((info) => {
        if (els.updateBanner) {
          els.updateBanner.style.display = "block";
        }
        if (els.updateVersion) {
          els.updateVersion.textContent = `Version ${asString(info?.version) || "unknown"} is available.`;
        }
      });
      if (typeof cleanup === "function") {
        window.addEventListener("beforeunload", cleanup);
      }
    }

    els.updateBtn?.addEventListener("click", async () => {
      if (!desktopApi?.downloadUpdate) {
        return;
      }
      els.updateBtn.disabled = true;
      els.updateBtn.textContent = "Installing...";
      try {
        const result = await desktopApi.downloadUpdate();
        if (!result?.ok) {
          throw new Error(result?.error || "update failed");
        }
        els.updateBtn.textContent = "Restarting...";
      } catch (error) {
        els.updateBtn.disabled = false;
        els.updateBtn.textContent = "Install & Restart";
        appendOutput(els.runtimeLogs, { event: "update.error", error: error instanceof Error ? error.message : String(error) });
      }
    });
  }

  async function bootstrap() {
    await loadStoredApiKey();
    loadStoredIntegrations();
    loadWorkforceState();
    await loadDesktopConfig();

    if (els.billingReturnUrl && !asString(els.billingReturnUrl.value)) {
      const origin = normalizeGatewayOrigin(state.gatewayUrl) || (window.location ? window.location.origin : "");
      els.billingReturnUrl.value = origin ? `${origin}/account` : "https://mayple.cloud/account";
    }

    if (desktopApi?.getBridgeStatus) {
      try {
        const bridge = await desktopApi.getBridgeStatus();
        setText(els.bridgeMeta, bridge?.available === false ? "Unavailable" : "Available");
        if (bridge && bridge.available === false && els.bridgeWarning) {
          els.bridgeWarning.style.display = "block";
        }
      } catch {
        setText(els.bridgeMeta, "Unknown");
        // ignore bridge status failures
      }
    } else {
      setText(els.bridgeMeta, "Browser mode");
    }

    wireDesktopButtons();
    wireAuthButtons();
    wireAgentButtons();
    wireSessionButtons();
    wireCliButtons();
    wireChatAndApiLab();
    wireIntegrationControls();
    wireWorkforceControls();
    wireJourneyControls();
    wireActivityTreeControls();
    wireEndpointCatalogControls();
    wireIdentityButtons();
    wireHitlButtons();
    wireOpsButtons();
    wireAdminButtons();
    wireUpdateNotifications();
    renderIntegrationList();
    populateJourneyProviderOptions();
    renderJourneySteps();
    resetActivityTree();
    refreshChatViews();
    setText(els.chatStatus, "Ready.");

    window.addEventListener("beforeunload", () => {
      for (const key of state.streamControllers.keys()) {
        stopStream(key);
      }
    });

    await refreshRuntime();
    await refreshCapabilities();
    applyCapabilityGates();

    await refreshAuthJourneyState();

    try {
      await refreshIntegrationConnections();
    } catch {
      // continue boot even if business-api integrations are unavailable
    }

    try {
      await refreshAgentStatus();
    } catch {
      // continue boot
    }

    try {
      await refreshSessions();
    } catch {
      // continue boot
    }

    try {
      await refreshCliTools();
    } catch {
      // continue boot
    }

    setInterval(async () => {
      try {
        await refreshRuntime();
      } catch {
        setBadge("Runtime poll error", "danger");
      }
    }, 8000);
  }

  bootstrap().catch((error) => {
    setBadge("Initialization error", "danger");
    appendOutput(els.runtimeLogs, error instanceof Error ? error.message : String(error));
  });
})();
