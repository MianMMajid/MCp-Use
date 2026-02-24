import { server, database } from "../state.js";
import { downstreamAppRegistry } from "../config.js";
import { requireApiKeyResponse } from "../auth.js";
import { isSmitheryDownstreamApp } from "../firewall-proxy.js";
import { listDownstreamApps } from "../control/downstream-proxy.js";

export function registerSmitheryDownstreamRegisteredRoute(app: typeof server.app) {
  app.get("/api/smithery/downstream/registered", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) {
      return unauthorized;
    }

    const smitheryApps = listDownstreamApps(downstreamAppRegistry, true).filter((entry) => {
      const raw = downstreamAppRegistry.get(entry.id);
      return Boolean(raw && isSmitheryDownstreamApp(raw));
    });

    return c.json({
      source: "smithery",
      count: smitheryApps.length,
      apps: smitheryApps,
    });
  });
}
