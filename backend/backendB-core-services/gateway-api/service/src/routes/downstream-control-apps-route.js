import { database } from "../state.js";
import { downstreamAppRegistry, mcpRouteLockEnabled } from "../config.js";
import { requireApiKeyResponse } from "../auth.js";
import { listDownstreamApps } from "../control/downstream-proxy.js";
export function registerDownstreamAppsRoute(app) {
    app.get("/api/downstream/apps", async (c) => {
        const unauthorized = await requireApiKeyResponse(c, database);
        if (unauthorized) {
            return unauthorized;
        }
        const includeDisabled = c.req.query("includeDisabled") === "true";
        const apps = listDownstreamApps(downstreamAppRegistry, includeDisabled);
        return c.json({
            routeLock: mcpRouteLockEnabled,
            count: apps.length,
            apps,
        });
    });
}
//# sourceMappingURL=downstream-control-apps-route.js.map