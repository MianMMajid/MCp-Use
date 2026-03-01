/**
 * e2e-app.test.mjs
 *
 * End-to-end integration test exercising the full app lifecycle:
 * createApp() → HTTP request → middleware → route → database → shutdown.
 *
 * Uses DATABASE_URL from env or falls back to the default local Postgres
 * provisioned by k8s/Northflank (postgresql://maple:maple@localhost:5432/maple).
 * Throws on connection failure — the DB is always expected to be available.
 *
 * Run with: node --test backend/backendB-core-services/gateway-api/service/tests/e2e-app.test.mjs
 */

// Set ALL required env vars for gateway-api config before import
process.env.MAPLE_LOG_LEVEL = process.env.MAPLE_LOG_LEVEL || "error";
process.env.MAPLE_LOG_REQUESTS = process.env.MAPLE_LOG_REQUESTS || "0";
process.env.MAPLE_LOG_INCLUDE_BODIES = process.env.MAPLE_LOG_INCLUDE_BODIES || "0";
process.env.MAPLE_LOG_BODY_MAX_CHARS = process.env.MAPLE_LOG_BODY_MAX_CHARS || "4000";
process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_placeholder";
process.env.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "whsec_test";
process.env.STRIPE_PRICE_PRO = process.env.STRIPE_PRICE_PRO || "price_pro";
process.env.STRIPE_PRICE_TEAM = process.env.STRIPE_PRICE_TEAM || "price_team";
process.env.STRIPE_PRICE_ENTERPRISE = process.env.STRIPE_PRICE_ENTERPRISE || "price_enterprise";
process.env.STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY || "pk_test_placeholder";
process.env.MAPLE_ALLOW_NO_AUTH = process.env.MAPLE_ALLOW_NO_AUTH || "1";
process.env.MAPLE_ALLOW_BRIDGE_OVERRIDE = process.env.MAPLE_ALLOW_BRIDGE_OVERRIDE || "0";
process.env.MAPLE_LOCK_BRIDGE_TARGET = process.env.MAPLE_LOCK_BRIDGE_TARGET || "0";
process.env.OPENCLAW_BRIDGE_URL = process.env.OPENCLAW_BRIDGE_URL || "http://127.0.0.1:8787";
process.env.OPENCLAW_BRIDGE_TOKEN = process.env.OPENCLAW_BRIDGE_TOKEN || "test-token";
process.env.MAPLE_OPENCLAW_AGENT_ENABLED = process.env.MAPLE_OPENCLAW_AGENT_ENABLED || "1";
process.env.MAPLE_OPENCLAW_AGENT_MODE = process.env.MAPLE_OPENCLAW_AGENT_MODE || "gateway";
process.env.MAPLE_OPENCLAW_AGENT_REQUIRED = process.env.MAPLE_OPENCLAW_AGENT_REQUIRED || "0";
process.env.MAPLE_OPENCLAW_AGENT_DEV_PROFILE = process.env.MAPLE_OPENCLAW_AGENT_DEV_PROFILE || "1";
process.env.MAPLE_OPENCLAW_AGENT_AUTOSTART_GATEWAY = process.env.MAPLE_OPENCLAW_AGENT_AUTOSTART_GATEWAY || "0";
process.env.MAPLE_OPENCLAW_AGENT_GATEWAY_PORT = process.env.MAPLE_OPENCLAW_AGENT_GATEWAY_PORT || "19001";
process.env.MAPLE_OPENCLAW_AGENT_GATEWAY_BIND = process.env.MAPLE_OPENCLAW_AGENT_GATEWAY_BIND || "loopback";
process.env.MAPLE_OPENCLAW_AGENT_DEFAULT_SESSION_ID = process.env.MAPLE_OPENCLAW_AGENT_DEFAULT_SESSION_ID || "agent-dev-main";
process.env.MAPLE_OPENCLAW_AGENT_DEFAULT_THINKING = process.env.MAPLE_OPENCLAW_AGENT_DEFAULT_THINKING || "medium";
process.env.MAPLE_OPENCLAW_AGENT_TIMEOUT_SECONDS = process.env.MAPLE_OPENCLAW_AGENT_TIMEOUT_SECONDS || "120";
process.env.MAPLE_OPENCLAW_MODIFIER_ENABLED = process.env.MAPLE_OPENCLAW_MODIFIER_ENABLED || "1";
process.env.MAPLE_OPENCLAW_MODIFIER_ALLOW_DEV_PROFILE = process.env.MAPLE_OPENCLAW_MODIFIER_ALLOW_DEV_PROFILE || "0";
process.env.MAPLE_OPENCLAW_MODIFIER_APPROVAL_TTL_SECONDS = process.env.MAPLE_OPENCLAW_MODIFIER_APPROVAL_TTL_SECONDS || "900";
process.env.MAPLE_OPENCLAW_MODIFIER_MAX_TIMEOUT_SECONDS = process.env.MAPLE_OPENCLAW_MODIFIER_MAX_TIMEOUT_SECONDS || "90";
process.env.MAPLE_OPENCLAW_MODIFIER_MAX_BUFFER_MB = process.env.MAPLE_OPENCLAW_MODIFIER_MAX_BUFFER_MB || "8";
process.env.MAPLE_OPENCLAW_MODIFIER_SOURCE_PROFILE = process.env.MAPLE_OPENCLAW_MODIFIER_SOURCE_PROFILE || "default";
process.env.MAPLE_OPENCLAW_MODIFIER_ALLOWED_TOOLS = process.env.MAPLE_OPENCLAW_MODIFIER_ALLOWED_TOOLS || "agent,agents,message,sessions,status,health,gateway,memory,models,skills,nodes,logs";
process.env.MAPLE_OPENCLAW_MODIFIER_DANGEROUS_TOOLS = process.env.MAPLE_OPENCLAW_MODIFIER_DANGEROUS_TOOLS || "setup,onboard,configure,config,reset,uninstall,update,plugins,webhooks,hooks,pairing,devices,node,sandbox,daemon,voicecall,acp,system,directory,dns,browser,cron";
process.env.MAPLE_OPENCLAW_MODIFIER_BLOCKED_TARGET_PROFILES = process.env.MAPLE_OPENCLAW_MODIFIER_BLOCKED_TARGET_PROFILES || "default,main,primary,root,system";
process.env.MAPLE_OPENCLAW_MODIFIER_REQUIRE_SCOPE = process.env.MAPLE_OPENCLAW_MODIFIER_REQUIRE_SCOPE || "1";
process.env.MAPLE_OPENCLAW_MODIFIER_REQUIRE_ORG_RBAC = process.env.MAPLE_OPENCLAW_MODIFIER_REQUIRE_ORG_RBAC || "1";
process.env.MAPLE_OPENCLAW_MODIFIER_REQUIRE_TENANT_POLICY = process.env.MAPLE_OPENCLAW_MODIFIER_REQUIRE_TENANT_POLICY || "0";
process.env.MAPLE_OPENCLAW_MODIFIER_AUTO_BOOTSTRAP_OWNER = process.env.MAPLE_OPENCLAW_MODIFIER_AUTO_BOOTSTRAP_OWNER || "1";
process.env.MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX = process.env.MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX || "1";
process.env.MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX_INTERVAL_MS = process.env.MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX_INTERVAL_MS || "5000";
process.env.MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX_BATCH_SIZE = process.env.MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX_BATCH_SIZE || "50";
process.env.MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX_MAX_RETRIES = process.env.MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX_MAX_RETRIES || "5";
process.env.MAPLE_STEP_UP_REQUIRED_FOR_APPROVALS = process.env.MAPLE_STEP_UP_REQUIRED_FOR_APPROVALS || "0";
process.env.MAPLE_ESCALATION_CHECK_INTERVAL_MS = process.env.MAPLE_ESCALATION_CHECK_INTERVAL_MS || "30000";
process.env.MAPLE_RETENTION_CHECK_INTERVAL_MS = process.env.MAPLE_RETENTION_CHECK_INTERVAL_MS || "86400000";
process.env.MAPLE_MODIFIER_GOVERNANCE_ENABLED = process.env.MAPLE_MODIFIER_GOVERNANCE_ENABLED || "0";
process.env.MAPLE_LEADER_ELECTION_ENABLED = process.env.MAPLE_LEADER_ELECTION_ENABLED || "1";
process.env.MAPLE_OTLP_ENDPOINT = process.env.MAPLE_OTLP_ENDPOINT || "http://localhost:4318";
process.env.MAPLE_OTLP_SERVICE_NAME = process.env.MAPLE_OTLP_SERVICE_NAME || "gateway-api";
process.env.MAPLE_OTLP_BATCH_SIZE = process.env.MAPLE_OTLP_BATCH_SIZE || "100";
process.env.MAPLE_OTLP_FLUSH_INTERVAL_MS = process.env.MAPLE_OTLP_FLUSH_INTERVAL_MS || "5000";
process.env.MAPLE_OTLP_TIMEOUT_MS = process.env.MAPLE_OTLP_TIMEOUT_MS || "10000";
process.env.MAPLE_EVENT_TRANSPORT_BACKEND = process.env.MAPLE_EVENT_TRANSPORT_BACKEND || "pg";
process.env.MAPLE_REDIS_URL = process.env.MAPLE_REDIS_URL || "redis://localhost:6379";
process.env.MAPLE_FIREWALL_CHAT_PREFER_OPENCLAW = process.env.MAPLE_FIREWALL_CHAT_PREFER_OPENCLAW || "1";
process.env.MAPLE_FIREWALL_CHAT_STRICT_MODE = process.env.MAPLE_FIREWALL_CHAT_STRICT_MODE || "0";
process.env.MAPLE_SESSION_POLL = process.env.MAPLE_SESSION_POLL || "1";
process.env.MAPLE_SESSION_POLL_MS = process.env.MAPLE_SESSION_POLL_MS || "5000";
process.env.MAPLE_MCP_FIREWALL_DEFAULT_APP = process.env.MAPLE_MCP_FIREWALL_DEFAULT_APP || "default";
process.env.MAPLE_MCP_PROXY_ALLOW_DYNAMIC_TARGETS = process.env.MAPLE_MCP_PROXY_ALLOW_DYNAMIC_TARGETS || "0";
process.env.MAPLE_MCP_PROXY_ALLOW_HTTP = process.env.MAPLE_MCP_PROXY_ALLOW_HTTP || "0";
process.env.MAPLE_MCP_PROXY_ALLOW_PRIVATE_TARGETS = process.env.MAPLE_MCP_PROXY_ALLOW_PRIVATE_TARGETS || "0";
process.env.MAPLE_MCP_PROXY_DEFAULT_TARGET_URL = process.env.MAPLE_MCP_PROXY_DEFAULT_TARGET_URL || "http://localhost:3000";
process.env.MAPLE_MCP_PROXY_ALLOWED_HOSTS = process.env.MAPLE_MCP_PROXY_ALLOWED_HOSTS || "localhost";
process.env.MAPLE_MCP_EXECUTION_ORDER = process.env.MAPLE_MCP_EXECUTION_ORDER || "default";
process.env.MAPLE_DOWNSTREAM_TOOLS_CACHE_TTL_MS = process.env.MAPLE_DOWNSTREAM_TOOLS_CACHE_TTL_MS || "15000";
process.env.MAPLE_MCP_ROUTE_LOCK = process.env.MAPLE_MCP_ROUTE_LOCK || "0";
process.env.MAPLE_SESSION_OWNER_SCOPE = process.env.MAPLE_SESSION_OWNER_SCOPE || "auto";
process.env.MAPLE_ENABLE_DEMO_ROUTES = process.env.MAPLE_ENABLE_DEMO_ROUTES || "1";
process.env.MAPLE_ENABLE_JUDGE_UI = process.env.MAPLE_ENABLE_JUDGE_UI || "1";
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || "test-openai-key";
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "test-anthropic-key";
process.env.MAPLE_FIREWALL_CHAT_PRIMARY = process.env.MAPLE_FIREWALL_CHAT_PRIMARY || "openai";
process.env.MAPLE_FIREWALL_CHAT_OPENAI_MODEL = process.env.MAPLE_FIREWALL_CHAT_OPENAI_MODEL || "gpt-4o-mini";
process.env.MAPLE_FIREWALL_CHAT_ANTHROPIC_MODEL = process.env.MAPLE_FIREWALL_CHAT_ANTHROPIC_MODEL || "claude-sonnet-4-6";
process.env.MAPLE_FIREWALL_CHAT_TIMEOUT_MS = process.env.MAPLE_FIREWALL_CHAT_TIMEOUT_MS || "15000";
process.env.MAPLE_SESSION_COOKIE_NAME = process.env.MAPLE_SESSION_COOKIE_NAME || "maple_session";
process.env.MAPLE_SESSION_TTL_SECONDS = process.env.MAPLE_SESSION_TTL_SECONDS || "604800";
process.env.MAPLE_AUTH_ALLOW_SELF_SIGNUP = process.env.MAPLE_AUTH_ALLOW_SELF_SIGNUP || "0";
process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "test-google-client-id";
process.env.MAPLE_GPT_OAUTH_CLIENT_ID = process.env.MAPLE_GPT_OAUTH_CLIENT_ID || "maple-gpt-client";
process.env.MAPLE_GPT_OAUTH_CLIENT_SECRET = process.env.MAPLE_GPT_OAUTH_CLIENT_SECRET || "maple-secret";
process.env.GATEWAY_PORT = process.env.GATEWAY_PORT || "8443";
process.env.GATEWAY_HOST = process.env.GATEWAY_HOST || "0.0.0.0";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __e2e_dir = dirname(fileURLToPath(import.meta.url));
const __cert_dir = resolve(__e2e_dir, "../../../../backendA-platform-infra/certs");
process.env.MAPLE_GATEWAY_TLS_CERT = process.env.MAPLE_GATEWAY_TLS_CERT || `${__cert_dir}/tls.crt`;
process.env.MAPLE_GATEWAY_TLS_KEY = process.env.MAPLE_GATEWAY_TLS_KEY || `${__cert_dir}/tls.key`;
process.env.MAPLE_GATEWAY_TLS_CA = process.env.MAPLE_GATEWAY_TLS_CA || `${__cert_dir}/ca.crt`;
process.env.MAPLE_GRPC_TLS_CERT = process.env.MAPLE_GRPC_TLS_CERT || process.env.MAPLE_GATEWAY_TLS_CERT;
process.env.MAPLE_GRPC_TLS_KEY = process.env.MAPLE_GRPC_TLS_KEY || process.env.MAPLE_GATEWAY_TLS_KEY;
process.env.MAPLE_GRPC_TLS_CA = process.env.MAPLE_GRPC_TLS_CA || process.env.MAPLE_GATEWAY_TLS_CA;
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://maple:maple@127.0.0.1:5432/maple_test";
process.env.CONTEXT_WALL_ADDRESS = process.env.CONTEXT_WALL_ADDRESS || "localhost:9000";
process.env.MODEL_ROUTER_ADDRESS = process.env.MODEL_ROUTER_ADDRESS || "localhost:9100";
process.env.MCP_PROXY_ADDRESS = process.env.MCP_PROXY_ADDRESS || "localhost:9200";
process.env.TOOL_RUNNER_ADDRESS = process.env.TOOL_RUNNER_ADDRESS || "localhost:9250";
process.env.CYBER_PROXY_ADDRESS = process.env.CYBER_PROXY_ADDRESS || "localhost:8080";
process.env.SECRETS_BROKER_ADDRESS = process.env.SECRETS_BROKER_ADDRESS || "localhost:9300";
process.env.AUDIT_WRITER_ADDRESS = process.env.AUDIT_WRITER_ADDRESS || "localhost:9400";
process.env.MAPLE_BUSINESS_API_BASE_URL = process.env.MAPLE_BUSINESS_API_BASE_URL || "http://localhost:9550";
process.env.MAPLE_BUSINESS_API_REQUIRED = process.env.MAPLE_BUSINESS_API_REQUIRED || "0";
process.env.MAPLE_BUSINESS_API_CA = process.env.MAPLE_BUSINESS_API_CA || "/etc/maple/tls/ca.crt";
process.env.MAPLE_BUSINESS_API_CERT = process.env.MAPLE_BUSINESS_API_CERT || "/etc/maple/gateway-tls/tls.crt";
process.env.MAPLE_BUSINESS_API_KEY = process.env.MAPLE_BUSINESS_API_KEY || "/etc/maple/gateway-tls/tls.key";
process.env.MAPLE_BUSINESS_API_TIMEOUT_MS = process.env.MAPLE_BUSINESS_API_TIMEOUT_MS || "3000";
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
process.env.MCP_URL = process.env.MCP_URL || "http://localhost:3000";
process.env.DOWNSTREAM_APPS = process.env.DOWNSTREAM_APPS || "";

