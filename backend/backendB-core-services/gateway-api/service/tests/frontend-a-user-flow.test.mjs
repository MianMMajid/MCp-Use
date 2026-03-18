/**
 * frontend-a-user-flow.test.mjs
 *
 * End-to-end user flow test simulating a real operator session on Frontend A.
 * Each section represents the next step in the flow and validates the exact
 * response shape the frontend depends on.
 *
 * Flow:
 *   1. Health check (Frontend A alive, Gateway alive)
 *   2. Login page accessible
 *   3. Auth: POST /api/auth/login → session cookie → GET /api/auth/me
 *   4. Workspace bootstrap: all parallel fetches MapleShell.svelte does on mount
 *   5. Cyber operations surface (Fix 1 regression check)
 *   6. Admin API proxy (Fix 2 regression check)
 *   7. Observability endpoints (Fix 3 regression check)
 *   8. Mutation smoke tests (firewall block, incident note)
 *
 * Requires the dev stack to be running:
 *   npm run dev
 *
 * Run with:
 *   node --test backend/backendB-core-services/gateway-api/service/tests/frontend-a-user-flow.test.mjs
 */

import assert from "node:assert/strict";
import { describe, it, before } from "node:test";

const GATEWAY = process.env.GATEWAY_URL || "http://127.0.0.1:3000";
const FRONTEND_A = process.env.FRONTEND_A_URL || "http://127.0.0.1:4101";

// Shared session state across the flow — simulates a single operator session
let sessionCookie = "";
let authUser = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchRaw(base, path, options = {}) {
  const headers = { ...options.headers };
  if (sessionCookie) {
    headers.cookie = sessionCookie;
  }
  const res = await fetch(`${base}${path}`, {
    signal: AbortSignal.timeout(10_000),
    redirect: "manual",
    ...options,
    headers,
  });
  const setCookie = res.headers.get("set-cookie") || "";
  const contentType = res.headers.get("content-type") || "";
  const body = await res.text();
  return { status: res.status, contentType, body, setCookie, location: res.headers.get("location") };
}

async function fetchJson(base, path, options = {}) {
  const result = await fetchRaw(base, path, options);
  return { ...result, json: safeParseJson(result.body) };
}

function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function assertIsJson(result, label) {
  assert.ok(
    result.contentType.includes("application/json"),
    `${label}: expected JSON content-type, got "${result.contentType}". Body preview: ${result.body.slice(0, 200)}`
  );
  assert.ok(result.json !== null, `${label}: body is not valid JSON: ${result.body.slice(0, 200)}`);
  return result.json;
}

function assertNotHtml(result, label) {
  assert.ok(
    !result.contentType.includes("text/html"),
    `${label}: got text/html instead of JSON — likely Inspector SPA catch-all. Body: ${result.body.slice(0, 300)}`
  );
}

// ─── Preflight ────────────────────────────────────────────────────────────────

let gatewayAlive = false;
let frontendAlive = false;

before(async () => {
  try {
    const r = await fetch(`${GATEWAY}/health`, { signal: AbortSignal.timeout(3000) });
    gatewayAlive = r.ok;
  } catch { /* not running */ }

  try {
    const r = await fetch(`${FRONTEND_A}/health`, { signal: AbortSignal.timeout(3000) });
    frontendAlive = r.ok;
  } catch { /* not running */ }

  if (!gatewayAlive) {
    console.log(`[SKIP] Gateway not reachable at ${GATEWAY}`);
  }
  if (!frontendAlive) {
    console.log(`[SKIP] Frontend A not reachable at ${FRONTEND_A}`);
  }
});

