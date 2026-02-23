import type { Hono } from "hono";
import { server, database } from "../state.js";
import {
  legacySmitheryRoutesEnabled,
  smitheryEnabled,
  smitheryApiBaseUrl,
  smitheryApiKey,
  smitheryTimeoutMs,
  mcpMarketplaceEnabled,
  mcpSoEnabled,
  mcpSoBaseUrl,
  mcpRouteLockEnabled,
  downstreamAppRegistry,
} from "../config.js";
import { requireApiKeyResponse } from "../auth.js";
import {
  asString,
  asNumber,
  asBoolean,
  asStringArray,
  asStringRecord,
  readJsonBody,
  errorMessage,
  buildUrlWithQueryParams,
  parseAppIdList,
  withAbortTimeout,
} from "../helpers.js";
import {
  resolveDownstreamApp,
  resolveDispatchAppIds,
  isSmitheryDownstreamApp,
  isMcpSoDownstreamApp,
  parseMarketplaceProvider,
  classifyMarketplaceProviderForApp,
  searchMarketplaceServers,
  normalizeMarketplaceId,
  registerMarketplaceDownstream,
  toPublicDownstreamApp,
  listToolsFromDownstreamCached,
  clearDownstreamToolsCache,
  listEnabledDownstreamAppIds,
  buildMarketplaceCatalogForAppIds,
  dispatchDownstreamChainAndLog,
} from "../firewall-proxy.js";
import { toPolicySnapshot } from "../trace-helpers.js";
import {
  listDownstreamApps,
  type DownstreamAppConfig,
} from "../../control/downstream-proxy.js";
import {
  fetchSmitheryServerDetails,
  listSmitheryServers,
  resolveSmitheryDeploymentUrl,
  toSmitheryDownstreamAppId,
} from "../../integrations/smithery.js";