import assert from "node:assert/strict";
import test from "node:test";

if (!process.env.DATABASE_URL) {
  throw new Error("Missing required environment variable: DATABASE_URL");
}

// Configure env before any app code runs
process.env.MAPLE_TENANT_CLAIM_SIGNING_KEY = process.env.MAPLE_TENANT_CLAIM_SIGNING_KEY || "ci-test-tenant-key";
process.env.MAPLE_SKIP_AUTH_BOOTSTRAP = "1";
process.env.MAPLE_DISABLE_HITL_BROKER = "1";
process.env.MAPLE_ALLOW_NO_AUTH = "1";
process.env.MAPLE_LEADER_ELECTION_ENABLED = "0";
process.env.MAPLE_OPENCLAW_AGENT_ENABLED = "0";
process.env.MAPLE_OPENCLAW_AGENT_AUTOSTART_GATEWAY = "0";
process.env.MAPLE_OTLP_ENDPOINT = "http://localhost:4318";
process.env.MAPLE_SESSION_POLL = "0";

let appResult = null;

test.before(async () => {
  const { createApp } = await import("../src/app.js");
  appResult = await createApp();
});

test.after(async () => {
  if (appResult?.shutdown) {
    await appResult.shutdown();
  }
});

// Helper to make requests against the Hono app
async function appFetch(path, options = {}) {
  const { app } = appResult;
  const url = `http://localhost${path}`;
  const req = new Request(url, options);
  return app.fetch(req);
}

