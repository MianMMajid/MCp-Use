import assert from "node:assert/strict";
import test from "node:test";

import { Hono } from "hono";
import { registerBillingRoutes } from "../src/routes/billing-routes.js";

function createDatabaseStub(options = {}) {
  const state = {
    subscription: options.subscription,
    upserts: [],
  };

  return {
    state,
    async findActiveSession(sessionId) {
      if (sessionId !== "session-123") {
        return undefined;
      }
      return {
        id: sessionId,
        user: { id: "user-1", username: "maple", email: "maple@example.com" },
      };
    },
    async ensureFreeSubscription(userId) {
      if (!state.subscription) {
        state.subscription = {
          id: "sub-local",
          userId,
          stripeCustomerId: null,
          stripeSubscriptionId: null,
          plan: "free",
          status: "active",
          currentPeriodEnd: null,
        };
      }
      return state.subscription;
    },
    async findSubscriptionByUserId(userId) {
      if (!state.subscription || state.subscription.userId !== userId) {
        return undefined;
      }
      return state.subscription;
    },
    async findSubscriptionByStripeCustomerId(customerId) {
      if (!state.subscription || state.subscription.stripeCustomerId !== customerId) {
        return undefined;
      }
      return state.subscription;
    },
    async upsertSubscription(input) {
      state.upserts.push(input);
      state.subscription = {
        id: state.subscription?.id ?? "sub-upserted",
        userId: input.userId,
        stripeCustomerId:
          input.stripeCustomerId ?? state.subscription?.stripeCustomerId ?? null,
        stripeSubscriptionId:
          input.stripeSubscriptionId ?? state.subscription?.stripeSubscriptionId ?? null,
        plan: input.plan ?? state.subscription?.plan ?? "free",
        status: input.status ?? state.subscription?.status ?? "active",
        currentPeriodEnd:
          input.currentPeriodEnd ?? state.subscription?.currentPeriodEnd ?? null,
      };
      return state.subscription;
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

test("billing routes simulate lifecycle when stripe client is not configured", async () => {
  const previousBillingSimulation = process.env.MAPLE_BILLING_SIMULATION;
  process.env.MAPLE_BILLING_SIMULATION = "1";
  const app = new Hono();
  registerBillingRoutes(app, {
    database: createDatabaseStub(),
    billingEnabled: false,
    stripeWebhookSecret: "",
    stripeClient: null,
  });

  try {
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
    assert.equal(checkout.status, 200);
    const checkoutPayload = await checkout.json();
    assert.equal(checkoutPayload.ok, true);
    assert.equal(checkoutPayload.simulated, true);

    const portal = await app.request(
      "http://localhost/api/business/billing/portal-session",
      {
        method: "POST",
        headers: {
          cookie: "maple_session=session-123",
        },
      }
    );
    assert.equal(portal.status, 200);
    const portalPayload = await portal.json();
    assert.equal(portalPayload.ok, true);
    assert.equal(portalPayload.simulated, true);

    const invoices = await app.request("http://localhost/api/business/billing/invoices", {
      headers: { cookie: "maple_session=session-123" },
    });
    assert.equal(invoices.status, 200);
    const invoicesPayload = await invoices.json();
    assert.equal(invoicesPayload.ok, true);
    assert.equal(invoicesPayload.simulated, true);
    assert.equal(Array.isArray(invoicesPayload.items), true);

    const cancel = await app.request(
      "http://localhost/api/business/billing/subscription/cancel",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "maple_session=session-123",
        },
        body: JSON.stringify({ atPeriodEnd: true }),
      }
    );
    assert.equal(cancel.status, 200);
    const cancelPayload = await cancel.json();
    assert.equal(cancelPayload.ok, true);
    assert.equal(cancelPayload.simulated, true);
    assert.equal(cancelPayload.cancelAtPeriodEnd, true);

    const resume = await app.request(
      "http://localhost/api/business/billing/subscription/resume",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "maple_session=session-123",
        },
        body: JSON.stringify({}),
      }
    );
    assert.equal(resume.status, 200);
    const resumePayload = await resume.json();
    assert.equal(resumePayload.ok, true);
    assert.equal(resumePayload.simulated, true);
    assert.equal(resumePayload.cancelAtPeriodEnd, false);
  } finally {
    if (previousBillingSimulation === undefined) {
      delete process.env.MAPLE_BILLING_SIMULATION;
    } else {
      process.env.MAPLE_BILLING_SIMULATION = previousBillingSimulation;
    }
  }
});

