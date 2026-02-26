import assert from "node:assert/strict";
import test from "node:test";

import { Hono } from "hono";
import { createAdminAuthMiddleware, verifyAdminRequest } from "../src/admin-auth.js";

test("verifyAdminRequest fails closed when admin keys are missing", () => {
  const result = verifyAdminRequest({
    apiKeys: [],
    allowNoAuth: false,
    xApiKey: "",
    authorization: "",
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 503);
  assert.equal(result.code, "ADMIN_AUTH_MISCONFIGURED");
});

test("verifyAdminRequest accepts valid admin api key", () => {
  const result = verifyAdminRequest({
    apiKeys: ["admin-secret"],
    allowNoAuth: false,
    xApiKey: "admin-secret",
    authorization: "",
  });

  assert.equal(result.ok, true);
  assert.equal(result.mode, "api_key");
  assert.equal(typeof result.keyFingerprint, "string");
  assert.equal(result.keyFingerprint.length > 0, true);
});

test("admin auth middleware blocks unauthorized requests", async () => {
  const app = new Hono();
  app.use(
    "/admin/api/*",
    createAdminAuthMiddleware({
      apiKeys: ["expected-secret"],
      allowNoAuth: false,
    })
  );
  app.get("/admin/api/policies", (c) => c.json({ ok: true }));

  const response = await app.request("http://localhost/admin/api/policies");
  assert.equal(response.status, 401);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, "ADMIN_AUTH_REQUIRED");
});

test("admin auth middleware allows access with valid key", async () => {
  const app = new Hono();
  app.use(
    "/admin/api/*",
    createAdminAuthMiddleware({
      apiKeys: ["expected-secret"],
      allowNoAuth: false,
    })
  );
  app.get("/admin/api/policies", (c) => c.json({ ok: true }));

  const response = await app.request("http://localhost/admin/api/policies", {
    headers: { "x-api-key": "expected-secret" },
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload, { ok: true });
});

test("admin auth middleware allows bypass only when explicitly enabled", async () => {
  const app = new Hono();
  app.use(
    "/admin/api/*",
    createAdminAuthMiddleware({
      apiKeys: [],
      allowNoAuth: true,
    })
  );
  app.get("/admin/api/policies", (c) => c.json({ ok: true }));

  const response = await app.request("http://localhost/admin/api/policies");
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload, { ok: true });
});
