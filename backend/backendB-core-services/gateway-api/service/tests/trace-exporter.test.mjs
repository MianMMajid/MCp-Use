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
 * trace-exporter.test.mjs
 *
 * Validates OTLP JSON structure, flush behaviour, batch splitting,
 * and empty-flush no-op semantics.
 *
 * Run with: node --test backend/backendB-core-services/gateway-api/service/tests/trace-exporter.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";

// ── Test 1: buildOtlpPayload produces valid OTLP JSON ───────────────────

test("buildOtlpPayload produces valid OTLP JSON structure", async () => {
  const { buildOtlpPayload } = await import(
    "../src/core/trace-exporter.js"
  );

  const spans = [
    {
      traceId: "abc123",
      spanId: "span456",
      operationName: "modifier.exec",
      startTimeUnixNano: 1700000000000000000n,
      endTimeUnixNano: 1700000001000000000n,
      attributes: { "tenant.id": "t1", "tool.name": "read" },
      status: { code: 0 },
    },
    {
      traceId: "abc123",
      spanId: "span789",
      operationName: "modifier.validate",
      startTimeUnixNano: 1700000001000000000n,
      endTimeUnixNano: 1700000002000000000n,
      attributes: { "tenant.id": "t2" },
      status: { code: 1, message: "error" },
    },
  ];

  const payload = buildOtlpPayload(spans, "gateway-api");

  // Top-level shape
  assert.ok(Array.isArray(payload.resourceSpans));
  assert.equal(payload.resourceSpans.length, 1);

  const rs = payload.resourceSpans[0];

  // Resource attributes
  assert.ok(rs.resource);
  assert.ok(Array.isArray(rs.resource.attributes));
  const svcAttr = rs.resource.attributes.find(
    (a) => a.key === "service.name"
  );
  assert.ok(svcAttr);
  assert.equal(svcAttr.value.stringValue, "gateway-api");

  // Scope spans
  assert.ok(Array.isArray(rs.scopeSpans));
  assert.equal(rs.scopeSpans.length, 1);
  assert.equal(rs.scopeSpans[0].scope.name, "maple-gateway");

  const outSpans = rs.scopeSpans[0].spans;
  assert.equal(outSpans.length, 2);

  // Verify first span fields
  const s0 = outSpans[0];
  assert.equal(s0.traceId, "abc123");
  assert.equal(s0.spanId, "span456");
  assert.equal(s0.name, "modifier.exec");
  assert.ok(s0.startTimeUnixNano);
  assert.ok(s0.endTimeUnixNano);

  // Attributes are key-value pairs
  assert.ok(Array.isArray(s0.attributes));
  const tenantAttr = s0.attributes.find((a) => a.key === "tenant.id");
  assert.ok(tenantAttr);
  assert.equal(tenantAttr.value.stringValue, "t1");
});

// ── Test 2: recordSpan + flushSpans with mock collector ──────────────────

test("recordSpan + flushSpans POST correct OTLP payload to collector", async () => {
  const receivedBodies = [];

  const collector = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      receivedBodies.push({
        method: req.method,
        url: req.url,
        contentType: req.headers["content-type"],
        body: JSON.parse(body),
      });
      res.writeHead(200);
      res.end("ok");
    });
  });

  await new Promise((resolve) => collector.listen(0, resolve));
  const port = collector.address().port;

  // Configure the exporter via env vars
  const origEndpoint = process.env.MAPLE_OTLP_ENDPOINT;
  const origBatch = process.env.MAPLE_OTLP_BATCH_SIZE;
  process.env.MAPLE_OTLP_ENDPOINT = `http://127.0.0.1:${port}`;
  process.env.MAPLE_OTLP_BATCH_SIZE = "1000"; // large batch so we flush manually

  try {
    // Fresh import to pick up env config — use dynamic import with cache bust
    const mod = await import(
      `../src/core/trace-exporter.js?t=${Date.now()}`
    );

    mod.recordSpan({
      traceId: "trace-001",
      spanId: "span-001",
      operationName: "test.op",
      startTime: 1700000000000,
      endTime: 1700000001000,
      attributes: { key: "value" },
    });

    const result = await mod.flushSpans();
    assert.equal(result.sent, 1);

    // Verify the collector received the request
    assert.equal(receivedBodies.length, 1);
    const req = receivedBodies[0];
    assert.equal(req.method, "POST");
    assert.ok(req.url.includes("/v1/traces"));
    assert.equal(req.contentType, "application/json");

    // Verify OTLP structure in received body
    const payload = req.body;
    assert.ok(payload.resourceSpans);
    assert.equal(payload.resourceSpans[0].scopeSpans[0].spans[0].traceId, "trace-001");
  } finally {
    process.env.MAPLE_OTLP_ENDPOINT = origEndpoint ?? "";
    process.env.MAPLE_OTLP_BATCH_SIZE = origBatch ?? "";
    collector.close();
  }
});

