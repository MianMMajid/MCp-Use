import { server, database } from "../state.js";
import {
  mcpMarketplaceEnabled,
  smitheryEnabled,
  smitheryApiBaseUrl,
  mcpSoEnabled,
  mcpSoBaseUrl,
} from "../config.js";
import { requireApiKeyResponse } from "../auth.js";

export function registerMarketplaceProvidersRoute(app: typeof server.app) {
  app.get("/api/marketplace/providers", async (c) => {
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

    return c.json({
      providers: {
        smithery: {
          enabled: smitheryEnabled,
          apiBaseUrl: smitheryApiBaseUrl,
        },
        mcpso: {
          enabled: mcpSoEnabled,
          baseUrl: mcpSoBaseUrl,
        },
      },
    });
  });
}
