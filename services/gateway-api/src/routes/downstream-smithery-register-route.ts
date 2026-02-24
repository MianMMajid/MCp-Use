import { server, database } from "../state.js";
import {
  smitheryEnabled,
  smitheryApiBaseUrl,
  smitheryApiKey,
  smitheryTimeoutMs,
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
  withAbortTimeout,
} from "../helpers.js";
import {
  toPublicDownstreamApp,
  clearDownstreamToolsCache,
} from "../firewall-proxy.js";
import { type DownstreamAppConfig } from "../control/downstream-proxy.js";
import {
  fetchSmitheryServerDetails,
  resolveSmitheryDeploymentUrl,
  toSmitheryDownstreamAppId,
} from "../integrations/smithery.js";

export function registerSmitheryDownstreamRegisterRoute(app: typeof server.app) {
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
        400,
      );
    }

    const body = await readJsonBody(c);
    const qualifiedName = asString(body.qualifiedName) ?? asString(body.server);
    if (!qualifiedName) {
      return c.json(
        {
          error: "qualifiedName is required.",
        },
        400,
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
        }),
      );
    } catch (error) {
      return c.json(
        {
          error: `Failed to resolve Smithery server "${qualifiedName}".`,
          detail: errorMessage(error),
        },
        502,
      );
    }

    const deploymentUrl = resolveSmitheryDeploymentUrl(detail);
    if (!deploymentUrl) {
      return c.json(
        {
          error: `Smithery server "${detail.qualifiedName}" has no HTTP deployment URL.`,
        },
        400,
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
        409,
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
}
