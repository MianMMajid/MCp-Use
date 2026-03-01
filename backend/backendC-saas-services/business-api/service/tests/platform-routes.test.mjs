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

function createDatabaseStub() {
  return {
    async findActiveSession(sessionId) {
      if (sessionId !== "session-123") {
        return undefined;
      }
      return {
        id: sessionId,
        user: {
          id: "user-1",
          username: "maple",
          email: "maple@example.com",
        },
      };
    },
  };
}

function createPlatformStoreStub() {
  return {
    async listOrganizationsForUser() {
      return [{ orgId: "org-1", name: "Maple Org", membersCount: 1 }];
    },
    async createOrganization(input) {
      return {
        orgId: "org-1",
        name: input.name,
        ownerUserId: input.ownerUserId,
        membersCount: 1,
      };
    },
    async getOrganizationForUser(orgId) {
      if (orgId !== "org-1") {
        return null;
      }
      return {
        orgId: "org-1",
        name: "Maple Org",
        ownerUserId: "user-1",
        membersCount: 1,
      };
    },
    async updateOrganizationName(orgId, name) {
      return {
        orgId,
        name,
        ownerUserId: "user-1",
        membersCount: 1,
      };
    },
    async listOrganizationMembers() {
      return [{ userId: "user-1", roleId: "owner" }];
    },
    async createOrganizationInvite() {
      return { inviteId: "invite-1", orgId: "org-1" };
    },
    async acceptOrganizationInvite() {
      return { inviteId: "invite-1", orgId: "org-1" };
    },
    async removeOrganizationMember() {
      return true;
    },
    async listOrganizationRoles() {
      return [{ roleId: "owner" }, { roleId: "member" }];
    },
    async assignOrganizationRole(_orgId, userId, roleId) {
      return { userId, roleId };
    },
    async listUserApiKeys() {
      return [{ keyId: "key-1" }];
    },
    async createUserApiKey() {
      return { keyId: "key-2" };
    },
    async deleteUserApiKey() {
      return true;
    },
    async listServiceAccounts() {
      return [{ accountId: "svc-1" }];
    },
    async createServiceAccount() {
      return { accountId: "svc-2" };
    },
    async createServiceAccountKey() {
      return { keyId: "svc-key-1" };
    },
    async deleteServiceAccountKey() {
      return true;
    },
    async getEntitlementsForUser() {
      return { plan: "team", features: ["tool-governance"] };
    },
    async getUsageSummary() {
      return { runs: 12 };
    },
    async getUsageTimeseries() {
      return [{ day: "2026-02-25", runs: 2 }];
    },
    async getLimitsForUser() {
      return { maxRunsPerDay: 100 };
    },
    async updateLimitsForUser() {
      return { maxRunsPerDay: 250 };
    },
  };
}

async function createApp() {
  const { registerPlatformRoutes } = await import("../src/routes/platform-routes.js");
  const app = new Hono();
  registerPlatformRoutes(app, {
    database: createDatabaseStub(),
    platformStore: createPlatformStoreStub(),
  });
  return app;
}

test("platform routes require session authentication", async () => {
  const app = await createApp();
  const response = await app.request("http://localhost/api/business/org");
  assert.equal(response.status, 401);
  const payload = await response.json();
  assert.equal(payload.error, "Authentication required.");
});

test("platform routes expose org, key, usage, and limits lifecycle", async () => {
  const app = await createApp();
  const authHeaders = { cookie: "maple_session=session-123", "content-type": "application/json" };

  assert.equal(
    (await app.request("http://localhost/api/business/org", { headers: authHeaders })).status,
    200
  );
  assert.equal(
    (
      await app.request("http://localhost/api/business/org", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ name: "Maple Org" }),
      })
    ).status,
    201
  );
  assert.equal(
    (
      await app.request("http://localhost/api/business/org/org-1", {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({ name: "Maple Org v2" }),
      })
    ).status,
    200
  );
  assert.equal(
    (
      await app.request("http://localhost/api/business/user/api-keys", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ name: "automation" }),
      })
    ).status,
    201
  );
  assert.equal(
    (
      await app.request("http://localhost/api/business/usage/timeseries?days=7", {
        headers: authHeaders,
      })
    ).status,
    200
  );
  const override = await app.request("http://localhost/api/business/limits/override", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ maxRunsPerDay: 250 }),
  });
  assert.equal(override.status, 200);
  const overridePayload = await override.json();
  assert.equal(overridePayload.ok, true);
  assert.equal(overridePayload.limits.maxRunsPerDay, 250);
});
