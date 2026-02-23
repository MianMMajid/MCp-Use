import Stripe from "stripe";
import { server, database } from "../state.js";
import {
  stripeSecretKey,
  stripeWebhookSecret,
  STRIPE_PLAN_PRICE_IDS,
  STRIPE_PRICE_TO_PLAN,
  sessionTtlSeconds,
  stripePublishableKey,
} from "../config.js";
import { findRequestSession, buildSessionCookie } from "../auth.js";
import { asString, readJsonBody } from "../helpers.js";
import { verifyPassword, hashPassword } from "@maple/security";

// ── Stripe Instance ────────────────────────────────────────────────────────
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

// ── User Profile & Billing Routes ──────────────────────────────────────────

server.get("/api/user/profile", async (c) => {
  const session = await findRequestSession(database, c.req.header("cookie"));
  if (!session) {
    return c.json({ error: "Authentication required." }, 401);
  }
  const user = await database.findUserById(session.user.id);
  if (!user) {
    return c.json({ error: "User not found." }, 404);
  }
  const subscription = await database.ensureFreeSubscription(user.id);
  return c.json({
    ok: true,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      createdAt: user.createdAt,
    },
    subscription: {
      plan: subscription.plan,
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd,
    },
  });
});

server.app.post("/api/user/change-password", async (c) => {
  const session = await findRequestSession(database, c.req.header("cookie"));
  if (!session) {
    return c.json({ error: "Authentication required." }, 401);
  }
  const body = await readJsonBody(c);
  const currentPassword = asString(body.currentPassword);
  const newPassword = asString(body.newPassword);
  if (!currentPassword || !newPassword) {
    return c.json({ error: "currentPassword and newPassword are required." }, 400);
  }
  if (newPassword.length < 8) {
    return c.json({ error: "New password must be at least 8 characters." }, 400);
  }
  const user = await database.findUserById(session.user.id);
  if (!user) {
    return c.json({ error: "User not found." }, 404);
  }
  if (!verifyPassword(currentPassword, user.passwordHash)) {
    return c.json({ error: "Current password is incorrect." }, 401);
  }
  await database.updatePasswordByUserId(user.id, hashPassword(newPassword));
  return c.json({ ok: true });
});

server.get("/api/billing/subscription", async (c) => {
  const session = await findRequestSession(database, c.req.header("cookie"));
  if (!session) {
    return c.json({ error: "Authentication required." }, 401);
  }
  const subscription = await database.ensureFreeSubscription(session.user.id);
  return c.json({
    ok: true,
    billingEnabled: !!stripe,
    subscription: {
      plan: subscription.plan,
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd,
    },
  });
});

server.app.post("/api/billing/create-checkout-session", async (c) => {
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

  // Ensure subscription record exists
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

  const baseUrl = process.env.MCP_URL || `http://localhost:${process.env.PORT || 3000}`;
  const checkoutSession = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${baseUrl}/judge?billing=success`,
    cancel_url: `${baseUrl}/judge?billing=cancel`,
    metadata: { mapleUserId: session.user.id, maplePlan: plan },
  });

  return c.json({ ok: true, url: checkoutSession.url });
});

server.app.post("/api/billing/portal-session", async (c) => {
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
  const baseUrl = process.env.MCP_URL || `http://localhost:${process.env.PORT || 3000}`;
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: `${baseUrl}/judge`,
  });
  return c.json({ ok: true, url: portalSession.url });
});

server.app.post("/api/billing/webhook", async (c) => {
  if (!stripe || !stripeWebhookSecret) {
    return c.json({ error: "Webhook not configured." }, 501);
  }
  const rawBody = await c.req.text();
  const sig = c.req.header("stripe-signature");
  if (!sig) {
    return c.json({ error: "Missing stripe-signature header." }, 400);
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, stripeWebhookSecret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Signature verification failed";
    return c.json({ error: msg }, 400);
  }

  if (event.type === "checkout.session.completed") {
    const checkoutSession = event.data.object as Stripe.Checkout.Session;
    const userId = checkoutSession.metadata?.mapleUserId;
    const plan = checkoutSession.metadata?.maplePlan;
    const customerId = typeof checkoutSession.customer === "string" ? checkoutSession.customer : checkoutSession.customer?.id;
    const subscriptionId = typeof checkoutSession.subscription === "string" ? checkoutSession.subscription : checkoutSession.subscription?.id;
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
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
    if (customerId) {
      const sub = await database.findSubscriptionByStripeCustomerId(customerId);
      if (sub) {
        const priceId = subscription.items.data[0]?.price?.id;
        const plan = priceId ? (STRIPE_PRICE_TO_PLAN[priceId] || sub.plan) : sub.plan;
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
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
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
