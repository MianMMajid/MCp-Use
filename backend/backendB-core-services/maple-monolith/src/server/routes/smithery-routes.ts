import type { Hono } from "hono";
import type {
  DownstreamAppConfig,
  DownstreamAppInfo,
} from "../../control/downstream-proxy.js";
import type {
  SmitheryListResponse,
  SmitheryServerDetails,
} from "../../integrations/smithery.js";

interface RequireApiKeyContext {
  req: {
    header: (name: string) => string | undefined;
  };
  json: (body: unknown, status?: number) => Response;
}

interface RegisterSmitheryLegacyRoutesDeps {
  asBoolean: (value: unknown, fallback: boolean) => boolean;
  asNumber: (value: unknown) => number | undefined;
  asString: (value: unknown) => string | undefined;
  asStringArray: (value: unknown) => string[];
  asStringRecord: (value: unknown) => Record<string, string>;
  buildUrlWithQueryParams: (baseUrl: string, params: Record<string, string>) => string;
  clearDownstreamToolsCache: (appId?: string) => void;
  downstreamAppRegistry: Map<string, DownstreamAppConfig>;
  errorMessage: (error: unknown) => string;
  fetchSmitheryServerDetails: (qualifiedName: string, options: {
    apiBaseUrl: string;
    apiKey?: string;
    signal?: AbortSignal;
  }) => Promise<SmitheryServerDetails>;
  isSmitheryDownstreamApp: (app: DownstreamAppConfig) => boolean;
  listDownstreamApps: (
    appRegistry: Map<string, DownstreamAppConfig>,
    includeDisabled?: boolean
  ) => DownstreamAppInfo[];
  listSmitheryServers: (options?: {
    apiBaseUrl?: string;
    apiKey?: string;
    signal?: AbortSignal;
    page?: number;
    pageSize?: number;
    query?: string;
    remote?: boolean;
    verified?: boolean;
    deployed?: boolean;
  }) => Promise<SmitheryListResponse>;
  readJsonBody: (c: { req: { json: () => Promise<unknown> } }) => Promise<Record<string, unknown>>;
  requireApiKeyResponse: (c: RequireApiKeyContext) => Response | undefined;
  resolveSmitheryDeploymentUrl: (server: SmitheryServerDetails) => string | undefined;
  smitheryApiBaseUrl: string;
  smitheryApiKey?: string;
  smitheryEnabled: boolean;
  smitheryTimeoutMs: number;
  toPublicDownstreamApp: (app: DownstreamAppConfig) => DownstreamAppInfo;
  toSmitheryDownstreamAppId: (qualifiedName: string) => string;
  withAbortTimeout: <T>(
    timeoutMs: number,
    run: (signal: AbortSignal) => Promise<T>
  ) => Promise<T>;
}

