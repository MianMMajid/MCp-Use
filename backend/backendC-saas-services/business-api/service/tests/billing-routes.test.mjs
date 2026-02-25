import assert from "node:assert/strict";
import test from "node:test";

import { Hono } from "hono";
import { registerBillingRoutes } from "../src/routes/billing-routes.js";

function createDatabaseStub() {
  return {
    async findActiveSession(sessionId) {
      if (sessionId !== "session-123") {
        return undefined;
      }
      return {
        id: sessionId,
        user: { id: "user-1", username: "maple", email: "maple@example.com" },
      };
    },
    async ensureFreeSubscription() {
      return {
        plan: "free",
        status: "active",
        currentPeriodEnd: null,
      };
    },
    async findSubscriptionByUserId() {
      return undefined;
    },
    async findSubscriptionByStripeCustomerId() {
      return undefined;
    },
    async upsertSubscription() {
      return {};
    },
  };
}

test("billing subscription route enforces auth and returns subscription status", async () => {
  const app = new Hono();
  registerBillingRoutes(app, {
    database: createDatabaseStub(),
    billingEnabled: true,
  });

  const unauthenticated = await app.request(
    "http://localhost/api/business/billing/subscription"
  );
  assert.equal(unauthenticated.status, 401);

  const authenticated = await app.request(
    "http://localhost/api/business/billing/subscription",
    {
      headers: {
        cookie: "maple_session=session-123",
      },
    }
  );

  assert.equal(authenticated.status, 200);
  const payload = await authenticated.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.billingEnabled, true);
  assert.equal(payload.subscription.plan, "free");
});

test("billing checkout/portal routes return 501 when stripe is not configured", async () => {
  const app = new Hono();
  registerBillingRoutes(app, {
    database: createDatabaseStub(),
    billingEnabled: false,
    stripeWebhookSecret: "",
  });

  const checkout = await app.request(
    "http://localhost/api/business/billing/create-checkout-session",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "maple_session=session-123",
      },
      body: JSON.stringify({ plan: "pro" }),
    }
  );
  assert.equal(checkout.status, 501);

  const portal = await app.request(
    "http://localhost/api/business/billing/portal-session",
    {
      method: "POST",
      headers: {
        cookie: "maple_session=session-123",
      },
    }
  );
  assert.equal(portal.status, 501);
});

test("billing webhook route returns 501 when webhook integration is not configured", async () => {
  const app = new Hono();
  registerBillingRoutes(app, {
    database: createDatabaseStub(),
    billingEnabled: false,
    stripeWebhookSecret: "",
  });

  const webhook = await app.request("http://localhost/api/business/billing/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({}),
  });
  assert.equal(webhook.status, 501);
});
