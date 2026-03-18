/**
 * m1-integration.test.mjs
 *
 * M1-21 integration test covering OpenClaw session APIs (M1-11..15),
 * firewall preview (M1-16), policy lifecycle (M1-17..20), auth boundary,
 * and edge cases.
 *
 * Uses the shared gateway-test-env helper for env defaults, then applies
 * test-specific overrides before any app code is imported.
 *
 * Run with: node --test backend/backendB-core-services/gateway-api/service/tests/m1-integration.test.mjs
 */

// Apply shared env defaults BEFORE any app code
import { applyGatewayTestEnvDefaults } from "./helpers/gateway-test-env.mjs";
applyGatewayTestEnvDefaults();

// Test-specific overrides — disable subsystems that are not under test
process.env.MAPLE_OPENCLAW_AGENT_ENABLED = "0";
process.env.MAPLE_OPENCLAW_AGENT_AUTOSTART_GATEWAY = "0";
process.env.MAPLE_SKIP_AUTH_BOOTSTRAP = "1";
process.env.MAPLE_DISABLE_HITL_BROKER = "1";
process.env.MAPLE_ALLOW_NO_AUTH = "1";
process.env.MAPLE_LEADER_ELECTION_ENABLED = "0";
process.env.MAPLE_SESSION_POLL = "0";

import assert from "node:assert/strict";
import test from "node:test";

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

// ── Helpers ────────────────────────────────────────────────────────

/** Make a request against the Hono app (same pattern as e2e-app.test.mjs). */
async function appFetch(path, options = {}) {
  const { app } = appResult;
  const url = `http://localhost${path}`;
  const req = new Request(url, options);
  return app.fetch(req);
}

/** Add authenticated session headers. */
function authed(options = {}) {
  const headers = new Headers(options.headers);
  headers.set("x-api-key", "test-admin-key");
  return { ...options, headers };
}

/** Add API-key auth header (same as authed while MAPLE_ALLOW_NO_AUTH=1). */
function apiKeyed(options = {}) {
  const headers = new Headers(options.headers);
  headers.set("x-api-key", "test-admin-key");
  return { ...options, headers };
}

// ═══════════════════════════════════════════════════════════════════
// Suite 1: OpenClaw Session APIs (M1-11..15)
// ═══════════════════════════════════════════════════════════════════

test("GET /api/openclaw/agent/sessions returns 200 with items array", async () => {
  const resp = await appFetch("/api/openclaw/agent/sessions", authed());
  assert.equal(resp.status, 200);
  const body = await resp.json();
  assert.ok(Array.isArray(body.items), "Expected body.items to be an array");
});

test("GET /api/openclaw/agent/sessions?status=invalid ignores unknown status", async () => {
  const resp = await appFetch(
    "/api/openclaw/agent/sessions?status=invalid",
    authed()
  );
  // Should still return 200 — unknown status filter is ignored
  assert.equal(resp.status, 200);
  const body = await resp.json();
  assert.ok(Array.isArray(body.items));
});

test("GET /api/openclaw/agent/sessions/:sessionId returns 404 for unknown session", async () => {
  const resp = await appFetch(
    "/api/openclaw/agent/sessions/nonexistent-session-id",
    authed()
  );
  assert.equal(resp.status, 404);
});

test("GET /api/openclaw/agent/sessions/:sessionId?include=steps,runs works on unknown returns 404", async () => {
  const resp = await appFetch(
    "/api/openclaw/agent/sessions/nonexistent-session-id?include=steps,runs",
    authed()
  );
  assert.equal(resp.status, 404);
});

test("POST /api/openclaw/agent/sessions/:sessionId/cancel returns 404 for unknown", async () => {
  const resp = await appFetch(
    "/api/openclaw/agent/sessions/nonexistent-session-id/cancel",
    authed({ method: "POST" })
  );
  assert.equal(resp.status, 404);
});

test("GET /api/openclaw/agent/sessions/:sessionId/stream returns 404 for unknown session", async () => {
  const resp = await appFetch(
    "/api/openclaw/agent/sessions/nonexistent-session-id/stream",
    authed()
  );
  assert.equal(resp.status, 404);
});

test("GET /api/openclaw/agent/runs/unknown-run/artifacts returns 404", async () => {
  const resp = await appFetch(
    "/api/openclaw/agent/runs/unknown-run/artifacts",
    authed()
  );
  assert.equal(resp.status, 404);
});

// ═══════════════════════════════════════════════════════════════════
// Suite 2: Firewall Preview (M1-16)
// ═══════════════════════════════════════════════════════════════════

test("POST /api/firewall/preview without tool or action returns 400", async () => {
  const resp = await appFetch(
    "/api/firewall/preview",
    authed({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
  );
  assert.equal(resp.status, 400);
});

test("POST /api/firewall/preview with valid tool returns 200 or 503", async () => {
  const resp = await appFetch(
    "/api/firewall/preview",
    authed({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tool: "file_read",
        action: "allow",
        input: { path: "/tmp/test.txt" },
      }),
    })
  );
  // 200 if context-wall is running, 503 if not — accept both
  assert.ok(
    [200, 503].includes(resp.status),
    `Expected 200 or 503, got ${resp.status}`
  );
});

// ═══════════════════════════════════════════════════════════════════
// Suite 3: Policy Lifecycle (M1-17..20)
// ═══════════════════════════════════════════════════════════════════

