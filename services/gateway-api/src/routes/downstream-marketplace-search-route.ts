import { server, database } from "../state.js";
import { mcpMarketplaceEnabled } from "../config.js";
import { requireApiKeyResponse } from "../auth.js";
import {
  asString,
  asNumber,
  errorMessage,
} from "../helpers.js";
import {
  parseMarketplaceProvider,
  searchMarketplaceServers,
} from "../firewall-proxy.js";

export function registerMarketplaceSearchRoute(app: typeof server.app) {
  app.get("/api/marketplace/search", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) {
      return unauthorized;
    }
    if (!mcpMarketplaceEnabled) {
      return c.json(
        {
          error: "Marketplace is disabled in this Maple build.",
          hint: "Use cleared downstream tools through MAPLE_DOWNSTREAM_APPS and MAPLE_MCP_EXECUTION_ORDER.",
        },
        403,
      );
    }

    const provider = parseMarketplaceProvider(c.req.query("provider")) ?? "all";
    const query = asString(c.req.query("q")) ?? asString(c.req.query("query"));
    const limitRaw = asNumber(c.req.query("limit"));
    const limit = limitRaw ? Math.max(1, Math.min(100, Math.trunc(limitRaw))) : 20;

    try {
      const entries = await searchMarketplaceServers({
        provider,
        query,
        limit,
      });
      return c.json({
        provider,
        query: query ?? null,
        count: entries.length,
        entries,
      });
    } catch (error) {
      return c.json(
        {
          error: "Marketplace search failed.",
          detail: errorMessage(error),
        },
        502,
      );
    }
  });
}
