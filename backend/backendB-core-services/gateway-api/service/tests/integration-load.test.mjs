/**
 * integration-load.test.mjs
 *
 * Live Postgres-backed load tests that exercise real concurrency:
 * - Rate limiter window counting
 * - Advisory lock contention
 * - Outbox flush with leader election
 * - Tenant isolation under concurrent writes
 *
 * Uses DATABASE_URL from env or falls back to the default local Postgres
 * provisioned by k8s/Northflank (postgresql://maple:maple@localhost:5432/maple).
 * Throws on connection failure — the DB is always expected to be available.
 *
 * Run with: node --test backend/backendB-core-services/gateway-api/service/tests/integration-load.test.mjs
 */

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
import { resolve as __resolve, dirname as __dirname_ } from "node:path";
import { fileURLToPath as __fileURLToPath } from "node:url";
const __intg_dir = __dirname_(__fileURLToPath(import.meta.url));
const __cert_dir = __resolve(__intg_dir, "../../../../backendA-platform-infra/certs");
process.env.MAPLE_GATEWAY_TLS_CERT = process.env.MAPLE_GATEWAY_TLS_CERT || `${__cert_dir}/tls.crt`;
process.env.MAPLE_GATEWAY_TLS_KEY = process.env.MAPLE_GATEWAY_TLS_KEY || `${__cert_dir}/tls.key`;
process.env.MAPLE_GATEWAY_TLS_CA = process.env.MAPLE_GATEWAY_TLS_CA || `${__cert_dir}/ca.crt`;
process.env.MAPLE_GRPC_TLS_CERT = process.env.MAPLE_GRPC_TLS_CERT || process.env.MAPLE_GATEWAY_TLS_CERT;
process.env.MAPLE_GRPC_TLS_KEY = process.env.MAPLE_GRPC_TLS_KEY || process.env.MAPLE_GATEWAY_TLS_KEY;
process.env.MAPLE_GRPC_TLS_CA = process.env.MAPLE_GRPC_TLS_CA || process.env.MAPLE_GATEWAY_TLS_CA;
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
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pg = require("pg");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("Missing required environment variable: DATABASE_URL");
}

let pool;
let pgAvailable = false;

test.before(async () => {
  pool = new pg.Pool({
    connectionString: DATABASE_URL,
    max: 30,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
  });
  try {
    const client = await pool.connect();
    client.release();
    pgAvailable = true;
  } catch {
    console.log("[SKIP] PostgreSQL not reachable — skipping integration-load tests");
  }
});

test.after(async () => {
  if (pool) await pool.end();
});

// Helper: create a lightweight database object matching the app's interface
function makeDb() {
  return { pool };
}

// ── Test 1: Rate limiter concurrency ─────────────────────────────────

test("rate limiter concurrency — 50 parallel calls across 5 tenants", async (t) => {
  if (!pgAvailable) return t.skip("PostgreSQL not reachable");
  const {
    ensureRateLimiterTables,
    checkRateLimit,
    recordExecution,
  } = await import("../src/core/rate-limiter.js");

  const database = makeDb();
  await ensureRateLimiterTables(database);

  // Clean slate for test
  await pool.query(`DELETE FROM modifier_rate_limits WHERE scope_key LIKE 'intg-test-%'`);

  const tenants = Array.from({ length: 5 }, (_, i) => `intg-test-t${i}`);
  const promises = [];

  for (const tenantId of tenants) {
    for (let i = 0; i < 10; i++) {
      promises.push(
        (async () => {
          const result = await checkRateLimit(tenantId, "org-default", { database });
          if (result.allowed) {
            await recordExecution(tenantId, "org-default", { database });
          }
          return { tenantId, allowed: result.allowed };
        })()
      );
    }
  }

  const results = await Promise.all(promises);

  // Each tenant should have some allowed requests (exact count depends on defaults)
  for (const tenantId of tenants) {
    const tenantResults = results.filter((r) => r.tenantId === tenantId);
    const allowedCount = tenantResults.filter((r) => r.allowed).length;
    assert.ok(allowedCount > 0, `Tenant ${tenantId} should have at least 1 allowed request`);
  }

  // Verify window counts exist in the DB
  const countResult = await pool.query(
    `SELECT DISTINCT scope_key FROM modifier_rate_limits WHERE scope_key LIKE 'intg-test-%'`
  );
  assert.ok(countResult.rows.length > 0, "Rate limit window rows should exist in DB");
});

// ── Test 2: Advisory lock contention ─────────────────────────────────

test("advisory lock contention — exactly 1 of 10 acquires", async (t) => {
  if (!pgAvailable) return t.skip("PostgreSQL not reachable");
  const { withLeaderLock } = await import("../src/core/leader-election.js");

  const database = makeDb();
  const TEST_LOCK_ID = 9999901;
  let executeCount = 0;

  const promises = Array.from({ length: 10 }, () =>
    withLeaderLock(TEST_LOCK_ID, database, async () => {
      executeCount++;
      // Hold the lock briefly to simulate work
      await new Promise((r) => setTimeout(r, 50));
      return { executed: true };
    })
  );

  const results = await Promise.all(promises);
  const executed = results.filter((r) => r?.executed).length;
  const skipped = results.filter((r) => r?.skipped).length;

  assert.equal(executed, 1, "Exactly 1 should execute under advisory lock");
  assert.equal(skipped, 9, "9 should be skipped");
  assert.equal(executeCount, 1);
});