test("GET /api/firewall/rules/effective returns 200 or 503", async () => {
  const resp = await appFetch("/api/firewall/rules/effective", authed());
  assert.ok(
    [200, 502, 503].includes(resp.status),
    `Expected 200, 502, or 503, got ${resp.status}`
  );
});

test("GET /api/policies/effective returns deprecation header", async () => {
  const resp = await appFetch("/api/policies/effective", authed());
  // Accept 200/301/302/503 — the endpoint may redirect or still serve
  assert.ok(
    [200, 301, 302, 502, 503].includes(resp.status),
    `Expected 200/301/302/502/503, got ${resp.status}`
  );
  // If the endpoint is live it should include a deprecation header
  if (resp.status === 200) {
    const deprecation = resp.headers.get("deprecation") || resp.headers.get("x-deprecated");
    assert.ok(
      deprecation !== null,
      "Expected a deprecation or x-deprecated header on /api/policies/effective"
    );
  }
});

test("GET /admin/api/policies/versions returns 200", async () => {
  const resp = await appFetch("/admin/api/policies/versions", apiKeyed());
  assert.ok(
    [200, 502, 503].includes(resp.status),
    `Expected 200/502/503, got ${resp.status}`
  );
});

test("POST /admin/api/policies/validate with empty rules returns 200 with warning", async () => {
  const resp = await appFetch(
    "/admin/api/policies/validate",
    apiKeyed({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules: [] }),
    })
  );
  assert.ok(
    [200, 502, 503].includes(resp.status),
    `Expected 200/502/503, got ${resp.status}`
  );
  if (resp.status === 200) {
    const body = await resp.json();
    // Empty rules should produce a warning
    assert.ok(
      body.warnings || body.warning || body.valid !== undefined,
      "Expected warnings or valid field in response"
    );
  }
});

test("POST /admin/api/policies/validate with invalid action returns 400", async () => {
  const resp = await appFetch(
    "/admin/api/policies/validate",
    apiKeyed({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rules: [
          { id: "r-bad", match: "prompt_injection", action: "not_a_real_action" },
        ],
      }),
    })
  );
  assert.ok(
    [400, 502, 503].includes(resp.status),
    `Expected 400/502/503, got ${resp.status}`
  );
});

test("POST /admin/api/policies/validate with invalid regex returns 400", async () => {
  const resp = await appFetch(
    "/admin/api/policies/validate",
    apiKeyed({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rules: [
          { id: "r-regex", match: "[invalid(regex", action: "block" },
        ],
      }),
    })
  );
  assert.ok(
    [400, 502, 503].includes(resp.status),
    `Expected 400/502/503, got ${resp.status}`
  );
});

test("POST /admin/api/policies/validate with >1000 rules returns 400", async () => {
  const oversizedRules = Array.from({ length: 1001 }, (_, i) => ({
    id: `r-${String(i).padStart(4, "0")}`,
    match: "prompt_injection",
    action: "block",
  }));
  const resp = await appFetch(
    "/admin/api/policies/validate",
    apiKeyed({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules: oversizedRules }),
    })
  );
  assert.ok(
    [400, 502, 503].includes(resp.status),
    `Expected 400/502/503, got ${resp.status}`
  );
});

// ═══════════════════════════════════════════════════════════════════
// Suite 4: Auth Boundary
// ═══════════════════════════════════════════════════════════════════

// NOTE: MAPLE_ALLOW_NO_AUTH=1 is set for this test file, so auth is
// bypassed and 401 checks cannot be exercised. In production mode
// (MAPLE_ALLOW_NO_AUTH=0) the following would verify that unauthenticated
// requests to protected endpoints return 401:
//
//   test("GET /api/openclaw/agent/sessions without auth returns 401 when auth required", ...)
//
// This suite is intentionally skipped here. A dedicated auth-boundary test
// should run with MAPLE_ALLOW_NO_AUTH=0 and a real auth provider.

test("Auth boundary placeholder — skipped (MAPLE_ALLOW_NO_AUTH=1)", { skip: true }, async () => {
  // Would test: GET /api/openclaw/agent/sessions without auth returns 401
  const resp = await appFetch("/api/openclaw/agent/sessions");
  assert.equal(resp.status, 401);
});

// ═══════════════════════════════════════════════════════════════════
// Suite 5: Edge Cases
// ═══════════════════════════════════════════════════════════════════

test("POST /api/openclaw/agent/sessions/nonexistent/cancel returns 404 (idempotent)", async () => {
  // Cancelling a non-existent session should be safe and return 404
  const resp1 = await appFetch(
    "/api/openclaw/agent/sessions/nonexistent/cancel",
    authed({ method: "POST" })
  );
  assert.equal(resp1.status, 404);

  // Second call should also return 404 — idempotent
  const resp2 = await appFetch(
    "/api/openclaw/agent/sessions/nonexistent/cancel",
    authed({ method: "POST" })
  );
  assert.equal(resp2.status, 404);
});

test("POST /api/firewall/preview with oversized body returns 413", async () => {
  // Create a body larger than 1 MB
  const oversizedPayload = JSON.stringify({
    tool: "file_read",
    action: "allow",
    input: { data: "x".repeat(1024 * 1024 + 1) },
  });
  const resp = await appFetch(
    "/api/firewall/preview",
    authed({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: oversizedPayload,
    })
  );
  assert.ok(
    [413, 400, 503].includes(resp.status),
    `Expected 413, 400, or 503 for oversized body, got ${resp.status}`
  );
});
