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
import { createServer } from "node:http";
import test from "node:test";

import { Hono } from "hono";

function createDatabaseStub() {
  const sessions = new Map([
    [
      "session-1",
      {
        id: "session-1",
        userId: "user-1",
        user: {
          id: "user-1",
          username: "maple",
          email: "maple@example.com",
        },
      },
    ],
  ]);
  const integrations = new Map();
  let sequence = 0;

  return {
    async findActiveSession(sessionId) {
      return sessions.get(sessionId);
    },
    async listUserIntegrations(userId) {
      return [...integrations.values()].filter((entry) => entry.userId === userId);
    },
    async upsertUserIntegration(input) {
      const key = `${input.userId}:${input.provider}`;
      const existing = integrations.get(key);
      const next = {
        id: existing?.id ?? `integration-${++sequence}`,
        userId: input.userId,
        provider: input.provider,
        displayName: input.displayName,
        status: input.status,
        authType: input.authType,
        externalAccountId: input.externalAccountId ?? "",
        scopes: Array.isArray(input.scopes) ? input.scopes : [],
        metadata: input.metadata ?? {},
        connectedAt: input.connectedAt ?? "",
        disconnectedAt: input.disconnectedAt ?? "",
        createdAt: existing?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      integrations.set(key, next);
      return next;
    },
    async findUserIntegration(userId, provider) {
      return integrations.get(`${userId}:${provider}`);
    },
    async disconnectUserIntegration(userId, provider) {
      const key = `${userId}:${provider}`;
      const existing = integrations.get(key);
      if (!existing) {
        return undefined;
      }
      const next = {
        ...existing,
        status: "disconnected",
        disconnectedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      integrations.set(key, next);
      return next;
    },
  };
}

async function startOauthProviderStub() {
  const requests = [];
  const server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      requests.push({
        method: req.method,
        path: req.url,
        body,
      });

      if (req.method === "POST" && req.url === "/token") {
        const params = new URLSearchParams(body);
        const grantType = params.get("grant_type");
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        if (grantType === "authorization_code") {
          res.end(
            JSON.stringify({
              access_token: "oauth_access_1",
              refresh_token: "oauth_refresh_1",
              token_type: "Bearer",
              expires_in: 3600,
              scope: "repo:read user:email",
            })
          );
          return;
        }
        if (grantType === "refresh_token") {
          res.end(
            JSON.stringify({
              access_token: "oauth_access_2",
              refresh_token: "oauth_refresh_2",
              token_type: "Bearer",
              expires_in: 3600,
              scope: "repo:read",
            })
          );
          return;
        }
        res.statusCode = 400;
        res.end(JSON.stringify({ error: "unsupported_grant_type" }));
        return;
      }

      if (req.method === "GET" && req.url === "/userinfo") {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            id: "12345",
            login: "octocat",
            name: "Octo Cat",
          })
        );
        return;
      }

      if (req.method === "POST" && req.url === "/revoke") {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      res.statusCode = 404;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "not_found" }));
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    await new Promise((resolve) => server.close(() => resolve()));
    throw new Error("Unable to resolve provider stub address.");
  }
  return {
    server,
    requests,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

test("integration routes require session and expose catalog", async () => {
  const { registerIntegrationRoutes } = await import("../src/routes/integration-routes.js");
  const app = new Hono();
  const database = createDatabaseStub();
  registerIntegrationRoutes(app, { database });

  const catalog = await app.request("http://localhost/api/business/integrations/catalog");
  assert.equal(catalog.status, 200);
  const catalogPayload = await catalog.json();
  assert.equal(catalogPayload.ok, true);
  assert.equal(Array.isArray(catalogPayload.providers), true);
  assert.equal(catalogPayload.providers.some((entry) => entry.provider === "github"), true);

  const unauthorized = await app.request("http://localhost/api/business/integrations");
  assert.equal(unauthorized.status, 401);
});

test("integration connect/list/disconnect lifecycle persists by user", async () => {
  const { registerIntegrationRoutes } = await import("../src/routes/integration-routes.js");
  const app = new Hono();
  const database = createDatabaseStub();
  registerIntegrationRoutes(app, { database });

  const connectMissingCredential = await app.request(
    "http://localhost/api/business/integrations/github/connect",
    {
      method: "POST",
      headers: {
        cookie: "maple_session=session-1",
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    }
  );
  assert.equal(connectMissingCredential.status, 400);

  const connect = await app.request(
    "http://localhost/api/business/integrations/github/connect",
    {
      method: "POST",
      headers: {
        cookie: "maple_session=session-1",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        credential: "ghp_demo_123",
        scopes: ["repo:read", "issues:write"],
        externalAccountId: "octocat",
      }),
    }
  );
  assert.equal(connect.status, 201);
  const connectPayload = await connect.json();
  assert.equal(connectPayload.ok, true);
  assert.equal(connectPayload.integration.provider, "github");
  assert.equal(connectPayload.integration.connected, true);
  assert.equal(connectPayload.integration.authType, "oauth2");

  const listed = await app.request("http://localhost/api/business/integrations", {
    headers: {
      cookie: "maple_session=session-1",
    },
  });
  assert.equal(listed.status, 200);
  const listedPayload = await listed.json();
  assert.equal(listedPayload.ok, true);
  const github = listedPayload.items.find((entry) => entry.provider === "github");
  assert.equal(Boolean(github), true);
  assert.equal(github.connected, true);
  assert.deepEqual(github.scopes, ["repo:read", "issues:write"]);

  const disconnected = await app.request(
    "http://localhost/api/business/integrations/github/disconnect",
    {
      method: "POST",
      headers: {
        cookie: "maple_session=session-1",
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    }
  );
  assert.equal(disconnected.status, 200);
  const disconnectedPayload = await disconnected.json();
  assert.equal(disconnectedPayload.ok, true);
  assert.equal(disconnectedPayload.integration.connected, false);
  assert.equal(disconnectedPayload.integration.status, "disconnected");
});

test("integration oauth lifecycle (start -> callback -> refresh -> revoke) persists securely", async () => {
  const { registerIntegrationRoutes } = await import("../src/routes/integration-routes.js");
  const app = new Hono();
  const database = createDatabaseStub();
  const provider = await startOauthProviderStub();
  const envBackup = {
    MAPLE_INTEGRATION_OAUTH_STATE_SECRET:
      process.env.MAPLE_INTEGRATION_OAUTH_STATE_SECRET,
    MAPLE_INTEGRATION_OAUTH_ENCRYPTION_KEY:
      process.env.MAPLE_INTEGRATION_OAUTH_ENCRYPTION_KEY,
    MAPLE_INTEGRATION_OAUTH_REDIRECT_BASE_URL:
      process.env.MAPLE_INTEGRATION_OAUTH_REDIRECT_BASE_URL,
    MAPLE_GITHUB_OAUTH_CLIENT_ID: process.env.MAPLE_GITHUB_OAUTH_CLIENT_ID,
    MAPLE_GITHUB_OAUTH_CLIENT_SECRET:
      process.env.MAPLE_GITHUB_OAUTH_CLIENT_SECRET,
    MAPLE_GITHUB_OAUTH_AUTHORIZE_URL:
      process.env.MAPLE_GITHUB_OAUTH_AUTHORIZE_URL,
    MAPLE_GITHUB_OAUTH_TOKEN_URL: process.env.MAPLE_GITHUB_OAUTH_TOKEN_URL,
    MAPLE_GITHUB_OAUTH_USERINFO_URL:
      process.env.MAPLE_GITHUB_OAUTH_USERINFO_URL,
    MAPLE_GITHUB_OAUTH_REVOKE_URL: process.env.MAPLE_GITHUB_OAUTH_REVOKE_URL,
  };

  process.env.MAPLE_INTEGRATION_OAUTH_STATE_SECRET = "state-secret";
  process.env.MAPLE_INTEGRATION_OAUTH_ENCRYPTION_KEY =
    "integration-encryption-secret";
  process.env.MAPLE_INTEGRATION_OAUTH_REDIRECT_BASE_URL = "https://mayple.cloud";
  process.env.MAPLE_GITHUB_OAUTH_CLIENT_ID = "gh-client";
  process.env.MAPLE_GITHUB_OAUTH_CLIENT_SECRET = "gh-secret";
  process.env.MAPLE_GITHUB_OAUTH_AUTHORIZE_URL = `${provider.baseUrl}/authorize`;
  process.env.MAPLE_GITHUB_OAUTH_TOKEN_URL = `${provider.baseUrl}/token`;
  process.env.MAPLE_GITHUB_OAUTH_USERINFO_URL = `${provider.baseUrl}/userinfo`;
  process.env.MAPLE_GITHUB_OAUTH_REVOKE_URL = `${provider.baseUrl}/revoke`;

  registerIntegrationRoutes(app, { database });

  try {
    const start = await app.request(
      "http://localhost/api/business/integrations/github/oauth/start?returnTo=/journey",
      {
        headers: { cookie: "maple_session=session-1" },
      }
    );
    assert.equal(start.status, 200);
    const startPayload = await start.json();
    assert.equal(startPayload.ok, true);
    assert.equal(typeof startPayload.authorizationUrl, "string");
    assert.equal(startPayload.authorizationUrl.includes("state="), true);
    assert.equal(startPayload.redirectUri.includes("/api/integrations/github/oauth/callback"), true);

    const startUrl = new URL(startPayload.authorizationUrl);
    const state = startUrl.searchParams.get("state");
    assert.ok(state);

    const callback = await app.request(
      `http://localhost/api/business/integrations/github/oauth/callback?code=oauth-code-1&state=${encodeURIComponent(
        state
      )}&format=json`
    );
    assert.equal(callback.status, 200);
    const callbackPayload = await callback.json();
    assert.equal(callbackPayload.ok, true);
    assert.equal(callbackPayload.integration.connected, true);
    assert.equal(callbackPayload.integration.provider, "github");
    assert.equal(callbackPayload.integration.authType, "oauth2");
    assert.equal(callbackPayload.integration.metadata.oauth.hasRefreshToken, true);

    const refresh = await app.request(
      "http://localhost/api/business/integrations/github/oauth/refresh",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "maple_session=session-1",
        },
        body: JSON.stringify({}),
      }
    );
    assert.equal(refresh.status, 200);
    const refreshPayload = await refresh.json();
    assert.equal(refreshPayload.ok, true);
    assert.equal(refreshPayload.integration.connected, true);

    const revoke = await app.request(
      "http://localhost/api/business/integrations/github/oauth/revoke",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "maple_session=session-1",
        },
        body: JSON.stringify({}),
      }
    );
    assert.equal(revoke.status, 200);
    const revokePayload = await revoke.json();
    assert.equal(revokePayload.ok, true);
    assert.equal(revokePayload.integration.connected, false);

    assert.equal(
      provider.requests.some((entry) => entry.path === "/token"),
      true
    );
    assert.equal(
      provider.requests.some((entry) => entry.path === "/userinfo"),
      true
    );
    assert.equal(
      provider.requests.some((entry) => entry.path === "/revoke"),
      true
    );
  } finally {
    await new Promise((resolve) => provider.server.close(() => resolve()));
    for (const [key, value] of Object.entries(envBackup)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});