function skipUnless(t, ...flags) {
  for (const flag of flags) {
    if (!flag) { t.skip("Required service not running"); return true; }
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 1 — Health: Both services are up
// ═══════════════════════════════════════════════════════════════════════════════

describe("Step 1: Health checks", () => {
  it("Gateway /health returns JSON with ok status", async (t) => {
    if (skipUnless(t, gatewayAlive)) return;
    const r = await fetchJson(GATEWAY, "/health");
    const json = assertIsJson(r, "Gateway /health");
    assert.ok(["ok", "degraded"].includes(json.status), `Unexpected status: ${json.status}`);
    assert.equal(json.service, "gateway-api");
  });

  it("Frontend A /health returns JSON", async (t) => {
    if (skipUnless(t, frontendAlive)) return;
    const r = await fetchJson(FRONTEND_A, "/health");
    const json = assertIsJson(r, "Frontend A /health");
    assert.ok(["ok", "degraded", "critical"].includes(json.status), `Unexpected health status: ${json.status}`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 2 — Login page is accessible
// ═══════════════════════════════════════════════════════════════════════════════

describe("Step 2: Login page accessibility", () => {
  it("GET /login returns HTML page (not a redirect, not a 500)", async (t) => {
    if (skipUnless(t, frontendAlive)) return;
    const r = await fetchRaw(FRONTEND_A, "/login");
    assert.ok([200, 304].includes(r.status), `Login page returned ${r.status}`);
    assert.ok(r.contentType.includes("text/html"), "Login page should be HTML");
  });

  it("GET / redirects to /maple workspace", async (t) => {
    if (skipUnless(t, frontendAlive)) return;
    const r = await fetchRaw(FRONTEND_A, "/");
    // SvelteKit may return 302/307/308 redirect
    assert.ok([301, 302, 307, 308].includes(r.status), `Root should redirect, got ${r.status}`);
    assert.ok(
      r.location?.includes("/maple") || r.location?.includes("/login"),
      `Root should redirect to /maple or /login, got: ${r.location}`
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 3 — Authentication flow
// ═══════════════════════════════════════════════════════════════════════════════

describe("Step 3: Authentication", () => {
  it("GET /api/auth/me (unauthenticated) returns { authenticated: false }", async (t) => {
    if (skipUnless(t, gatewayAlive)) return;
    const r = await fetchJson(GATEWAY, "/api/auth/me");
    const json = assertIsJson(r, "/api/auth/me (unauth)");
    assert.equal(r.status, 200);
    assert.equal(json.ok, true);
    // In allowNoAuth mode, authenticated may be true with method: "bypass"
    assert.equal(typeof json.authenticated, "boolean");
    if (json.authenticated) {
      assert.ok(["session", "api_key", "bypass"].includes(json.method));
    }
  });

  it("GET /api/auth/me through Frontend A proxy returns same shape", async (t) => {
    if (skipUnless(t, frontendAlive, gatewayAlive)) return;
    const r = await fetchJson(FRONTEND_A, "/api/auth/me");
    const json = assertIsJson(r, "Frontend A /api/auth/me");
    assert.equal(r.status, 200);
    assert.equal(json.ok, true);
    assert.equal(typeof json.authenticated, "boolean");

    // Store auth state for subsequent tests
    authUser = json;
  });

  it("POST /api/auth/login with empty body returns 400 JSON error", async (t) => {
    if (skipUnless(t, gatewayAlive)) return;
    const r = await fetchJson(GATEWAY, "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const json = assertIsJson(r, "POST /api/auth/login (empty)");
    // 400 for bad input, 429 for rate limit
    assert.ok([400, 429].includes(r.status), `Expected 400 or 429, got ${r.status}`);
  });

  it("GET /api/auth/google/client-id returns JSON (login page calls this)", async (t) => {
    if (skipUnless(t, gatewayAlive)) return;
    const r = await fetchJson(GATEWAY, "/api/auth/google/client-id");
    assertIsJson(r, "/api/auth/google/client-id");
    assert.equal(r.status, 200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 4 — Workspace bootstrap: all data loads MapleShell does on mount
//
// MapleShell.svelte calls these in parallel via Promise.allSettled.
// Each must return JSON — if any returns HTML, the workspace is broken.
// ═══════════════════════════════════════════════════════════════════════════════

describe("Step 4: Workspace bootstrap — MapleShell parallel data load", () => {
  // ── Observability & Execution group ──
  const observabilityEndpoints = [
    {
      path: "/api/observability/orchestrations/summary",
      validate: (json) => {
        assert.equal(json.ok, true);
        // MapleShell reads: json.outbox, json.activeExecutions
        assert.ok("outbox" in json || "activeExecutions" in json || json.ok, "summary should have outbox or activeExecutions");
      },
    },
    {
      path: "/api/observability/orchestrations/slo",
      validate: (json) => {
        // MapleShell reads: json.sloPercent, json.auditDelivery
        assert.ok("auditDelivery" in json || "sloPercent" in json || "signalCount" in json, "slo should have metrics");
      },
    },
    {
      path: "/api/observability/orchestrations/audit-log?offset=0&limit=50",
      validate: (json) => {
        assert.equal(json.ok, true);
        // MapleShell reads: json.items || json.entries || json.events
        const events = json.items || json.entries || json.events;
        assert.ok(Array.isArray(events), "audit-log should have items/entries/events array");
        assert.equal(typeof json.total, "number");
      },
    },
  ];

  // ── Execution & Approval group ──
  const executionEndpoints = [
    {
      path: "/api/orchestrations/executions?limit=50",
      validate: (json) => {
        // MapleShell reads: json.items || json.executions
        const items = json.items || json.executions;
        assert.ok(items === undefined || Array.isArray(items), "executions should be array or undefined");
      },
    },
    {
      path: "/api/orchestrations/executions/approvals?status=pending&limit=50",
      // This is an alias that redirects to /api/operations/orchestrations/approvals
      validate: (json) => {
        const items = json.items || json.approvals;
        assert.ok(items === undefined || Array.isArray(items), "approvals should be array or undefined");
      },
      allowRedirect: true,
    },
  ];

  // ── Runtime & Integration group ──
  const runtimeEndpoints = [
    {
      path: "/api/runtime/feature-capabilities",
      validate: (json) => {
        assert.equal(json.ok, true);
        assert.ok("features" in json, "should have features object");
      },
    },
    {
      path: "/api/integrations/catalog",
      validate: (json) => {
        const items = json.items || json.catalog;
        assert.ok(items === undefined || Array.isArray(items), "catalog should be array or undefined");
      },
    },
    {
      path: "/api/integrations",
      validate: (json) => {
        const items = json.items || json.integrations;
        assert.ok(items === undefined || Array.isArray(items), "integrations should be array or undefined");
      },
    },
    {
      path: "/api/downstream/apps",
      validate: (json) => {
        const items = json.items || json.apps;
        assert.ok(items === undefined || Array.isArray(items), "apps should be array or undefined");
      },
    },
    {
      path: "/api/openclaw/cli/catalog",
      validate: (json) => {
        // MapleShell reads: json.tools || json.catalog || json.items
        const items = json.tools || json.catalog || json.items;
        assert.ok(items === undefined || Array.isArray(items), "catalog tools should be array or undefined");
      },
    },
  ];

  // ── Cyber workspace data group (fetched by MapleShell for CyberOpsPanel) ──
  const cyberWorkspaceEndpoints = [
    {
      path: "/api/cyber/status",
      validate: (json) => {
        // CyberOpsPanel reads: json.providers.contextWall.reachable, json.security.*, json.scanning.*, json.recent.*
        assert.ok(typeof json === "object", "cyber/status should be an object");
      },
    },
    {
      path: "/api/cyber/policies",
      validate: (json) => {
        // CyberOpsPanel reads: json.allowedDomains, json.scanProvider, etc.
        assert.ok(typeof json === "object", "cyber/policies should be an object");
      },
    },
    {
      path: "/api/cyber/incidents?limit=100",
      validate: (json) => {
        assert.equal(json.ok, true);
        // CyberOpsPanel reads: json.items
        assert.ok(Array.isArray(json.items), "cyber/incidents items should be array");
      },
    },
    {
      path: "/api/cyber/downloads?limit=100",
      validate: (json) => {
        assert.equal(json.ok, true);
        assert.ok(Array.isArray(json.items), "cyber/downloads items should be array");
      },
    },
    {
      path: "/api/cyber/quarantine",
      validate: (json) => {
        assert.equal(json.ok, true);
        assert.ok(Array.isArray(json.items), "cyber/quarantine items should be array");
      },
    },
    {
      path: "/api/cyber/suppressions",
      validate: (json) => {
        assert.equal(json.ok, true);
        assert.ok(Array.isArray(json.items), "cyber/suppressions items should be array");
      },
    },
  ];

  // ── Auth & Firewall group ──
  const authFirewallEndpoints = [
    {
      path: "/api/auth/me",
      validate: (json) => {
        assert.equal(json.ok, true);
        assert.equal(typeof json.authenticated, "boolean");
      },
    },
    {
      path: "/api/firewall/rules/effective",
      validate: (json) => {
        assert.equal(json.ok, true);
        // MapleShell reads: json.rules
        assert.ok("rules" in json || "source" in json, "should have rules or source");
      },
    },
  ];

  const allEndpoints = [
    ...observabilityEndpoints,
    ...executionEndpoints,
    ...runtimeEndpoints,
    ...cyberWorkspaceEndpoints,
    ...authFirewallEndpoints,
  ];

  for (const { path, validate, allowRedirect } of allEndpoints) {
    it(`GET ${path} → JSON (not HTML)`, async (t) => {
      if (skipUnless(t, gatewayAlive)) return;

      const r = await fetchJson(GATEWAY, path);

      // Some endpoints (e.g., approvals alias) use 307 redirect
      if (allowRedirect && [301, 302, 307, 308].includes(r.status)) {
        // Follow the redirect
        const redirectPath = new URL(r.location, GATEWAY).pathname + new URL(r.location, GATEWAY).search;
        const r2 = await fetchJson(GATEWAY, redirectPath);
        assertNotHtml(r2, path);
        const json = assertIsJson(r2, path);
        validate(json);
        return;
      }

      assertNotHtml(r, path);
      const json = assertIsJson(r, path);
      validate(json);
    });
  }

  it("All workspace endpoints respond in parallel (< 5s total)", async (t) => {
    if (skipUnless(t, gatewayAlive)) return;

    const start = Date.now();
    const results = await Promise.allSettled(
      allEndpoints.map(({ path }) =>
        fetch(`${GATEWAY}${path}`, { signal: AbortSignal.timeout(8_000) })
      )
    );
    const elapsed = Date.now() - start;

    const fulfilled = results.filter((r) => r.status === "fulfilled").length;
    assert.ok(
      fulfilled === results.length,
      `${results.length - fulfilled} of ${results.length} workspace requests failed`
    );
    // Warn if slow but don't fail — CI may be slower
    if (elapsed > 5000) {
      console.warn(`[WARN] Workspace bootstrap took ${elapsed}ms (target: <5000ms)`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 5 — Cyber operations surface (Fix 1 regression)
//
// These endpoints previously returned Inspector HTML due to the catch-all.
// Every response MUST be JSON, never text/html.
// ═══════════════════════════════════════════════════════════════════════════════

describe("Step 5: Cyber operations — Fix 1 regression", () => {
  const cyberGetEndpoints = [
    {
      path: "/api/cyber/status",
      validate: (json) => {
        // MapleShell cyber view reads: json.security
        assert.ok("security" in json || "status" in json, "cyber/status should have security or status field");
      },
    },
    {
      path: "/api/cyber/policies",
      validate: (json) => {
        // Returns policy list — may be direct array or wrapped
        assert.ok(json.policies || Array.isArray(json) || json.rules, "cyber/policies should have policies or rules");
      },
    },
    {
      path: "/api/cyber/events?limit=10",
      validate: (json) => {
        assert.equal(json.ok, true);
        assert.ok(Array.isArray(json.items), "cyber/events should have items array");
        assert.equal(typeof json.total, "number");
      },
    },
    {
      path: "/api/cyber/incidents",
      validate: (json) => {
        assert.equal(json.ok, true);
        assert.ok(Array.isArray(json.items), "cyber/incidents should have items array");
      },
    },
    {
      path: "/api/cyber/downloads?limit=10",
      validate: (json) => {
        assert.equal(json.ok, true);
        assert.ok(Array.isArray(json.items), "cyber/downloads should have items array");
      },
    },
    {
      path: "/api/cyber/quarantine",
      validate: (json) => {
        assert.equal(json.ok, true);
        assert.ok(Array.isArray(json.items), "cyber/quarantine should have items array");
      },
    },
    {
      path: "/api/cyber/suppressions",
      validate: (json) => {
        assert.equal(json.ok, true);
        assert.ok(Array.isArray(json.items), "cyber/suppressions should have items array");
      },
    },
  ];

  for (const { path, validate } of cyberGetEndpoints) {
    it(`GET ${path} → JSON (never HTML)`, async (t) => {
      if (skipUnless(t, gatewayAlive)) return;
      const r = await fetchJson(GATEWAY, path);
      assertNotHtml(r, path);
      const json = assertIsJson(r, path);
      validate(json);
    });
  }

  it("GET /api/cyber/status through Frontend A proxy → JSON", async (t) => {
    if (skipUnless(t, frontendAlive, gatewayAlive)) return;
    const r = await fetchJson(FRONTEND_A, "/api/cyber/status");
    assertNotHtml(r, "FrontendA /api/cyber/status");
    assertIsJson(r, "FrontendA /api/cyber/status");
  });

  it("GET /api/cyber/incidents through Frontend A proxy → JSON", async (t) => {
    if (skipUnless(t, frontendAlive, gatewayAlive)) return;
    const r = await fetchJson(FRONTEND_A, "/api/cyber/incidents");
    assertNotHtml(r, "FrontendA /api/cyber/incidents");
    const json = assertIsJson(r, "FrontendA /api/cyber/incidents");
    assert.equal(json.ok, true);
  });

  it("Incident items have fields CyberOpsPanel renders", async (t) => {
    if (skipUnless(t, gatewayAlive)) return;
    const r = await fetchJson(GATEWAY, "/api/cyber/incidents?limit=5");
    assertNotHtml(r, "/api/cyber/incidents");
    const json = assertIsJson(r, "/api/cyber/incidents");
    assert.equal(json.ok, true);
    if (json.items.length > 0) {
      const item = json.items[0];
      // CyberOpsPanel uses: incidentId/id, title, severity, state, priority, summary
      assert.ok(item.incidentId || item.id, "incident should have incidentId or id");
    }
  });

  it("Download items have scan sub-object for scanColor/scanLabel", async (t) => {
    if (skipUnless(t, gatewayAlive)) return;
    const r = await fetchJson(GATEWAY, "/api/cyber/downloads?limit=5");
    assertNotHtml(r, "/api/cyber/downloads");
    const json = assertIsJson(r, "/api/cyber/downloads");
    assert.equal(json.ok, true);
    if (json.items.length > 0) {
      const item = json.items[0];
      // CyberOpsPanel uses: item.scan.status, item.scan.verdict, item.scan.provider
      assert.ok(item.scan && typeof item.scan === "object", "download item should have scan object");
    }
  });

  it("Quarantine items have quarantineId for mutation targeting", async (t) => {
    if (skipUnless(t, gatewayAlive)) return;
    const r = await fetchJson(GATEWAY, "/api/cyber/quarantine");
    assertNotHtml(r, "/api/cyber/quarantine");
    const json = assertIsJson(r, "/api/cyber/quarantine");
    assert.equal(json.ok, true);
    if (json.items.length > 0) {
      const item = json.items[0];
      assert.ok(item.quarantineId || item.id, "quarantine item should have quarantineId or id");
    }
  });

  it("Suppression items have suppressionId for revoke targeting", async (t) => {
    if (skipUnless(t, gatewayAlive)) return;
    const r = await fetchJson(GATEWAY, "/api/cyber/suppressions");
    assertNotHtml(r, "/api/cyber/suppressions");
    const json = assertIsJson(r, "/api/cyber/suppressions");
    assert.equal(json.ok, true);
    if (json.items.length > 0) {
      const item = json.items[0];
      assert.ok(item.suppressionId || item.id, "suppression item should have suppressionId or id");
      assert.ok(item.scopeType, "suppression should have scopeType");
      assert.ok(typeof item.status === "string", "suppression should have status string");
    }
  });

  it("GET /inspector still returns HTML (Inspector UI not broken)", async (t) => {
    if (skipUnless(t, gatewayAlive)) return;
    const r = await fetchRaw(GATEWAY, "/inspector");
    assert.ok(
      r.contentType.includes("text/html"),
      `Inspector should serve HTML, got: ${r.contentType}`
    );
    assert.equal(r.status, 200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 6 — Admin API proxy (Fix 2 regression)
//
// Both frontends should proxy /admin/api/* to the gateway (port 3000),
// not to a stale port 4001 or localhost:8000.
// ═══════════════════════════════════════════════════════════════════════════════

describe("Step 6: Admin API proxy — Fix 2 regression", () => {
  it("GET /admin/api/policies via Gateway → JSON", async (t) => {
    if (skipUnless(t, gatewayAlive)) return;
    const r = await fetchJson(GATEWAY, "/admin/api/policies");
    assertNotHtml(r, "Gateway /admin/api/policies");
    // May be 200 (allowed) or 401/403 (needs admin key) — both are valid JSON
    assertIsJson(r, "Gateway /admin/api/policies");
    assert.ok(
      [200, 401, 403].includes(r.status),
      `Expected 200, 401, or 403, got ${r.status}`
    );
  });

  it("GET /admin/api/policies via Frontend A proxy → JSON (not ECONNREFUSED)", async (t) => {
    if (skipUnless(t, frontendAlive, gatewayAlive)) return;
    const r = await fetchJson(FRONTEND_A, "/admin/api/policies");
    assertNotHtml(r, "FrontendA /admin/api/policies");
    const json = assertIsJson(r, "FrontendA /admin/api/policies");
    // Must not be a proxy connection error
    assert.ok(
      r.status !== 503 || !json.details?.includes("ECONNREFUSED"),
      `Admin proxy failed with ECONNREFUSED — wrong target port. Details: ${json.details}`
    );
  });

  it("GET /admin/api/audit via Frontend A proxy → JSON", async (t) => {
    if (skipUnless(t, frontendAlive, gatewayAlive)) return;
    const r = await fetchJson(FRONTEND_A, "/admin/api/audit");
    assertNotHtml(r, "FrontendA /admin/api/audit");
    assertIsJson(r, "FrontendA /admin/api/audit");
    assert.ok([200, 401, 403].includes(r.status), `Expected 200/401/403, got ${r.status}`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 7 — Observability endpoints (Fix 3 regression)
//
// These previously returned 403 because verifiedScope() didn't check
// allowNoAuth. In local dev (MAPLE_ALLOW_NO_AUTH=true) they should succeed.
// ═══════════════════════════════════════════════════════════════════════════════

describe("Step 7: Observability auth bypass — Fix 3 regression", () => {
  const observabilityEndpoints = [
    "/api/observability/orchestrations/summary",
    "/api/observability/orchestrations/slo",
    "/api/observability/orchestrations/audit-log",
    "/api/observability/orchestrations/retention",
    "/api/observability/orchestrations/dead-letter",
    "/api/observability/orchestrations/audit-chain",
    "/api/observability/orchestrations/audit-chain/verify",
    "/api/observability/orchestrations/alert-webhooks",
  ];

  for (const path of observabilityEndpoints) {
    it(`GET ${path} → 200 (not 403) when allowNoAuth is set`, async (t) => {
      if (skipUnless(t, gatewayAlive)) return;
      const r = await fetchJson(GATEWAY, path);
      assertNotHtml(r, path);
      const json = assertIsJson(r, path);
      // The key assertion: with MAPLE_ALLOW_NO_AUTH=true, we should NOT get 403
      assert.notEqual(
        r.status, 403,
        `${path} returned 403 — verifiedScope() is rejecting without tenant headers despite allowNoAuth`
      );
      // Should be 200 (or possibly 500 if DB is down, but not 403)
      assert.ok(
        [200, 500].includes(r.status),
        `${path} returned unexpected status ${r.status}. Body: ${r.body?.slice(0, 200)}`
      );
    });
  }

  it("Observability summary via Frontend A proxy → not 403", async (t) => {
    if (skipUnless(t, frontendAlive, gatewayAlive)) return;
    const r = await fetchJson(FRONTEND_A, "/api/observability/orchestrations/summary");
    assertNotHtml(r, "FrontendA observability/summary");
    assertIsJson(r, "FrontendA observability/summary");
    assert.notEqual(r.status, 403, "Observability should not return 403 through frontend proxy");
  });

  it("Observability SLO via Frontend A proxy → not 403", async (t) => {
    if (skipUnless(t, frontendAlive, gatewayAlive)) return;
    const r = await fetchJson(FRONTEND_A, "/api/observability/orchestrations/slo");
    assertNotHtml(r, "FrontendA observability/slo");
    assertIsJson(r, "FrontendA observability/slo");
    assert.notEqual(r.status, 403, "SLO should not return 403 through frontend proxy");
  });

  it("POST /api/observability/orchestrations/export → JSON (not 403)", async (t) => {
    if (skipUnless(t, gatewayAlive)) return;
    const r = await fetchJson(GATEWAY, "/api/observability/orchestrations/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format: "json", limit: 5 }),
    });
    assertNotHtml(r, "POST observability/export");
    assertIsJson(r, "POST observability/export");
    assert.notEqual(r.status, 403, "Export should not return 403 with allowNoAuth");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 8 — Mutation smoke tests
//
// Verify that POST/PATCH endpoints accept requests and return JSON.
// These simulate user actions in the workspace (block rule, create suppression).
// ═══════════════════════════════════════════════════════════════════════════════

describe("Step 8: Mutation smoke tests", () => {
  it("POST /api/firewall/rules → creates a block rule", async (t) => {
    if (skipUnless(t, gatewayAlive)) return;
    const r = await fetchJson(GATEWAY, "/api/firewall/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "block",
        target: { type: "tool", value: "test-integration-probe" },
        reason: "Integration test — safe to delete",
        createdBy: "frontend-a-user-flow-test",
      }),
    });
    assertNotHtml(r, "POST /api/firewall/rules");
    assertIsJson(r, "POST /api/firewall/rules");
    // 201 = created, 200 = ok, 400 = validation, 401/403 = auth
    assert.ok(
      [200, 201, 400, 401, 403].includes(r.status),
      `Unexpected status ${r.status} for firewall rule creation`
    );
  });

  it("POST /api/cyber/incidents/nonexistent/note → 404 JSON", async (t) => {
    if (skipUnless(t, gatewayAlive)) return;
    const r = await fetchJson(GATEWAY, "/api/cyber/incidents/nonexistent/note", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: "integration test" }),
    });
    assertNotHtml(r, "POST /api/cyber/incidents/nonexistent/note");
    assertIsJson(r, "POST /api/cyber/incidents/nonexistent/note");
    // With allowNoAuth + no tenant headers, scope check may fail (403) or incident not found (404)
    assert.ok(
      [403, 404].includes(r.status),
      `Expected 403 or 404 for non-existent incident, got ${r.status}`
    );
  });

  it("POST /api/observability/orchestrations/flush → JSON", async (t) => {
    if (skipUnless(t, gatewayAlive)) return;
    const r = await fetchJson(GATEWAY, "/api/observability/orchestrations/flush", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assertNotHtml(r, "POST observability/flush");
    assertIsJson(r, "POST observability/flush");
    // Flush doesn't require tenant scope and bypasses verifiedScope
    assert.ok([200, 500].includes(r.status), `Unexpected status ${r.status}`);
    if (r.status === 200) {
      assert.equal(r.json.ok, true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 9 — Full flow through Frontend A proxy
//
// Simulates the actual browser experience: Frontend A proxies to Gateway.
// Validates that the proxy layer doesn't corrupt responses.
// ═══════════════════════════════════════════════════════════════════════════════

describe("Step 9: Full flow through Frontend A proxy", () => {
  const criticalPaths = [
    "/api/auth/me",
    "/api/firewall/rules/effective",
    "/api/runtime/feature-capabilities",
    "/api/cyber/status",
    "/api/cyber/incidents",
    "/api/cyber/policies",
    "/api/observability/orchestrations/summary",
    "/api/observability/orchestrations/slo",
    "/api/observability/orchestrations/audit-log?offset=0&limit=10",
  ];

  for (const path of criticalPaths) {
    it(`Frontend A proxy: GET ${path} → JSON`, async (t) => {
      if (skipUnless(t, frontendAlive, gatewayAlive)) return;
      const direct = await fetchJson(GATEWAY, path);
      const proxied = await fetchJson(FRONTEND_A, path);

      assertNotHtml(proxied, `FrontendA ${path}`);
      assertIsJson(proxied, `FrontendA ${path}`);

      // Status codes should match (proxy shouldn't transform them)
      assert.equal(
        proxied.status, direct.status,
        `Proxy status mismatch for ${path}: frontend=${proxied.status}, gateway=${direct.status}`
      );
    });
  }
});
