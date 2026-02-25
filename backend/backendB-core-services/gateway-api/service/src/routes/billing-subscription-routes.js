import { readJsonBody } from "../helpers.js";
import { businessApiUnavailableResponse, proxyBusinessApiRequest } from "../core/business-api-client.js";
export function registerBillingSubscriptionRoutes(app) {
    app.get("/api/billing/subscription", async (c) => {
        const proxied = await proxyBusinessApiRequest(c, "/api/business/billing/subscription");
        if (proxied.proxied) {
            return c.json(proxied.payload, proxied.status);
        }
        return businessApiUnavailableResponse(c, proxied, "billing.subscription");
    });
    app.post("/api/billing/create-checkout-session", async (c) => {
        const body = await readJsonBody(c);
        const proxied = await proxyBusinessApiRequest(c, "/api/business/billing/create-checkout-session", {
            method: "POST",
            body,
        });
        if (proxied.proxied) {
            return c.json(proxied.payload, proxied.status);
        }
        return businessApiUnavailableResponse(c, proxied, "billing.create_checkout_session");
    });
    app.post("/api/billing/portal-session", async (c) => {
        const proxied = await proxyBusinessApiRequest(c, "/api/business/billing/portal-session", {
            method: "POST",
        });
        if (proxied.proxied) {
            return c.json(proxied.payload, proxied.status);
        }
        return businessApiUnavailableResponse(c, proxied, "billing.portal_session");
    });
}
//# sourceMappingURL=billing-subscription-routes.js.map
