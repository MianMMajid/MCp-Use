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
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const notifierModuleUrl = pathToFileURL(
  resolve(
    process.cwd(),
    "backend/backendC-saas-services/business-api/service/src/recovery-notifier.js"
  )
).href;

function runSnippet({ env = {}, snippet }) {
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `
      import { createRecoveryNotificationPublisher } from ${JSON.stringify(
        notifierModuleUrl
      )};
      ${snippet}
      `,
    ],
    {
      env: {
        ...process.env,
        ...env,
      },
      encoding: "utf8",
    }
  );
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || "").trim();
    throw new Error(detail || `Snippet failed with exit ${result.status}`);
  }
  const output = String(result.stdout || "").trim();
  return output ? JSON.parse(output) : null;
}

test("recovery notifier fails closed when delivery is required but no provider is configured", () => {
  const payload = runSnippet({
    env: {
      MAPLE_RECOVERY_DELIVERY_REQUIRED: "1",
      MAPLE_RECOVERY_EMAIL_PROVIDER: "none",
      MAPLE_RECOVERY_SMS_PROVIDER: "none",
    },
    snippet: `
      let threw = false;
      let message = "";
      try {
        createRecoveryNotificationPublisher({ log: () => {} });
      } catch (error) {
        threw = true;
        message = error?.message ?? String(error);
      }
      process.stdout.write(JSON.stringify({ threw, message }));
    `,
  });
  assert.equal(payload.threw, true);
  assert.match(payload.message, /Recovery delivery is required/);
});

test("recovery notifier delivers email via SendGrid when configured", () => {
  const payload = runSnippet({
    env: {
      MAPLE_RECOVERY_DELIVERY_REQUIRED: "1",
      MAPLE_RECOVERY_EMAIL_PROVIDER: "sendgrid",
      MAPLE_RECOVERY_EMAIL_FROM: "no-reply@maple.test",
      MAPLE_RECOVERY_EMAIL_SUBJECT_PREFIX: "[Maple Test]",
      SENDGRID_API_KEY: "sg_test_key",
      MAPLE_RECOVERY_SMS_PROVIDER: "none",
    },
    snippet: `
      const calls = [];
      const publish = createRecoveryNotificationPublisher({
        log: () => {},
        fetchImpl: async (url, init = {}) => {
          calls.push({ url, init });
          return { ok: true, status: 202, text: async () => "" };
        },
      });
      await publish({
        channel: "password_reset",
        email: "maple@example.com",
        token: "token-123",
        redirectUrl: "https://app.example.com/reset-password",
        expiresAt: "2026-12-31T00:00:00.000Z",
      });
      process.stdout.write(JSON.stringify(calls));
    `,
  });
  assert.equal(Array.isArray(payload), true);
  assert.equal(payload.length, 1);
  assert.equal(payload[0].url, "https://api.sendgrid.com/v3/mail/send");
  const requestBody = JSON.parse(String(payload[0].init.body));
  assert.equal(requestBody.personalizations[0].to[0].email, "maple@example.com");
  assert.equal(requestBody.from.email, "no-reply@maple.test");
  assert.match(requestBody.subject, /Maple Test/);
  assert.match(requestBody.content[0].value, /token-123/);
});

test("recovery notifier delivers SMS via Twilio when configured", () => {
  const payload = runSnippet({
    env: {
      MAPLE_RECOVERY_DELIVERY_REQUIRED: "1",
      MAPLE_RECOVERY_EMAIL_PROVIDER: "none",
      MAPLE_RECOVERY_SMS_PROVIDER: "twilio",
      MAPLE_RECOVERY_SMS_FROM: "+15555550123",
      MAPLE_RECOVERY_SMS_TO: "+15555550999",
      TWILIO_ACCOUNT_SID: "AC1234567890",
      TWILIO_AUTH_TOKEN: "twilio-auth-token",
    },
    snippet: `
      const calls = [];
      const publish = createRecoveryNotificationPublisher({
        log: () => {},
        fetchImpl: async (url, init = {}) => {
          calls.push({ url, init });
          return { ok: true, status: 201, text: async () => "" };
        },
      });
      await publish({
        channel: "verify_email",
        email: "maple@example.com",
        token: "verify-abc",
      });
      process.stdout.write(JSON.stringify(calls));
    `,
  });
  assert.equal(Array.isArray(payload), true);
  assert.equal(payload.length, 1);
  assert.match(
    payload[0].url,
    /https:\/\/api\.twilio\.com\/2010-04-01\/Accounts\/AC1234567890\/Messages\.json/
  );
  assert.match(String(payload[0].init.body), /To=%2B15555550999/);
  assert.match(String(payload[0].init.body), /From=%2B15555550123/);
  assert.match(String(payload[0].init.body), /verify-abc/);
});
