import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import { Hono } from "hono";
import { registerAuthMeRoute } from "../src/routes/auth-routes-me.js";
import { registerAuthLoginRegisterRoutes } from "../src/routes/auth-routes-login-register.js";
import { registerAuthGoogleRoutes } from "../src/routes/auth-routes-google.js";
import { registerAuthLogoutRoute } from "../src/routes/auth-routes-logout.js";
import { registerAuthRecoveryRoutes } from "../src/routes/auth-routes-recovery.js";
import { registerBillingUserRoutes } from "../src/routes/billing-user-routes.js";
import { registerBillingSubscriptionRoutes } from "../src/routes/billing-subscription-routes.js";
import { registerBillingWebhookRoute } from "../src/routes/billing-webhook-route.js";
import { registerPlatformProxyRoutes } from "../src/routes/platform-proxy-routes.js";

function startBusinessApiStub() {
  const received = [];

  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => {
      chunks.push(chunk);
    });
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      received.push({
        method: req.method,
        path: req.url,
        body,
        headers: req.headers,
      });

      const ok = (payload, status = 200, headers = {}) => {
        res.statusCode = status;
        for (const [name, value] of Object.entries(headers)) {
          res.setHeader(name, value);
        }
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(payload));
      };

      if (req.method === "POST" && req.url === "/api/business/auth/login") {
        ok(
          { ok: true, authenticated: true, method: "session", via: "business-api" },
          200,
          { "set-cookie": "maple_session=proxied-login; Path=/; HttpOnly" }
        );
        return;
      }
      if (req.method === "POST" && req.url === "/api/business/auth/register") {
        ok(
          { ok: true, authenticated: true, method: "session", via: "business-api" },
          200,
          { "set-cookie": "maple_session=proxied-register; Path=/; HttpOnly" }
        );
        return;
      }
      if (req.method === "GET" && req.url === "/api/business/auth/me") {
        ok({ ok: true, authenticated: true, method: "api_key", via: "business-api" });
        return;
      }
      if (req.method === "POST" && req.url === "/api/business/auth/logout") {
        ok({ ok: true, via: "business-api" }, 200, {
          "set-cookie": "maple_session=; Path=/; HttpOnly; Max-Age=0",
        });
        return;
      }
      if (req.method === "GET" && req.url === "/api/business/auth/google/client-id") {
        ok({ clientId: "google-client", via: "business-api" });
        return;
      }
      if (req.method === "POST" && req.url === "/api/business/auth/google") {
        ok({ ok: true, authenticated: true, via: "business-api" }, 200, {
          "set-cookie": "maple_session=proxied-google; Path=/; HttpOnly",
        });
        return;
      }
      if (req.method === "POST" && req.url === "/api/business/auth/forgot-password") {
        ok({ ok: true, via: "business-api" });
        return;
      }
      if (req.method === "POST" && req.url === "/api/business/auth/reset-password") {
        ok({ ok: true, via: "business-api" });
        return;
      }
      if (req.method === "POST" && req.url === "/api/business/auth/verify-email/request") {
        ok({ ok: true, via: "business-api" });
        return;
      }
      if (req.method === "POST" && req.url === "/api/business/auth/verify-email/confirm") {
        ok({ ok: true, via: "business-api" });
        return;
      }
      if (req.method === "GET" && req.url === "/api/business/user/profile") {
        ok({ ok: true, user: { id: "u1" }, subscription: { plan: "free" }, via: "business-api" });
        return;
      }
      if (req.method === "POST" && req.url === "/api/business/user/change-password") {
        ok({ ok: true, via: "business-api" });
        return;
      }
      if (req.method === "GET" && req.url === "/api/business/billing/subscription") {
        ok({ ok: true, billingEnabled: true, subscription: { plan: "team" }, via: "business-api" });
        return;
      }
      if (req.method === "POST" && req.url === "/api/business/billing/create-checkout-session") {
        ok({ ok: true, url: "https://checkout.example/session", via: "business-api" });
        return;
      }
      if (req.method === "POST" && req.url === "/api/business/billing/portal-session") {
        ok({ ok: true, url: "https://billing.example/portal", via: "business-api" });
        return;
      }
      if (req.method === "GET" && req.url?.startsWith("/api/business/billing/invoices")) {
        ok({
          ok: true,
          items: [
            {
              id: "in_1",
              status: "paid",
              amount: 2900,
              currency: "usd",
              createdAt: "2026-02-25T00:00:00.000Z",
              hostedInvoiceUrl: "https://billing.example/in_1",
            },
          ],
          nextCursor: "",
          via: "business-api",
        });
        return;
      }
      if (req.method === "POST" && req.url === "/api/business/billing/subscription/cancel") {
        ok({
          ok: true,
          status: "active",
          cancelAtPeriodEnd: true,
          currentPeriodEnd: "2026-03-25T00:00:00.000Z",
          via: "business-api",
        });
        return;
      }
      if (req.method === "POST" && req.url === "/api/business/billing/subscription/resume") {
        ok({
          ok: true,
          status: "active",
          cancelAtPeriodEnd: false,
          currentPeriodEnd: "2026-03-25T00:00:00.000Z",
          via: "business-api",
        });
        return;
      }
      if (req.method === "POST" && req.url === "/api/business/billing/webhook") {
        ok({ received: true, via: "business-api" });
        return;
      }
      if (req.method === "GET" && req.url === "/api/business/org") {
        ok({
          ok: true,
          items: [{ orgId: "org-1", name: "Maple Org", membersCount: 1 }],
          via: "business-api",
        });
        return;
      }
      if (req.method === "POST" && req.url === "/api/business/org") {
        ok({ ok: true, org: { orgId: "org-1", name: "Maple Org" }, via: "business-api" }, 201);
        return;
      }
      if (req.method === "PATCH" && req.url === "/api/business/org/org-1") {
        ok({ ok: true, org: { orgId: "org-1", name: "Maple Org v2" }, via: "business-api" });
        return;
      }
      if (req.method === "GET" && req.url === "/api/business/org/org-1/members") {
        ok({ ok: true, items: [{ userId: "user-1", roleId: "owner" }], via: "business-api" });
        return;
      }
      if (req.method === "POST" && req.url === "/api/business/org/org-1/invites") {
        ok({ ok: true, invite: { inviteId: "invite-1" }, via: "business-api" }, 201);
        return;
      }
      if (req.method === "POST" && req.url === "/api/business/org/invites/invite-1/accept") {
        ok({ ok: true, invite: { inviteId: "invite-1", accepted: true }, via: "business-api" });
        return;
      }
      if (req.method === "DELETE" && req.url === "/api/business/org/org-1/members/user-2") {
        ok({ ok: true, removedUserId: "user-2", via: "business-api" });
        return;
      }
      if (req.method === "GET" && req.url === "/api/business/org/org-1/roles") {
        ok({ ok: true, items: [{ roleId: "owner" }, { roleId: "member" }], via: "business-api" });
        return;
      }
      if (req.method === "POST" && req.url === "/api/business/org/org-1/roles/member/assign") {
        ok({ ok: true, roleId: "member", userId: "user-2", via: "business-api" });
        return;
      }
      if (req.method === "GET" && req.url === "/api/business/user/api-keys") {
        ok({ ok: true, items: [{ keyId: "key-1" }], via: "business-api" });
        return;
      }
      if (req.method === "POST" && req.url === "/api/business/user/api-keys") {
        ok({ ok: true, key: { keyId: "key-2" }, via: "business-api" }, 201);
        return;
      }
      if (req.method === "DELETE" && req.url === "/api/business/user/api-keys/key-2") {
        ok({ ok: true, keyId: "key-2", via: "business-api" });
        return;
      }
      if (req.method === "GET" && req.url === "/api/business/org/org-1/service-accounts") {
        ok({ ok: true, items: [{ accountId: "svc-1" }], via: "business-api" });
        return;
      }
      if (req.method === "POST" && req.url === "/api/business/org/org-1/service-accounts") {
        ok({ ok: true, account: { accountId: "svc-2" }, via: "business-api" }, 201);
        return;
      }
      if (req.method === "POST" && req.url === "/api/business/org/org-1/service-accounts/svc-2/keys") {
        ok({ ok: true, key: { keyId: "svc-key-1" }, via: "business-api" }, 201);
        return;
      }
      if (
        req.method === "DELETE" &&
        req.url === "/api/business/org/org-1/service-accounts/svc-2/keys/svc-key-1"
      ) {
        ok({ ok: true, keyId: "svc-key-1", via: "business-api" });
        return;
      }
      if (req.method === "GET" && req.url === "/api/business/entitlements") {
        ok({ ok: true, plan: "team", features: ["tool-governance"], via: "business-api" });
        return;
      }
      if (req.method === "GET" && req.url === "/api/business/usage/summary") {
        ok({ ok: true, summary: { runs: 12 }, via: "business-api" });
        return;
      }
      if (req.method === "GET" && req.url?.startsWith("/api/business/usage/timeseries")) {
        ok({ ok: true, points: [{ day: "2026-02-25", runs: 2 }], via: "business-api" });
        return;
      }
      if (req.method === "GET" && req.url === "/api/business/limits") {
        ok({ ok: true, limits: { maxRunsPerDay: 100 }, via: "business-api" });
        return;
      }
      if (req.method === "POST" && req.url === "/api/business/limits/override") {
        ok({ ok: true, limits: { maxRunsPerDay: 250 }, via: "business-api" });
        return;
      }

      ok({ error: "Unhandled route", method: req.method, path: req.url }, 404);
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to resolve stub server address"));
        return;
      }
      resolve({
        server,
        received,
        baseUrl: `http://127.0.0.1:${address.port}`,
      });
    });
  });
}

