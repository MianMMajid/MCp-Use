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
  const { registerUserRoutes } = await import("../src/routes/user-routes.js");
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
  const { registerUserRoutes } = await import("../src/routes/user-routes.js");
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
