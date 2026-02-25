import { database } from "../state.js";
import { stripeWebhookSecret, STRIPE_PRICE_TO_PLAN, } from "../config.js";
import { stripe } from "./billing-stripe.js";
export function registerBillingWebhookRoute(app) {
    app.post("/api/billing/webhook", async (c) => {
        if (!stripe || !stripeWebhookSecret) {
            return c.json({ error: "Webhook not configured." }, 501);
        }
        const rawBody = await c.req.text();
        const sig = c.req.header("stripe-signature");
        if (!sig) {
            return c.json({ error: "Missing stripe-signature header." }, 400);
        }
        let event;
        try {
            event = stripe.webhooks.constructEvent(rawBody, sig, stripeWebhookSecret);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : "Signature verification failed";
            return c.json({ error: msg }, 400);
        }
        if (event.type === "checkout.session.completed") {
            const checkoutSession = event.data.object;
            const userId = checkoutSession.metadata?.mapleUserId;
            const plan = checkoutSession.metadata?.maplePlan;
            const customerId = typeof checkoutSession.customer === "string" ? checkoutSession.customer : checkoutSession.customer?.id;
            const subscriptionId = typeof checkoutSession.subscription === "string"
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
        }
        else if (event.type === "customer.subscription.updated") {
            const subscription = event.data.object;
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
        }
        else if (event.type === "customer.subscription.deleted") {
            const subscription = event.data.object;
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
}
//# sourceMappingURL=billing-webhook-route.js.map