test("gateway auth/user/billing routes proxy to business-api endpoints", async () => {
  const previousBaseUrl = process.env.MAPLE_BUSINESS_API_BASE_URL;
  const previousRequired = process.env.MAPLE_BUSINESS_API_REQUIRED;

  const { server, received, baseUrl } = await startBusinessApiStub();
  process.env.MAPLE_BUSINESS_API_BASE_URL = baseUrl;
  process.env.MAPLE_BUSINESS_API_REQUIRED = "true";

  const app = new Hono();
  registerAuthMeRoute(app);
  registerAuthLoginRegisterRoutes(app);
  registerAuthGoogleRoutes(app);
  registerAuthLogoutRoute(app);
  registerAuthRecoveryRoutes(app);
  registerBillingUserRoutes(app);
  registerBillingSubscriptionRoutes(app);
  registerBillingWebhookRoute(app);
  registerPlatformProxyRoutes(app);

  try {
    const login = await app.request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "maple", password: "password" }),
    });
    assert.equal(login.status, 200);
    assert.equal(login.headers.get("set-cookie")?.includes("proxied-login"), true);

    const register = await app.request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "new", password: "password123" }),
    });
    assert.equal(register.status, 200);

    const me = await app.request("http://localhost/api/auth/me", {
      headers: { "x-api-key": "demo" },
    });
    assert.equal(me.status, 200);

    const logout = await app.request("http://localhost/api/auth/logout", {
      method: "POST",
      headers: { cookie: "maple_session=s1" },
    });
    assert.equal(logout.status, 200);
    assert.equal(logout.headers.get("set-cookie")?.includes("Max-Age=0"), true);

    const googleClient = await app.request("http://localhost/api/auth/google/client-id");
    assert.equal(googleClient.status, 200);

    const googleLogin = await app.request("http://localhost/api/auth/google", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ credential: "token" }),
    });
    assert.equal(googleLogin.status, 200);

    const forgotPassword = await app.request(
      "http://localhost/api/auth/forgot-password",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "maple@example.com",
          redirectUrl: "https://app.example.com/reset",
        }),
      }
    );
    assert.equal(forgotPassword.status, 200);

    const forgotPasswordAlias = await app.request(
      "http://localhost/api/auth/password-reset",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "maple@example.com",
          redirectUrl: "https://app.example.com/reset",
        }),
      }
    );
    assert.equal(forgotPasswordAlias.status, 200);

    const resetPassword = await app.request("http://localhost/api/auth/reset-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token: "x".repeat(32),
        newPassword: "new-password-123",
      }),
    });
    assert.equal(resetPassword.status, 200);

    const verifyRequest = await app.request("http://localhost/api/auth/verify-email/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "maple@example.com" }),
    });
    assert.equal(verifyRequest.status, 200);

    const verifyConfirm = await app.request("http://localhost/api/auth/verify-email/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "x".repeat(32) }),
    });
    assert.equal(verifyConfirm.status, 200);

    const profile = await app.request("http://localhost/api/user/profile", {
      headers: { cookie: "maple_session=s1" },
    });
    assert.equal(profile.status, 200);
    const profilePayload = await profile.json();
    assert.equal(profilePayload.via, "business-api");

    const changePassword = await app.request("http://localhost/api/user/change-password", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "maple_session=s1",
      },
      body: JSON.stringify({
        currentPassword: "old",
        newPassword: "new-password-123",
      }),
    });
    assert.equal(changePassword.status, 200);

    const changePasswordAlias = await app.request("http://localhost/api/auth/change-password", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "maple_session=s1",
      },
      body: JSON.stringify({
        currentPassword: "old",
        newPassword: "new-password-123",
      }),
    });
    assert.equal(changePasswordAlias.status, 200);

    const subscription = await app.request("http://localhost/api/billing/subscription", {
      headers: { cookie: "maple_session=s1" },
    });
    assert.equal(subscription.status, 200);

    const checkout = await app.request("http://localhost/api/billing/create-checkout-session", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "maple_session=s1",
      },
      body: JSON.stringify({ plan: "team" }),
    });
    assert.equal(checkout.status, 200);

    const portal = await app.request("http://localhost/api/billing/portal-session", {
      method: "POST",
      headers: { cookie: "maple_session=s1" },
    });
    assert.equal(portal.status, 200);

    const invoices = await app.request("http://localhost/api/billing/invoices?limit=20", {
      headers: { cookie: "maple_session=s1" },
    });
    assert.equal(invoices.status, 200);
    const invoicesPayload = await invoices.json();
    assert.equal(invoicesPayload.ok, true);
    assert.equal(Array.isArray(invoicesPayload.items), true);

    const cancelSubscription = await app.request(
      "http://localhost/api/billing/subscription/cancel",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "maple_session=s1",
        },
        body: JSON.stringify({ atPeriodEnd: true }),
      }
    );
    assert.equal(cancelSubscription.status, 200);

    const resumeSubscription = await app.request(
      "http://localhost/api/billing/subscription/resume",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "maple_session=s1",
        },
        body: JSON.stringify({}),
      }
    );
    assert.equal(resumeSubscription.status, 200);

    const orgs = await app.request("http://localhost/api/org", {
      headers: {
        cookie: "maple_session=s1",
        "x-tenant-id": "tenant-dev",
        "x-user-id": "user-42",
        "x-device-id": "device-42",
        "x-maple-session-id": "session-42",
        "x-trace-id": "trace-42",
      },
    });
    assert.equal(orgs.status, 200);
    const orgsPayload = await orgs.json();
    assert.equal(orgsPayload.ok, true);
    assert.equal(Array.isArray(orgsPayload.items), true);

    const createOrg = await app.request("http://localhost/api/org", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "maple_session=s1",
      },
      body: JSON.stringify({ name: "Maple Org" }),
    });
    assert.equal(createOrg.status, 201);

    const patchOrg = await app.request("http://localhost/api/org/org-1", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        cookie: "maple_session=s1",
      },
      body: JSON.stringify({ name: "Maple Org v2" }),
    });
    assert.equal(patchOrg.status, 200);

    assert.equal(
      (await app.request("http://localhost/api/org/org-1/members", { headers: { cookie: "maple_session=s1" } }))
        .status,
      200
    );
    assert.equal(
      (
        await app.request("http://localhost/api/org/org-1/invites", {
          method: "POST",
          headers: { "content-type": "application/json", cookie: "maple_session=s1" },
          body: JSON.stringify({ email: "member@example.com", roleId: "member" }),
        })
      ).status,
      201
    );
    assert.equal(
      (
        await app.request("http://localhost/api/org/invites/invite-1/accept", {
          method: "POST",
          headers: { "content-type": "application/json", cookie: "maple_session=s1" },
          body: JSON.stringify({}),
        })
      ).status,
      200
    );
    assert.equal(
      (
        await app.request("http://localhost/api/org/org-1/members/user-2", {
          method: "DELETE",
          headers: { cookie: "maple_session=s1" },
        })
      ).status,
      200
    );
    assert.equal(
      (await app.request("http://localhost/api/org/org-1/roles", { headers: { cookie: "maple_session=s1" } }))
        .status,
      200
    );
    assert.equal(
      (
        await app.request("http://localhost/api/org/org-1/roles/member/assign", {
          method: "POST",
          headers: { "content-type": "application/json", cookie: "maple_session=s1" },
          body: JSON.stringify({ userId: "user-2" }),
        })
      ).status,
      200
    );
    assert.equal(
      (await app.request("http://localhost/api/user/api-keys", { headers: { cookie: "maple_session=s1" } }))
        .status,
      200
    );
    assert.equal(
      (
        await app.request("http://localhost/api/user/api-keys", {
          method: "POST",
          headers: { "content-type": "application/json", cookie: "maple_session=s1" },
          body: JSON.stringify({ name: "automation" }),
        })
      ).status,
      201
    );
    assert.equal(
      (
        await app.request("http://localhost/api/user/api-keys/key-2", {
          method: "DELETE",
          headers: { cookie: "maple_session=s1" },
        })
      ).status,
      200
    );
    assert.equal(
      (
        await app.request("http://localhost/api/org/org-1/service-accounts", {
          headers: { cookie: "maple_session=s1" },
        })
      ).status,
      200
    );
    assert.equal(
      (
        await app.request("http://localhost/api/org/org-1/service-accounts", {
          method: "POST",
          headers: { "content-type": "application/json", cookie: "maple_session=s1" },
          body: JSON.stringify({ name: "bot-account" }),
        })
      ).status,
      201
    );
    assert.equal(
      (
        await app.request("http://localhost/api/org/org-1/service-accounts/svc-2/keys", {
          method: "POST",
          headers: { "content-type": "application/json", cookie: "maple_session=s1" },
          body: JSON.stringify({}),
        })
      ).status,
      201
    );
    assert.equal(
      (
        await app.request("http://localhost/api/org/org-1/service-accounts/svc-2/keys/svc-key-1", {
          method: "DELETE",
          headers: { cookie: "maple_session=s1" },
        })
      ).status,
      200
    );
    assert.equal(
      (await app.request("http://localhost/api/entitlements", { headers: { cookie: "maple_session=s1" } }))
        .status,
      200
    );
    assert.equal(
      (await app.request("http://localhost/api/usage/summary", { headers: { cookie: "maple_session=s1" } }))
        .status,
      200
    );
    assert.equal(
      (
        await app.request("http://localhost/api/usage/timeseries?days=7", {
          headers: { cookie: "maple_session=s1" },
        })
      ).status,
      200
    );
    assert.equal(
      (await app.request("http://localhost/api/limits", { headers: { cookie: "maple_session=s1" } }))
        .status,
      200
    );
    assert.equal(
      (
        await app.request("http://localhost/api/limits/override", {
          method: "POST",
          headers: { "content-type": "application/json", cookie: "maple_session=s1" },
          body: JSON.stringify({ maxRunsPerDay: 250 }),
        })
      ).status,
      200
    );

    const webhookBody = JSON.stringify({ event: "stripe" });
    const webhook = await app.request("http://localhost/api/billing/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": "t=1,v1=abc",
      },
      body: webhookBody,
    });
    assert.equal(webhook.status, 200);

    const proxiedWebhook = received.find(
      (entry) => entry.path === "/api/business/billing/webhook"
    );
    assert.equal(Boolean(proxiedWebhook), true);
    assert.equal(proxiedWebhook.body, webhookBody);
    assert.equal(proxiedWebhook.headers["stripe-signature"], "t=1,v1=abc");

    const proxiedInvoices = received.find(
      (entry) => entry.path === "/api/business/billing/invoices?limit=20"
    );
    assert.equal(Boolean(proxiedInvoices), true);

    const proxiedForgotPassword = received.find(
      (entry) => entry.path === "/api/business/auth/forgot-password"
    );
    assert.equal(Boolean(proxiedForgotPassword), true);
    assert.equal(proxiedForgotPassword.method, "POST");

    const proxiedOrgList = received.find((entry) => entry.path === "/api/business/org");
    assert.equal(Boolean(proxiedOrgList), true);
    assert.equal(proxiedOrgList.headers["x-maple-tenant-id"], "tenant-dev");
    assert.equal(proxiedOrgList.headers["x-maple-user-id"], "user-42");
    assert.equal(proxiedOrgList.headers["x-maple-device-id"], "device-42");
    assert.equal(proxiedOrgList.headers["x-maple-session-id"], "session-42");
    assert.equal(proxiedOrgList.headers["x-trace-id"], "trace-42");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (previousBaseUrl === undefined) {
      delete process.env.MAPLE_BUSINESS_API_BASE_URL;
    } else {
      process.env.MAPLE_BUSINESS_API_BASE_URL = previousBaseUrl;
    }
    if (previousRequired === undefined) {
      delete process.env.MAPLE_BUSINESS_API_REQUIRED;
    } else {
      process.env.MAPLE_BUSINESS_API_REQUIRED = previousRequired;
    }
  }
});

