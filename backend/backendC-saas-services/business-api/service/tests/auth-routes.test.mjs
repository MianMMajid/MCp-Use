import assert from "node:assert/strict";
import test from "node:test";

import { Hono } from "hono";
import { hashPassword } from "@maple/security";
import { registerAuthLoginRegisterRoutes } from "../src/routes/auth-login-register-routes.js";
import { registerAuthLogoutRoute } from "../src/routes/auth-logout-route.js";
import { registerAuthGoogleRoutes } from "../src/routes/auth-google-routes.js";
import { registerAuthMeRoute } from "../src/routes/auth-me-route.js";

function createDatabaseStub() {
  const users = new Map();
  const sessions = new Map();
  let lastRevokedSession;

  const user = {
    id: "user-1",
    username: "maple",
    email: "maple@example.com",
    passwordHash: hashPassword("maple-password"),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  users.set(user.username.toLowerCase(), user);

  return {
    lastRevokedSession: () => lastRevokedSession,
    async countUsers() {
      return users.size;
    },
    async findUserByUsername(username) {
      return users.get(String(username).trim().toLowerCase());
    },
    async findUserByEmail(email) {
      const normalized = String(email).trim().toLowerCase();
      for (const candidate of users.values()) {
        if ((candidate.email || "").toLowerCase() === normalized) {
          return candidate;
        }
      }
      return undefined;
    },
    async createUser(input) {
      const created = {
        id: `user-${users.size + 1}`,
        username: input.username,
        email: input.email || null,
        passwordHash: input.passwordHash,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      users.set(created.username.toLowerCase(), created);
      return created;
    },
    async createSession(userId, ttlSeconds) {
      const id = `session-${sessions.size + 1}`;
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
      const sessionUser = [...users.values()].find((candidate) => candidate.id === userId);
      const session = {
        id,
        userId,
        expiresAt,
        user: sessionUser
          ? {
              id: sessionUser.id,
              username: sessionUser.username,
              email: sessionUser.email,
            }
          : undefined,
      };
      sessions.set(id, session);
      return session;
    },
    async revokeSession(sessionId) {
      lastRevokedSession = sessionId;
      sessions.delete(sessionId);
    },
    async findActiveSession(sessionId) {
      return sessions.get(sessionId);
    },
    async findUserById(userId) {
      return [...users.values()].find((candidate) => candidate.id === userId);
    },
  };
}

test("business auth login proxies existing credentials into a session cookie", async () => {
  const app = new Hono();
  const database = createDatabaseStub();
  registerAuthLoginRegisterRoutes(app, { database });

  const response = await app.request("http://localhost/api/business/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: "maple",
      password: "maple-password",
    }),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.authenticated, true);
  assert.equal(payload.method, "session");
  assert.equal(payload.user.username, "maple");
  assert.equal(typeof payload.session.id, "string");

  const setCookie = response.headers.get("set-cookie");
  assert.equal(typeof setCookie, "string");
  assert.equal(setCookie.includes("maple_session="), true);
});

test("business auth me resolves session and unauthenticated responses", async () => {
  const app = new Hono();
  const database = createDatabaseStub();
  registerAuthMeRoute(app, { database });

  const noSession = await app.request("http://localhost/api/business/auth/me");
  assert.equal(noSession.status, 200);
  const noSessionPayload = await noSession.json();
  assert.equal(noSessionPayload.authenticated, false);
  assert.equal(noSessionPayload.user, null);

  await database.createSession("user-1", 1200);
  const withSession = await app.request("http://localhost/api/business/auth/me", {
    headers: {
      cookie: "maple_session=session-1",
    },
  });
  assert.equal(withSession.status, 200);
  const withSessionPayload = await withSession.json();
  assert.equal(withSessionPayload.authenticated, true);
  assert.equal(withSessionPayload.method, "session");
  assert.equal(withSessionPayload.user.id, "user-1");
});

test("business auth register enforces self-signup guard when users already exist", async () => {
  const app = new Hono();
  registerAuthLoginRegisterRoutes(app, { database: createDatabaseStub() });

  const response = await app.request("http://localhost/api/business/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: "new-user",
      password: "password-1234",
      email: "new@example.com",
    }),
  });

  assert.equal(response.status, 403);
  const payload = await response.json();
  assert.equal(payload.error, "Self-signup is disabled.");
});

test("business auth logout revokes existing session and clears cookie", async () => {
  const app = new Hono();
  const database = createDatabaseStub();
  registerAuthLogoutRoute(app, { database });

  const response = await app.request("http://localhost/api/business/auth/logout", {
    method: "POST",
    headers: {
      cookie: "maple_session=session-99",
    },
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(database.lastRevokedSession(), "session-99");

  const setCookie = response.headers.get("set-cookie");
  assert.equal(typeof setCookie, "string");
  assert.equal(setCookie.includes("Max-Age=0"), true);
});

test("business google auth endpoints expose client id and block when unconfigured", async () => {
  const app = new Hono();
  registerAuthGoogleRoutes(app, { database: createDatabaseStub() });

  const clientIdResponse = await app.request(
    "http://localhost/api/business/auth/google/client-id"
  );
  assert.equal(clientIdResponse.status, 200);
  const clientIdPayload = await clientIdResponse.json();
  assert.equal(Object.hasOwn(clientIdPayload, "clientId"), true);

  const googleLogin = await app.request("http://localhost/api/business/auth/google", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ credential: "fake-token" }),
  });

  assert.equal(googleLogin.status, 501);
  const googlePayload = await googleLogin.json();
  assert.equal(googlePayload.error, "Google sign-in is not configured.");
});
