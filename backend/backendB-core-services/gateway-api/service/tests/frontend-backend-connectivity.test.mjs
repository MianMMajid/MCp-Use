/**
 * frontend-backend-connectivity.test.mjs
 *
 * Live integration tests verifying that all frontend-to-backend API routes
 * return proper JSON responses (not HTML fallbacks from the MCP inspector SPA).
 *
 * Requires the dev stack to be running:
 *   npm run dev
 *
 * Run with:
 *   node --test backend/backendB-core-services/gateway-api/service/tests/frontend-backend-connectivity.test.mjs
 */

import assert from "node:assert/strict";
import { describe, it, before } from "node:test";

const GATEWAY = process.env.GATEWAY_URL || "http://127.0.0.1:3000";
const FRONTEND_A = process.env.FRONTEND_A_URL || "http://127.0.0.1:4101";
const FRONTEND_B = process.env.FRONTEND_B_URL || "http://127.0.0.1:4102";
const FRONTEND_C = process.env.FRONTEND_C_URL || "http://127.0.0.1:4103";

async function fetchJson(base, path, options = {}) {
  const res = await fetch(`${base}${path}`, {
    signal: AbortSignal.timeout(10_000),
    ...options,
  });
  const contentType = res.headers.get("content-type") || "";
  const body = await res.text();
  return { status: res.status, contentType, body };
}

function assertJsonResponse(result, path) {
  assert.ok(
    result.contentType.includes("application/json"),
    `${path} should return JSON but got ${result.contentType}: ${result.body.slice(0, 200)}`
  );
  // Must be parseable JSON
  const parsed = JSON.parse(result.body);
  assert.ok(typeof parsed === "object", `${path} should return a JSON object`);
  return parsed;
}

// ─── Preflight: verify gateway is reachable ─────────────────────────────────

before(async () => {
  try {
    await fetch(`${GATEWAY}/health`, { signal: AbortSignal.timeout(3000) });
  } catch {
    throw new Error(
      `Gateway not reachable at ${GATEWAY}. Start the dev stack first: npm run dev`
    );
  }
});

// ─── 1. Gateway returns JSON for all core API endpoints ─────────────────────

describe("Gateway core API endpoints return JSON", () => {
  const getEndpoints = [
    "/api/auth/me",
    "/api/auth/google/client-id",
    "/api/chat/capabilities",
    "/api/firewall/state",
    "/api/firewall/rules/effective",
    "/api/runtime/feature-capabilities",
    "/api/runtime/status",
    "/api/search",
    "/api/agents",
    "/api/orchestrations",
    "/api/orchestrations/executions",
    "/api/orchestrations/templates",
    "/api/runs",
    "/api/notifications",
    "/api/notifications/unread-count",
    "/api/notifications/preferences",
    "/api/hitl/approvals",
    "/api/tools/registry",
    "/api/tools/policies",
    "/api/tools/executions",
    "/api/downstream/apps",
    "/api/policies/effective",
    "/api/traces",
    "/api/integrations/catalog",
    "/api/community/stats",
    "/api/community/traces",
    "/api/observability/orchestrations/summary",
    "/api/observability/orchestrations/slo",
    "/api/observability/orchestrations/audit-log",
    "/api/observability/orchestrations/retention",
    "/api/observability/orchestrations/dead-letter",
    "/api/observability/orchestrations/alert-webhooks",
    "/api/openclaw/agent/status",
    "/api/openclaw/agent/sessions",
    "/api/openclaw/cli/tools",
    "/api/openclaw/cli/catalog",
    "/api/openclaw/modifier/capabilities",
    "/api/operations/orchestrations/approvals",
    "/api/operations/orchestrations/escalation",
    "/api/operations/orchestrations/break-glass",
    "/api/operations/orchestrations/step-up/status",
  ];

  for (const path of getEndpoints) {
    it(`GET ${path} → JSON`, async () => {
      const result = await fetchJson(GATEWAY, path);
      assertJsonResponse(result, path);
    });
  }
});

