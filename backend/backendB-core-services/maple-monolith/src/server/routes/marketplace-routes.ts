import type { Hono } from "hono";
import type { DownstreamAppConfig, DownstreamAppInfo } from "../../control/downstream-proxy.js";

type MarketplaceProvider = "smithery" | "mcpso";
type MarketplaceProviderOrAll = MarketplaceProvider | "all";

interface RequireApiKeyContext {
  req: {
    header: (name: string) => string | undefined;
  };
  json: (body: unknown, status?: number) => Response;
}

interface MarketplaceToolEntry {
  appId: string;
  appName: string;
  toolName: string;
  qualifiedName: string;
  description?: string;
  inputSchema?: unknown;
}

interface MarketplaceCatalogResult {
  appIds: string[];
  tools: MarketplaceToolEntry[];
  warnings: Array<{ appId: string; message: string }>;
}

interface RegisterMarketplaceDownstreamResult {
  app: DownstreamAppConfig;
  appId: string;
  provider: MarketplaceProvider;
  resolved: unknown;
  replaced: boolean;
}

interface RegisterMarketplaceDownstreamOptions {
  provider: MarketplaceProvider;
  id: string;
  overwrite?: boolean;
  appId?: string;
  name?: string;
  enabled?: boolean;
  timeoutMs?: number;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  apiKey?: string;
  authHeader?: string;
  authScheme?: "bearer" | "raw";
  toolAllowlist?: string[];
  restrictToCatalogTools?: boolean;
}

interface RegisterMarketplaceRoutesDeps {
  asBoolean: (value: unknown, fallback: boolean) => boolean;
  asNumber: (value: unknown) => number | undefined;
  asString: (value: unknown) => string | undefined;
  asStringArray: (value: unknown) => string[];
  asStringRecord: (value: unknown) => Record<string, string>;
  buildMarketplaceCatalogForAppIds: (appIds: string[]) => Promise<MarketplaceCatalogResult>;
  classifyMarketplaceProviderForApp: (
    app: DownstreamAppConfig
  ) => MarketplaceProvider | undefined;
  clearDownstreamToolsCache: (appId?: string) => void;
  downstreamAppRegistry: Map<string, DownstreamAppConfig>;
  errorMessage: (error: unknown) => string;
  listDownstreamApps: (
    appRegistry: Map<string, DownstreamAppConfig>,
    includeDisabled?: boolean
  ) => DownstreamAppInfo[];
  listEnabledDownstreamAppIds: () => string[];
  mcpMarketplaceEnabled: boolean;
  mcpRouteLockEnabled: boolean;
  mcpSoBaseUrl: string;
  mcpSoEnabled: boolean;
  normalizeMarketplaceId: (provider: MarketplaceProvider, rawId: string) => string;
  parseMarketplaceProvider: (value: unknown) => MarketplaceProviderOrAll | undefined;
  readJsonBody: (c: { req: { json: () => Promise<unknown> } }) => Promise<Record<string, unknown>>;
  registerMarketplaceDownstream: (
    options: RegisterMarketplaceDownstreamOptions
  ) => Promise<RegisterMarketplaceDownstreamResult>;
  requireApiKeyResponse: (c: RequireApiKeyContext) => Response | undefined;
  resolveDownstreamApp: (appId: string) => DownstreamAppConfig;
  searchMarketplaceServers: (options: {
    provider?: MarketplaceProviderOrAll;
    query?: string;
    limit?: number;
  }) => Promise<unknown[]>;
  smitheryApiBaseUrl: string;
  smitheryEnabled: boolean;
  toPublicDownstreamApp: (app: DownstreamAppConfig) => DownstreamAppInfo;
}

