import {
  asBoolean,
  asNumber,
  asString,
  asStringArray,
  asStringRecord,
} from "../helpers.js";
import { downstreamAppRegistry } from "../config.js";
import { buildRuntimeStatus } from "../state.js";
import { listDownstreamApps } from "./downstream-proxy.js";
import {
  clearDownstreamToolsCache,
  toPublicDownstreamApp,
} from "./downstream-resolution.js";
import {
  buildMapleGetStartedPlan,
  localToolResult,
} from "./marketplace-tools.js";
import {
  classifyMarketplaceProviderForApp,
  normalizeMarketplaceId,
  parseMarketplaceProvider,
} from "./marketplace-provider.js";
import type { MarketplaceControlExecutionOptions } from "./marketplace-control-types.js";

export function executeMarketplaceGetStarted(options: MarketplaceControlExecutionOptions) {
  const provider = parseMarketplaceProvider(options.toolArgs.provider) ?? "all";
  const goal = asString(options.toolArgs.goal);
  const connectedApps = listDownstreamApps(downstreamAppRegistry, false).map((entry) => {
    const raw = downstreamAppRegistry.get(entry.id);
    return {
      id: entry.id,
      name: entry.name,
      provider: raw ? classifyMarketplaceProviderForApp(raw) : undefined,
    };
  });
  const runtime = buildRuntimeStatus();
  const plan = buildMapleGetStartedPlan({
    goal,
    provider,
    connectedApps,
  });
  return localToolResult({
    ok: true,
    action: "get_started",
    provider,
    goal: goal ?? null,
    runtime: {
      routeMode: runtime.routeMode,
      routeSummary: runtime.routeSummary,
      routeLock: runtime.routeLock,
      marketplaceEnabled: runtime.marketplaceEnabled,
      connectedAppCount: connectedApps.length,
    },
    connectedApps,
    ...plan,
  });
}

export async function executeMarketplaceSearch(options: MarketplaceControlExecutionOptions) {
  const provider = parseMarketplaceProvider(options.toolArgs.provider) ?? "all";
  const query = asString(options.toolArgs.query);
  const limitRaw = asNumber(options.toolArgs.limit);
  const limit = limitRaw ? Math.max(1, Math.min(50, Math.trunc(limitRaw))) : 12;
  const entries = await options.searchMarketplaceServers({
    provider,
    query,
    limit,
  });
  return localToolResult({
    provider,
    query: query ?? null,
    count: entries.length,
    entries,
  });
}

export async function executeMarketplaceConnect(options: MarketplaceControlExecutionOptions) {
  const provider = parseMarketplaceProvider(options.toolArgs.provider);
  if (provider !== "smithery" && provider !== "mcpso") {
    throw new Error("provider must be smithery or mcpso.");
  }
  const rawId = asString(options.toolArgs.id);
  if (!rawId) {
    throw new Error("id is required.");
  }
  const normalizedId = normalizeMarketplaceId(provider, rawId);
  const timeoutMsRaw = asNumber(options.toolArgs.timeoutMs);
  const registered = await options.registerMarketplaceDownstream({
    provider,
    id: normalizedId,
    overwrite: asBoolean(options.toolArgs.overwrite, false),
    appId: asString(options.toolArgs.appId),
    name: asString(options.toolArgs.name),
    enabled: asBoolean(options.toolArgs.enabled, true),
    timeoutMs: timeoutMsRaw ? Math.max(1_000, Math.min(60_000, Math.trunc(timeoutMsRaw))) : undefined,
    query: asStringRecord(options.toolArgs.query),
    headers: asStringRecord(options.toolArgs.headers),
    apiKey: asString(options.toolArgs.apiKey),
    authHeader: asString(options.toolArgs.authHeader),
    authScheme: asString(options.toolArgs.authScheme)?.toLowerCase() === "raw" ? "raw" : "bearer",
    toolAllowlist: asStringArray(options.toolArgs.toolAllowlist),
    restrictToCatalogTools: asBoolean(options.toolArgs.restrictToCatalogTools, true),
  });
  return localToolResult({
    ok: true,
    action: "connect",
    provider: registered.provider,
    appId: registered.appId,
    replaced: registered.replaced,
    app: toPublicDownstreamApp(registered.app),
    resolved: registered.resolved,
  });
}

export function executeMarketplaceConnectedApps(options: MarketplaceControlExecutionOptions) {
  const provider = parseMarketplaceProvider(options.toolArgs.provider) ?? "all";
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

  return localToolResult({
    provider,
    count: apps.length,
    apps,
  });
}

export function executeMarketplaceDisconnect(options: MarketplaceControlExecutionOptions) {
  const appId = asString(options.toolArgs.appId);
  if (!appId) {
    throw new Error("appId is required.");
  }
  const existing = downstreamAppRegistry.get(appId);
  if (!existing) {
    throw new Error(`Downstream app "${appId}" not found.`);
  }
  const provider = classifyMarketplaceProviderForApp(existing);
  if (!provider) {
    throw new Error(`Downstream app "${appId}" is not marketplace-managed.`);
  }
  downstreamAppRegistry.delete(appId);
  clearDownstreamToolsCache(appId);
  return localToolResult({
    ok: true,
    action: "disconnect",
    provider,
    appId,
  });
}
