import { server, database } from "../state.js";
import {
  mcpMarketplaceEnabled,
  smitheryEnabled,
  mcpSoEnabled,
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
} from "../helpers.js";
import {
  parseMarketplaceProvider,
  normalizeMarketplaceId,
  registerMarketplaceDownstream,
  toPublicDownstreamApp,
} from "../firewall-proxy.js";

export function registerMarketplaceConnectRoute(app: typeof server.app) {
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
        403,
      );
    }

    const body = await readJsonBody(c);
    const provider = parseMarketplaceProvider(body.provider);
    if (provider !== "smithery" && provider !== "mcpso") {
      return c.json(
        {
          error: "provider must be smithery or mcpso.",
        },
        400,
      );
    }
    if (provider === "smithery" && !smitheryEnabled) {
      return c.json(
        {
          error: "Smithery integration is disabled.",
          hint: "Set MAPLE_SMITHERY_ENABLED=true.",
        },
        400,
      );
    }
    if (provider === "mcpso" && !mcpSoEnabled) {
      return c.json(
        {
          error: "MCP.so integration is disabled.",
          hint: "Set MAPLE_MCPSO_ENABLED=true.",
        },
        400,
      );
    }

    const rawId = asString(body.id) ?? asString(body.server) ?? asString(body.slug);
    if (!rawId) {
      return c.json(
        {
          error: "id is required.",
        },
        400,
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
        status,
      );
    }
  });
}