// ─── 2. Stub routes return JSON (previously returned HTML) ──────────────────

describe("Stub routes return JSON instead of HTML fallback", () => {
  const stubGetEndpoints = [
    { path: "/api/tasks", check: (j) => assert.ok(Array.isArray(j.items)) },
    {
      path: "/api/agents/stub-test/tools",
      check: (j) => {
        assert.ok(Array.isArray(j.items));
        assert.ok(Array.isArray(j.equippedToolIds));
      },
    },
    {
      path: "/api/operations/orchestrations/tenant-bindings",
      check: (j) => assert.ok(Array.isArray(j.bindings)),
    },
    {
      path: "/api/operations/orchestrations/tenant-scope",
      check: (j) => assert.ok("scope" in j),
    },
    {
      path: "/api/operations/orchestrations/org/tree",
      check: (j) => assert.ok(Array.isArray(j.tree)),
    },
    {
      path: "/api/operations/orchestrations/org/test-org-id",
      check: (j) => assert.ok("org" in j),
    },
    {
      path: "/api/operations/orchestrations/org/test-org-id/lifecycle",
      check: (j) => assert.ok(Array.isArray(j.events)),
    },
  ];

  for (const { path, check } of stubGetEndpoints) {
    it(`GET ${path} → JSON with correct shape`, async () => {
      const result = await fetchJson(GATEWAY, path);
      const json = assertJsonResponse(result, path);
      assert.equal(result.status, 200, `${path} should return 200`);
      check(json);
    });
  }

  it("GET /api/downloads/latest → 404 JSON (not gateway-served)", async () => {
    const result = await fetchJson(GATEWAY, "/api/downloads/latest");
    assertJsonResponse(result, "/api/downloads/latest");
    assert.equal(result.status, 404);
  });

  it("POST /api/tasks → 501 JSON (not yet implemented)", async () => {
    const result = await fetchJson(GATEWAY, "/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "test" }),
    });
    assertJsonResponse(result, "POST /api/tasks");
    assert.equal(result.status, 501);
  });
});

// ─── 3. Auth endpoints accept POST with proper validation ───────────────────

