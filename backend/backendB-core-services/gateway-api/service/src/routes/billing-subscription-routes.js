import { asString, readJsonBody } from "../helpers.js";
import { database } from "../state.js";
import { findRequestSession } from "../auth.js";
import { STRIPE_PLAN_PRICE_IDS } from "../config.js";
import { stripe, billingBaseUrl } from "./billing-stripe.js";
import {
  getCachedSubscription,
  setCachedSubscription,
} from "../core/billing-cache.js";
import { emitAuditEvent } from "../audit-emitter.js";

function buildPathWithQuery(basePath, c) {
  const url = new URL(c.req.url);
  const query = url.searchParams.toString();
  if (!query) {
    return basePath;
  }
  return `${basePath}?${query}`;
}

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

function getUserId(c) {
  return c.get("userId") ?? c.get("sessionUserId") ?? "anonymous";
}

const billingEnabled = Boolean(stripe);

export function registerBillingSubscriptionRoutes(app) {
  // GET /api/billing/subscription
  app.get("/api/billing/subscription", async (c) => {
    const session = await findRequestSession(database, c.req.header("cookie"));
    if (!session) {
      return c.json({ error: "Authentication required." }, 401);
    }

    const subscription = await database.ensureFreeSubscription(session.user.id);
    // M2-13: Verify that canceled subscriptions are still valid until period end.
    // If status is "canceled" or "canceling" but currentPeriodEnd is in the future,
    // present the subscription as still active (with a flag) so the user retains
    // access to their paid features until the billing period expires.
    let effectiveStatus = subscription.status;
    let validUntilPeriodEnd = false;
    if (
      (subscription.status === "canceled" || subscription.status === "canceling") &&
      subscription.currentPeriodEnd &&
      new Date(subscription.currentPeriodEnd) > new Date()
    ) {
      effectiveStatus = "active";
      validUntilPeriodEnd = true;
    }
    const payload = {
      ok: true,
      billingEnabled,
      billingMode: stripe ? "stripe" : "disabled",
      subscription: {
        plan: subscription.plan,
        status: effectiveStatus,
        currentPeriodEnd: subscription.currentPeriodEnd,
        ...(validUntilPeriodEnd ? { canceledButValidUntilPeriodEnd: true } : {}),
      },
    };
    const userId = getUserId(c);
    setCachedSubscription(userId, payload);
    return c.json(payload);
  });

  // POST /api/billing/create-checkout-session
  app.post("/api/billing/create-checkout-session", async (c) => {
    const session = await findRequestSession(database, c.req.header("cookie"));
    if (!session) {
      return c.json({ error: "Authentication required." }, 401);
    }

    const body = await readJsonBody(c);
    const plan = asString(body.plan);
    if (!plan || !Object.prototype.hasOwnProperty.call(STRIPE_PLAN_PRICE_IDS, plan)) {
      return c.json({ error: "Invalid plan." }, 400);
    }

    if (!stripe) {
      return c.json({ error: "Billing provider unavailable." }, 503);
    }

    const sub = await database.ensureFreeSubscription(session.user.id);
    const priceId = STRIPE_PLAN_PRICE_IDS[plan];
    if (!priceId) {
      return c.json({ error: "Price not configured for this plan." }, 503);
    }

    let customerId = sub.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
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

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${billingBaseUrl()}/?billing=success`,
      cancel_url: `${billingBaseUrl()}/?billing=cancel`,
      metadata: { mapleUserId: session.user.id, maplePlan: plan },
    });
    // M2-14: Emit audit event for billing mutation
    emitAuditEvent({
      eventType: "AUDIT_EVENT_TYPE_CHECKOUT_SESSION_CREATED",
      sourceService: "gateway-api",
      userId: session.user.id,
      severity: "RISK_SEVERITY_LOW",
      summary: `Checkout session created for plan=${plan} by user ${session.user.id}`,
      payload: { plan, customerId },
    });
    return c.json({ ok: true, url: checkoutSession.url });
  });

  // POST /api/billing/portal-session
  app.post("/api/billing/portal-session", async (c) => {
    const session = await findRequestSession(database, c.req.header("cookie"));
    if (!session) {
      return c.json({ error: "Authentication required." }, 401);
    }

    if (!stripe) {
      return c.json({ error: "Billing provider unavailable." }, 503);
    }

    const sub = await database.findSubscriptionByUserId(session.user.id);
    if (!sub?.stripeCustomerId) {
      return c.json({ error: "No billing account found." }, 404);
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${billingBaseUrl()}/`,
    });

    // M4-08: Audit coverage — billing portal session creation
    emitAuditEvent({
      eventType: "AUDIT_EVENT_TYPE_BILLING_PORTAL_SESSION_CREATED",
      sourceService: "gateway-api",
      userId: session.user.id,
      severity: "RISK_SEVERITY_LOW",
      summary: `Billing portal session created by user ${session.user.id}`,
      payload: { customerId: sub.stripeCustomerId },
    });

    return c.json({ ok: true, url: portalSession.url });
  });

  // GET /api/billing/invoices
  app.get("/api/billing/invoices", async (c) => {
    const session = await findRequestSession(database, c.req.header("cookie"));
    if (!session) {
      return c.json({ error: "Authentication required." }, 401);
    }

    if (!stripe) {
      return c.json({ error: "Billing provider unavailable." }, 503);
    }

    const subscription = await database.findSubscriptionByUserId(session.user.id);
    const limit = parseLimit(c.req.query("limit"));
    const cursor = asString(c.req.query("cursor")) ?? "";

    if (!subscription?.stripeCustomerId) {
      return c.json({ ok: true, items: [], nextCursor: "" });
    }

    const invoices = await stripe.invoices.list({
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
    const payload = { ok: true, items, nextCursor };
    const userId = getUserId(c);
    setCachedSubscription(`${userId}:invoices`, payload);
    return c.json(payload);
  });

  // POST /api/billing/subscription/cancel
  app.post("/api/billing/subscription/cancel", async (c) => {
    const session = await findRequestSession(database, c.req.header("cookie"));
    if (!session) {
      return c.json({ error: "Authentication required." }, 401);
    }

    if (!stripe) {
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
      stripeSubscription = await stripe.subscriptions.update(
        subscription.stripeSubscriptionId,
        { cancel_at_period_end: true }
      );
    } else {
      stripeSubscription = await stripe.subscriptions.cancel(
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

    // M2-14: Emit audit event for billing mutation
    emitAuditEvent({
      eventType: "AUDIT_EVENT_TYPE_SUBSCRIPTION_CANCEL_REQUESTED",
      sourceService: "gateway-api",
      userId: session.user.id,
      severity: "RISK_SEVERITY_LOW",
      summary: `Subscription cancellation requested by user ${session.user.id} (atPeriodEnd=${atPeriodEnd})`,
      payload: { plan: subscription.plan, atPeriodEnd, status, currentPeriodEnd },
    });

    return c.json({
      ok: true,
      status,
      cancelAtPeriodEnd: Boolean(stripeSubscription.cancel_at_period_end),
      currentPeriodEnd,
    });
  });

  // POST /api/billing/subscription/resume
  app.post("/api/billing/subscription/resume", async (c) => {
    const session = await findRequestSession(database, c.req.header("cookie"));
    if (!session) {
      return c.json({ error: "Authentication required." }, 401);
    }

    if (!stripe) {
      return c.json({ error: "Billing provider unavailable." }, 503);
    }

    const subscription = await database.findSubscriptionByUserId(session.user.id);
    if (!subscription?.stripeSubscriptionId || !subscription.stripeCustomerId) {
      return c.json({ error: "No active paid subscription found." }, 404);
    }

    let stripeSubscription;
    try {
      stripeSubscription = await stripe.subscriptions.update(
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

    // M2-14: Emit audit event for billing mutation
    emitAuditEvent({
      eventType: "AUDIT_EVENT_TYPE_SUBSCRIPTION_RESUMED",
      sourceService: "gateway-api",
      userId: session.user.id,
      severity: "RISK_SEVERITY_LOW",
      summary: `Subscription resumed by user ${session.user.id}`,
      payload: { plan: subscription.plan, status, currentPeriodEnd },
    });

    return c.json({
      ok: true,
      status,
      cancelAtPeriodEnd: Boolean(stripeSubscription.cancel_at_period_end),
      currentPeriodEnd,
    });
  });
}