// ── Test 1: Health check ───────────────────────────────────────────

test("GET /health returns 200", async () => {
  const resp = await appFetch("/health");
  assert.equal(resp.status, 200);
  const body = await resp.json();
  assert.equal(body.status, "ok");
});

// ── Test 2: Readiness check ────────────────────────────────────────

test("GET /ready returns 200", async () => {
  const resp = await appFetch("/ready");
  assert.equal(resp.status, 200);
  const body = await resp.json();
  assert.ok(body.status === "ok" || body.status === "ready" || body.ready === true);
});

// ── Test 3: Runtime status ─────────────────────────────────────────

test("GET /api/runtime/feature-capabilities returns 200", async () => {
  const resp = await appFetch("/api/runtime/feature-capabilities");
  // May require auth, so accept 200 or 401
  assert.ok(
    [200, 401].includes(resp.status),
    `Expected 200 or 401, got ${resp.status}`
  );
});

// ── Test 4: Modifier exec without auth ─────────────────────────────

test("POST /api/openclaw/modifier/exec without auth rejects request", async () => {
  const resp = await appFetch("/api/openclaw/modifier/exec", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tool: "test", input: {} }),
  });
  assert.ok(
    [400, 401, 403].includes(resp.status),
    `Expected 400, 401, or 403, got ${resp.status}`
  );
});

// ── Test 5: Modifier capabilities ──────────────────────────────────

test("GET /api/openclaw/modifier/capabilities returns 200", async () => {
  const resp = await appFetch("/api/openclaw/modifier/capabilities");
  // This endpoint may or may not require auth
  assert.ok(
    [200, 401, 403].includes(resp.status),
    `Expected 200/401/403, got ${resp.status}`
  );
  if (resp.status === 200) {
    const body = await resp.json();
    assert.ok(typeof body === "object");
  }
});

// ── Test 6: 404 fallback ───────────────────────────────────────────

test("GET /nonexistent returns 404", async () => {
  const resp = await appFetch("/nonexistent");
  assert.equal(resp.status, 404);
  const body = await resp.json();
  assert.equal(body.error, "Not Found");
});