describe("Auth POST endpoints return JSON errors for empty payloads", () => {
  const authPosts = [
    { path: "/api/auth/login", expectedStatus: 400 },
    { path: "/api/auth/register", expectedStatus: 400 },
    { path: "/api/auth/forgot-password", expectedStatus: 400 },
    { path: "/api/auth/reset-password", expectedStatus: 400 },
  ];

  for (const { path, expectedStatus } of authPosts) {
    it(`POST ${path} → ${expectedStatus} JSON`, async () => {
      const result = await fetchJson(GATEWAY, path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = assertJsonResponse(result, path);
      assert.equal(result.status, expectedStatus);
      assert.ok(json.error, `${path} should include an error message`);
    });
  }
});

// ─── 4. Chat capabilities report correct status ─────────────────────────────

describe("Chat orchestration", () => {
  it("GET /api/chat/capabilities reports contextWallAvailable", async () => {
    const result = await fetchJson(GATEWAY, "/api/chat/capabilities");
    const json = assertJsonResponse(result, "/api/chat/capabilities");
    assert.equal(json.contextWallAvailable, true, "context-wall should be reachable");
    assert.equal(typeof json.aiEnabled, "boolean");
    assert.ok(["context-wall-local-provider", "openclaw-agent", "unavailable"].includes(json.mode));
  });

  it("POST /api/firewall/chat returns AI reply", async () => {
    const result = await fetchJson(GATEWAY, "/api/firewall/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "ping" }),
    });
    const json = assertJsonResponse(result, "/api/firewall/chat");
    assert.equal(json.ok, true, "Chat should succeed");
    assert.ok(json.reply, "Should include a reply");
    assert.ok(["ai", "rules", "openclaw-agent"].includes(json.mode));
  });

  it("POST /api/chat/stream returns SSE stream", async () => {
    const res = await fetch(`${GATEWAY}/api/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "hello" }),
      signal: AbortSignal.timeout(35_000),
    });
    assert.equal(res.status, 200);
    const contentType = res.headers.get("content-type") || "";
    assert.ok(
      contentType.includes("text/event-stream"),
      `Expected text/event-stream, got ${contentType}`
    );
    // Read first few chunks to verify SSE format
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let accumulated = "";
    let chunks = 0;
    while (chunks < 5) {
      const { value, done } = await reader.read();
      if (done) break;
      accumulated += decoder.decode(value, { stream: true });
      chunks++;
    }
    reader.cancel();
    assert.ok(accumulated.includes("data:"), "Stream should contain SSE data lines");
  });
});

// ─── 5. Frontend proxy connectivity ─────────────────────────────────────────

describe("Frontend → Gateway proxy connectivity", () => {
  const frontends = [
    { name: "FrontendA", url: FRONTEND_A },
    { name: "FrontendB", url: FRONTEND_B },
    { name: "FrontendC", url: FRONTEND_C },
  ];

  for (const { name, url } of frontends) {
    it(`${name} proxies /api/auth/me → JSON`, async () => {
      let result;
      try {
        result = await fetchJson(url, "/api/auth/me");
      } catch {
        // Frontend might not be running in CI; skip gracefully
        return;
      }
      const json = assertJsonResponse(result, `${name} /api/auth/me`);
      assert.equal(result.status, 200);
      assert.equal(json.ok, true);
      assert.equal(typeof json.authenticated, "boolean");
    });

    it(`${name} proxies /api/chat/capabilities → JSON`, async () => {
      let result;
      try {
        result = await fetchJson(url, "/api/chat/capabilities");
      } catch {
        return;
      }
      const json = assertJsonResponse(result, `${name} /api/chat/capabilities`);
      assert.equal(result.status, 200);
      assert.equal(typeof json.aiEnabled, "boolean");
    });

    it(`${name} proxies /api/firewall/state → JSON`, async () => {
      let result;
      try {
        result = await fetchJson(url, "/api/firewall/state");
      } catch {
        return;
      }
      const json = assertJsonResponse(result, `${name} /api/firewall/state`);
      assert.equal(result.status, 200);
      assert.equal(json.ok, true);
    });
  }

  // FrontendC-specific: /api/downloads/latest is a local Next.js API route
  it("FrontendC serves /api/downloads/latest locally (not from gateway)", async () => {
    let result;
    try {
      result = await fetchJson(FRONTEND_C, "/api/downloads/latest");
    } catch {
      return;
    }
    const json = assertJsonResponse(result, "FrontendC /api/downloads/latest");
    assert.equal(result.status, 200);
    assert.ok(json.version, "Should include a version field");
  });
});

// ─── 6. gRPC service addresses are correct ──────────────────────────────────

describe("gRPC service mesh connectivity", () => {
  it("context-wall gRPC is reachable (listPolicyRules succeeds)", async () => {
    const result = await fetchJson(GATEWAY, "/api/firewall/rules/effective");
    const json = assertJsonResponse(result, "/api/firewall/rules/effective");
    assert.equal(json.ok, true);
    assert.equal(json.source, "context-wall");
  });

  it("chat orchestration reaches context-wall (not ECONNREFUSED)", async () => {
    const result = await fetchJson(GATEWAY, "/api/chat/capabilities");
    const json = assertJsonResponse(result, "/api/chat/capabilities");
    assert.equal(json.contextWallAvailable, true);
    if (json.chatOrchestration) {
      assert.ok(
        !json.chatOrchestration.reason?.includes("ECONNREFUSED"),
        `gRPC should not show ECONNREFUSED: ${json.chatOrchestration.reason}`
      );
    }
  });
});