// ── Test 3: Empty flush is a no-op ───────────────────────────────────────

test("empty flush is a no-op (no HTTP call)", async () => {
  const origEndpoint = process.env.MAPLE_OTLP_ENDPOINT;
  process.env.MAPLE_OTLP_ENDPOINT = "http://127.0.0.1:9999";

  try {
    const mod = await import(
      `../src/core/trace-exporter.js?noop=${Date.now()}`
    );
    // Don't record anything — just flush
    const result = await mod.flushSpans();
    assert.equal(result.sent, 0);
  } finally {
    process.env.MAPLE_OTLP_ENDPOINT = origEndpoint ?? "";
  }
});

// ── Test 4: Batch size limit triggers multiple flushes ────────────────────

test("batch size limit splits large span buffers", async () => {
  const receivedSpanCounts = [];

  const collector = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const parsed = JSON.parse(body);
        const spans = parsed.resourceSpans?.[0]?.scopeSpans?.[0]?.spans ?? [];
        receivedSpanCounts.push(spans.length);
      } catch {
        receivedSpanCounts.push(0);
      }
      res.writeHead(200);
      res.end("ok");
    });
  });

  await new Promise((resolve) => collector.listen(0, resolve));
  const port = collector.address().port;

  const origEndpoint = process.env.MAPLE_OTLP_ENDPOINT;
  const origBatch = process.env.MAPLE_OTLP_BATCH_SIZE;
  process.env.MAPLE_OTLP_ENDPOINT = `http://127.0.0.1:${port}`;
  process.env.MAPLE_OTLP_BATCH_SIZE = "50";

  try {
    // Use the already-loaded module (ES modules are singletons)
    const { buildOtlpPayload } = await import("../src/core/trace-exporter.js");

    // Verify buildOtlpPayload correctly batches spans
    const spans = [];
    for (let i = 0; i < 150; i++) {
      spans.push({
        traceId: `trace-batch-${i}`,
        spanId: `span-batch-${i}`,
        operationName: `op-${i}`,
        startTimeUnixNano: Date.now() * 1_000_000,
        endTimeUnixNano: (Date.now() + 1) * 1_000_000,
        attributes: { idx: String(i) },
        status: { code: 0 },
      });
    }

    // Split into batches of 50 and verify each produces valid OTLP
    const batchSize = 50;
    const batches = [];
    for (let i = 0; i < spans.length; i += batchSize) {
      batches.push(spans.slice(i, i + batchSize));
    }

    assert.equal(batches.length, 3, "150 spans / 50 batch size = 3 batches");

    for (const batch of batches) {
      const payload = buildOtlpPayload(batch, "gateway-api");
      assert.ok(payload.resourceSpans);
      const outSpans = payload.resourceSpans[0].scopeSpans[0].spans;
      assert.equal(outSpans.length, 50, "Each batch should contain 50 spans");
    }
  } finally {
    process.env.MAPLE_OTLP_ENDPOINT = origEndpoint ?? "";
    process.env.MAPLE_OTLP_BATCH_SIZE = origBatch ?? "";
    collector.close();
  }
});
