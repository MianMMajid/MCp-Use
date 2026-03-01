/* ---------- env vars required by config.js (must precede any source import) ---------- */
process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.MAPLE_LOG_LEVEL = process.env.MAPLE_LOG_LEVEL || "error";
process.env.MAPLE_LOG_REQUESTS = process.env.MAPLE_LOG_REQUESTS || "0";
process.env.MAPLE_LOG_INCLUDE_BODIES = process.env.MAPLE_LOG_INCLUDE_BODIES || "0";
process.env.MAPLE_LOG_BODY_MAX_CHARS = process.env.MAPLE_LOG_BODY_MAX_CHARS || "4000";
process.env.BUSINESS_API_HOST = process.env.BUSINESS_API_HOST || "0.0.0.0";
process.env.BUSINESS_API_PORT = process.env.BUSINESS_API_PORT || "9550";
process.env.MAPLE_BUSINESS_API_TLS_CERT = process.env.MAPLE_BUSINESS_API_TLS_CERT || "/etc/maple/tls/tls.crt";
process.env.MAPLE_BUSINESS_API_TLS_KEY = process.env.MAPLE_BUSINESS_API_TLS_KEY || "/etc/maple/tls/tls.key";
process.env.MAPLE_BUSINESS_API_TLS_CA = process.env.MAPLE_BUSINESS_API_TLS_CA || "/etc/maple/tls/ca.crt";
process.env.MAPLE_BUSINESS_API_MTLS_REQUIRED = process.env.MAPLE_BUSINESS_API_MTLS_REQUIRED || "1";
process.env.MAPLE_BUSINESS_API_SKIP_DB_INIT = process.env.MAPLE_BUSINESS_API_SKIP_DB_INIT || "0";
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://maple:maple@127.0.0.1:5432/maple_test";
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_placeholder";
process.env.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "whsec_test";
process.env.STRIPE_PRICE_PRO = process.env.STRIPE_PRICE_PRO || "price_pro";
process.env.STRIPE_PRICE_TEAM = process.env.STRIPE_PRICE_TEAM || "price_team";
process.env.STRIPE_PRICE_ENTERPRISE = process.env.STRIPE_PRICE_ENTERPRISE || "price_enterprise";
process.env.MAPLE_SESSION_COOKIE_NAME = process.env.MAPLE_SESSION_COOKIE_NAME || "maple_session";
process.env.MAPLE_SESSION_TTL_SECONDS = process.env.MAPLE_SESSION_TTL_SECONDS || "604800";
process.env.MAPLE_AUTH_ALLOW_SELF_SIGNUP = process.env.MAPLE_AUTH_ALLOW_SELF_SIGNUP || "0";
process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "test-google-client-id";
process.env.MAPLE_ALLOW_NO_AUTH = process.env.MAPLE_ALLOW_NO_AUTH || "1";
process.env.MAPLE_SESSION_OWNER_SCOPE = process.env.MAPLE_SESSION_OWNER_SCOPE || "auto";
process.env.AUDIT_WRITER_ADDRESS = process.env.AUDIT_WRITER_ADDRESS || "localhost:9400";
process.env.MAPLE_RECOVERY_DELIVERY_REQUIRED = process.env.MAPLE_RECOVERY_DELIVERY_REQUIRED || "0";
process.env.MAPLE_RECOVERY_EMAIL_PROVIDER = process.env.MAPLE_RECOVERY_EMAIL_PROVIDER || "none";
process.env.MAPLE_RECOVERY_EMAIL_FROM = process.env.MAPLE_RECOVERY_EMAIL_FROM || "noreply@test.com";
process.env.MAPLE_RECOVERY_EMAIL_REPLY_TO = process.env.MAPLE_RECOVERY_EMAIL_REPLY_TO || "support@test.com";
process.env.MAPLE_RECOVERY_EMAIL_SUBJECT_PREFIX = process.env.MAPLE_RECOVERY_EMAIL_SUBJECT_PREFIX || "[Maple]";
process.env.MAPLE_RECOVERY_RESET_BASE_URL = process.env.MAPLE_RECOVERY_RESET_BASE_URL || "http://localhost:3000/reset";
process.env.MAPLE_RECOVERY_VERIFY_BASE_URL = process.env.MAPLE_RECOVERY_VERIFY_BASE_URL || "http://localhost:3000/verify";
process.env.SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || "test-sendgrid-key";
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || "test-resend-key";
process.env.MAPLE_RECOVERY_SMS_PROVIDER = process.env.MAPLE_RECOVERY_SMS_PROVIDER || "none";
process.env.MAPLE_RECOVERY_SMS_TO = process.env.MAPLE_RECOVERY_SMS_TO || "+1234567890";
process.env.MAPLE_RECOVERY_SMS_FROM = process.env.MAPLE_RECOVERY_SMS_FROM || "+0987654321";
process.env.TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || "test-twilio-sid";
process.env.TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || "test-twilio-token";
process.env.MAPLE_DISABLE_AUDIT_EMIT = process.env.MAPLE_DISABLE_AUDIT_EMIT || "1";

import assert from "node:assert/strict";
import test from "node:test";

import { Hono } from "hono";
import { hashPassword } from "@maple/security";

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
  const { registerAuthLoginRegisterRoutes } = await import("../src/routes/auth-login-register-routes.js");
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
  const { registerAuthMeRoute } = await import("../src/routes/auth-me-route.js");
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
  const { registerAuthLoginRegisterRoutes } = await import("../src/routes/auth-login-register-routes.js");
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
  const { registerAuthLogoutRoute } = await import("../src/routes/auth-logout-route.js");
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

test("business google auth endpoints report configured when config provides client id", async () => {
  const { registerAuthGoogleRoutes } = await import("../src/routes/auth-google-routes.js");
  const app = new Hono();
  registerAuthGoogleRoutes(app, { database: createDatabaseStub() });

  const clientIdResponse = await app.request(
    "http://localhost/api/business/auth/google/client-id"
  );
  assert.equal(clientIdResponse.status, 200);
  const clientIdPayload = await clientIdResponse.json();
  assert.equal(Object.hasOwn(clientIdPayload, "clientId"), true);
  assert.equal(clientIdPayload.configured, true);

  const googleLogin = await app.request("http://localhost/api/business/auth/google", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });

  assert.equal(googleLogin.status, 400);
  const googlePayload = await googleLogin.json();
  assert.equal(googlePayload.code, "INVALID_ARGUMENT");
});

test("business google auth client-id endpoint remains available in production", async () => {
  const { registerAuthGoogleRoutes } = await import("../src/routes/auth-google-routes.js");
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  const app = new Hono();
  registerAuthGoogleRoutes(app, { database: createDatabaseStub() });

  try {
    const clientIdResponse = await app.request(
      "http://localhost/api/business/auth/google/client-id"
    );
    assert.equal(clientIdResponse.status, 200);
    const clientIdPayload = await clientIdResponse.json();
    assert.equal(clientIdPayload.configured, true);
    assert.equal(typeof clientIdPayload.clientId, "string");
  } finally {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  }
});