test("billing invoices route returns normalized invoice payload with cursor", async () => {
  const app = new Hono();
  const database = createDatabaseStub({
    subscription: {
      id: "sub-1",
      userId: "user-1",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      plan: "team",
      status: "active",
      currentPeriodEnd: null,
    },
  });
  const stripeClient = {
    invoices: {
      async list(input) {
        assert.equal(input.customer, "cus_1");
        assert.equal(input.limit, 1);
        assert.equal(input.starting_after, "in_prev");
        return {
          data: [
            {
              id: "in_1",
              status: "paid",
              total: 2900,
              currency: "usd",
              created: 1_700_000_000,
              hosted_invoice_url: "https://billing.example/in_1",
            },
          ],
          has_more: true,
        };
      },
    },
  };

  registerBillingRoutes(app, {
    database,
    billingEnabled: true,
    stripeClient,
  });

  const response = await app.request(
    "http://localhost/api/business/billing/invoices?limit=1&cursor=in_prev",
    {
      headers: { cookie: "maple_session=session-123" },
    }
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.items.length, 1);
  assert.equal(payload.items[0].id, "in_1");
  assert.equal(payload.items[0].amount, 2900);
  assert.equal(payload.nextCursor, "in_1");
});

test("billing subscription cancel/resume routes update status through stripe client", async () => {
  const app = new Hono();
  const database = createDatabaseStub({
    subscription: {
      id: "sub-1",
      userId: "user-1",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      plan: "team",
      status: "active",
      currentPeriodEnd: null,
    },
  });
  const stripeClient = {
    subscriptions: {
      async update(id, input) {
        assert.equal(id, "sub_1");
        if (input.cancel_at_period_end === true) {
          return {
            id,
            status: "active",
            cancel_at_period_end: true,
            current_period_end: 1_700_000_000,
          };
        }
        return {
          id,
          status: "active",
          cancel_at_period_end: false,
          current_period_end: 1_700_000_000,
        };
      },
      async cancel(id) {
        assert.equal(id, "sub_1");
        return {
          id,
          status: "canceled",
          cancel_at_period_end: false,
          current_period_end: 1_700_000_000,
        };
      },
    },
  };

  registerBillingRoutes(app, {
    database,
    billingEnabled: true,
    stripeClient,
  });

  const cancel = await app.request(
    "http://localhost/api/business/billing/subscription/cancel",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "maple_session=session-123",
      },
      body: JSON.stringify({ atPeriodEnd: true }),
    }
  );
  assert.equal(cancel.status, 200);
  const cancelPayload = await cancel.json();
  assert.equal(cancelPayload.ok, true);
  assert.equal(cancelPayload.cancelAtPeriodEnd, true);

  const resume = await app.request(
    "http://localhost/api/business/billing/subscription/resume",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "maple_session=session-123",
      },
      body: JSON.stringify({}),
    }
  );
  assert.equal(resume.status, 200);
  const resumePayload = await resume.json();
  assert.equal(resumePayload.ok, true);
  assert.equal(resumePayload.cancelAtPeriodEnd, false);
  assert.equal(database.state.upserts.length >= 2, true);
});

test("billing webhook route accepts events in simulation mode when webhook integration is not configured", async () => {
  const previousBillingSimulation = process.env.MAPLE_BILLING_SIMULATION;
  process.env.MAPLE_BILLING_SIMULATION = "1";
  const app = new Hono();
  registerBillingRoutes(app, {
    database: createDatabaseStub(),
    billingEnabled: false,
    stripeWebhookSecret: "",
    stripeClient: null,
  });

  try {
    const webhook = await app.request("http://localhost/api/business/billing/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    });
    assert.equal(webhook.status, 200);
    const payload = await webhook.json();
    assert.equal(payload.received, true);
    assert.equal(payload.simulated, true);
  } finally {
    if (previousBillingSimulation === undefined) {
      delete process.env.MAPLE_BILLING_SIMULATION;
    } else {
      process.env.MAPLE_BILLING_SIMULATION = previousBillingSimulation;
    }
  }
});

test("billing simulation is fail-closed in production", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousBillingSimulation = process.env.MAPLE_BILLING_SIMULATION;
  process.env.NODE_ENV = "production";
  process.env.MAPLE_BILLING_SIMULATION = "1";

  const app = new Hono();
  registerBillingRoutes(app, {
    database: createDatabaseStub(),
    billingEnabled: false,
    stripeWebhookSecret: "",
    stripeClient: null,
  });

  try {
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
    assert.equal(checkout.status, 503);
    const payload = await checkout.json();
    assert.equal(payload.error, "Billing provider unavailable.");
  } finally {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
    if (previousBillingSimulation === undefined) {
      delete process.env.MAPLE_BILLING_SIMULATION;
    } else {
      process.env.MAPLE_BILLING_SIMULATION = previousBillingSimulation;
    }
  }
});
