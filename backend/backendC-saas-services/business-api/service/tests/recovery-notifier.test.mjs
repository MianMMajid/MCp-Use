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
      MAPLE_RECOVERY_EMAIL_FROM: "",
      SENDGRID_API_KEY: "",
      RESEND_API_KEY: "",
      MAPLE_RECOVERY_SMS_FROM: "",
      MAPLE_RECOVERY_SMS_TO: "",
      TWILIO_ACCOUNT_SID: "",
      TWILIO_AUTH_TOKEN: "",
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
