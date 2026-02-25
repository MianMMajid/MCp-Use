import { database } from "../state.js";
import { STRIPE_PLAN_PRICE_IDS, } from "../config.js";
import { findRequestSession } from "../auth.js";
import { asString, readJsonBody } from "../helpers.js";
import { billingBaseUrl, stripe, } from "./billing-stripe.js";
export function registerBillingSubscriptionRoutes(app) {
    app.get("/api/billing/subscription", async (c) => {
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
    app.post("/api/billing/create-checkout-session", async (c) => {
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
    app.post("/api/billing/portal-session", async (c) => {
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
}
//# sourceMappingURL=billing-subscription-routes.js.map