export function registerDownstreamRoutes(app: typeof server.app) {
  // ── Legacy Smithery Routes ────────────────────────────────────────────────

  if (legacySmitheryRoutesEnabled) {
    app.get("/api/smithery/servers", async (c) => {
      const unauthorized = await requireApiKeyResponse(c, database);
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
      } catch (error) {
        return c.json(
          {
            error: "Failed to fetch Smithery servers.",
            detail: errorMessage(error),
          },
          502
        );
      }
    });

    app.get("/api/smithery/server", async (c) => {
      const unauthorized = await requireApiKeyResponse(c, database);
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

      const qualifiedName = asString(c.req.query("qualifiedName")) ?? asString(c.req.query("server"));
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
      } catch (error) {
        return c.json(
          {
            error: `Failed to resolve Smithery server "${qualifiedName}".`,
            detail: errorMessage(error),
          },
          502
        );
      }
    });

    app.get("/api/smithery/downstream/registered", async (c) => {
      const unauthorized = await requireApiKeyResponse(c, database);
      if (unauthorized) {
        return unauthorized;
      }

      const smitheryApps = listDownstreamApps(downstreamAppRegistry, true).filter((app) => {
        const raw = downstreamAppRegistry.get(app.id);
        return Boolean(raw && isSmitheryDownstreamApp(raw));
      });

      return c.json({
        source: "smithery",
        count: smitheryApps.length,
        apps: smitheryApps,
      });
    });

    app.post("/api/smithery/downstream/register", async (c) => {
      const unauthorized = await requireApiKeyResponse(c, database);
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
      const timeoutMs = timeoutMsRaw ? Math.max(1_000, Math.min(60_000, Math.trunc(timeoutMsRaw))) : 12_000;

      let detail;
      try {
        detail = await withAbortTimeout(smitheryTimeoutMs, (signal) =>
          fetchSmitheryServerDetails(qualifiedName, {
            apiBaseUrl: smitheryApiBaseUrl,
            apiKey: smitheryApiKey,
            signal,
          })
        );
      } catch (error) {
        return c.json(
          {
            error: `Failed to resolve Smithery server "${qualifiedName}".`,
            detail: errorMessage(error),
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
            .map((tool) => asString(tool.name))
            .filter((name): name is string => Boolean(name))
        : [];
      const allowlist =
        explicitAllowlist.length > 0
          ? explicitAllowlist
          : restrictToCatalogTools && catalogToolNames.length > 0
            ? catalogToolNames
            : undefined;

      const downstreamApp: DownstreamAppConfig = {
        id: appId,
        name: explicitName ?? detail.displayName ?? detail.qualifiedName,
        description: `[smithery] ${detail.qualifiedName}${detail.description ? ` - ${detail.description}` : ""}`,
        mcpUrl,
        enabled,
        timeoutMs,
        apiKey: explicitApiKey,
        authHeader: explicitAuthHeader ?? "authorization",
        authScheme: explicitAuthScheme === "raw" ? "raw" : "bearer",
        headers: headers,
        toolAllowlist: allowlist,
      };

      downstreamAppRegistry.set(appId, downstreamApp);
      clearDownstreamToolsCache(appId);
      return c.json({
        ok: true,
        source: "smithery",
        appId,
        app: toPublicDownstreamApp(downstreamApp),
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
      const unauthorized = await requireApiKeyResponse(c, database);
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

  // ── Marketplace Routes ──────────────────────────────────────────────────────

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
    } catch (error) {
      return c.json(
        {
          error: "Marketplace search failed.",
          detail: errorMessage(error),
        },
        502
      );
    }
  });

  app.get("/api/marketplace/connected", async (c) => {
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
        timeoutMs: timeoutMsRaw ? Math.max(1_000, Math.min(60_000, Math.trunc(timeoutMsRaw))) : undefined,
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
    } catch (error) {
      const detail = errorMessage(error);
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

  // ── Downstream Routes ───────────────────────────────────────────────────────

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

  app.get("/api/downstream/tools", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) {
      return unauthorized;
    }

    const appId = asString(c.req.query("appId"));
    if (!appId) {
      return c.json({ error: "appId query parameter is required." }, 400);
    }

    let downstreamApp: DownstreamAppConfig;
    try {
      downstreamApp = resolveDownstreamApp(appId);
    } catch (configError) {
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
    } catch (listError) {
      return c.json(
        {
          error: "Downstream tools/list failed.",
          detail: errorMessage(listError),
        },
        502
      );
    }
  });

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
        502
      );
    }
  });

  app.post("/api/downstream/dispatch", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) {
      return unauthorized;
    }

    const body = await readJsonBody(c);
    const appId = asString(body.appId);
    const chainInput = body.chainAppIds ?? body.chainApps ?? body.chain;
    const toolName = asString(body.toolName);
    const sessionId = asString(body.sessionId) ?? "maple-control";
    const traceId = asString(body.traceId);
    const toolArgs =
      body.arguments && typeof body.arguments === "object" && !Array.isArray(body.arguments)
        ? (body.arguments as Record<string, unknown>)
        : {};

    if (!toolName) {
      return c.json(
        {
          error: "toolName is required.",
        },
        400
      );
    }

    let appIds: string[];
    try {
      if (mcpRouteLockEnabled) {
        const overrideAttempted = Boolean(appId) || parseAppIdList(chainInput).length > 0;
        if (overrideAttempted) {
          return c.json(
            {
              error:
                "MCP route-lock is enabled. /api/downstream/dispatch does not accept per-request app/chain routing overrides.",
              hint: "Use configured route only (MAPLE_MCP_EXECUTION_ORDER, MAPLE_MCP_FIREWALL_DEFAULT_APP, MAPLE_MCP_PROXY_DEFAULT_TARGET_URL, or a single enabled downstream app).",
            },
            403
          );
        }
      }
      appIds = resolveDispatchAppIds({
        explicitChain: mcpRouteLockEnabled ? undefined : chainInput,
        fallbackAppId: mcpRouteLockEnabled ? undefined : appId,
        includeDefaultExecutionOrder: true,
      });
    } catch (resolutionError) {
      return c.json(
        {
          error: errorMessage(resolutionError),
        },
        400
      );
    }

    try {
      const chainResult = await dispatchDownstreamChainAndLog({
        appIds,
        toolName,
        toolArgs,
        sessionId,
        traceId,
        origin: "api",
      });
      const result = chainResult.finalResult;

      if (!chainResult.ok) {
        const status = chainResult.blockedByPolicy ? 403 : 502;
        return c.json(
          {
            ok: false,
            error: result.failure ?? "Downstream dispatch failed.",
            appId: result.app.id,
            chainAppIds: chainResult.appIds,
            chainStages: chainResult.stages,
            toolName,
            blocked: chainResult.blockedByPolicy,
            blockedByPolicy: chainResult.blockedByPolicy,
            executeAllowed: false,
            policyWouldBlock: result.preExecutionWouldBlock,
            traceId: result.trace.id,
            sessionId: result.trace.sessionId,
            stepIndex: result.step.index,
            preExecutionStepIndex: result.preExecutionStep.index,
            policy: toPolicySnapshot(result.preExecutionDecision),
            overallRiskScore: result.report.overallRiskScore,
            severity: result.report.severity,
          },
          status
        );
      }

      return c.json({
        ok: true,
        appId: result.app.id,
        chainAppIds: chainResult.appIds,
        chainStages: chainResult.stages,
        blocked: false,
        blockedByPolicy: false,
        executeAllowed: true,
        policyWouldBlock: result.preExecutionWouldBlock,
        toolName,
        traceId: result.trace.id,
        sessionId: result.trace.sessionId,
        stepIndex: result.step.index,
        preExecutionStepIndex: result.preExecutionStep.index,
        policy: toPolicySnapshot(result.preExecutionDecision),
        overallRiskScore: result.report.overallRiskScore,
        severity: result.report.severity,
        dispatch: {
          requestId: result.dispatch?.requestId,
          responseStatus: result.dispatch?.responseStatus,
          durationMs: result.dispatch?.durationMs,
        },
        result: result.dispatch?.result,
        resultPreview: result.dispatch?.textPreview,
      });
    } catch (dispatchError) {
      return c.json(
        {
          error: "Downstream dispatch could not be completed.",
          detail: errorMessage(dispatchError),
        },
        400
      );
    }
  });
}
