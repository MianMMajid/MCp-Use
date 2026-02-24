import {
  asString,
  isPrivateOrLocalHost,
  parseAppIdList,
} from "../helpers.js";
import {
  downstreamAppRegistry,
  mcpExecutionOrderAppIds,
  mcpFirewallDefaultAppId,
  mcpProxyAllowHttp,
  mcpProxyAllowPrivateTargets,
  mcpProxyAllowedHosts,
  mcpProxyDefaultTargetUrl,
  MAPLE_DEFAULT_TARGET_APP_ID,
} from "../config.js";
import {
  type DownstreamAppConfig,
  type DownstreamAppInfo,
} from "./downstream-proxy.js";
export {
  clearDownstreamToolsCache,
  listToolsFromDownstreamCached,
} from "./downstream-resolution-cache.js";

function hostAllowedByPolicy(hostname: string): boolean {
  if (mcpProxyAllowedHosts.length === 0) {
    return true;
  }
  if (mcpProxyAllowedHosts.includes("*")) {
    return true;
  }
  const lower = hostname.toLowerCase();
  return mcpProxyAllowedHosts.some((allowed) => lower === allowed || lower.endsWith(`.${allowed}`));
}

export function normalizeDynamicMcpUrl(rawUrl: string): string {
  const parsed = new URL(rawUrl);
  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== "https:" && !(protocol === "http:" && mcpProxyAllowHttp)) {
    throw new Error("Dynamic MCP target must use https (or http when MAPLE_MCP_PROXY_ALLOW_HTTP=true).");
  }
  if (process.env.NODE_ENV === "production" && protocol !== "https:") {
    throw new Error("Dynamic MCP target must use https in production.");
  }
  const privateHost = isPrivateOrLocalHost(parsed.hostname);
  const privateAllowed = privateHost && mcpProxyAllowPrivateTargets && process.env.NODE_ENV !== "production";
  if (privateHost && !privateAllowed) {
    throw new Error("Dynamic MCP target host is private/local and is denied by policy.");
  }
  if (!hostAllowedByPolicy(parsed.hostname)) {
    throw new Error("Dynamic MCP target host is not allowlisted.");
  }
  return parsed.toString();
}

export function toDynamicDownstreamAppConfig(rawUrl: string): DownstreamAppConfig {
  const normalizedUrl = normalizeDynamicMcpUrl(rawUrl);
  const parsed = new URL(normalizedUrl);
  const id = `dynamic-${parsed.host.replace(/[^a-z0-9.-]+/gi, "-").toLowerCase()}`;
  return {
    id,
    name: id,
    mcpUrl: normalizedUrl,
    enabled: true,
    timeoutMs: 12_000,
    authHeader: "authorization",
    authScheme: "raw",
  };
}

export function resolveDefaultTargetApp(): DownstreamAppConfig | undefined {
  if (!mcpProxyDefaultTargetUrl) {
    return undefined;
  }
  const dynamic = toDynamicDownstreamAppConfig(mcpProxyDefaultTargetUrl);
  return {
    ...dynamic,
    id: MAPLE_DEFAULT_TARGET_APP_ID,
    name: "default-target",
  };
}

export function resolveAutoConfiguredAppId(): string | undefined {
  if (mcpFirewallDefaultAppId) {
    return mcpFirewallDefaultAppId;
  }
  const enabled = [...downstreamAppRegistry.values()].filter((app) => app.enabled);
  if (enabled.length === 1) {
    return enabled[0].id;
  }
  return undefined;
}

export function resolveDownstreamApp(appId: string): DownstreamAppConfig {
  const app = downstreamAppRegistry.get(appId);
  if (!app && appId === MAPLE_DEFAULT_TARGET_APP_ID) {
    const defaultTargetApp = resolveDefaultTargetApp();
    if (defaultTargetApp) {
      return defaultTargetApp;
    }
  }
  if (!app) {
    throw new Error(`Downstream app "${appId}" is not configured.`);
  }
  if (!app.enabled) {
    throw new Error(`Downstream app "${appId}" is disabled.`);
  }
  return app;
}

export function resolveDispatchAppIds(options: {
  explicitChain?: unknown;
  fallbackAppId?: string;
  includeDefaultExecutionOrder?: boolean;
}): string[] {
  const explicit = parseAppIdList(options.explicitChain);
  if (explicit.length > 0) {
    explicit.forEach((appId) => resolveDownstreamApp(appId));
    return explicit;
  }

  if ((options.includeDefaultExecutionOrder ?? true) && mcpExecutionOrderAppIds.length > 0) {
    mcpExecutionOrderAppIds.forEach((appId) => resolveDownstreamApp(appId));
    return [...mcpExecutionOrderAppIds];
  }

  const fallbackAppId = asString(options.fallbackAppId) ?? resolveAutoConfiguredAppId();
  if (!fallbackAppId) {
    if (mcpProxyDefaultTargetUrl) {
      return [MAPLE_DEFAULT_TARGET_APP_ID];
    }
    throw new Error(
      "No downstream app resolved. Provide appId, chainAppIds, set MAPLE_MCP_EXECUTION_ORDER, or set MAPLE_MCP_PROXY_DEFAULT_TARGET_URL.",
    );
  }
  resolveDownstreamApp(fallbackAppId);
  return [fallbackAppId];
}

export function toPublicDownstreamApp(app: DownstreamAppConfig): DownstreamAppInfo {
  return {
    id: app.id,
    name: app.name,
    description: app.description,
    mcpUrl: app.mcpUrl,
    enabled: app.enabled,
    timeoutMs: app.timeoutMs,
    authHeader: app.authHeader,
    authScheme: app.authScheme,
    hasApiKey: Boolean(app.apiKey),
    headerKeys: app.headers ? Object.keys(app.headers) : [],
    toolAllowlist: app.toolAllowlist,
  };
}
