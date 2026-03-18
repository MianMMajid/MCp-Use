import { database } from "../state.js";
import { stripeWebhookSecret, STRIPE_PRICE_TO_PLAN } from "../config.js";
import { stripe } from "./billing-stripe.js";
import { emitAuditEvent } from "../audit-emitter.js";
import { mapleLog } from "../logging.js";

/**
 * M2-14: Track the last processed event.created timestamp per customer to
 * prevent out-of-order webhook processing from causing race conditions.
 * In-memory map; acceptable because Stripe guarantees at-least-once delivery
 * and we use event.created for ordering rather than arrival time.
 */
const _lastEventTimestampByCustomer = new Map();

function shouldProcessEvent(customerId, eventCreated) {
    if (!customerId || !Number.isFinite(eventCreated)) return true;
    const last = _lastEventTimestampByCustomer.get(customerId);
    if (last && eventCreated < last) {
        mapleLog("info", "billing_webhook.out_of_order_skipped", {
            customerId,
            eventCreated,
            lastProcessed: last,
        });
        return false;
    }
    _lastEventTimestampByCustomer.set(customerId, eventCreated);
    return true;
}

export function registerBillingWebhookRoute(app) {
    app.post("/api/billing/webhook", async (c) => {
        if (!stripe || !stripeWebhookSecret) {
            return c.json({ error: "Webhook provider unavailable." }, 503);
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
                stripeWebhookSecret
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
            // M2-14: Use event.created timestamp for ordering
            if (!shouldProcessEvent(customerId, event.created)) {
                return c.json({ received: true, skipped: true });
            }
            if (userId && plan && customerId) {
                await database.upsertSubscription({
                    userId,
                    stripeCustomerId: customerId,
                    stripeSubscriptionId: subscriptionId || null,
                    plan,
                    status: "active",
                });
                // M2-14: Emit audit event for billing mutation
                emitAuditEvent({
                    eventType: "AUDIT_EVENT_TYPE_SUBSCRIPTION_ACTIVATED",
                    sourceService: "gateway-api",
                    userId,
                    severity: "RISK_SEVERITY_LOW",
                    summary: `Subscription activated: plan=${plan} for user ${userId}`,
                    payload: { plan, customerId, subscriptionId },
                });
            }
        } else if (event.type === "customer.subscription.updated") {
            const subscription = event.data.object;
            const customerId =
                typeof subscription.customer === "string"
                    ? subscription.customer
                    : subscription.customer?.id;
            // M2-14: Use event.created timestamp for ordering
            if (!shouldProcessEvent(customerId, event.created)) {
                return c.json({ received: true, skipped: true });
            }
            if (customerId) {
                const sub = await database.findSubscriptionByStripeCustomerId(customerId);
                if (sub) {
                    const priceId = subscription.items.data[0]?.price?.id;
                    const plan = priceId ? STRIPE_PRICE_TO_PLAN[priceId] || sub.plan : sub.plan;
                    const currentPeriodEnd = subscription.current_period_end
                        ? new Date(subscription.current_period_end * 1000).toISOString()
                        : null;
                    await database.upsertSubscription({
                        userId: sub.userId,
                        stripeCustomerId: customerId,
                        stripeSubscriptionId: subscription.id,
                        plan,
                        status: subscription.status,
                        currentPeriodEnd,
                    });
                    // M2-14: Emit audit event for billing mutation
                    emitAuditEvent({
                        eventType: "AUDIT_EVENT_TYPE_SUBSCRIPTION_UPDATED",
                        sourceService: "gateway-api",
                        userId: sub.userId,
                        severity: "RISK_SEVERITY_LOW",
                        summary: `Subscription updated: plan=${plan}, status=${subscription.status}`,
                        payload: { plan, status: subscription.status, customerId, currentPeriodEnd },
                    });
                }
            }
        } else if (event.type === "customer.subscription.deleted") {
            const subscription = event.data.object;
            const customerId =
                typeof subscription.customer === "string"
                    ? subscription.customer
                    : subscription.customer?.id;
            // M2-14: Use event.created timestamp for ordering
            if (!shouldProcessEvent(customerId, event.created)) {
                return c.json({ received: true, skipped: true });
            }
            if (customerId) {
                const sub = await database.findSubscriptionByStripeCustomerId(customerId);
                if (sub) {
                    // M2-13: For deleted subscriptions, check if there is remaining period.
                    // Even after deletion event, the subscription may still be valid until
                    // current_period_end (cancel_at_period_end scenario).
                    const currentPeriodEnd = subscription.current_period_end
                        ? new Date(subscription.current_period_end * 1000).toISOString()
                        : null;
                    const stillWithinPeriod = currentPeriodEnd && new Date(currentPeriodEnd) > new Date();
                    await database.upsertSubscription({
                        userId: sub.userId,
                        stripeCustomerId: customerId,
                        stripeSubscriptionId: subscription.id,
                        plan: stillWithinPeriod ? sub.plan : "free",
                        status: stillWithinPeriod ? "canceling" : "canceled",
                        currentPeriodEnd,
                    });
                    // M2-14: Emit audit event for billing mutation
                    emitAuditEvent({
                        eventType: "AUDIT_EVENT_TYPE_SUBSCRIPTION_CANCELED",
                        sourceService: "gateway-api",
                        userId: sub.userId,
                        severity: "RISK_SEVERITY_LOW",
                        summary: `Subscription canceled for user ${sub.userId}${stillWithinPeriod ? " (valid until period end)" : ""}`,
                        payload: { customerId, currentPeriodEnd, stillWithinPeriod },
                    });
                }
            }
        }

        return c.json({ received: true });
    });
}