test("gateway returns 503 when business-api is required but unavailable", async () => {
  const previousBaseUrl = process.env.MAPLE_BUSINESS_API_BASE_URL;
  const previousRequired = process.env.MAPLE_BUSINESS_API_REQUIRED;
  process.env.MAPLE_BUSINESS_API_BASE_URL = "http://127.0.0.1:9";
  process.env.MAPLE_BUSINESS_API_REQUIRED = "true";

  const app = new Hono();
  registerBillingUserRoutes(app);
  registerAuthRecoveryRoutes(app);

  try {
    const response = await app.request("http://localhost/api/user/profile", {
      headers: { cookie: "maple_session=s1" },
    });
    assert.equal(response.status, 503);
    const payload = await response.json();
    assert.equal(payload.error, "Business API unavailable");

    const forgotResponse = await app.request("http://localhost/api/auth/forgot-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "maple@example.com",
        redirectUrl: "https://app.example.com/reset",
      }),
    });
    assert.equal(forgotResponse.status, 503);
  } finally {
    if (previousBaseUrl === undefined) {
      delete process.env.MAPLE_BUSINESS_API_BASE_URL;
    } else {
      process.env.MAPLE_BUSINESS_API_BASE_URL = previousBaseUrl;
    }
    if (previousRequired === undefined) {
      delete process.env.MAPLE_BUSINESS_API_REQUIRED;
    } else {
      process.env.MAPLE_BUSINESS_API_REQUIRED = previousRequired;
    }
  }
});