export function registerMarketplaceRoutes(
  app: Hono,
  deps: RegisterMarketplaceRoutesDeps
): void {
  const {
    asBoolean,
    asNumber,
    asString,
    asStringArray,
    asStringRecord,
    buildMarketplaceCatalogForAppIds,
    classifyMarketplaceProviderForApp,
    clearDownstreamToolsCache,
    downstreamAppRegistry,
    errorMessage,
    listDownstreamApps,
    listEnabledDownstreamAppIds,
    mcpMarketplaceEnabled,
    mcpRouteLockEnabled,
    mcpSoBaseUrl,
    mcpSoEnabled,
    normalizeMarketplaceId,
    parseMarketplaceProvider,
    readJsonBody,
    registerMarketplaceDownstream,
    requireApiKeyResponse,
    resolveDownstreamApp,
    searchMarketplaceServers,
    smitheryApiBaseUrl,
    smitheryEnabled,
    toPublicDownstreamApp,
  } = deps;

  app.get("/api/marketplace/providers", (c) => {
    const unauthorized = requireApiKeyResponse(c);
    if (unauthorized) {
      return unauthorized;
    }
    if (!mcpMarketplaceEnabled) {
      return c.json(
        {
          error: "Marketplace is disabled in this Maple build.",
          hint: "Use cleared downstream tools through MAPLE_DOWNSTREAM_APPS and MAPLE_MCP_EXECUTION_ORDER.",
        },
        403
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

  app.get("/api/marketplace/search", async (c) => {
    const unauthorized = requireApiKeyResponse(c);
    if (unauthorized) {
      return unauthorized;
    }
    if (!mcpMarketplaceEnabled) {
      return c.json(
        {
          error: "Marketplace is disabled in this Maple build.",
          hint: "Use cleared downstream tools through MAPLE_DOWNSTREAM_APPS and MAPLE_MCP_EXECUTION_ORDER.",
        },
        403
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
    } catch (requestError) {
      return c.json(
        {
          error: "Marketplace search failed.",
          detail: errorMessage(requestError),
        },
        502
      );
    }
  });

  app.get("/api/marketplace/connected", (c) => {
    const unauthorized = requireApiKeyResponse(c);
    if (unauthorized) {
      return unauthorized;
    }
    if (!mcpMarketplaceEnabled) {
      return c.json(
        {
          error: "Marketplace is disabled in this Maple build.",
          hint: "Use cleared downstream tools through MAPLE_DOWNSTREAM_APPS and MAPLE_MCP_EXECUTION_ORDER.",
        },
        403
      );
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
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .filter((entry) => provider === "all" || entry.provider === provider);

    return c.json({
      provider,
      count: apps.length,
      apps,
    });
  });

  app.post("/api/marketplace/connect", async (c) => {
    const unauthorized = requireApiKeyResponse(c);
    if (unauthorized) {
      return unauthorized;
    }
    if (!mcpMarketplaceEnabled) {
      return c.json(
        {
          error: "Marketplace is disabled in this Maple build.",
          hint: "Use cleared downstream tools through MAPLE_DOWNSTREAM_APPS and MAPLE_MCP_EXECUTION_ORDER.",
        },
        403
      );
    }

    const body = await readJsonBody(c);
    const provider = parseMarketplaceProvider(body.provider);
    if (provider !== "smithery" && provider !== "mcpso") {
      return c.json(
        {
          error: "provider must be smithery or mcpso.",
        },
        400
      );
    }
    if (provider === "smithery" && !smitheryEnabled) {
      return c.json(
        {
          error: "Smithery integration is disabled.",
          hint: "Set MAPLE_SMITHERY_ENABLED=true.",
        },
        400
      );
    }
    if (provider === "mcpso" && !mcpSoEnabled) {
      return c.json(
        {
          error: "MCP.so integration is disabled.",
          hint: "Set MAPLE_MCPSO_ENABLED=true.",
        },
        400
      );
    }

    const rawId = asString(body.id) ?? asString(body.server) ?? asString(body.slug);
    if (!rawId) {
      return c.json(
        {
          error: "id is required.",
        },
        400
      );
    }

    const timeoutMsRaw = asNumber(body.timeoutMs);
    try {
      const registered = await registerMarketplaceDownstream({
        provider,
        id: normalizeMarketplaceId(provider, rawId),
        overwrite: asBoolean(body.overwrite, false),
        appId: asString(body.appId),
        name: asString(body.name),
        enabled: asBoolean(body.enabled, true),
        timeoutMs: timeoutMsRaw
          ? Math.max(1_000, Math.min(60_000, Math.trunc(timeoutMsRaw)))
          : undefined,
        query: asStringRecord(body.query),
        headers: asStringRecord(body.headers),
        apiKey: asString(body.apiKey),
        authHeader: asString(body.authHeader),
        authScheme: asString(body.authScheme)?.toLowerCase() === "raw" ? "raw" : "bearer",
        toolAllowlist: asStringArray(body.toolAllowlist),
        restrictToCatalogTools: asBoolean(body.restrictToCatalogTools, true),
      });

      return c.json({
        ok: true,
        action: "connect",
        provider: registered.provider,
        appId: registered.appId,
        app: toPublicDownstreamApp(registered.app),
        resolved: registered.resolved,
        replaced: registered.replaced,
      });
    } catch (connectError) {
      const detail = errorMessage(connectError);
      const status = /already exists/i.test(detail) ? 409 : 400;
      return c.json(
        {
          error: "Marketplace connect failed.",
          detail,
        },
        status
      );
    }
  });

  app.post("/api/marketplace/disconnect", async (c) => {
    const unauthorized = requireApiKeyResponse(c);
    if (unauthorized) {
      return unauthorized;
    }
    if (!mcpMarketplaceEnabled) {
      return c.json(
        {
          error: "Marketplace is disabled in this Maple build.",
          hint: "Use cleared downstream tools through MAPLE_DOWNSTREAM_APPS and MAPLE_MCP_EXECUTION_ORDER.",
        },
        403
      );
    }

    const body = await readJsonBody(c);
    const appId = asString(body.appId);
    if (!appId) {
      return c.json(
        {
          error: "appId is required.",
        },
        400
      );
    }

    const existing = downstreamAppRegistry.get(appId);
    if (!existing) {
      return c.json(
        {
          error: `Downstream app "${appId}" was not found.`,
        },
        404
      );
    }

    const provider = classifyMarketplaceProviderForApp(existing);
    if (!provider) {
      return c.json(
        {
          error: `Downstream app "${appId}" is not marketplace-managed.`,
        },
        400
      );
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

  app.get("/api/marketplace/catalog", async (c) => {
    const unauthorized = requireApiKeyResponse(c);
    if (unauthorized) {
      return unauthorized;
    }

    if (!mcpMarketplaceEnabled) {
      return c.json(
        {
          error: "Marketplace is disabled in this Maple build.",
          hint: "Use cleared downstream tools through MAPLE_DOWNSTREAM_APPS and MAPLE_MCP_EXECUTION_ORDER.",
        },
        403
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
          // Warnings already contain unresolved app details.
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
        const appInfo = appMetadata.get(appId);
        return {
          appId,
          appName: appInfo?.name ?? appId,
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
        502
      );
    }
  });
}