export function registerSmitheryLegacyRoutes(
  app: Hono,
  deps: RegisterSmitheryLegacyRoutesDeps
): void {
  const {
    asBoolean,
    asNumber,
    asString,
    asStringArray,
    asStringRecord,
    buildUrlWithQueryParams,
    clearDownstreamToolsCache,
    downstreamAppRegistry,
    errorMessage,
    fetchSmitheryServerDetails,
    isSmitheryDownstreamApp,
    listDownstreamApps,
    listSmitheryServers,
    readJsonBody,
    requireApiKeyResponse,
    resolveSmitheryDeploymentUrl,
    smitheryApiBaseUrl,
    smitheryApiKey,
    smitheryEnabled,
    smitheryTimeoutMs,
    toPublicDownstreamApp,
    toSmitheryDownstreamAppId,
    withAbortTimeout,
  } = deps;

  app.get("/api/smithery/servers", async (c) => {
    const unauthorized = requireApiKeyResponse(c);
    if (unauthorized) {
      return unauthorized;
    }
    if (!smitheryEnabled) {
      return c.json(
        {
          error: "Smithery integration is disabled.",
          hint: "Set MAPLE_SMITHERY_ENABLED=true.",
        },
        400
      );
    }

    const page = asNumber(c.req.query("page"));
    const pageSize = asNumber(c.req.query("pageSize"));
    const query = asString(c.req.query("q")) ?? asString(c.req.query("query"));
    const remote = asString(c.req.query("remote"));
    const verified = asString(c.req.query("verified"));
    const deployed = asString(c.req.query("deployed"));

    try {
      const data = await withAbortTimeout(smitheryTimeoutMs, (signal) =>
        listSmitheryServers({
          apiBaseUrl: smitheryApiBaseUrl,
          apiKey: smitheryApiKey,
          signal,
          page: page ? Math.max(1, Math.trunc(page)) : 1,
          pageSize: pageSize ? Math.max(1, Math.min(100, Math.trunc(pageSize))) : 20,
          query,
          remote: remote ? remote.toLowerCase() === "true" : undefined,
          verified: verified ? verified.toLowerCase() === "true" : undefined,
          deployed: deployed ? deployed.toLowerCase() === "true" : undefined,
        })
      );

      return c.json({
        source: "smithery",
        apiBaseUrl: smitheryApiBaseUrl,
        count: data.servers.length,
        pagination: data.pagination ?? null,
        servers: data.servers,
      });
    } catch (requestError) {
      return c.json(
        {
          error: "Failed to fetch Smithery servers.",
          detail: errorMessage(requestError),
        },
        502
      );
    }
  });

  app.get("/api/smithery/server", async (c) => {
    const unauthorized = requireApiKeyResponse(c);
    if (unauthorized) {
      return unauthorized;
    }
    if (!smitheryEnabled) {
      return c.json(
        {
          error: "Smithery integration is disabled.",
          hint: "Set MAPLE_SMITHERY_ENABLED=true.",
        },
        400
      );
    }

    const qualifiedName =
      asString(c.req.query("qualifiedName")) ?? asString(c.req.query("server"));
    if (!qualifiedName) {
      return c.json(
        {
          error: "qualifiedName query parameter is required.",
        },
        400
      );
    }

    try {
      const detail = await withAbortTimeout(smitheryTimeoutMs, (signal) =>
        fetchSmitheryServerDetails(qualifiedName, {
          apiBaseUrl: smitheryApiBaseUrl,
          apiKey: smitheryApiKey,
          signal,
        })
      );
      const deploymentUrl = resolveSmitheryDeploymentUrl(detail);
      return c.json({
        source: "smithery",
        apiBaseUrl: smitheryApiBaseUrl,
        server: detail,
        deploymentUrl: deploymentUrl ?? null,
      });
    } catch (requestError) {
      return c.json(
        {
          error: `Failed to resolve Smithery server "${qualifiedName}".`,
          detail: errorMessage(requestError),
        },
        502
      );
    }
  });

  app.get("/api/smithery/downstream/registered", (c) => {
    const unauthorized = requireApiKeyResponse(c);
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

  app.post("/api/smithery/downstream/register", async (c) => {
    const unauthorized = requireApiKeyResponse(c);
    if (unauthorized) {
      return unauthorized;
    }
    if (!smitheryEnabled) {
      return c.json(
        {
          error: "Smithery integration is disabled.",
          hint: "Set MAPLE_SMITHERY_ENABLED=true.",
        },
        400
      );
    }

    const body = await readJsonBody(c);
    const qualifiedName = asString(body.qualifiedName) ?? asString(body.server);
    if (!qualifiedName) {
      return c.json(
        {
          error: "qualifiedName is required.",
        },
        400
      );
    }

    const overwrite = asBoolean(body.overwrite, false);
    const enabled = asBoolean(body.enabled, true);
    const explicitAppId = asString(body.appId);
    const explicitName = asString(body.name);
    const explicitAuthHeader = asString(body.authHeader);
    const explicitAuthScheme = asString(body.authScheme)?.toLowerCase();
    const explicitApiKey = asString(body.apiKey) ?? smitheryApiKey;
    const query = asStringRecord(body.query);
    const headers = asStringRecord(body.headers);
    const explicitAllowlist = asStringArray(body.toolAllowlist);
    const restrictToCatalogTools = asBoolean(body.restrictToCatalogTools, true);
    const timeoutMsRaw = asNumber(body.timeoutMs);
    const timeoutMs = timeoutMsRaw
      ? Math.max(1_000, Math.min(60_000, Math.trunc(timeoutMsRaw)))
      : 12_000;

    let detail: SmitheryServerDetails;
    try {
      detail = await withAbortTimeout(smitheryTimeoutMs, (signal) =>
        fetchSmitheryServerDetails(qualifiedName, {
          apiBaseUrl: smitheryApiBaseUrl,
          apiKey: smitheryApiKey,
          signal,
        })
      );
    } catch (requestError) {
      return c.json(
        {
          error: `Failed to resolve Smithery server "${qualifiedName}".`,
          detail: errorMessage(requestError),
        },
        502
      );
    }

    const deploymentUrl = resolveSmitheryDeploymentUrl(detail);
    if (!deploymentUrl) {
      return c.json(
        {
          error: `Smithery server "${detail.qualifiedName}" has no HTTP deployment URL.`,
        },
        400
      );
    }

    const mcpUrl = buildUrlWithQueryParams(deploymentUrl, query);
    const appId = explicitAppId ?? toSmitheryDownstreamAppId(detail.qualifiedName);
    const existing = downstreamAppRegistry.get(appId);
    if (existing && !overwrite) {
      return c.json(
        {
          error: `Downstream app "${appId}" already exists.`,
          hint: "Set overwrite=true to replace it.",
        },
        409
      );
    }

    const catalogToolNames = Array.isArray(detail.tools)
      ? detail.tools
          .map((tool) => asString((tool as { name?: unknown }).name))
          .filter((name): name is string => Boolean(name))
      : [];
    const allowlist =
      explicitAllowlist.length > 0
        ? explicitAllowlist
        : restrictToCatalogTools && catalogToolNames.length > 0
          ? catalogToolNames
          : undefined;

    const nextApp: DownstreamAppConfig = {
      id: appId,
      name: explicitName ?? detail.displayName ?? detail.qualifiedName,
      description: `[smithery] ${detail.qualifiedName}${detail.description ? ` - ${detail.description}` : ""}`,
      mcpUrl,
      enabled,
      timeoutMs,
      apiKey: explicitApiKey,
      authHeader: explicitAuthHeader ?? "authorization",
      authScheme: explicitAuthScheme === "raw" ? "raw" : "bearer",
      headers,
      toolAllowlist: allowlist,
    };

    downstreamAppRegistry.set(appId, nextApp);
    clearDownstreamToolsCache(appId);
    return c.json({
      ok: true,
      source: "smithery",
      appId,
      app: toPublicDownstreamApp(nextApp),
      server: {
        qualifiedName: detail.qualifiedName,
        displayName: detail.displayName,
        deploymentUrl,
        toolCount: catalogToolNames.length,
      },
      replaced: Boolean(existing),
    });
  });

  app.post("/api/smithery/downstream/unregister", async (c) => {
    const unauthorized = requireApiKeyResponse(c);
    if (unauthorized) {
      return unauthorized;
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
    if (!isSmitheryDownstreamApp(existing)) {
      return c.json(
        {
          error: `Downstream app "${appId}" is not managed by Smithery integration.`,
        },
        400
      );
    }

    downstreamAppRegistry.delete(appId);
    clearDownstreamToolsCache(appId);
    return c.json({
      ok: true,
      source: "smithery",
      appId,
    });
  });
}
