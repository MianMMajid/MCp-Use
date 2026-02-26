import { database } from "../state.js";
import { requireApiKeyResponse } from "../auth.js";
import { asString, errorMessage, } from "../helpers.js";
import { resolveDownstreamApp, listToolsFromDownstreamCached, } from "../firewall-proxy.js";
export function registerDownstreamToolsRoute(app) {
    app.get("/api/downstream/tools", async (c) => {
        const unauthorized = await requireApiKeyResponse(c, database);
        if (unauthorized) {
            return unauthorized;
        }
        const appId = asString(c.req.query("appId"));
        if (!appId) {
            return c.json({ error: "appId query parameter is required." }, 400);
        }
        let downstreamApp;
        try {
            downstreamApp = resolveDownstreamApp(appId);
        }
        catch (configError) {
            return c.json({ error: errorMessage(configError) }, 404);
        }
        try {
            const refresh = c.req.query("refresh") === "true";
            const listed = await listToolsFromDownstreamCached(downstreamApp, {
                forceRefresh: refresh,
            });
            return c.json({
                appId: downstreamApp.id,
                toolCount: listed.tools.length,
                requestId: listed.requestId,
                durationMs: listed.durationMs,
                tools: listed.tools,
            });
        }
        catch (listError) {
            return c.json({
                error: "Downstream tools/list failed.",
                detail: errorMessage(listError),
            }, 502);
        }
    });
}
//# sourceMappingURL=downstream-control-tools-route.js.map