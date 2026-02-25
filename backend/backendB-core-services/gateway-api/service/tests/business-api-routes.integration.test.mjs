import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import { Hono } from "hono";
import { registerAuthMeRoute } from "../src/routes/auth-routes-me.js";
import { registerAuthLoginRegisterRoutes } from "../src/routes/auth-routes-login-register.js";
import { registerAuthGoogleRoutes } from "../src/routes/auth-routes-google.js";
import { registerAuthLogoutRoute } from "../src/routes/auth-routes-logout.js";
import { registerBillingUserRoutes } from "../src/routes/billing-user-routes.js";
import { registerBillingSubscriptionRoutes } from "../src/routes/billing-subscription-routes.js";
import { registerBillingWebhookRoute } from "../src/routes/billing-webhook-route.js";

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
      if (req.method === "POST" && req.url === "/api/business/billing/webhook") {
        ok({ received: true, via: "business-api" });
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
  registerBillingUserRoutes(app);
  registerBillingSubscriptionRoutes(app);
  registerBillingWebhookRoute(app);

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

  try {
    const response = await app.request("http://localhost/api/user/profile", {
      headers: { cookie: "maple_session=s1" },
    });
    assert.equal(response.status, 503);
    const payload = await response.json();
    assert.equal(payload.error, "Business API unavailable");
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
