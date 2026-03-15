import { database } from "../state.js";
import { mcpMarketplaceEnabled, downstreamAppRegistry, } from "../config.js";
import { requireApiKeyResponse } from "../auth.js";
import { asString, readJsonBody, } from "../helpers.js";
import { classifyMarketplaceProviderForApp, clearDownstreamToolsCache, } from "../firewall-proxy.js";
export function registerMarketplaceDisconnectRoute(app) {
    app.post("/api/marketplace/disconnect", async (c) => {
        const unauthorized = await requireApiKeyResponse(c, database);
        if (unauthorized) {
            return unauthorized;
        }
        if (!mcpMarketplaceEnabled) {
            return c.json({
                error: "Marketplace is disabled in this Maple build.",
                hint: "Use cleared downstream tools through MAPLE_DOWNSTREAM_APPS and MAPLE_MCP_EXECUTION_ORDER.",
            }, 403);
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
        const provider = classifyMarketplaceProviderForApp(existing);
        if (!provider) {
            return c.json({
                error: `Downstream app "${appId}" is not marketplace-managed.`,
            }, 400);
        }
        downstreamAppRegistry.delete(appId);
        clearDownstreamToolsCache(appId);
        return c.json({
            ok: true,
            action: "disconnect",
            provider,
            appId,
        });
    });
}
//# sourceMappingURL=downstream-marketplace-disconnect-route.js.map