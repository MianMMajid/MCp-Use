import { server, database } from "../state.js";
import {
  mcpMarketplaceEnabled,
  mcpRouteLockEnabled,
} from "../config.js";
import { requireApiKeyResponse } from "../auth.js";
import { errorMessage } from "../helpers.js";
import {
  listEnabledDownstreamAppIds,
  buildMarketplaceCatalogForAppIds,
  resolveDownstreamApp,
} from "../firewall-proxy.js";
import { type DownstreamAppConfig } from "../control/downstream-proxy.js";

export function registerMarketplaceCatalogRoute(app: typeof server.app) {
  app.get("/api/marketplace/catalog", async (c) => {
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

    try {
      const appIds = listEnabledDownstreamAppIds();
      if (appIds.length === 0) {
        return c.json({
          enabled: true,
          routeLock: mcpRouteLockEnabled,
          appCount: 0,
          toolCount: 0,
          apps: [],
          warnings: [],
        });
      }
      const catalog = await buildMarketplaceCatalogForAppIds(appIds);
      const appMetadata = new Map<string, DownstreamAppConfig>();
      for (const appId of catalog.appIds) {
        try {
          appMetadata.set(appId, resolveDownstreamApp(appId));
        } catch {
          // Ignore unresolved entries here; warnings already capture failures.
        }
      }
      const apps = catalog.appIds.map((appId) => {
        const tools = catalog.tools
          .filter((tool) => tool.appId === appId)
          .sort((a, b) => a.toolName.localeCompare(b.toolName))
          .map((tool) => ({
            toolName: tool.toolName,
            qualifiedName: tool.qualifiedName,
            description: tool.description,
            inputSchema: tool.inputSchema,
          }));
        const catalogApp = appMetadata.get(appId);
        return {
          appId,
          appName: catalogApp?.name ?? appId,
          toolCount: tools.length,
          tools,
        };
      });

      return c.json({
        enabled: true,
        routeLock: mcpRouteLockEnabled,
        appCount: apps.length,
        toolCount: catalog.tools.length,
        apps,
        warnings: catalog.warnings,
      });
    } catch (catalogError) {
      return c.json(
        {
          error: "Failed to load marketplace catalog.",
          detail: errorMessage(catalogError),
        },
        502,
      );
    }
  });
}
