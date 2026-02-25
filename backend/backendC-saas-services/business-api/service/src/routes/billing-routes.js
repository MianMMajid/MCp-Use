import { asString, readJsonBody } from "@maple/common";
import {
  STRIPE_PLAN_PRICE_IDS,
  STRIPE_PRICE_TO_PLAN,
} from "../config.js";
import { findRequestSession } from "../auth-session.js";
import { billingBaseUrl, stripe } from "./billing-stripe.js";

export function registerBillingRoutes(app, options) {
  const database = options.database;
  const billingEnabled = Boolean(options.billingEnabled);

  app.get("/api/business/billing/subscription", async (c) => {
    const session = await findRequestSession(database, c.req.header("cookie"));
    if (!session) {
      return c.json({ error: "Authentication required." }, 401);
    }

    const subscription = await database.ensureFreeSubscription(session.user.id);
    return c.json({
      ok: true,
      billingEnabled,
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
    if (!stripe) {
      return c.json({ error: "Billing is not configured." }, 501);
    }

    const body = await readJsonBody(c);
    const plan = asString(body.plan);
    if (!plan || !STRIPE_PLAN_PRICE_IDS[plan]) {
      return c.json({ error: "Invalid plan." }, 400);
    }

    const priceId = STRIPE_PLAN_PRICE_IDS[plan];
    if (!priceId) {
      return c.json({ error: "Price not configured for this plan." }, 501);
    }

    const sub = await database.ensureFreeSubscription(session.user.id);
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
      success_url: `${billingBaseUrl()}/judge?billing=success`,
      cancel_url: `${billingBaseUrl()}/judge?billing=cancel`,
      metadata: { mapleUserId: session.user.id, maplePlan: plan },
    });
    return c.json({ ok: true, url: checkoutSession.url });
  });

  app.post("/api/business/billing/portal-session", async (c) => {
    const session = await findRequestSession(database, c.req.header("cookie"));
    if (!session) {
      return c.json({ error: "Authentication required." }, 401);
    }
    if (!stripe) {
      return c.json({ error: "Billing is not configured." }, 501);
    }

    const sub = await database.findSubscriptionByUserId(session.user.id);
    if (!sub?.stripeCustomerId) {
      return c.json({ error: "No billing account found." }, 404);
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${billingBaseUrl()}/judge`,
    });
    return c.json({ ok: true, url: portalSession.url });
  });

  app.post("/api/business/billing/webhook", async (c) => {
    if (!stripe || !options.stripeWebhookSecret) {
      return c.json({ error: "Webhook not configured." }, 501);
    }

    const rawBody = await c.req.text();
    const signature = c.req.header("stripe-signature");
    if (!signature) {
      return c.json({ error: "Missing stripe-signature header." }, 400);
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(
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
