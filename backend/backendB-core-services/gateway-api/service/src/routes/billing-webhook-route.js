import { businessApiUnavailableResponse, proxyBusinessApiRequest } from "../core/business-api-client.js";
export function registerBillingWebhookRoute(app) {
    app.post("/api/billing/webhook", async (c) => {
        const rawBody = await c.req.text();
        const signature = c.req.header("stripe-signature");
        const proxied = await proxyBusinessApiRequest(c, "/api/business/billing/webhook", {
            method: "POST",
            rawBody,
            contentType: c.req.header("content-type") || "application/json",
            headers: signature ? { "stripe-signature": signature } : undefined,
        });
        if (proxied.proxied) {
            return c.json(proxied.payload, proxied.status);
        }
        return businessApiUnavailableResponse(c, proxied, "billing.webhook");
    });
}
//# sourceMappingURL=billing-webhook-route.js.map
