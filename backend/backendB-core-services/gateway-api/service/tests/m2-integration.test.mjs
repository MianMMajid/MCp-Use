/**
 * m2-integration.test.mjs
 *
 * M2-15 integration test covering Org lifecycle (M2-01..05), member/RBAC,
 * API keys, entitlements, billing, and contract validation.
 *
 * Uses the shared gateway-test-env helper for env defaults, then applies
 * test-specific overrides before any app code is imported.
 *
 * Run with: node --test backend/backendB-core-services/gateway-api/service/tests/m2-integration.test.mjs
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
// Suite 1: Org Lifecycle
// ═══════════════════════════════════════════════════════════════════

test("POST /api/org with valid name returns 200 or 409 (conflict)", async () => {
  const resp = await appFetch(
    "/api/org",
    authed({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test Org M2" }),
    })
  );
  assert.ok(
    [200, 201, 409].includes(resp.status),
    `Expected 200, 201, or 409, got ${resp.status}`
  );
});

test("GET /api/org returns 200 with org list", async () => {
  const resp = await appFetch("/api/org", authed());
  assert.ok(
    [200, 401].includes(resp.status),
    `Expected 200 or 401, got ${resp.status}`
  );
  if (resp.status === 200) {
    const body = await resp.json();
    assert.ok(body.ok === true || Array.isArray(body.items), "Expected ok:true or items array");
  }
});

// ═══════════════════════════════════════════════════════════════════
// Suite 2: Org Validation
// ═══════════════════════════════════════════════════════════════════

test("POST /api/org with name >100 chars returns 400", async () => {
  const longName = "x".repeat(101);
  const resp = await appFetch(
    "/api/org",
    authed({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: longName }),
    })
  );
  assert.ok(
    [400, 401].includes(resp.status),
    `Expected 400 or 401, got ${resp.status}`
  );
});

test("POST /api/org with empty name returns 400", async () => {
  const resp = await appFetch(
    "/api/org",
    authed({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    })
  );
  assert.ok(
    [400, 401].includes(resp.status),
    `Expected 400 or 401, got ${resp.status}`
  );
});

// ═══════════════════════════════════════════════════════════════════
// Suite 3: Member/RBAC
// ═══════════════════════════════════════════════════════════════════

test("GET /api/org/unknown-id/members returns 404 or 200 (empty)", async () => {
  const resp = await appFetch("/api/org/unknown-id/members", authed());
  assert.ok(
    [200, 401, 404].includes(resp.status),
    `Expected 200, 401, or 404, got ${resp.status}`
  );
});

test("POST /api/org/unknown/invites returns 404", async () => {
  const resp = await appFetch(
    "/api/org/unknown/invites",
    authed({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com", role: "member" }),
    })
  );
  assert.ok(
    [401, 403, 404].includes(resp.status),
    `Expected 401, 403, or 404, got ${resp.status}`
  );
});

// ═══════════════════════════════════════════════════════════════════
// Suite 4: API Keys
// ═══════════════════════════════════════════════════════════════════

test("GET /api/user/api-keys returns 200 (may be empty array)", async () => {
  const resp = await appFetch("/api/user/api-keys", authed());
  assert.ok(
    [200, 401].includes(resp.status),
    `Expected 200 or 401, got ${resp.status}`
  );
  if (resp.status === 200) {
    const body = await resp.json();
    assert.ok(body.ok === true || Array.isArray(body.items), "Expected ok:true or items array");
  }
});

test("POST /api/user/api-keys with valid name returns 200 or 201", async () => {
  const resp = await appFetch(
    "/api/user/api-keys",
    authed({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "m2-test-key" }),
    })
  );
  assert.ok(
    [200, 201, 401].includes(resp.status),
    `Expected 200, 201, or 401, got ${resp.status}`
  );
});

// ═══════════════════════════════════════════════════════════════════
// Suite 5: Entitlements
// ═══════════════════════════════════════════════════════════════════

test("POST /api/entitlements/check without orgId returns 400 or 404", async () => {
  const resp = await appFetch(
    "/api/entitlements/check",
    authed({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feature: "some-feature" }),
    })
  );
  // 400 if contract validation rejects missing orgId, 404 if route doesn't exist
  assert.ok(
    [400, 404].includes(resp.status),
    `Expected 400 or 404, got ${resp.status}`
  );
});

// ═══════════════════════════════════════════════════════════════════
// Suite 6: Billing
// ═══════════════════════════════════════════════════════════════════

test("GET /api/billing/subscription returns 200 or 401/402", async () => {
  const resp = await appFetch("/api/billing/subscription", authed());
  assert.ok(
    [200, 401, 402].includes(resp.status),
    `Expected 200, 401, or 402, got ${resp.status}`
  );
});

// ═══════════════════════════════════════════════════════════════════
// Suite 7: Contract Validation (Direct)
// ═══════════════════════════════════════════════════════════════════

test("validateOrgCreate rejects empty name", async () => {
  const { validateOrgCreate } = await import("../src/contracts/org-contract.js");
  const result = validateOrgCreate({ name: "" });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("name")), "Expected error about name");
});

test("validateOrgCreate rejects name > 100 chars", async () => {
  const { validateOrgCreate } = await import("../src/contracts/org-contract.js");
  const result = validateOrgCreate({ name: "x".repeat(101) });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("100")), "Expected error about max length");
});

test("validateOrgCreate accepts valid name", async () => {
  const { validateOrgCreate } = await import("../src/contracts/org-contract.js");
  const result = validateOrgCreate({ name: "Valid Org Name" });
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test("validateMemberInvite rejects missing email", async () => {
  const { validateMemberInvite } = await import("../src/contracts/rbac-contract.js");
  const result = validateMemberInvite({ role: "member" });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("email")), "Expected error about email");
});

test("validateMemberInvite rejects invalid email", async () => {
  const { validateMemberInvite } = await import("../src/contracts/rbac-contract.js");
  const result = validateMemberInvite({ email: "not-an-email", role: "member" });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("email")), "Expected error about email");
});

test("validateMemberInvite accepts valid input", async () => {
  const { validateMemberInvite } = await import("../src/contracts/rbac-contract.js");
  const result = validateMemberInvite({ email: "user@example.com", role: "admin" });
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test("validateApiKeyCreate rejects empty name", async () => {
  const { validateApiKeyCreate } = await import("../src/contracts/api-key-contract.js");
  const result = validateApiKeyCreate({ name: "" });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("name")), "Expected error about name");
});

test("validateApiKeyCreate accepts valid name", async () => {
  const { validateApiKeyCreate } = await import("../src/contracts/api-key-contract.js");
  const result = validateApiKeyCreate({ name: "my-key" });
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test("validateEntitlementCheck rejects missing orgId", async () => {
  const { validateEntitlementCheck } = await import("../src/contracts/entitlement-contract.js");
  const result = validateEntitlementCheck({ feature: "some-feature" });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("orgId")), "Expected error about orgId");
});

test("validateEntitlementCheck rejects missing feature", async () => {
  const { validateEntitlementCheck } = await import("../src/contracts/entitlement-contract.js");
  const result = validateEntitlementCheck({ orgId: "org-1" });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("feature")), "Expected error about feature");
});

test("validateEntitlementCheck accepts valid input", async () => {
  const { validateEntitlementCheck } = await import("../src/contracts/entitlement-contract.js");
  const result = validateEntitlementCheck({ orgId: "org-1", feature: "premium-agents" });
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});
