import { database } from "../state.js";
import { downstreamAppRegistry } from "../config.js";
import { requireApiKeyResponse } from "../auth.js";
import { asString, readJsonBody, } from "../helpers.js";
import { isSmitheryDownstreamApp, clearDownstreamToolsCache, } from "../firewall-proxy.js";
export function registerSmitheryDownstreamUnregisterRoute(app) {
    app.post("/api/smithery/downstream/unregister", async (c) => {
        const unauthorized = await requireApiKeyResponse(c, database);
        if (unauthorized) {
            return unauthorized;
        }
        const body = await readJsonBody(c);
        const appId = asString(body.appId);
        if (!appId) {
            return c.json({
                error: "appId is required.",
            }, 400);
        }
        const existing = downstreamAppRegistry.get(appId);
        if (!existing) {
            return c.json({
                error: `Downstream app "${appId}" was not found.`,
            }, 404);
        }
        if (!isSmitheryDownstreamApp(existing)) {
            return c.json({
                error: `Downstream app "${appId}" is not managed by Smithery integration.`,
            }, 400);
        }
        downstreamAppRegistry.delete(appId);
        clearDownstreamToolsCache(appId);
        return c.json({
            ok: true,
            source: "smithery",
            appId,
        });
    });
}
//# sourceMappingURL=downstream-smithery-unregister-route.js.map