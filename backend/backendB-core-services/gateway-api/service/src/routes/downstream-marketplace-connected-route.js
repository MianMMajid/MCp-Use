import { database } from "../state.js";
import { mcpMarketplaceEnabled, downstreamAppRegistry, } from "../config.js";
import { requireApiKeyResponse } from "../auth.js";
import { parseMarketplaceProvider, classifyMarketplaceProviderForApp, } from "../firewall-proxy.js";
import { listDownstreamApps } from "../control/downstream-proxy.js";
export function registerMarketplaceConnectedRoute(app) {
    app.get("/api/marketplace/connected", async (c) => {
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
        const provider = parseMarketplaceProvider(c.req.query("provider")) ?? "all";
        const apps = listDownstreamApps(downstreamAppRegistry, true)
            .map((entry) => {
            const raw = downstreamAppRegistry.get(entry.id);
            if (!raw) {
                return undefined;
            }
            const detectedProvider = classifyMarketplaceProviderForApp(raw);
            if (!detectedProvider) {
                return undefined;
            }
            return {
                ...entry,
                provider: detectedProvider,
            };
        })
            .filter((entry) => Boolean(entry))
            .filter((entry) => provider === "all" || entry.provider === provider);
        return c.json({
            provider,
            count: apps.length,
            apps,
        });
    });
}
//# sourceMappingURL=downstream-marketplace-connected-route.js.map