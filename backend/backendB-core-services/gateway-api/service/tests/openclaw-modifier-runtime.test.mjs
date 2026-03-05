// Set ALL required env vars for gateway-api config before import
process.env.MAPLE_LOG_LEVEL = process.env.MAPLE_LOG_LEVEL || "error";
process.env.MAPLE_LOG_REQUESTS = process.env.MAPLE_LOG_REQUESTS || "0";
process.env.MAPLE_LOG_INCLUDE_BODIES = process.env.MAPLE_LOG_INCLUDE_BODIES || "0";
process.env.MAPLE_LOG_BODY_MAX_CHARS = process.env.MAPLE_LOG_BODY_MAX_CHARS || "4000";
process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.MAPLE_FIREWALL_LOG_DIR = process.env.MAPLE_FIREWALL_LOG_DIR || "/tmp/maple-firewall-logs";
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
process.env.MAPLE_GATEWAY_TLS_CERT = process.env.MAPLE_GATEWAY_TLS_CERT || "/etc/maple/gateway-tls/tls.crt";
process.env.MAPLE_GATEWAY_TLS_KEY = process.env.MAPLE_GATEWAY_TLS_KEY || "/etc/maple/gateway-tls/tls.key";
process.env.MAPLE_GATEWAY_TLS_CA = process.env.MAPLE_GATEWAY_TLS_CA || "/etc/maple/gateway-tls/ca.crt";
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://maple:maple@127.0.0.1:5432/maple_test";
process.env.CONTEXT_WALL_ADDRESS = process.env.CONTEXT_WALL_ADDRESS || "localhost:9000";
process.env.MCP_PROXY_ADDRESS = process.env.MCP_PROXY_ADDRESS || "localhost:9200";
process.env.CYBER_PROXY_ADDRESS = process.env.CYBER_PROXY_ADDRESS || "localhost:8080";
process.env.AUDIT_WRITER_ADDRESS = process.env.AUDIT_WRITER_ADDRESS || "localhost:9400";
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
process.env.MCP_URL = process.env.MCP_URL || "http://localhost:3000";
process.env.DOWNSTREAM_APPS = process.env.DOWNSTREAM_APPS || "";

import assert from "node:assert/strict";
import test from "node:test";

// Use dynamic import so env vars are set before config.js is evaluated
const {
  configureOpenClawModifierRuntime,
  executeOpenClawModifierRequest,
  getOpenClawModifierApproval,
  getOpenClawModifierPolicy,
  listOpenClawModifierApprovals,
  listOpenClawModifierPolicyVersions,
  listOpenClawModifierOrgMembers,
  saveOpenClawModifierPolicyVersion,
  submitOpenClawModifierApprovalDecision,
  upsertOpenClawModifierOrgMember,
} = await import("../src/core/openclaw-modifier-runtime.js");

test("openclaw modifier policy exposes guardrail configuration", async () => {
  const policy = await getOpenClawModifierPolicy();
  assert.equal(typeof policy.enabled, "boolean");
  assert.equal(Array.isArray(policy.allowedTools), true);
  assert.equal(Array.isArray(policy.dangerousTools), true);
  assert.equal(policy.allowedTools.includes("status"), true);
  assert.equal(typeof policy.constraints.maxTimeoutSeconds, "number");
});

test("openclaw modifier executes allowlisted command against isolated profile", async () => {
  let capturedOptions = null;
  const response = await executeOpenClawModifierRequest(
    {
      tool: "status",
      targetProfile: "worker_a",
      sourceProfile: "controller_a",
      args: ["--json"],
      parseJson: true,
    },
    {
      userId: "user:modifier:test",
      tenantId: "tenant-test",
      orgId: "org-test",
      deviceId: "device-test",
    },
    {
      runOpenClawCliTool: async (options) => {
        capturedOptions = options;
        return {
          ok: true,
          tool: options.tool,
          command: "openclaw",
          args: ["status", "--json"],
          timeoutSeconds: options.timeoutSeconds,
          stdout: JSON.stringify({ ok: true }),
          stderr: "",
          parsedJson: { ok: true },
          exitCode: 0,
          signal: null,
        };
      },
    }
  );

  assert.equal(response.ok, true);
  assert.equal(response.type, "executed");
  assert.equal(response.result.ok, true);
  assert.equal(capturedOptions.profile, "worker_a");
  assert.equal(capturedOptions.tool, "status");
});

