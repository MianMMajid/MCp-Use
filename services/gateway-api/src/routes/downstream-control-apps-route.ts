import { server, database } from "../state.js";
import { downstreamAppRegistry } from "../config.js";
import { requireApiKeyResponse } from "../auth.js";
import { listDownstreamApps } from "../control/downstream-proxy.js";

export function registerDownstreamAppsRoute(app: typeof server.app) {
  app.get("/api/downstream/apps", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) {
      return unauthorized;
    }

    const includeDisabled = c.req.query("includeDisabled") === "true";
    const apps = listDownstreamApps(downstreamAppRegistry, includeDisabled);
    return c.json({
      count: apps.length,
      apps,
    });
  });
}
