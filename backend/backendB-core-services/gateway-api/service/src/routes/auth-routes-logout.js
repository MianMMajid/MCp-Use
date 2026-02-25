import { database } from "../state.js";
import { clearSessionCookieHeader, sessionCookieValue, } from "../auth.js";
import { applyBusinessApiProxyHeaders, businessApiUnavailableResponse, isBusinessApiRequired, proxyBusinessApiRequest, } from "../core/business-api-client.js";
export function registerAuthLogoutRoute(app) {
    app.post("/api/auth/logout", async (c) => {
        const proxied = await proxyBusinessApiRequest(c, "/api/business/auth/logout", {
            method: "POST",
        });
        if (proxied.proxied) {
            applyBusinessApiProxyHeaders(c, proxied);
            return c.json(proxied.payload, proxied.status);
        }
        if (isBusinessApiRequired()) {
            return businessApiUnavailableResponse(c, proxied, "auth.logout");
        }
        const sessionId = sessionCookieValue(c.req.header("cookie"));
        if (sessionId) {
            await database.revokeSession(sessionId);
        }
        c.header("set-cookie", clearSessionCookieHeader());
        return c.json({ ok: true });
    });
}
//# sourceMappingURL=auth-routes-logout.js.map
