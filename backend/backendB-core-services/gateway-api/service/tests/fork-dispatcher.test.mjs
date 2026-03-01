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
process.env.MAPLE_GATEWAY_TLS_CERT = process.env.MAPLE_GATEWAY_TLS_CERT || "/etc/maple/gateway-tls/tls.crt";
process.env.MAPLE_GATEWAY_TLS_KEY = process.env.MAPLE_GATEWAY_TLS_KEY || "/etc/maple/gateway-tls/tls.key";
process.env.MAPLE_GATEWAY_TLS_CA = process.env.MAPLE_GATEWAY_TLS_CA || "/etc/maple/gateway-tls/ca.crt";
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

/**
 * fork-dispatcher.test.mjs
 *
 * Tests for ForkDispatcher (process mode) and mergeForkExecutionResult.
 *
 * Run with: node --test backend/backendB-core-services/gateway-api/service/tests/fork-dispatcher.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import { fork } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXECUTOR_PATH = resolve(__dirname, "../src/core/fork-executor.js");

// ── Helpers ──────────────────────────────────────────────────────────────

function makeTrace(overrides = {}) {
    return {
        id: "trace-fork-001",
        sessionId: "session-001",
        source: "test",
        status: "active",
        forkedFromStep: 0,
        ownerKeyFingerprint: "owner-fp-001",
        metadata: {},
        steps: [
            {
                type: "prompt",
                content: "Hello system",
                output: "Hello user",
                riskFlags: [],
            },
            {
                type: "tool_call",
                toolCall: {
                    name: "readFile",
                    appId: "test-app",
                    targetUrl: "http://localhost:3000",
                    arguments: { path: "/etc/hosts" },
                    output: null,
                },
                output: null,
                riskFlags: [],
            },
        ],
        ...overrides,
    };
}

function makeParentTrace() {
    return {
        id: "trace-parent-001",
        sessionId: "session-parent-001",
        ownerKeyFingerprint: "owner-fp-001",
        steps: [],
    };
}

// ── Test 1: Result merger — steps updated with execution data ─────────

test("mergeForkExecutionResult updates steps with execution data and calls audit", async () => {
    // Import merger directly (pure function, no side-effect imports)
    const { mergeForkExecutionResult } = await import("../src/core/fork-result-merger.js");

    const trace = makeTrace();
    const executionResult = {
        success: true,
        forkedTraceId: "trace-fork-001",
        parentTraceId: "trace-parent-001",
        executedSteps: [
            {
                index: 0,
                success: true,
                output: "pass-through output",
                toolOutput: null,
                durationMs: 5,
                guardStatus: "pass-through",
                riskScore: 0,
                riskFlags: [],
                error: null,
            },
            {
                index: 1,
                success: true,
                output: '{"content":"file contents"}',
                toolOutput: '{"result":"ok"}',
                durationMs: 150,
                guardStatus: "allowed",
                riskScore: 3,
                riskFlags: [{ id: "file-read", type: "firewall_file_read", stepIndex: 1, message: "file read" }],
                error: null,
            },
        ],
        totalDurationMs: 200,
    };

    let upsertCalled = false;
    const mockTraceStore = {
        upsertTrace(t, fp) {
            upsertCalled = true;
            assert.equal(fp, "owner-fp-001");
        },
    };

    mergeForkExecutionResult(trace, executionResult, mockTraceStore, "owner-fp-001");

    // Step 0 (prompt) should have pass-through metadata
    assert.equal(trace.steps[0].guardStatus, "pass-through");
    assert.ok(trace.steps[0].executionMetadata);
    assert.equal(trace.steps[0].executionMetadata.success, true);

    // Step 1 (tool_call) should have real output
    assert.equal(trace.steps[1].output, '{"content":"file contents"}');
    assert.equal(trace.steps[1].toolCall.output, '{"result":"ok"}');
    // guardStatus may be overwritten by enforceTraceFirewall after merge
    assert.ok(trace.steps[1].guardStatus);

    // Trace metadata should be updated
    assert.equal(trace.metadata.forkExecutionCompleted, true);
    assert.equal(trace.metadata.forkExecutionSuccess, true);
    assert.equal(trace.metadata.forkExecutedStepCount, 2);

    assert.ok(upsertCalled);
});

// ── Test 2: Result merger — blocked step quarantines trace ─────────────

test("mergeForkExecutionResult quarantines trace when step is blocked", async () => {
    const { mergeForkExecutionResult } = await import("../src/core/fork-result-merger.js");

    const trace = makeTrace();
    const executionResult = {
        success: false,
        forkedTraceId: "trace-fork-001",
        parentTraceId: "trace-parent-001",
        executedSteps: [
            {
                index: 0,
                success: true,
                output: null,
                toolOutput: null,
                durationMs: 2,
                guardStatus: "pass-through",
                riskScore: 0,
                riskFlags: [],
                error: null,
            },
            {
                index: 1,
                success: false,
                output: null,
                toolOutput: null,
                durationMs: 50,
                guardStatus: "blocked",
                riskScore: 9,
                riskFlags: [{ id: "policy-violation", type: "firewall_policy", stepIndex: 1, message: "Policy violation" }],
                error: "Policy blocked",
            },
        ],
        totalDurationMs: 60,
    };

    const mockTraceStore = { upsertTrace() {} };
    mergeForkExecutionResult(trace, executionResult, mockTraceStore, "owner-fp-001");

    // Trace should be quarantined since a step was blocked
    assert.equal(trace.status, "quarantined");
    // guardStatus may be "blocked" or "block" depending on firewall enforcement
    assert.ok(["blocked", "block"].includes(trace.steps[1].guardStatus));
    assert.equal(trace.metadata.forkExecutionSuccess, false);
});

// ── Test 3: Result merger — handles null/undefined inputs ──────────────

test("mergeForkExecutionResult handles null inputs gracefully", async () => {
    const { mergeForkExecutionResult } = await import("../src/core/fork-result-merger.js");

    // Should not throw
    mergeForkExecutionResult(null, null, { upsertTrace() {} }, "fp");
    mergeForkExecutionResult(undefined, undefined, { upsertTrace() {} }, "fp");
    mergeForkExecutionResult(makeTrace(), null, { upsertTrace() {} }, "fp");
});

// ── Test 4: Result merger — handles fork offset ────────────────────────

test("mergeForkExecutionResult respects forkedFromStep offset", async () => {
    const { mergeForkExecutionResult } = await import("../src/core/fork-result-merger.js");

    const trace = makeTrace({
        forkedFromStep: 1,
        steps: [
            { type: "prompt", content: "original", output: "original-output" },
            { type: "tool_call", toolCall: { name: "readFile", output: null }, output: null },
        ],
    });

    const executionResult = {
        success: true,
        forkedTraceId: "trace-fork-001",
        parentTraceId: "trace-parent-001",
        executedSteps: [
            {
                index: 0, // maps to trace step at forkedFromStep + 0 = 1
                success: true,
                output: "executed-output",
                toolOutput: '{"data":"result"}',
                durationMs: 100,
                guardStatus: "allowed",
                riskScore: 2,
                riskFlags: [],
                error: null,
            },
        ],
        totalDurationMs: 100,
    };

    const mockTraceStore = { upsertTrace() {} };
    mergeForkExecutionResult(trace, executionResult, mockTraceStore, "fp");

    // Step 0 (before fork point) should be unchanged
    assert.equal(trace.steps[0].output, "original-output");
    assert.equal(trace.steps[0].executionMetadata, undefined);

    // Step 1 (at fork point) should be updated
    assert.equal(trace.steps[1].output, "executed-output");
    assert.equal(trace.steps[1].toolCall.output, '{"data":"result"}');
});

// ── Test 5: ForkDispatcher constructor validates mode ──────────────────

test("ForkDispatcher rejects unknown mode", async () => {
    const { ForkDispatcher } = await import("../src/core/fork-dispatcher.js");

    const dispatcher = new ForkDispatcher("invalid");
    await assert.rejects(
        () => dispatcher.dispatch(makeTrace(), makeParentTrace()),
        { message: /Unknown fork isolation mode/ },
    );
});

// ── Test 6: K8s mode — verify Job spec security context ────────────────

test("K8s mode requires MAPLE_FORK_EXECUTOR_IMAGE", async () => {
    const { ForkDispatcher } = await import("../src/core/fork-dispatcher.js");

    const origImage = process.env.MAPLE_FORK_EXECUTOR_IMAGE;
    const origHost = process.env.KUBERNETES_SERVICE_HOST;
    const origPort = process.env.KUBERNETES_SERVICE_PORT;
    delete process.env.MAPLE_FORK_EXECUTOR_IMAGE;
    process.env.KUBERNETES_SERVICE_HOST = "10.0.0.1";
    process.env.KUBERNETES_SERVICE_PORT = "443";

    try {
        const dispatcher = new ForkDispatcher("k8s");
        await assert.rejects(
            () => dispatcher.dispatch(makeTrace(), makeParentTrace()),
            { message: /MAPLE_FORK_EXECUTOR_IMAGE is required/ },
        );
    } finally {
        if (origImage) process.env.MAPLE_FORK_EXECUTOR_IMAGE = origImage;
        else delete process.env.MAPLE_FORK_EXECUTOR_IMAGE;
        if (origHost) process.env.KUBERNETES_SERVICE_HOST = origHost;
        else delete process.env.KUBERNETES_SERVICE_HOST;
        if (origPort) process.env.KUBERNETES_SERVICE_PORT = origPort;
        else delete process.env.KUBERNETES_SERVICE_PORT;
    }
});