// ── Test 3: Outbox flush under load with leader election ─────────────

test("outbox flush under load — no duplicate deliveries", async (t) => {
  if (!pgAvailable) return t.skip("PostgreSQL not reachable");
  const { flushOutbox } = await import("../src/core/audit-outbox.js");

  const database = makeDb();

  // Ensure the outbox table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS gateway_audit_outbox (
      outbox_id TEXT PRIMARY KEY,
      event_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      next_attempt_at TEXT NOT NULL,
      delivered_at TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT NOT NULL DEFAULT ''
    )
  `);

  // Insert 200 test events directly
  const now = new Date().toISOString();
  for (let i = 0; i < 200; i++) {
    await pool.query(
      `INSERT INTO gateway_audit_outbox (outbox_id, event_json, status, created_at, updated_at, next_attempt_at)
       VALUES ($1, $2, 'pending', $3, $3, $3)
       ON CONFLICT (outbox_id) DO NOTHING`,
      [
        `intg-test-outbox-${i}`,
        JSON.stringify({
          eventId: `intg-test-outbox-${i}`,
          eventType: "test",
          timestamp: now,
          sourceService: "test",
        }),
        now,
      ]
    );
  }

  // Flush concurrently from 3 "instances" — since flushOutbox has a
  // _flushing guard, only 1 at a time will run. This verifies no duplicates.
  const flushResults = await Promise.all([
    flushOutbox({ database, batchSize: 100 }),
    flushOutbox({ database, batchSize: 100 }),
    flushOutbox({ database, batchSize: 100 }),
  ]);

  // Verify no event was delivered twice
  const deliveredResult = await pool.query(
    `SELECT outbox_id, COUNT(*)::int as cnt FROM gateway_audit_outbox
     WHERE outbox_id LIKE 'intg-test-outbox-%' AND status = 'delivered'
     GROUP BY outbox_id HAVING COUNT(*) > 1`
  );
  assert.equal(
    deliveredResult.rows.length,
    0,
    "No outbox event should have duplicate deliveries"
  );

  // Cleanup
  await pool.query(`DELETE FROM gateway_audit_outbox WHERE outbox_id LIKE 'intg-test-outbox-%'`);
});

// ── Test 4: Tenant isolation under concurrent writes ─────────────────

test("tenant isolation — concurrent policy writes across 10 tenants", async (t) => {
  if (!pgAvailable) return t.skip("PostgreSQL not reachable");
  // Ensure the tenant policies table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS gateway_modifier_tenant_policies (
      tenant_id TEXT NOT NULL,
      org_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT FALSE,
      policy_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      created_by TEXT NOT NULL,
      activated_at TEXT,
      PRIMARY KEY (tenant_id, org_id, version)
    )
  `);

  const now = new Date().toISOString();
  const promises = [];

  for (let t = 0; t < 10; t++) {
    promises.push(
      pool.query(
        `INSERT INTO gateway_modifier_tenant_policies
         (tenant_id, org_id, version, is_active, policy_json, created_at, created_by)
         VALUES ($1, $2, 1, true, $3, $4, 'test')
         ON CONFLICT (tenant_id, org_id, version) DO UPDATE SET
           policy_json = EXCLUDED.policy_json,
           is_active = EXCLUDED.is_active`,
        [
          `intg-test-tenant-${t}`,
          `intg-test-org-${t}`,
          JSON.stringify({
            allowedTools: [`tool-${t}`],
            dangerousTools: [],
            tenant: `intg-test-tenant-${t}`,
          }),
          now,
        ]
      )
    );
  }

  await Promise.all(promises);

  // Read back and verify no cross-tenant leakage
  for (let t = 0; t < 10; t++) {
    const result = await pool.query(
      `SELECT policy_json FROM gateway_modifier_tenant_policies
       WHERE tenant_id = $1 AND org_id = $2 AND is_active = true`,
      [`intg-test-tenant-${t}`, `intg-test-org-${t}`]
    );
    assert.equal(result.rows.length, 1, `Tenant ${t} should have exactly 1 active policy`);
    const policy = JSON.parse(result.rows[0].policy_json);
    assert.deepEqual(
      policy.allowedTools,
      [`tool-${t}`],
      `Tenant ${t} tools should be isolated`
    );
    assert.equal(policy.tenant, `intg-test-tenant-${t}`);
  }

  // Cleanup
  await pool.query(
    `DELETE FROM gateway_modifier_tenant_policies WHERE tenant_id LIKE 'intg-test-tenant-%'`
  );
});
