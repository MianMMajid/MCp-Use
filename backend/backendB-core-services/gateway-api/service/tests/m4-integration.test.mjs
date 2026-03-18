/**
 * m4-integration.test.mjs
 *
 * M4-10 integration test covering GPT adapter surface parity (M4-01..02),
 * error envelope normalization (M4-07), runtime diagnostics, and health.
 *
 * Run with: node --test backend/backendB-core-services/gateway-api/service/tests/m4-integration.test.mjs
 */

// Apply shared env defaults BEFORE any app code
import { applyGatewayTestEnvDefaults } from "./helpers/gateway-test-env.mjs";
applyGatewayTestEnvDefaults();

// Test-specific overrides
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

async function appFetch(path, options = {}) {
  const { app } = appResult;
  const url = `http://localhost${path}`;
  const req = new Request(url, options);
  return app.fetch(req);
}

function authed(options = {}) {
  const headers = new Headers(options.headers);
  headers.set("x-api-key", "test-admin-key");
  return { ...options, headers };
}

// ═══════════════════════════════════════════════════════════════════
// Suite 1: GPT Adapter (M4-01..02)
// ═══════════════════════════════════════════════════════════════════

test("GET /.well-known/ai-plugin.json returns 200 with required fields", async () => {
  const resp = await appFetch("/.well-known/ai-plugin.json");
  assert.equal(resp.status, 200);
  const body = await resp.json();

  // M4-01: Verify all required OpenAI plugin manifest fields
  assert.equal(body.schema_version, "v1");
  assert.ok(body.name_for_human, "name_for_human is required");
  assert.ok(body.name_for_model, "name_for_model is required");
  assert.ok(body.description_for_human, "description_for_human is required");
  assert.ok(body.description_for_model, "description_for_model is required");
  assert.ok(body.auth, "auth block is required");
  assert.equal(body.auth.type, "oauth");
  assert.ok(body.auth.client_url, "auth.client_url is required per spec");
  assert.ok(body.auth.authorization_url, "auth.authorization_url is required");
  assert.ok(body.auth.token_url, "auth.token_url is required");
  assert.ok(body.api, "api block is required");
  assert.equal(body.api.type, "openapi");
  assert.ok(body.api.url, "api.url is required");
  assert.ok(body.logo_url, "logo_url is required");
  assert.ok(body.contact_email, "contact_email is required");
  assert.ok(body.legal_info_url, "legal_info_url is required");
});

test("GET /gpt/openapi.json returns 200 with valid OpenAPI spec", async () => {
  const resp = await appFetch("/gpt/openapi.json");
  assert.equal(resp.status, 200);
  const body = await resp.json();

  assert.ok(body.openapi, "openapi version field is required");
  assert.ok(body.info, "info block is required");
  assert.ok(body.info.title, "info.title is required");
  assert.ok(body.info.version, "info.version is required");
  assert.ok(body.servers, "servers array is required");
  assert.ok(body.paths !== undefined, "paths object is required");
});

// ═══════════════════════════════════════════════════════════════════
// Suite 2: Error Envelope (M4-07)
// ═══════════════════════════════════════════════════════════════════

test("buildApiError returns correct envelope with code and message", async () => {
  const { buildApiError } = await import("../src/error-envelope.js");

  const result = buildApiError("NOT_FOUND", "Resource not found.");
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "NOT_FOUND");
  assert.equal(result.error.message, "Resource not found.");
  assert.equal(result.error.hint, undefined);
});

test("buildApiError includes hint when provided", async () => {
  const { buildApiError } = await import("../src/error-envelope.js");

  const result = buildApiError("VALIDATION_ERROR", "Invalid input.", "Check the 'name' field.");
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "VALIDATION_ERROR");
  assert.equal(result.error.message, "Invalid input.");
  assert.equal(result.error.hint, "Check the 'name' field.");
});

test("buildApiError handles null/undefined code and message", async () => {
  const { buildApiError } = await import("../src/error-envelope.js");

  const result = buildApiError(null, undefined);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "UNKNOWN_ERROR");
  assert.equal(result.error.message, "Unknown error.");
});

// ═══════════════════════════════════════════════════════════════════
// Suite 3: Runtime Diagnostics
// ═══════════════════════════════════════════════════════════════════

test("GET /api/runtime/dependencies returns 200 or 503", async () => {
  const resp = await appFetch("/api/runtime/dependencies", authed());
  // 200 if dependencies are available, 503 if not — accept both
  assert.ok(
    [200, 503].includes(resp.status),
    `Expected 200 or 503, got ${resp.status}`
  );
});

// ═══════════════════════════════════════════════════════════════════
// Suite 4: Health
// ═══════════════════════════════════════════════════════════════════

test("GET /health returns 200", async () => {
  const resp = await appFetch("/health");
  assert.equal(resp.status, 200);
  const body = await resp.json();
  assert.ok(body.ok !== undefined || body.status !== undefined, "Health response should have ok or status field");
});
