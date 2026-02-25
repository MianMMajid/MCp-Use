import assert from "node:assert/strict";
import test from "node:test";

import { Hono } from "hono";
import { hashPassword } from "@maple/security";
import { registerUserRoutes } from "../src/routes/user-routes.js";

function createDatabaseStub() {
  const user = {
    id: "user-1",
    username: "maple",
    email: "maple@example.com",
    passwordHash: hashPassword("old-password"),
    createdAt: new Date().toISOString(),
  };

  return {
    changedPasswordHash: undefined,
    async findActiveSession(sessionId) {
      if (sessionId !== "session-123") {
        return undefined;
      }
      return {
        id: sessionId,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
        },
      };
    },
    async findUserById(userId) {
      return userId === user.id ? user : undefined;
    },
    async ensureFreeSubscription() {
      return {
        plan: "free",
        status: "active",
        currentPeriodEnd: null,
      };
    },
    async updatePasswordByUserId(_userId, passwordHash) {
      this.changedPasswordHash = passwordHash;
      user.passwordHash = passwordHash;
    },
  };
}

test("profile route returns user metadata when session is valid", async () => {
  const app = new Hono();
  const database = createDatabaseStub();
  registerUserRoutes(app, { database });

  const response = await app.request("http://localhost/api/business/user/profile", {
    headers: { cookie: "maple_session=session-123" },
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.user.id, "user-1");
  assert.equal(payload.subscription.plan, "free");
});

test("change-password route validates existing password and updates hash", async () => {
  const app = new Hono();
  const database = createDatabaseStub();
  registerUserRoutes(app, { database });

  const badPassword = await app.request(
    "http://localhost/api/business/user/change-password",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "maple_session=session-123",
      },
      body: JSON.stringify({
        currentPassword: "wrong-password",
        newPassword: "new-password-123",
      }),
    }
  );
  assert.equal(badPassword.status, 401);

  const success = await app.request(
    "http://localhost/api/business/user/change-password",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "maple_session=session-123",
      },
      body: JSON.stringify({
        currentPassword: "old-password",
        newPassword: "new-password-123",
      }),
    }
  );

  assert.equal(success.status, 200);
  const payload = await success.json();
  assert.equal(payload.ok, true);
  assert.equal(typeof database.changedPasswordHash, "string");
  assert.equal(database.changedPasswordHash.length > 10, true);
});
