import { businessApiUnavailableResponse, proxyBusinessApiRequest, } from "../core/business-api-client.js";
export function registerAuthMeRoute(app) {
    app.get("/api/auth/me", async (c) => {
        const proxied = await proxyBusinessApiRequest(c, "/api/business/auth/me");
        if (proxied.proxied) {
            return c.json(proxied.payload, proxied.status);
        }
        return businessApiUnavailableResponse(c, proxied, "auth.me");
    });
}
//# sourceMappingURL=auth-routes-me.js.map