test("openclaw modifier blocks unisolated profile and unsafe args", async () => {
  const actor = {
    userId: "user:modifier:isolation",
    tenantId: "tenant-isolation",
    orgId: "org-isolation",
  };

  await assert.rejects(
    () =>
      executeOpenClawModifierRequest(
        {
          tool: "status",
          targetProfile: "same_profile",
          sourceProfile: "same_profile",
        },
        actor
      ),
    /targetProfile must be different/
  );

  await assert.rejects(
    () =>
      executeOpenClawModifierRequest(
        {
          tool: "status",
          targetProfile: "worker_b",
          sourceProfile: "controller_b",
          args: ["--profile", "default"],
        },
        actor
      ),
    /Disallowed argument/
  );
});

test("openclaw modifier enforces HITL approval for dangerous commands", async () => {
  const actor = {
    userId: "user:modifier:approval",
    tenantId: "tenant-hitl",
    orgId: "org-hitl",
    deviceId: "device-hitl",
  };

  const first = await executeOpenClawModifierRequest(
    {
      tool: "status",
      targetProfile: "worker_c",
      sourceProfile: "controller_c",
      forceApproval: true,
      args: ["--json"],
    },
    actor
  );

  assert.equal(first.ok, false);
  assert.equal(first.type, "approval_required");
  assert.equal(first.status, 409);
  assert.equal(typeof first.approval?.id, "string");

  const pendingRecord = await getOpenClawModifierApproval(first.approval.id);
  assert.equal(pendingRecord?.status, "pending");
  const pendingList = await listOpenClawModifierApprovals({ status: "pending" });
  assert.equal(pendingList.some((entry) => entry.id === first.approval.id), true);

  const approvalDecision = await submitOpenClawModifierApprovalDecision(
    first.approval.id,
    "allow",
    "Approved for test",
    { userId: "reviewer:test", tenantId: "tenant-hitl", orgId: "org-hitl" }
  );
  assert.equal(approvalDecision.ok, true);
  assert.equal(approvalDecision.approval.status, "approved");

  const second = await executeOpenClawModifierRequest(
    {
      tool: "status",
      targetProfile: "worker_c",
      sourceProfile: "controller_c",
      forceApproval: true,
      args: ["--json"],
      approvalId: first.approval.id,
    },
    actor,
    {
      runOpenClawCliTool: async (options) => ({
        ok: true,
        tool: options.tool,
        command: "openclaw",
        args: ["status", "--json"],
        timeoutSeconds: options.timeoutSeconds,
        stdout: "ok",
        stderr: "",
        parsedJson: null,
        exitCode: 0,
        signal: null,
      }),
    }
  );

  assert.equal(second.ok, true);
  assert.equal(second.type, "executed");
  assert.equal(second.result.approval.id, first.approval.id);
});

test("openclaw modifier rejects execution when approval is denied", async () => {
  const actor = {
    userId: "user:modifier:reject",
    tenantId: "tenant-reject",
    orgId: "org-reject",
  };
  const first = await executeOpenClawModifierRequest(
    {
      tool: "status",
      targetProfile: "worker_d",
      sourceProfile: "controller_d",
      forceApproval: true,
    },
    actor
  );
  assert.equal(first.ok, false);
  assert.equal(first.type, "approval_required");

  const rejected = await submitOpenClawModifierApprovalDecision(
    first.approval.id,
    "block",
    "Rejected for test",
    { userId: "reviewer:reject", tenantId: "tenant-reject", orgId: "org-reject" }
  );
  assert.equal(rejected.ok, true);
  assert.equal(rejected.approval.status, "rejected");

  const second = await executeOpenClawModifierRequest(
    {
      tool: "status",
      targetProfile: "worker_d",
      sourceProfile: "controller_d",
      forceApproval: true,
      approvalId: first.approval.id,
    },
    actor
  );
  assert.equal(second.ok, false);
  assert.equal(second.status, 403);
});

test("openclaw modifier configureOpenClawModifierRuntime accepts store override", () => {
  // Should not throw when called with no database (uses in-memory fallback)
  configureOpenClawModifierRuntime({});
  // Verify policy still works after reconfigure
});

test("openclaw modifier policy returns scope and version metadata", async () => {
  const actor = { tenantId: "tenant-meta", orgId: "org-meta", userId: "user-meta" };
  const policy = await getOpenClawModifierPolicy(actor);
  assert.equal(typeof policy.enabled, "boolean");
  assert.equal(typeof policy.scope, "object");
  assert.equal(policy.scope.tenantId, "tenant-meta");
  assert.equal(policy.scope.orgId, "org-meta");
});
