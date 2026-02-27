import { asString, readJsonBody } from "@maple/common";
import {
  STRIPE_PLAN_PRICE_IDS,
  STRIPE_PRICE_TO_PLAN,
} from "../config.js";
import { findRequestSession } from "../auth-session.js";
import { billingBaseUrl, stripe } from "./billing-stripe.js";

function parseLimit(rawValue) {
  const parsed = Number.parseInt(String(rawValue ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return 20;
  }
  return Math.max(1, Math.min(parsed, 100));
}

function parseAtPeriodEnd(value) {
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }
  return true;
}

function toIsoFromUnixSeconds(value) {
  if (!Number.isFinite(value)) {
    return null;
  }
  return new Date(Number(value) * 1000).toISOString();
}

export function registerBillingRoutes(app, options) {
  const database = options.database;
  const stripeClient = options.stripeClient ?? stripe;
  const billingEnabled = Boolean(options.billingEnabled) && Boolean(stripeClient);

  app.get("/api/business/billing/subscription", async (c) => {
    const session = await findRequestSession(database, c.req.header("cookie"));
    if (!session) {
      return c.json({ error: "Authentication required." }, 401);
    }

    const subscription = await database.ensureFreeSubscription(session.user.id);
    return c.json({
      ok: true,
      billingEnabled,
      billingMode: stripeClient ? "stripe" : "disabled",
      subscription: {
        plan: subscription.plan,
        status: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd,
      },
    });
  });

  app.post("/api/business/billing/create-checkout-session", async (c) => {
    const session = await findRequestSession(database, c.req.header("cookie"));
    if (!session) {
      return c.json({ error: "Authentication required." }, 401);
    }

    const body = await readJsonBody(c);
    const plan = asString(body.plan);
    if (!plan || !Object.prototype.hasOwnProperty.call(STRIPE_PLAN_PRICE_IDS, plan)) {
      return c.json({ error: "Invalid plan." }, 400);
    }

    if (!stripeClient) {
      return c.json({ error: "Billing provider unavailable." }, 503);
    }

    const sub = await database.ensureFreeSubscription(session.user.id);
    const priceId = STRIPE_PLAN_PRICE_IDS[plan];
    if (!priceId) {
      return c.json({ error: "Price not configured for this plan." }, 503);
    }

    let customerId = sub.stripeCustomerId;
    if (!customerId) {
      const customer = await stripeClient.customers.create({
        metadata: { mapleUserId: session.user.id },
        email: session.user.email || undefined,
      });
      customerId = customer.id;
      await database.upsertSubscription({
        userId: session.user.id,
        stripeCustomerId: customerId,
        plan: sub.plan,
        status: sub.status,
      });
    }

    const checkoutSession = await stripeClient.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${billingBaseUrl()}/?billing=success`,
      cancel_url: `${billingBaseUrl()}/?billing=cancel`,
      metadata: { mapleUserId: session.user.id, maplePlan: plan },
    });
    return c.json({ ok: true, url: checkoutSession.url });
  });

  app.post("/api/business/billing/portal-session", async (c) => {
    const session = await findRequestSession(database, c.req.header("cookie"));
    if (!session) {
      return c.json({ error: "Authentication required." }, 401);
    }

    if (!stripeClient) {
      return c.json({ error: "Billing provider unavailable." }, 503);
    }

    const sub = await database.findSubscriptionByUserId(session.user.id);
    if (!sub?.stripeCustomerId) {
      return c.json({ error: "No billing account found." }, 404);
    }

    const portalSession = await stripeClient.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${billingBaseUrl()}/`,
    });
    return c.json({ ok: true, url: portalSession.url });
  });

  app.get("/api/business/billing/invoices", async (c) => {
    const session = await findRequestSession(database, c.req.header("cookie"));
    if (!session) {
      return c.json({ error: "Authentication required." }, 401);
    }

    if (!stripeClient) {
      return c.json({ error: "Billing provider unavailable." }, 503);
    }

    const subscription = await database.findSubscriptionByUserId(session.user.id);
    const limit = parseLimit(c.req.query("limit"));
    const cursor = asString(c.req.query("cursor")) ?? "";

    if (!subscription?.stripeCustomerId) {
      return c.json({ ok: true, items: [], nextCursor: "" });
    }

    const invoices = await stripeClient.invoices.list({
      customer: subscription.stripeCustomerId,
      limit,
      ...(cursor ? { starting_after: cursor } : {}),
    });
    const items = invoices.data.map((invoice) => ({
      id: invoice.id,
      status: invoice.status ?? "unknown",
      amount:
        Number.isFinite(invoice.total) && invoice.total !== null
          ? invoice.total
          : Number.isFinite(invoice.amount_due) && invoice.amount_due !== null
            ? invoice.amount_due
            : 0,
      currency: invoice.currency ?? "usd",
      createdAt: toIsoFromUnixSeconds(invoice.created),
      hostedInvoiceUrl: invoice.hosted_invoice_url ?? "",
    }));
    const nextCursor =
      invoices.has_more && items.length > 0 ? items[items.length - 1].id : "";
    return c.json({ ok: true, items, nextCursor });
  });

  app.post("/api/business/billing/subscription/cancel", async (c) => {
    const session = await findRequestSession(database, c.req.header("cookie"));
    if (!session) {
      return c.json({ error: "Authentication required." }, 401);
    }

    if (!stripeClient) {
      return c.json({ error: "Billing provider unavailable." }, 503);
    }

    const body = await readJsonBody(c);
    const atPeriodEnd = parseAtPeriodEnd(body.atPeriodEnd);
    const subscription = await database.findSubscriptionByUserId(session.user.id);
    if (!subscription?.stripeSubscriptionId || !subscription.stripeCustomerId) {
      return c.json({ error: "No active paid subscription found." }, 404);
    }

    let stripeSubscription;
    if (atPeriodEnd) {
      stripeSubscription = await stripeClient.subscriptions.update(
        subscription.stripeSubscriptionId,
        { cancel_at_period_end: true }
      );
    } else {
      stripeSubscription = await stripeClient.subscriptions.cancel(
        subscription.stripeSubscriptionId
      );
    }

    const status = stripeSubscription.status ?? subscription.status;
    const currentPeriodEnd = toIsoFromUnixSeconds(stripeSubscription.current_period_end);
    await database.upsertSubscription({
      userId: subscription.userId,
      stripeCustomerId: subscription.stripeCustomerId,
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      plan: subscription.plan,
      status,
      currentPeriodEnd,
    });

    return c.json({
      ok: true,
      status,
      cancelAtPeriodEnd: Boolean(stripeSubscription.cancel_at_period_end),
      currentPeriodEnd,
    });
  });

  app.post("/api/business/billing/subscription/resume", async (c) => {
    const session = await findRequestSession(database, c.req.header("cookie"));
    if (!session) {
      return c.json({ error: "Authentication required." }, 401);
    }

    if (!stripeClient) {
      return c.json({ error: "Billing provider unavailable." }, 503);
    }

    const subscription = await database.findSubscriptionByUserId(session.user.id);
    if (!subscription?.stripeSubscriptionId || !subscription.stripeCustomerId) {
      return c.json({ error: "No active paid subscription found." }, 404);
    }

    let stripeSubscription;
    try {
      stripeSubscription = await stripeClient.subscriptions.update(
        subscription.stripeSubscriptionId,
        { cancel_at_period_end: false }
      );
    } catch (err) {
      const code = err?.code ?? "";
      if (code === "subscription_invalid_state" || code === "resource_missing") {
        return c.json({ error: "Subscription cannot be resumed." }, 409);
      }
      throw err;
    }

    const status = stripeSubscription.status ?? subscription.status;
    const currentPeriodEnd = toIsoFromUnixSeconds(stripeSubscription.current_period_end);
    await database.upsertSubscription({
      userId: subscription.userId,
      stripeCustomerId: subscription.stripeCustomerId,
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      plan: subscription.plan,
      status,
      currentPeriodEnd,
    });

    return c.json({
      ok: true,
      status,
      cancelAtPeriodEnd: Boolean(stripeSubscription.cancel_at_period_end),
      currentPeriodEnd,
    });
  });

  app.post("/api/business/billing/webhook", async (c) => {
    if (!stripeClient || !options.stripeWebhookSecret) {
      return c.json({ error: "Webhook provider unavailable." }, 503);
    }

    const rawBody = await c.req.text();
    const signature = c.req.header("stripe-signature");
    if (!signature) {
      return c.json({ error: "Missing stripe-signature header." }, 400);
    }

    let event;
    try {
      event = stripeClient.webhooks.constructEvent(
        rawBody,
        signature,
        options.stripeWebhookSecret
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Signature verification failed";
      return c.json({ error: message }, 400);
    }

    if (event.type === "checkout.session.completed") {
      const checkoutSession = event.data.object;
      const userId = checkoutSession.metadata?.mapleUserId;
      const plan = checkoutSession.metadata?.maplePlan;
      const customerId =
        typeof checkoutSession.customer === "string"
          ? checkoutSession.customer
          : checkoutSession.customer?.id;
      const subscriptionId =
        typeof checkoutSession.subscription === "string"
          ? checkoutSession.subscription
          : checkoutSession.subscription?.id;
      if (userId && plan && customerId) {
        await database.upsertSubscription({
          userId,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId || null,
          plan,
          status: "active",
        });
      }
    } else if (event.type === "customer.subscription.updated") {
      const subscription = event.data.object;
      const customerId =
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer?.id;
      if (customerId) {
        const sub = await database.findSubscriptionByStripeCustomerId(customerId);
        if (sub) {
          const priceId = subscription.items.data[0]?.price?.id;
          const plan = priceId ? STRIPE_PRICE_TO_PLAN[priceId] || sub.plan : sub.plan;
          await database.upsertSubscription({
            userId: sub.userId,
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscription.id,
            plan,
            status: subscription.status,
            currentPeriodEnd: subscription.current_period_end
              ? new Date(subscription.current_period_end * 1000).toISOString()
              : null,
          });
        }
      }
    } else if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object;
      const customerId =
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer?.id;
      if (customerId) {
        const sub = await database.findSubscriptionByStripeCustomerId(customerId);
        if (sub) {
          await database.upsertSubscription({
            userId: sub.userId,
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscription.id,
            plan: "free",
            status: "canceled",
          });
        }
      }
    }

    return c.json({ received: true });
  });
}
