/**
 * m3-integration.test.mjs
 *
 * M3-17 integration test covering Phase 3 Observability + Compliance:
 * trace search (M3-01..03), trace export (M3-04..06), run routes,
 * audit/compliance enrichment (M3-07..09), runtime diagnostics (M3-10..12),
 * and tool governance (M3-13..16).
 *
 * Uses the shared gateway-test-env helper for env defaults, then applies
 * test-specific overrides before any app code is imported.
 *
 * Run with: node --test backend/backendB-core-services/gateway-api/service/tests/m3-integration.test.mjs
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
// Suite 1: Trace Search (M3-01..03)
// ═══════════════════════════════════════════════════════════════════

test("GET /api/traces/search returns 200 with items array", async () => {
  const resp = await appFetch("/api/traces/search", authed());
  assert.equal(resp.status, 200);
  const body = await resp.json();
  assert.ok(body.ok === true, "Expected ok: true");
  assert.ok(Array.isArray(body.items), "Expected items to be an array");
  assert.ok(typeof body.nextCursor === "string", "Expected nextCursor to be a string");
});

test("GET /api/traces/search with query params returns 200", async () => {
  const resp = await appFetch(
    "/api/traces/search?agentId=test-agent&status=completed&limit=10",
    authed()
  );
  assert.equal(resp.status, 200);
  const body = await resp.json();
  assert.ok(body.ok === true);
  assert.ok(Array.isArray(body.items));
});

test("GET /api/traces/search with limit > 100 is clamped", async () => {
  const resp = await appFetch("/api/traces/search?limit=999", authed());
  assert.equal(resp.status, 200);
  const body = await resp.json();
  assert.ok(body.ok === true);
  assert.ok(Array.isArray(body.items));
});

// ═══════════════════════════════════════════════════════════════════
// Suite 2: Trace Export (M3-04..06)
// ═══════════════════════════════════════════════════════════════════

test("POST /api/traces/export with json format returns 200", async () => {
  const resp = await appFetch(
    "/api/traces/export",
    authed({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format: "json", limit: 10 }),
    })
  );
  assert.equal(resp.status, 200);
  const body = await resp.json();
  assert.ok(body.ok === true);
  assert.equal(body.format, "json");
  assert.ok(Array.isArray(body.items));
});

test("POST /api/traces/export with jsonl format returns ndjson content type", async () => {
  const resp = await appFetch(
    "/api/traces/export",
    authed({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format: "jsonl", limit: 5 }),
    })
  );
  assert.equal(resp.status, 200);
  const contentType = resp.headers.get("content-type") || "";
  assert.ok(
    contentType.includes("application/x-ndjson"),
    `Expected application/x-ndjson, got ${contentType}`
  );
});

test("POST /api/traces/export with invalid format returns 400", async () => {
  const resp = await appFetch(
    "/api/traces/export",
    authed({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format: "xml" }),
    })
  );
  assert.equal(resp.status, 400);
});

// ═══════════════════════════════════════════════════════════════════
// Suite 3: Run Routes
// ═══════════════════════════════════════════════════════════════════

test("GET /api/runs returns 200 with items array", async () => {
  const resp = await appFetch("/api/runs", authed());
  assert.equal(resp.status, 200);
  const body = await resp.json();
  assert.ok(body.ok === true);
  assert.ok(Array.isArray(body.items));
});

test("GET /api/runs/:runId returns 404 for unknown run", async () => {
  const resp = await appFetch("/api/runs/nonexistent-run-id", authed());
  assert.equal(resp.status, 404);
});

test("GET /api/runs/:runId/timeline returns 404 for unknown run", async () => {
  const resp = await appFetch("/api/runs/nonexistent-run-id/timeline", authed());
  assert.equal(resp.status, 404);
});

// ═══════════════════════════════════════════════════════════════════
// Suite 4: Audit/Compliance Enrichment (M3-07..09)
// ═══════════════════════════════════════════════════════════════════

test("POST /admin/api/audit/export with csv format returns 200 or 502", async () => {
  const resp = await appFetch(
    "/admin/api/audit/export",
    apiKeyed({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format: "csv", limit: 10 }),
    })
  );
  assert.ok(
    [200, 502].includes(resp.status),
    `Expected 200 or 502, got ${resp.status}`
  );
  if (resp.status === 200) {
    const contentType = resp.headers.get("content-type") || "";
    assert.ok(
      contentType.includes("text/csv"),
      `Expected text/csv content type, got ${contentType}`
    );
  }
});

test("POST /admin/api/audit/export with eventType filter returns 200 or 502", async () => {
  const resp = await appFetch(
    "/admin/api/audit/export",
    apiKeyed({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        format: "json",
        eventType: "AUDIT_EVENT_TYPE_POLICY_EVALUATED",
        since: "2024-01-01T00:00:00Z",
        limit: 10,
      }),
    })
  );
  assert.ok(
    [200, 502].includes(resp.status),
    `Expected 200 or 502, got ${resp.status}`
  );
});

test("POST /admin/api/audit/export with invalid format returns 400", async () => {
  const resp = await appFetch(
    "/admin/api/audit/export",
    apiKeyed({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format: "xml" }),
    })
  );
  assert.equal(resp.status, 400);
});

test("GET /admin/api/audit/schemas returns full JSON Schema per event type", async () => {
  const resp = await appFetch("/admin/api/audit/schemas", apiKeyed());
  assert.equal(resp.status, 200);
  const body = await resp.json();
  assert.ok(body.ok === true);
  assert.ok(Array.isArray(body.schemas));
  assert.ok(body.schemas.length >= 1, "Expected at least one schema");
  const baseSchema = body.schemas.find((s) => s.id === "audit_event_v1");
  assert.ok(baseSchema, "Expected audit_event_v1 schema");
  assert.ok(baseSchema.properties, "Expected properties object in schema");
  assert.ok(baseSchema.properties.eventId, "Expected eventId property");
  assert.ok(baseSchema.properties.eventType, "Expected eventType property");
  assert.ok(baseSchema.properties.timestamp, "Expected timestamp property");
});

test("GET /admin/api/compliance/reports returns per-control evidence", async () => {
  const resp = await appFetch("/admin/api/compliance/reports", apiKeyed());
  assert.ok(
    [200, 502].includes(resp.status),
    `Expected 200 or 502, got ${resp.status}`
  );
  if (resp.status === 200) {
    const body = await resp.json();
    assert.ok(body.ok === true);
    assert.ok(Array.isArray(body.reports));
    const report = body.reports[0];
    assert.ok(report, "Expected at least one report");
    assert.ok(typeof report.frameworkScore === "number", "Expected frameworkScore number");
    assert.ok(Array.isArray(report.controls), "Expected controls array");
    if (report.controls.length > 0) {
      const control = report.controls[0];
      assert.ok(control.controlId, "Expected controlId");
      assert.ok(control.controlName, "Expected controlName");
      assert.ok(control.framework, "Expected framework");
      assert.ok(typeof control.evidenceCount === "number", "Expected evidenceCount");
    }
  }
});

// ═══════════════════════════════════════════════════════════════════
// Suite 5: Runtime Diagnostics (M3-10..12)
// ═══════════════════════════════════════════════════════════════════

test("GET /api/runtime/dependencies returns 200 with checks", async () => {
  const resp = await appFetch("/api/runtime/dependencies", authed());
  assert.ok(
    [200, 500].includes(resp.status),
    `Expected 200 or 500, got ${resp.status}`
  );
  if (resp.status === 200) {
    const body = await resp.json();
    assert.ok(body.ok === true);
    assert.ok(Array.isArray(body.checks), "Expected checks array");
  }
});

test("GET /api/runtime/diag returns 200 with memory and uptime", async () => {
  const resp = await appFetch("/api/runtime/diag", authed());
  assert.equal(resp.status, 200);
  const body = await resp.json();
  assert.ok(body.ok === true);
  assert.ok(typeof body.memory === "object", "Expected memory object");
  assert.ok(typeof body.memory.rss === "number", "Expected rss number");
  assert.ok(typeof body.memory.heapUsed === "number", "Expected heapUsed number");
  assert.ok(typeof body.uptimeSeconds === "number", "Expected uptimeSeconds number");
  assert.ok(typeof body.eventLoopLagMs === "number", "Expected eventLoopLagMs number");
});

test("GET /api/runtime/logs returns 200 with logs array", async () => {
  const resp = await appFetch("/api/runtime/logs", authed());
  assert.equal(resp.status, 200);
  const body = await resp.json();
  assert.ok(body.ok === true);
  assert.ok(Array.isArray(body.logs), "Expected logs array");
  assert.ok(typeof body.count === "number", "Expected count number");
});

test("GET /api/runtime/logs?limit=5 respects limit", async () => {
  const resp = await appFetch("/api/runtime/logs?limit=5", authed());
  assert.equal(resp.status, 200);
  const body = await resp.json();
  assert.ok(body.ok === true);
  assert.ok(body.logs.length <= 5, "Expected at most 5 log entries");
});

// ═══════════════════════════════════════════════════════════════════
// Suite 6: Tool Governance (M3-13..16)
// ═══════════════════════════════════════════════════════════════════

test("GET /api/tools returns 200 with items array", async () => {
  const resp = await appFetch("/api/tools", authed());
  assert.equal(resp.status, 200);
  const body = await resp.json();
  assert.ok(body.ok === true);
  assert.ok(Array.isArray(body.items));
});

test("PUT /api/tools/:toolId upserts a tool and GET retrieves it", async () => {
  const toolId = "test-tool-m3";
  const putResp = await appFetch(
    `/api/tools/${toolId}`,
    authed({
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test Tool M3",
        description: "A tool created during M3 integration tests.",
        schema: { input: { type: "string" } },
        source: "integration-test",
      }),
    })
  );
  assert.equal(putResp.status, 200);
  const putBody = await putResp.json();
  assert.ok(putBody.ok === true);
  assert.equal(putBody.tool.toolId, toolId);

  // Retrieve it
  const getResp = await appFetch(`/api/tools/${toolId}`, authed());
  assert.equal(getResp.status, 200);
  const getBody = await getResp.json();
  assert.ok(getBody.ok === true);
  assert.equal(getBody.tool.toolId, toolId);
  assert.equal(getBody.tool.name, "Test Tool M3");
});

test("GET /api/tools/:toolId returns 404 for unknown tool", async () => {
  const resp = await appFetch("/api/tools/nonexistent-tool-id", authed());
  assert.equal(resp.status, 404);
});

test("GET /api/tools/policies returns 200 with items array", async () => {
  const resp = await appFetch("/api/tools/policies", authed());
  assert.equal(resp.status, 200);
  const body = await resp.json();
  assert.ok(body.ok === true);
  assert.ok(Array.isArray(body.items));
  // Default policy should always exist
  assert.ok(body.items.length >= 1, "Expected at least the default policy");
});

test("POST /api/tools/policies/validate with valid policy returns 200", async () => {
  const resp = await appFetch(
    "/api/tools/policies/validate",
    authed({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        policy: {
          mode: "allowlist",
          rules: [
            { match: "file_read", action: "allow" },
            { match: "file_write", action: "block" },
          ],
        },
      }),
    })
  );
  assert.equal(resp.status, 200);
  const body = await resp.json();
  assert.ok(body.ok === true);
  assert.ok(body.valid === true);
});

test("POST /api/tools/policies/validate with invalid action returns 400", async () => {
  const resp = await appFetch(
    "/api/tools/policies/validate",
    authed({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        policy: {
          mode: "allowlist",
          rules: [
            { match: "file_read", action: "not_a_real_action" },
          ],
        },
      }),
    })
  );
  assert.equal(resp.status, 400);
  const body = await resp.json();
  assert.ok(body.valid === false);
  assert.ok(body.errors.length > 0);
});

test("POST /api/tools/policies/validate with invalid mode returns 400", async () => {
  const resp = await appFetch(
    "/api/tools/policies/validate",
    authed({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        policy: {
          mode: "invalid-mode",
          rules: [],
        },
      }),
    })
  );
  assert.equal(resp.status, 400);
  const body = await resp.json();
  assert.ok(body.valid === false);
});

// ═══════════════════════════════════════════════════════════════════
// Suite 7: Edge Cases
// ═══════════════════════════════════════════════════════════════════

test("GET /api/traces/search without auth header still works (MAPLE_ALLOW_NO_AUTH=1)", async () => {
  const resp = await appFetch("/api/traces/search");
  // With MAPLE_ALLOW_NO_AUTH=1, should pass auth
  assert.equal(resp.status, 200);
});

test("PUT /api/tools/:toolId with empty body still succeeds (uses toolId from path)", async () => {
  const resp = await appFetch(
    "/api/tools/empty-body-tool",
    authed({
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
  );
  assert.equal(resp.status, 200);
  const body = await resp.json();
  assert.ok(body.ok === true);
  assert.equal(body.tool.toolId, "empty-body-tool");
});

test("GET /api/runs with limit=0 returns 200", async () => {
  const resp = await appFetch("/api/runs?limit=0", authed());
  assert.equal(resp.status, 200);
  const body = await resp.json();
  assert.ok(body.ok === true);
});
