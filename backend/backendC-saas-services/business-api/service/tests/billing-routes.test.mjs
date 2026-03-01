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
  const { registerBillingRoutes } = await import("../src/routes/billing-routes.js");
  const app = new Hono();
  registerBillingRoutes(app, {
    database: createDatabaseStub(),
    billingEnabled: true,
    stripeClient: {},
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

test("billing routes fail closed when stripe client is not configured", async () => {
  const { registerBillingRoutes } = await import("../src/routes/billing-routes.js");
  const app = new Hono();
  registerBillingRoutes(app, {
    database: createDatabaseStub(),
    billingEnabled: false,
    stripeWebhookSecret: "",
    stripeClient: false,
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
  assert.equal(checkout.status, 503);
  assert.equal((await checkout.json()).error, "Billing provider unavailable.");

  const portal = await app.request(
    "http://localhost/api/business/billing/portal-session",
    {
      method: "POST",
      headers: {
        cookie: "maple_session=session-123",
      },
    }
  );
  assert.equal(portal.status, 503);
  assert.equal((await portal.json()).error, "Billing provider unavailable.");

  const invoices = await app.request("http://localhost/api/business/billing/invoices", {
    headers: { cookie: "maple_session=session-123" },
  });
  assert.equal(invoices.status, 503);
  assert.equal((await invoices.json()).error, "Billing provider unavailable.");

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
  assert.equal(cancel.status, 503);
  assert.equal((await cancel.json()).error, "Billing provider unavailable.");

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
  assert.equal(resume.status, 503);
  assert.equal((await resume.json()).error, "Billing provider unavailable.");
});

test("billing invoices route returns normalized invoice payload with cursor", async () => {
  const { registerBillingRoutes } = await import("../src/routes/billing-routes.js");
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
  const { registerBillingRoutes } = await import("../src/routes/billing-routes.js");
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

test("billing webhook route fails closed when webhook integration is not configured", async () => {
  const { registerBillingRoutes } = await import("../src/routes/billing-routes.js");
  const app = new Hono();
  registerBillingRoutes(app, {
    database: createDatabaseStub(),
    billingEnabled: false,
    stripeWebhookSecret: "",
    stripeClient: false,
  });

  const webhook = await app.request("http://localhost/api/business/billing/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({}),
  });
  assert.equal(webhook.status, 503);
  const payload = await webhook.json();
  assert.equal(payload.error, "Webhook provider unavailable.");
});
