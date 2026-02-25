import assert from "node:assert/strict";
import test from "node:test";

import { Hono } from "hono";
import { hashPassword, verifyPassword } from "@maple/security";
import { AuthRecoveryStore } from "../src/auth-recovery-store.js";
import { registerAuthRecoveryRoutes } from "../src/routes/auth-recovery-routes.js";

function createDatabaseStub() {
  const users = new Map();
  const revokedSessionsByUserId = new Set();

  const user = {
    id: "user-1",
    username: "maple",
    email: "maple@example.com",
    passwordHash: hashPassword("old-password-123"),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  users.set(user.id, user);

  return {
    users,
    revokedSessionsByUserId,
    async findUserByEmail(email) {
      const normalized = String(email ?? "").trim().toLowerCase();
      for (const candidate of users.values()) {
        if (String(candidate.email ?? "").toLowerCase() === normalized) {
          return candidate;
        }
      }
      return undefined;
    },
    async findUserById(userId) {
      return users.get(String(userId ?? ""));
    },
    async updatePasswordByUserId(userId, nextPasswordHash) {
      const existing = users.get(String(userId ?? ""));
      if (!existing) {
        return;
      }
      existing.passwordHash = nextPasswordHash;
      existing.updatedAt = new Date().toISOString();
    },
    async revokeSessionsByUserId(userId) {
      revokedSessionsByUserId.add(String(userId ?? ""));
    },
  };
}

function createRecoveryApp(options = {}) {
  const app = new Hono();
  const database = options.database ?? createDatabaseStub();
  const recoveryStore =
    options.recoveryStore ?? new AuthRecoveryStore({ database, tokenBytes: 24 });
  const deliveries = [];

  registerAuthRecoveryRoutes(app, {
    database,
    recoveryStore,
    onRecoveryTokenIssued: async (event) => {
      deliveries.push(event);
    },
  });

  return { app, database, recoveryStore, deliveries };
}

test("forgot-password returns generic success for unknown accounts without issuing a token", async () => {
  const { app, deliveries } = createRecoveryApp();
  const response = await app.request("http://localhost/api/business/auth/forgot-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "unknown@example.com",
      redirectUrl: "https://app.example.com/reset",
    }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(deliveries.length, 0);
});

test("forgot-password + reset-password rotates password and revokes active sessions", async () => {
  const { app, database, deliveries } = createRecoveryApp();

  const forgot = await app.request("http://localhost/api/business/auth/forgot-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "maple@example.com",
      redirectUrl: "https://app.example.com/reset",
    }),
  });
  assert.equal(forgot.status, 200);
  assert.equal(deliveries.length, 1);
  const token = deliveries[0]?.token;
  assert.equal(typeof token, "string");

  const reset = await app.request("http://localhost/api/business/auth/reset-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      token,
      newPassword: "new-password-987654",
    }),
  });
  assert.equal(reset.status, 200);
  assert.deepEqual(await reset.json(), { ok: true });

  const user = await database.findUserById("user-1");
  assert.equal(verifyPassword("new-password-987654", user.passwordHash), true);
  assert.equal(database.revokedSessionsByUserId.has("user-1"), true);

  const secondReset = await app.request("http://localhost/api/business/auth/reset-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      token,
      newPassword: "another-password-123",
    }),
  });
  assert.equal(secondReset.status, 410);
});

test("verify-email request and confirm marks user as verified with single-use token", async () => {
  const { app, recoveryStore, deliveries } = createRecoveryApp();

  const request = await app.request("http://localhost/api/business/auth/verify-email/request", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "maple@example.com" }),
  });
  assert.equal(request.status, 200);
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].channel, "verify_email");

  const token = deliveries[0].token;
  const confirm = await app.request("http://localhost/api/business/auth/verify-email/confirm", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
  assert.equal(confirm.status, 200);
  assert.deepEqual(await confirm.json(), { ok: true });
  assert.equal(await recoveryStore.isEmailVerified("user-1"), true);

  const repeatedConfirm = await app.request(
    "http://localhost/api/business/auth/verify-email/confirm",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    }
  );
  assert.equal(repeatedConfirm.status, 410);
});

test("auth-recovery endpoints validate inputs and reject invalid tokens", async () => {
  const { app } = createRecoveryApp();

  const badForgot = await app.request("http://localhost/api/business/auth/forgot-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "maple@example.com",
      redirectUrl: "http://app.example.com/reset",
    }),
  });
  assert.equal(badForgot.status, 400);

  const badReset = await app.request("http://localhost/api/business/auth/reset-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      token: "not-valid",
      newPassword: "new-password-123",
    }),
  });
  assert.equal(badReset.status, 400);

  const expiredReset = await app.request("http://localhost/api/business/auth/reset-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      token: "x".repeat(32),
      newPassword: "new-password-123",
    }),
  });
  assert.equal(expiredReset.status, 410);
});
