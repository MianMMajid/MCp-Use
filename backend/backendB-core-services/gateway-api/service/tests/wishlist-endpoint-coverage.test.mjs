import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

function collectJsFiles(dir) {
  const entries = readdirSync(dir);
  const files = [];
  for (const entry of entries) {
    const fullPath = resolve(dir, entry);
    const info = statSync(fullPath);
    if (info.isDirectory()) {
      files.push(...collectJsFiles(fullPath));
      continue;
    }
    if (entry.endsWith(".js")) {
      files.push(fullPath);
    }
  }
  return files;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function endpointRegex(method, pathTemplate) {
  const escaped = escapeRegex(pathTemplate).replace(
    /:([A-Za-z0-9_]+)/g,
    '[^"\'`/]+'
  );
  return new RegExp(
    `[A-Za-z_][A-Za-z0-9_\\.]*\\.${method}\\(\\s*["'\`]${escaped}`,
    "m"
  );
}

function assertEndpointCoverage(sources, endpoint) {
  const [method, pathTemplate] = endpoint.split(" ");
  const regex = endpointRegex(method.toLowerCase(), pathTemplate);
  const matched = sources.some((source) => regex.test(source.content));
  assert.equal(matched, true, `Missing endpoint: ${endpoint}`);
}

const repoRoot = process.cwd();
const gatewayRouteFiles = collectJsFiles(
  resolve(repoRoot, "backend/backendB-core-services/gateway-api/service/src/routes")
);
const businessRouteFiles = collectJsFiles(
  resolve(repoRoot, "backend/backendC-saas-services/business-api/service/src/routes")
);
const adminRouteFiles = [
  resolve(repoRoot, "backend/backendB-core-services/admin-console-api/service/src/main.js"),
  resolve(
    repoRoot,
    "backend/backendB-core-services/admin-console-api/service/src/static-routes.js"
  ),
];

const gatewaySources = gatewayRouteFiles.map((path) => ({
  path,
  content: readFileSync(path, "utf8"),
}));
const businessSources = businessRouteFiles.map((path) => ({
  path,
  content: readFileSync(path, "utf8"),
}));
const adminSources = adminRouteFiles.map((path) => ({
  path,
  content: readFileSync(path, "utf8"),
}));

const gatewayEndpoints = [
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
  "POST /api/openclaw/cli/exec",
  "GET /api/openclaw/cli/:tool/help",
  "POST /api/openclaw/cli/:tool/exec",
  "GET /api/firewall/state",
  "POST /api/firewall/decision",
  "POST /api/firewall/chat",
  "POST /api/chat/stream",
  "GET /api/chat/capabilities",
  "POST /api/firewall/preview",
  "GET /api/firewall/rules/effective",
  "GET /api/hitl/approvals",
  "GET /api/hitl/approvals/watch",
  "POST /api/hitl/approvals/decision",
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
  "GET /api/billing/subscription",
  "POST /api/billing/create-checkout-session",
  "POST /api/billing/portal-session",
  "POST /api/billing/webhook",
  "GET /api/billing/invoices",
  "POST /api/billing/subscription/cancel",
  "POST /api/billing/subscription/resume",
  "GET /api/org",
  "POST /api/org",
  "PATCH /api/org/:orgId",
  "GET /api/org/:orgId/members",
  "POST /api/org/:orgId/invites",
  "POST /api/org/invites/:inviteId/accept",
  "DELETE /api/org/:orgId/members/:userId",
  "GET /api/org/:orgId/roles",
  "POST /api/org/:orgId/roles/:roleId/assign",
  "GET /api/user/api-keys",
  "POST /api/user/api-keys",
  "DELETE /api/user/api-keys/:keyId",
  "GET /api/org/:orgId/service-accounts",
  "POST /api/org/:orgId/service-accounts",
  "POST /api/org/:orgId/service-accounts/:id/keys",
  "DELETE /api/org/:orgId/service-accounts/:id/keys/:keyId",
  "GET /api/entitlements",
  "GET /api/usage/summary",
  "GET /api/usage/timeseries",
  "GET /api/limits",
  "POST /api/limits/override",
  "GET /api/traces",
  "GET /api/traces/:traceId",
  "GET /api/traces/search",
  "POST /api/traces/export",
  "GET /api/runs",
  "GET /api/runs/:runId",
  "GET /api/runs/:runId/timeline",
  "GET /health",
  "GET /ready",
  "GET /api/runtime/status",
  "GET /api/runtime/dependencies",
  "GET /api/runtime/feature-capabilities",
  "GET /api/runtime/diag",
  "GET /api/runtime/logs",
  "GET /api/tools/registry",
  "GET /api/tools/registry/:toolId",
  "POST /api/tools/registry",
  "PATCH /api/tools/registry/:toolId",
  "GET /api/tools/policies",
  "POST /api/tools/policies/validate",
  "GET /api/tools/executions",
  "GET /api/tools/executions/:executionId",
  "GET /.well-known/oauth-authorization-server",
  "GET /.well-known/oauth-protected-resource",
  "GET /.well-known/ai-plugin.json",
  "GET /gpt/openapi.json",
  "GET /gpt/oauth/authorize",
  "POST /gpt/oauth/token",
  "POST /gpt/tools/:toolName",
];

const businessEndpoints = [
  "POST /api/business/auth/login",
  "POST /api/business/auth/register",
  "POST /api/business/auth/logout",
  "GET /api/business/auth/me",
  "GET /api/business/auth/google/client-id",
  "POST /api/business/auth/google",
  "POST /api/business/auth/forgot-password",
  "POST /api/business/auth/reset-password",
  "POST /api/business/auth/verify-email/request",
  "POST /api/business/auth/verify-email/confirm",
  "GET /api/business/billing/subscription",
  "POST /api/business/billing/create-checkout-session",
  "POST /api/business/billing/portal-session",
  "POST /api/business/billing/webhook",
  "GET /api/business/billing/invoices",
  "POST /api/business/billing/subscription/cancel",
  "POST /api/business/billing/subscription/resume",
  "GET /api/business/org",
  "POST /api/business/org",
  "PATCH /api/business/org/:orgId",
  "GET /api/business/org/:orgId/members",
  "POST /api/business/org/:orgId/invites",
  "POST /api/business/org/invites/:inviteId/accept",
  "DELETE /api/business/org/:orgId/members/:userId",
  "GET /api/business/org/:orgId/roles",
  "POST /api/business/org/:orgId/roles/:roleId/assign",
  "GET /api/business/user/api-keys",
  "POST /api/business/user/api-keys",
  "DELETE /api/business/user/api-keys/:keyId",
  "GET /api/business/org/:orgId/service-accounts",
  "POST /api/business/org/:orgId/service-accounts",
  "POST /api/business/org/:orgId/service-accounts/:id/keys",
  "DELETE /api/business/org/:orgId/service-accounts/:id/keys/:keyId",
  "GET /api/business/entitlements",
  "GET /api/business/usage/summary",
  "GET /api/business/usage/timeseries",
  "GET /api/business/limits",
  "POST /api/business/limits/override",
];

const adminEndpoints = [
  "GET /admin/api/policies",
  "POST /admin/api/policies/reload",
  "GET /admin/api/policies/versions",
  "POST /admin/api/policies/versions/:versionId/activate",
  "POST /admin/api/policies/validate",
  "GET /admin/api/approvals",
  "GET /admin/api/approvals/watch",
  "POST /admin/api/approvals/decision",
  "GET /admin/api/audit",
  "POST /admin/api/audit/export",
  "GET /admin/api/audit/schemas",
  "GET /admin/api/compliance/reports",
];

test("wishlist endpoint coverage remains fully wired", () => {
  for (const endpoint of gatewayEndpoints) {
    assertEndpointCoverage(gatewaySources, endpoint);
  }
  for (const endpoint of businessEndpoints) {
    assertEndpointCoverage(businessSources, endpoint);
  }
  for (const endpoint of adminEndpoints) {
    assertEndpointCoverage(adminSources, endpoint);
  }
});
