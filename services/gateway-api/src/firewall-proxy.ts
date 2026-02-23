/**
 * firewall-proxy.ts
 *
 * Extracted from app.ts: downstream app resolution, marketplace types and
 * helpers, tool caching, chain dispatch, JSON-RPC forwarding, and the main
 * handleMcpFirewallProxy function that drives the MCP proxy endpoint.
 */

import {
  asString,
  asNumber,
  asBoolean,
  asObject,
  asStringArray,
  asStringRecord,
  parseAppIdList,
  dedupeBy,
  errorMessage,
  jsonRpcErrorPayload,
  isPrivateOrLocalHost,
  truncateText,
  compactUnknown,
  summarizeJsonRpcPayload,
  extractFirstUrl,
  extractLikelyCommand,
  buildUrlWithQueryParams,
  withAbortTimeout,
} from "./helpers.js";

import { mapleLog } from "./logging.js";

import {
  auditAndPersist,
  createTraceForCurrentOwner,
  upsertTraceForCurrentOwner,
  getTraceForCurrentOwner,
  getLatestTraceBySessionForCurrentOwner,
  inferStepTypeFromDownstream,
  toInvocationSummary,
  toPolicySnapshot,
} from "./trace-helpers.js";

import { buildRuntimeStatus } from "./state.js";

import {
  downstreamAppRegistry,
  mcpExecutionOrderAppIds,
  mcpFirewallDefaultAppId,
  mcpProxyDefaultTargetUrl,
  mcpProxyAllowDynamicTargets,
  mcpProxyAllowPrivateTargets,
  mcpProxyAllowedHosts,
  mcpProxyAllowHttp,
  mcpRouteLockEnabled,
  mcpMarketplaceEnabled,
  mcpMarketplaceAutoConnectEnabled,
  smitheryEnabled,
  smitheryApiBaseUrl,
  smitheryApiKey,
  smitheryTimeoutMs,
  mcpSoEnabled,
  mcpSoBaseUrl,
  mcpSoTimeoutMs,
  downstreamToolsCacheTtlMs,
  MAPLE_DEFAULT_TARGET_APP_ID,
} from "./config.js";

import {
  evaluateFirewallStep,
  type FirewallStepDecision,
} from "@maple/security";

import {
  dispatchToolToDownstream,
  forwardJsonRpcToDownstream,
  listDownstreamApps,
  listToolsFromDownstream,
  type DownstreamAppConfig,
  type DownstreamAppInfo,
  type DownstreamCallResult,
  type DownstreamJsonRpcForwardResult,
  type DownstreamToolInfo,
} from "./control/downstream-proxy.js";

import {
  fetchSmitheryServerDetails,
  listSmitheryServers,
  resolveSmitheryDeploymentUrl,
  toSmitheryDownstreamAppId,
} from "./integrations/smithery.js";

import {
  resolveMcpSoDeploymentUrl,
  resolveMcpSoServerDetails,
  searchMcpSoServers,
  toMcpSoDownstreamAppId,
} from "./integrations/mcpso.js";

import { analyzeTraceRisks } from "@maple/risk-engine";

import type { Trace, TraceStep } from "@maple/types";

// ═══════════════════════════════════════════════════════════════════════════════
// Tool caching infrastructure
// ═══════════════════════════════════════════════════════════════════════════════

type DownstreamToolsListResult = Awaited<ReturnType<typeof listToolsFromDownstream>>;

const downstreamToolsCache = new Map<
  string,
  {
    expiresAt: number;
    value: DownstreamToolsListResult;
  }
>();
const downstreamToolsInFlight = new Map<string, Promise<DownstreamToolsListResult>>();

// ═══════════════════════════════════════════════════════════════════════════════
// Host / URL validation helpers
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// Downstream tool cache operations
// ═══════════════════════════════════════════════════════════════════════════════

export function clearDownstreamToolsCache(appId?: string): void {
  if (appId) {
    downstreamToolsCache.delete(appId);
    downstreamToolsInFlight.delete(appId);
    return;
  }
  downstreamToolsCache.clear();
  downstreamToolsInFlight.clear();
}

function getCachedDownstreamTools(appId: string): DownstreamToolsListResult | undefined {
  const cached = downstreamToolsCache.get(appId);
  if (!cached) {
    return undefined;
  }
  if (Date.now() >= cached.expiresAt) {
    downstreamToolsCache.delete(appId);
    return undefined;
  }
  return cached.value;
}

function setCachedDownstreamTools(appId: string, value: DownstreamToolsListResult): void {
  downstreamToolsCache.set(appId, {
    expiresAt: Date.now() + downstreamToolsCacheTtlMs,
    value,
  });
}

export async function listToolsFromDownstreamCached(
  app: DownstreamAppConfig,
  options: { forceRefresh?: boolean } = {}
): Promise<DownstreamToolsListResult> {
  if (!options.forceRefresh) {
    const cached = getCachedDownstreamTools(app.id);
    if (cached) {
      return cached;
    }
    const inFlight = downstreamToolsInFlight.get(app.id);
    if (inFlight) {
      return inFlight;
    }
  }

  const task = listToolsFromDownstream(app)
    .then((listed) => {
      setCachedDownstreamTools(app.id, listed);
      return listed;
    })
    .finally(() => {
      downstreamToolsInFlight.delete(app.id);
    });
  downstreamToolsInFlight.set(app.id, task);
  return task;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Default target & auto-configured app resolution
// ═══════════════════════════════════════════════════════════════════════════════

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

function resolveAutoConfiguredAppId(): string | undefined {
  if (mcpFirewallDefaultAppId) {
    return mcpFirewallDefaultAppId;
  }
  const enabled = [...downstreamAppRegistry.values()].filter((app) => app.enabled);
  if (enabled.length === 1) {
    return enabled[0].id;
  }
  return undefined;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Downstream app resolution
// ═══════════════════════════════════════════════════════════════════════════════

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

export function isSmitheryDownstreamApp(app: DownstreamAppConfig): boolean {
  return app.id.startsWith("smithery-") || app.description?.startsWith("[smithery] ") === true;
}

export function isMcpSoDownstreamApp(app: DownstreamAppConfig): boolean {
  return app.id.startsWith("mcpso-") || app.description?.startsWith("[mcpso] ") === true;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Marketplace types
// ═══════════════════════════════════════════════════════════════════════════════

export type MarketplaceProvider = "smithery" | "mcpso";

export interface MarketplaceSearchEntry {
  provider: MarketplaceProvider;
  id: string;
  title: string;
  description?: string;
  sourceUrl?: string;
  appIdSuggestion: string;
  connectable?: boolean;
  resolvedMcpUrl?: string;
  allowCall?: boolean;
}

export interface MarketplaceResolvedServer {
  provider: MarketplaceProvider;
  id: string;
  title: string;
  description?: string;
  sourceUrl?: string;
  appIdSuggestion: string;
  mcpUrl?: string;
  defaultToolAllowlist?: string[];
}

export interface RegisterMarketplaceDownstreamOptions {
  provider: MarketplaceProvider;
  id: string;
  overwrite?: boolean;
  appId?: string;
  name?: string;
  enabled?: boolean;
  timeoutMs?: number;
  resolvedTitle?: string;
  resolvedDescription?: string;
  resolvedSourceUrl?: string;
  resolvedMcpUrl?: string;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  apiKey?: string;
  authHeader?: string;
  authScheme?: "raw" | "bearer";
  toolAllowlist?: string[];
  restrictToCatalogTools?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Marketplace helpers
// ═══════════════════════════════════════════════════════════════════════════════

export function parseMarketplaceProvider(value: unknown): MarketplaceProvider | "all" | undefined {
  const normalized = asString(value)?.toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (normalized === "all") {
    return "all";
  }
  if (normalized === "smithery" || normalized === "mcpso") {
    return normalized;
  }
  return undefined;
}

function parseMcpSoSlug(value: string): { slug?: string; serverUrl?: string } {
  const normalized = value.trim();
  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    return {
      serverUrl: normalized,
    };
  }
  return {
    slug: normalized.replace(/^\/+/, "").replace(/^server\//, ""),
  };
}

export function normalizeMarketplaceId(provider: MarketplaceProvider, rawId: string): string {
  const trimmed = rawId.trim();
  if (provider === "smithery") {
    return trimmed;
  }
  const mcpSoParsed = parseMcpSoSlug(trimmed);
  if (mcpSoParsed.serverUrl) {
    try {
      const parsed = new URL(mcpSoParsed.serverUrl);
      if (parsed.pathname.startsWith("/server/")) {
        return parsed.pathname.replace(/^\/server\//, "").replace(/\/+$/, "");
      }
    } catch {
      return trimmed;
    }
  }
  return mcpSoParsed.slug ?? trimmed;
}

export async function searchMarketplaceServers(options: {
  provider?: MarketplaceProvider | "all";
  query?: string;
  limit?: number;
}): Promise<MarketplaceSearchEntry[]> {
  const provider = options.provider ?? "all";
  const limit = options.limit ? Math.max(1, Math.min(100, Math.trunc(options.limit))) : 20;
  const query = asString(options.query);
  const requests: Array<Promise<MarketplaceSearchEntry[]>> = [];

  if ((provider === "all" || provider === "smithery") && smitheryEnabled) {
    requests.push(
      withAbortTimeout(smitheryTimeoutMs, (signal) =>
        listSmitheryServers({
          apiBaseUrl: smitheryApiBaseUrl,
          apiKey: smitheryApiKey,
          signal,
          query,
          page: 1,
          pageSize: Math.max(limit, 20),
        })
      ).then((smithery) =>
        smithery.servers.map((server) => {
          const id = server.qualifiedName;
          return {
            provider: "smithery" as const,
            id,
            title: server.displayName ?? id,
            description: server.description,
            sourceUrl: `https://smithery.ai/server/${encodeURIComponent(id)}`,
            appIdSuggestion: toSmitheryDownstreamAppId(id),
            connectable: server.isDeployed,
          };
        })
      )
    );
  }

  if ((provider === "all" || provider === "mcpso") && mcpSoEnabled) {
    requests.push(
      withAbortTimeout(mcpSoTimeoutMs, (signal) =>
        searchMcpSoServers({
          baseUrl: mcpSoBaseUrl,
          signal,
          query,
          limit: Math.max(limit, 20),
        })
      ).then((mcpSo) =>
        mcpSo.map((server) => {
          const id = server.slug || server.id;
          return {
            provider: "mcpso" as const,
            id,
            title: server.title,
            description: server.description,
            sourceUrl: server.sourceUrl,
            allowCall: server.allowCall,
            appIdSuggestion: toMcpSoDownstreamAppId(server.slug),
            connectable: Boolean(server.resolvedMcpUrl),
            resolvedMcpUrl: server.resolvedMcpUrl,
          };
        })
      )
    );
  }

  const entries = (await Promise.all(requests)).flat();
  const prioritized = [...entries].sort((a, b) => {
    const rank = (entry: MarketplaceSearchEntry): number => {
      if (entry.connectable === true) {
        return 2;
      }
      if (entry.connectable === false) {
        return 0;
      }
      return 1;
    };
    return rank(b) - rank(a);
  });
  const deduped = dedupeBy(prioritized, (entry) => `${entry.provider}:${entry.id.toLowerCase()}`);
  return deduped.slice(0, limit);
}

async function resolveMarketplaceServer(options: {
  provider: MarketplaceProvider;
  id: string;
}): Promise<MarketplaceResolvedServer> {
  if (options.provider === "smithery") {
    const detail = await withAbortTimeout(smitheryTimeoutMs, (signal) =>
      fetchSmitheryServerDetails(options.id, {
        apiBaseUrl: smitheryApiBaseUrl,
        apiKey: smitheryApiKey,
        signal,
      })
    );
    const deploymentUrl = resolveSmitheryDeploymentUrl(detail);
    const allowlist = Array.isArray(detail.tools)
      ? detail.tools
          .map((tool) => asString(tool.name))
          .filter((name): name is string => Boolean(name))
      : [];
    return {
      provider: "smithery",
      id: detail.qualifiedName,
      title: detail.displayName ?? detail.qualifiedName,
      description: detail.description,
      sourceUrl: `https://smithery.ai/server/${encodeURIComponent(detail.qualifiedName)}`,
      appIdSuggestion: toSmitheryDownstreamAppId(detail.qualifiedName),
      mcpUrl: deploymentUrl,
      defaultToolAllowlist: allowlist,
    };
  }

  const parsed = parseMcpSoSlug(options.id);
  const detail = await withAbortTimeout(mcpSoTimeoutMs, (signal) =>
    resolveMcpSoServerDetails({
      baseUrl: mcpSoBaseUrl,
      signal,
      slug: parsed.slug,
      serverUrl: parsed.serverUrl,
    })
  );
  return {
    provider: "mcpso",
    id: detail.slug || detail.id,
    title: detail.title,
    description: detail.description,
    sourceUrl: detail.pageUrl,
    appIdSuggestion: toMcpSoDownstreamAppId(detail.slug),
    mcpUrl: resolveMcpSoDeploymentUrl({
      sse_url: detail.sseUrl,
      server_config: detail.serverConfig,
      server_command: detail.serverCommand,
      url: detail.sourceUrl,
    }),
  };
}

export async function registerMarketplaceDownstream(
  options: RegisterMarketplaceDownstreamOptions
): Promise<{
  app: DownstreamAppConfig;
  appId: string;
  provider: MarketplaceProvider;
  resolved: MarketplaceResolvedServer;
  replaced: boolean;
}> {
  const preResolvedMcpUrl = asString(options.resolvedMcpUrl);
  const resolved = preResolvedMcpUrl
    ? {
        provider: options.provider,
        id: options.id,
        title: options.resolvedTitle ?? options.name ?? options.id,
        description: options.resolvedDescription,
        sourceUrl: options.resolvedSourceUrl,
        appIdSuggestion:
          options.provider === "smithery"
            ? toSmitheryDownstreamAppId(options.id)
            : toMcpSoDownstreamAppId(options.id),
        mcpUrl: preResolvedMcpUrl,
      }
    : await resolveMarketplaceServer({
        provider: options.provider,
        id: options.id,
      });
  if (!resolved.mcpUrl) {
    throw new Error(
      `${resolved.provider} server "${resolved.id}" does not expose a public HTTP MCP endpoint.`
    );
  }

  const normalizedMcpUrl = normalizeDynamicMcpUrl(resolved.mcpUrl);
  const mcpUrl = buildUrlWithQueryParams(normalizedMcpUrl, options.query ?? {});
  const appId = options.appId ?? resolved.appIdSuggestion;
  const existing = downstreamAppRegistry.get(appId);
  if (existing && !options.overwrite) {
    throw new Error(`Downstream app "${appId}" already exists. Set overwrite=true to replace it.`);
  }

  const timeoutMs = options.timeoutMs
    ? Math.max(1_000, Math.min(60_000, Math.trunc(options.timeoutMs)))
    : 12_000;
  const authHeader = options.authHeader?.trim() || "authorization";
  const authScheme = options.authScheme === "raw" ? "raw" : "bearer";
  const allowlist =
    options.toolAllowlist && options.toolAllowlist.length > 0
      ? options.toolAllowlist
      : options.restrictToCatalogTools !== false && resolved.defaultToolAllowlist && resolved.defaultToolAllowlist.length > 0
        ? resolved.defaultToolAllowlist
        : undefined;

  const app: DownstreamAppConfig = {
    id: appId,
    name: options.name ?? resolved.title,
    description: `[${resolved.provider}] ${resolved.id}${resolved.description ? ` - ${resolved.description}` : ""}`,
    mcpUrl,
    enabled: options.enabled ?? true,
    timeoutMs,
    apiKey:
      options.apiKey ??
      (resolved.provider === "smithery" ? smitheryApiKey : undefined),
    authHeader,
    authScheme,
    headers: options.headers && Object.keys(options.headers).length > 0 ? options.headers : undefined,
    toolAllowlist: allowlist,
  };
  downstreamAppRegistry.set(appId, app);
  clearDownstreamToolsCache(appId);
  return {
    app,
    appId,
    provider: resolved.provider,
    resolved,
    replaced: Boolean(existing),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Dispatch app resolution
// ═══════════════════════════════════════════════════════════════════════════════

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
      "No downstream app resolved. Provide appId, chainAppIds, set MAPLE_MCP_EXECUTION_ORDER, or set MAPLE_MCP_PROXY_DEFAULT_TARGET_URL."
    );
  }
  resolveDownstreamApp(fallbackAppId);
  return [fallbackAppId];
}

function toDynamicDownstreamAppConfig(rawUrl: string): DownstreamAppConfig {
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

function applyToolAllowlist(app: DownstreamAppConfig, tools: Array<Record<string, unknown>>) {
  const allowlist = app.toolAllowlist;
  if (!allowlist || allowlist.length === 0) {
    return tools;
  }
  return tools.filter((tool) => {
    const name = asString(tool.name);
    return Boolean(name && allowlist.includes(name));
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// MCP proxy target resolution
// ═══════════════════════════════════════════════════════════════════════════════

interface McpProxyTargetResolution {
  app: DownstreamAppConfig;
  mode: "configured" | "dynamic";
}

// ═══════════════════════════════════════════════════════════════════════════════
// Marketplace tool types & catalog
// ═══════════════════════════════════════════════════════════════════════════════

export interface MarketplaceToolEntry {
  appId: string;
  appName: string;
  toolName: string;
  qualifiedName: string;
  description?: string;
  inputSchema?: unknown;
  annotations?: Record<string, unknown>;
}

export interface MarketplaceCatalogResult {
  appIds: string[];
  tools: MarketplaceToolEntry[];
  warnings: Array<{ appId: string; message: string }>;
}

interface MarketplaceControlToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const MARKETPLACE_CONTROL_TOOLS: MarketplaceControlToolDefinition[] = [
  {
    name: "maple_get_started",
    description:
      "LLM quickstart for Maple routing. Returns the exact next MCP calls (search/connect/call) based on current Maple state so no UI steps are required.",
    inputSchema: {
      type: "object",
      properties: {
        goal: {
          type: "string",
          description: "Optional task goal (for example: weather lookup, web search, crm read).",
        },
        provider: {
          type: "string",
          enum: ["all", "smithery", "mcpso"],
          description: "Marketplace provider preference for suggested next calls.",
        },
      },
    },
  },
  {
    name: "maple_autoroute_call",
    description:
      "One-call execution path for LLMs: resolve downstream app, optionally auto-connect from marketplace, then call the requested tool through Maple firewall.",
    inputSchema: {
      type: "object",
      properties: {
        toolName: {
          type: "string",
          description: "Tool name to execute. Supports plain toolName or namespaced appId::toolName.",
        },
        arguments: {
          type: "object",
          description: "Arguments for the downstream tool call.",
        },
        appId: {
          type: "string",
          description: "Optional explicit downstream app ID.",
        },
        sessionId: {
          type: "string",
          description: "Optional session ID used for trace grouping.",
        },
        traceId: {
          type: "string",
          description: "Optional existing trace ID to append to.",
        },
        autoConnect: {
          type: "boolean",
          description: "If true and tool is unresolved, Maple searches/connects marketplace apps automatically.",
        },
        provider: {
          type: "string",
          enum: ["all", "smithery", "mcpso"],
          description: "Marketplace provider used for auto-connect lookup.",
        },
        searchQuery: {
          type: "string",
          description: "Optional marketplace search query. Defaults to toolName.",
        },
        searchLimit: {
          type: "number",
          minimum: 1,
          maximum: 20,
          description: "Maximum marketplace entries to try during auto-connect.",
        },
      },
      required: ["toolName"],
    },
  },
  {
    name: "maple_marketplace_search",
    description:
      "Search MCP marketplaces (Smithery and MCP.so) and return connectable servers Maple can route through firewall policy.",
    inputSchema: {
      type: "object",
      properties: {
        provider: {
          type: "string",
          enum: ["all", "smithery", "mcpso"],
          description: "Marketplace provider to search. Default is all.",
        },
        query: {
          type: "string",
          description: "Search query.",
        },
        limit: {
          type: "number",
          minimum: 1,
          maximum: 50,
          description: "Maximum results to return.",
        },
      },
    },
  },
  {
    name: "maple_marketplace_connect",
    description:
      "Connect/register a marketplace server as a downstream MCP app in Maple so tools can be called through Maple firewall.",
    inputSchema: {
      type: "object",
      properties: {
        provider: {
          type: "string",
          enum: ["smithery", "mcpso"],
          description: "Marketplace provider.",
        },
        id: {
          type: "string",
          description:
            "Server identifier. Smithery: qualifiedName (@owner/name). MCP.so: slug (name/author) or full server URL.",
        },
        appId: {
          type: "string",
          description: "Optional custom downstream app ID.",
        },
        overwrite: {
          type: "boolean",
          description: "Replace existing app with same appId.",
        },
        timeoutMs: {
          type: "number",
          minimum: 1000,
          maximum: 60000,
          description: "Per-request timeout for downstream app.",
        },
      },
      required: ["provider", "id"],
    },
  },
  {
    name: "maple_marketplace_connected_apps",
    description: "List currently connected marketplace apps registered in Maple.",
    inputSchema: {
      type: "object",
      properties: {
        provider: {
          type: "string",
          enum: ["all", "smithery", "mcpso"],
          description: "Optional provider filter.",
        },
      },
    },
  },
  {
    name: "maple_marketplace_disconnect",
    description: "Disconnect/unregister a connected marketplace app from Maple.",
    inputSchema: {
      type: "object",
      properties: {
        appId: {
          type: "string",
          description: "Downstream app ID to remove.",
        },
      },
      required: ["appId"],
    },
  },
];

function getMarketplaceControlTools() {
  if (!mcpMarketplaceEnabled) {
    return [] as MarketplaceControlToolDefinition[];
  }
  return MARKETPLACE_CONTROL_TOOLS;
}

function isMarketplaceControlToolName(toolName: string): boolean {
  return getMarketplaceControlTools().some((tool) => tool.name === toolName);
}

const MAPLE_NATIVE_TOOL_NAMES = new Set<string>([
  "observe_session",
  "replay_fork",
  "audit_risk",
  "ml_anomaly_report",
  "guard_action",
  "ingest_session_event",
  "share_trace_anon",
  "suggest_evolved_skills",
  "yc_app_brief",
  "list_traces",
  "export_trace",
  "list_downstream_apps",
  "list_downstream_tools",
  "dispatch_downstream_tool",
]);

function isMapleNativeToolName(toolName: string): boolean {
  return MAPLE_NATIVE_TOOL_NAMES.has(toolName);
}

function namespaceMarketplaceToolName(appId: string, toolName: string): string {
  return `${appId}::${toolName}`;
}

function parseMarketplaceToolName(value: string): { appId: string; toolName: string } | undefined {
  const separatorIndex = value.indexOf("::");
  if (separatorIndex <= 0) {
    return undefined;
  }
  const appId = value.slice(0, separatorIndex).trim();
  const toolName = value.slice(separatorIndex + 2).trim();
  if (!appId || !toolName) {
    return undefined;
  }
  return {
    appId,
    toolName,
  };
}

function filterAllowedDownstreamTools(
  app: DownstreamAppConfig,
  tools: DownstreamToolInfo[]
): DownstreamToolInfo[] {
  const allowlist = app.toolAllowlist;
  if (!allowlist || allowlist.length === 0) {
    return tools;
  }
  return tools.filter((tool) => allowlist.includes(tool.name));
}

function resolveMarketplaceAppIds(target: McpProxyTargetResolution): string[] {
  if (target.mode === "dynamic") {
    return [target.app.id];
  }

  if (mcpExecutionOrderAppIds.length > 0) {
    return [...new Set(mcpExecutionOrderAppIds)];
  }

  if (mcpFirewallDefaultAppId) {
    return [mcpFirewallDefaultAppId];
  }

  const auto = resolveAutoConfiguredAppId();
  if (auto) {
    return [auto];
  }

  if (!mcpRouteLockEnabled) {
    const enabled = [...downstreamAppRegistry.values()]
      .filter((app) => app.enabled)
      .map((app) => app.id);
    if (enabled.length > 0) {
      return enabled;
    }
  }

  return [target.app.id];
}

async function buildMarketplaceCatalog(
  target: McpProxyTargetResolution
): Promise<MarketplaceCatalogResult> {
  const appIds = resolveMarketplaceAppIds(target);
  return buildMarketplaceCatalogForAppIds(appIds);
}

export function listEnabledDownstreamAppIds(): string[] {
  return [...downstreamAppRegistry.values()]
    .filter((app) => app.enabled)
    .map((app) => app.id);
}

export async function buildMarketplaceCatalogForAppIds(
  appIds: string[]
): Promise<MarketplaceCatalogResult> {
  const uniqueAppIds = [...new Set(appIds)];
  const warnings: Array<{ appId: string; message: string }> = [];
  const tools: MarketplaceToolEntry[] = [];

  const results = await Promise.all(
    uniqueAppIds.map(async (appId) => {
      try {
        const app = resolveDownstreamApp(appId);
        const listed = await listToolsFromDownstreamCached(app);
        return {
          appId,
          app,
          tools: filterAllowedDownstreamTools(app, listed.tools),
          error: undefined,
        };
      } catch (error) {
        return {
          appId,
          app: undefined,
          tools: [] as DownstreamToolInfo[],
          error: errorMessage(error),
        };
      }
    })
  );

  for (const result of results) {
    if (!result.app) {
      warnings.push({
        appId: result.appId,
        message: result.error ?? "Unknown marketplace listing error.",
      });
      continue;
    }

    for (const tool of result.tools) {
      tools.push({
        appId: result.app.id,
        appName: result.app.name,
        toolName: tool.name,
        qualifiedName: namespaceMarketplaceToolName(result.app.id, tool.name),
        description: tool.description,
        inputSchema: tool.inputSchema,
        ...(tool.annotations ? { annotations: tool.annotations } : {}),
      });
    }
  }

  return {
    appIds: uniqueAppIds,
    tools,
    warnings,
  };
}

export function classifyMarketplaceProviderForApp(
  app: DownstreamAppConfig
): MarketplaceProvider | undefined {
  if (isSmitheryDownstreamApp(app)) {
    return "smithery";
  }
  if (isMcpSoDownstreamApp(app)) {
    return "mcpso";
  }
  return undefined;
}

function localToolResult(payload: unknown) {
  let textPayload = "";
  try {
    textPayload = JSON.stringify(payload, null, 2);
  } catch {
    textPayload = String(payload ?? "");
  }
  return {
    content: [
      {
        type: "text",
        text: textPayload,
      },
    ],
    structuredContent: payload,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Auto-route tool matching
// ═══════════════════════════════════════════════════════════════════════════════

interface AutoRouteToolMatch {
  appId: string;
  appName: string;
  toolName: string;
  qualifiedName: string;
  source: "connected" | "auto_connected";
}

async function findConnectedToolMatches(
  toolName: string,
  appIds?: string[]
): Promise<AutoRouteToolMatch[]> {
  const normalizedTool = toolName.trim();
  if (!normalizedTool) {
    return [];
  }
  const candidates = [...new Set(appIds && appIds.length > 0 ? appIds : listEnabledDownstreamAppIds())];
  const matches: AutoRouteToolMatch[] = [];

  const results = await Promise.all(
    candidates.map(async (appId) => {
      try {
        const app = resolveDownstreamApp(appId);
        const listed = await listToolsFromDownstreamCached(app);
        const allowedTools = filterAllowedDownstreamTools(app, listed.tools);
        const exact = allowedTools.find((tool) => tool.name === normalizedTool);
        if (!exact) {
          return undefined;
        }
        return {
          appId: app.id,
          appName: app.name,
          toolName: exact.name,
          qualifiedName: namespaceMarketplaceToolName(app.id, exact.name),
        };
      } catch {
        return undefined;
      }
    })
  );

  for (const result of results) {
    if (!result) {
      continue;
    }
    matches.push({
      ...result,
      source: "connected",
    });
  }
  return matches;
}

function buildMapleGetStartedPlan(options: {
  goal?: string;
  provider: MarketplaceProvider | "all";
  connectedApps: Array<{
    id: string;
    name: string;
    provider?: MarketplaceProvider;
  }>;
}) {
  const goal = options.goal ?? "general task";
  if (options.connectedApps.length > 0) {
    return {
      mode: "ready",
      message:
        "Maple already has connected downstream apps. Call maple_autoroute_call with the desired toolName to execute without UI steps.",
      nextCalls: [
        {
          step: 1,
          method: "tools/call",
          params: {
            name: "maple_autoroute_call",
            arguments: {
              toolName: "replace_with_tool_name",
              arguments: {},
              autoConnect: true,
            },
          },
        },
      ],
      guidance: [
        "Run tools/list to inspect currently available downstream tools.",
        "If multiple apps expose the same tool, pass appId or use appId::toolName.",
      ],
    };
  }

  return {
    mode: "needs_connection",
    message:
      "No downstream apps are connected yet. Use the next calls below in order; no dashboard buttons are required.",
    nextCalls: [
      {
        step: 1,
        method: "tools/call",
        params: {
          name: "maple_marketplace_search",
          arguments: {
            provider: options.provider,
            query: goal,
            limit: 5,
          },
        },
      },
      {
        step: 2,
        method: "tools/call",
        params: {
          name: "maple_marketplace_connect",
          arguments: {
            provider: options.provider === "all" ? "mcpso" : options.provider,
            id: "choose_id_from_step_1",
          },
        },
      },
      {
        step: 3,
        method: "tools/call",
        params: {
          name: "maple_autoroute_call",
          arguments: {
            toolName: "replace_with_tool_name",
            arguments: {},
            autoConnect: true,
          },
        },
      },
    ],
    guidance: [
      "Prefer maple_autoroute_call for execution; it resolves/auto-connects apps when possible.",
      "Use maple_marketplace_connected_apps to verify connected app IDs.",
    ],
  };
}

async function autoConnectAndResolveToolMatch(options: {
  toolName: string;
  provider: MarketplaceProvider | "all";
  searchQuery: string;
  searchLimit: number;
}): Promise<{
  match?: AutoRouteToolMatch;
  entries: MarketplaceSearchEntry[];
  attempted: string[];
  warnings: string[];
}> {
  const entries = await searchMarketplaceServers({
    provider: options.provider,
    query: options.searchQuery,
    limit: options.searchLimit,
  });
  const prioritizedEntries = [...entries].sort((a, b) => {
    const rank = (entry: MarketplaceSearchEntry): number => {
      if (entry.connectable === true) {
        return 2;
      }
      if (entry.connectable === false) {
        return 0;
      }
      return 1;
    };
    return rank(b) - rank(a);
  });
  const attempted: string[] = [];
  const warnings: string[] = [];

  for (const entry of prioritizedEntries) {
    const normalizedId = normalizeMarketplaceId(entry.provider, entry.id);
    const appId = entry.appIdSuggestion;
    attempted.push(`${entry.provider}:${entry.id}`);

    if (entry.connectable === false) {
      warnings.push(
        `${entry.provider}:${entry.id}: skipped because no request/response HTTP MCP endpoint was advertised`
      );
      continue;
    }

    if (!downstreamAppRegistry.has(appId)) {
      try {
        await registerMarketplaceDownstream({
          provider: entry.provider,
          id: normalizedId,
          appId,
          overwrite: false,
          restrictToCatalogTools: true,
          resolvedTitle: entry.title,
          resolvedDescription: entry.description,
          resolvedSourceUrl: entry.sourceUrl,
          resolvedMcpUrl: entry.resolvedMcpUrl,
        });
      } catch (connectError) {
        warnings.push(`${entry.provider}:${entry.id}: ${errorMessage(connectError)}`);
        continue;
      }
    }

    const matches = await findConnectedToolMatches(options.toolName, [appId]);
    if (matches.length > 0) {
      return {
        match: {
          ...matches[0],
          source: "auto_connected",
        },
        entries: prioritizedEntries,
        attempted,
        warnings,
      };
    }
  }

  return {
    entries: prioritizedEntries,
    attempted,
    warnings,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Marketplace control tool execution
// ═══════════════════════════════════════════════════════════════════════════════

async function executeMarketplaceControlTool(
  toolName: string,
  toolArgs: Record<string, unknown>
) {
  if (toolName === "maple_get_started") {
    const provider = parseMarketplaceProvider(toolArgs.provider) ?? "all";
    const goal = asString(toolArgs.goal);
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

  if (toolName === "maple_autoroute_call") {
    const requestedToolName = asString(toolArgs.toolName);
    if (!requestedToolName) {
      throw new Error("toolName is required.");
    }
    const explicitAppId = asString(toolArgs.appId);
    const parsedQualified = parseMarketplaceToolName(requestedToolName);
    const normalizedToolName = parsedQualified?.toolName ?? requestedToolName;
    const appIdHint = parsedQualified?.appId ?? explicitAppId;
    const downstreamArgs =
      toolArgs.arguments && typeof toolArgs.arguments === "object" && !Array.isArray(toolArgs.arguments)
        ? (toolArgs.arguments as Record<string, unknown>)
        : {};
    const sessionId =
      asString(toolArgs.sessionId) ??
      `mcp-autoroute-${(appIdHint ?? normalizedToolName).replace(/[^a-z0-9_-]+/gi, "-").toLowerCase()}`;
    const traceId = asString(toolArgs.traceId);
    const autoConnect = asBoolean(toolArgs.autoConnect, true);
    const provider = parseMarketplaceProvider(toolArgs.provider) ?? "all";
    const searchQuery = asString(toolArgs.searchQuery) ?? normalizedToolName;
    const searchLimitRaw = asNumber(toolArgs.searchLimit);
    const searchLimit = searchLimitRaw
      ? Math.max(1, Math.min(20, Math.trunc(searchLimitRaw)))
      : 8;

    let selectedMatch: AutoRouteToolMatch | undefined;
    let autoConnectContext:
      | {
          entries: MarketplaceSearchEntry[];
          attempted: string[];
          warnings: string[];
        }
      | undefined;

    if (appIdHint) {
      const explicitMatches = await findConnectedToolMatches(normalizedToolName, [appIdHint]);
      if (explicitMatches.length === 0) {
        throw new Error(
          `Tool "${normalizedToolName}" is not available on app "${appIdHint}". Run tools/list and choose an available tool name.`
        );
      }
      selectedMatch = explicitMatches[0];
    } else {
      const connectedMatches = await findConnectedToolMatches(normalizedToolName);
      if (connectedMatches.length === 1) {
        selectedMatch = connectedMatches[0];
      } else if (connectedMatches.length > 1) {
        return localToolResult({
          ok: false,
          action: "autoroute_call",
          status: "ambiguous_tool",
          message:
            `Tool "${normalizedToolName}" exists in multiple apps. Specify appId or use namespaced appId::toolName.`,
          matches: connectedMatches.map((match) => ({
            appId: match.appId,
            appName: match.appName,
            qualifiedName: match.qualifiedName,
          })),
        });
      } else if (autoConnect) {
        const autoConnected = await autoConnectAndResolveToolMatch({
          toolName: normalizedToolName,
          provider,
          searchQuery,
          searchLimit,
        });
        autoConnectContext = {
          entries: autoConnected.entries,
          attempted: autoConnected.attempted,
          warnings: autoConnected.warnings,
        };
        if (autoConnected.match) {
          selectedMatch = autoConnected.match;
        }
      }
    }

    if (!selectedMatch) {
      return localToolResult({
        ok: false,
        action: "autoroute_call",
        status: "tool_not_resolved",
        message:
          `Could not resolve tool "${normalizedToolName}" to a connected downstream app.`,
        guidance: [
          "Run maple_marketplace_search to find candidate servers.",
          "Run maple_marketplace_connect to attach one server.",
          "Retry maple_autoroute_call with appId or namespaced appId::toolName.",
        ],
        autoConnect: autoConnectContext ?? null,
      });
    }

    const chainResult = await dispatchDownstreamChainAndLog({
      appIds: [selectedMatch.appId],
      toolName: selectedMatch.toolName,
      toolArgs: downstreamArgs,
      sessionId,
      traceId,
      origin: "mcp_proxy",
    });

    if (!chainResult.ok) {
      const failed = chainResult.finalResult;
      return localToolResult({
        ok: false,
        action: "autoroute_call",
        status: chainResult.blockedByPolicy ? "blocked_by_policy" : "dispatch_failed",
        appId: failed.app.id,
        qualifiedToolName: namespaceMarketplaceToolName(failed.app.id, selectedMatch.toolName),
        toolName: selectedMatch.toolName,
        requestedToolName,
        blockedByPolicy: chainResult.blockedByPolicy,
        policyWouldBlock: failed.preExecutionWouldBlock,
        traceId: failed.trace.id,
        sessionId: failed.trace.sessionId,
        stepIndex: failed.step.index,
        preExecutionStepIndex: failed.preExecutionStep.index,
        policy: toPolicySnapshot(failed.preExecutionDecision),
        chainStages: chainResult.stages,
        error: failed.failure ?? "Downstream dispatch failed.",
      });
    }

    const final = chainResult.finalResult;
    return localToolResult({
      ok: true,
      action: "autoroute_call",
      status: "executed",
      source: selectedMatch.source,
      appId: final.app.id,
      appName: selectedMatch.appName,
      qualifiedToolName: namespaceMarketplaceToolName(final.app.id, selectedMatch.toolName),
      toolName: selectedMatch.toolName,
      requestedToolName,
      traceId: final.trace.id,
      sessionId: final.trace.sessionId,
      stepIndex: final.step.index,
      preExecutionStepIndex: final.preExecutionStep.index,
      policyWouldBlock: final.preExecutionWouldBlock,
      policy: toPolicySnapshot(final.preExecutionDecision),
      chainStages: chainResult.stages,
      downstreamResult: final.dispatch?.result ?? null,
    });
  }

  if (toolName === "maple_marketplace_search") {
    const provider = parseMarketplaceProvider(toolArgs.provider) ?? "all";
    const query = asString(toolArgs.query);
    const limitRaw = asNumber(toolArgs.limit);
    const limit = limitRaw ? Math.max(1, Math.min(50, Math.trunc(limitRaw))) : 12;
    const entries = await searchMarketplaceServers({
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

  if (toolName === "maple_marketplace_connect") {
    const provider = parseMarketplaceProvider(toolArgs.provider);
    if (provider !== "smithery" && provider !== "mcpso") {
      throw new Error("provider must be smithery or mcpso.");
    }
    const rawId = asString(toolArgs.id);
    if (!rawId) {
      throw new Error("id is required.");
    }
    const normalizedId = normalizeMarketplaceId(provider, rawId);
    const timeoutMsRaw = asNumber(toolArgs.timeoutMs);
    const registered = await registerMarketplaceDownstream({
      provider,
      id: normalizedId,
      overwrite: asBoolean(toolArgs.overwrite, false),
      appId: asString(toolArgs.appId),
      name: asString(toolArgs.name),
      enabled: asBoolean(toolArgs.enabled, true),
      timeoutMs: timeoutMsRaw ? Math.max(1_000, Math.min(60_000, Math.trunc(timeoutMsRaw))) : undefined,
      query: asStringRecord(toolArgs.query),
      headers: asStringRecord(toolArgs.headers),
      apiKey: asString(toolArgs.apiKey),
      authHeader: asString(toolArgs.authHeader),
      authScheme: asString(toolArgs.authScheme)?.toLowerCase() === "raw" ? "raw" : "bearer",
      toolAllowlist: asStringArray(toolArgs.toolAllowlist),
      restrictToCatalogTools: asBoolean(toolArgs.restrictToCatalogTools, true),
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

  if (toolName === "maple_marketplace_connected_apps") {
    const provider = parseMarketplaceProvider(toolArgs.provider) ?? "all";
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

  if (toolName === "maple_marketplace_disconnect") {
    const appId = asString(toolArgs.appId);
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

  throw new Error(`Unsupported marketplace control tool: ${toolName}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Route override & proxy target resolution
// ═══════════════════════════════════════════════════════════════════════════════

function collectMcpRouteOverrideFields(c: {
  req: {
    header: (name: string) => string | undefined;
    query: (name: string) => string | undefined;
  };
}): string[] {
  const overrides: string[] = [];
  if (asString(c.req.header("x-maple-downstream-app"))) {
    overrides.push("x-maple-downstream-app");
  }
  if (asString(c.req.header("x-maple-chain-apps"))) {
    overrides.push("x-maple-chain-apps");
  }
  if (asString(c.req.header("x-maple-downstream-url"))) {
    overrides.push("x-maple-downstream-url");
  }
  if (asString(c.req.query("mapleApp"))) {
    overrides.push("mapleApp");
  }
  if (asString(c.req.query("mapleChain"))) {
    overrides.push("mapleChain");
  }
  if (asString(c.req.query("mapleTargetUrl"))) {
    overrides.push("mapleTargetUrl");
  }
  return overrides;
}

function resolveMcpProxyTarget(c: {
  req: {
    header: (name: string) => string | undefined;
    query: (name: string) => string | undefined;
  };
}): McpProxyTargetResolution | undefined {
  const bypassProxy =
    c.req.header("x-maple-proxy-bypass") === "1" || c.req.query("mapleProxy") === "off";
  if (bypassProxy) {
    throw new Error("MCP proxy bypass is disabled by policy.");
  }

  if (mcpRouteLockEnabled) {
    const overrides = collectMcpRouteOverrideFields(c);
    if (overrides.length > 0) {
      throw new Error(
        `MCP route-lock is enabled. Per-request route overrides are denied: ${overrides.join(", ")}.`
      );
    }
  }

  const dynamicUrl =
    asString(c.req.header("x-maple-downstream-url")) || asString(c.req.query("mapleTargetUrl"));
  if (dynamicUrl) {
    if (!mcpProxyAllowDynamicTargets) {
      throw new Error(
        "Dynamic MCP targets are disabled. Configure MAPLE_MCP_PROXY_ALLOW_DYNAMIC_TARGETS=true."
      );
    }
    return {
      app: toDynamicDownstreamAppConfig(dynamicUrl),
      mode: "dynamic",
    };
  }

  const autoDefaultAppId = resolveAutoConfiguredAppId();
  const executionOrderDefaultAppId =
    mcpExecutionOrderAppIds.length > 0 ? mcpExecutionOrderAppIds[0] : undefined;

  const appId =
    asString(c.req.header("x-maple-downstream-app")) ||
    asString(c.req.query("mapleApp")) ||
    mcpFirewallDefaultAppId ||
    executionOrderDefaultAppId ||
    autoDefaultAppId;
  if (appId) {
    return {
      app: resolveDownstreamApp(appId),
      mode: "configured",
    };
  }

  const defaultTargetApp = resolveDefaultTargetApp();
  if (defaultTargetApp) {
    return {
      app: defaultTargetApp,
      mode: "dynamic",
    };
  }

  const routeResolutionHint = mcpRouteLockEnabled
    ? "Set MAPLE_MCP_EXECUTION_ORDER, MAPLE_MCP_FIREWALL_DEFAULT_APP, MAPLE_MCP_PROXY_DEFAULT_TARGET_URL, or keep exactly one downstream app enabled."
    : "Set MAPLE_MCP_FIREWALL_DEFAULT_APP, MAPLE_MCP_EXECUTION_ORDER, MAPLE_MCP_PROXY_DEFAULT_TARGET_URL, send x-maple-downstream-app, or enable dynamic targets.";
  throw new Error(
    `No downstream target resolved for strict MCP firewall mode. ${routeResolutionHint}`
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Proxy trace resolution
// ═══════════════════════════════════════════════════════════════════════════════

function resolveProxyTrace(options: {
  traceId?: string;
  sessionId?: string;
  appId: string;
}): Trace {
  const traceId = options.traceId ? options.traceId.trim() : "";
  const sessionId = options.sessionId ? options.sessionId.trim() : "";

  if (traceId) {
    const existing = getTraceForCurrentOwner(traceId);
    if (!existing) {
      throw new Error(`Trace ${traceId} not found.`);
    }
    return existing;
  }

  if (sessionId) {
    const existing = getLatestTraceBySessionForCurrentOwner(sessionId);
    if (existing) {
      return existing;
    }
  }

  const nextSessionId = sessionId || `proxy-${Date.now().toString(36)}`;
  return createTraceForCurrentOwner({
    sessionId: nextSessionId,
    source: "manual",
    status: "active",
    metadata: {
      mode: "maple-downstream-proxy",
      downstreamAppId: options.appId,
      createdFromProxy: true,
    },
    steps: [],
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Downstream dispatch result types
// ═══════════════════════════════════════════════════════════════════════════════

interface DownstreamDispatchLogResult {
  ok: boolean;
  blockedByPolicy: boolean;
  preExecutionWouldBlock: boolean;
  trace: Trace;
  step: TraceStep;
  preExecutionStep: TraceStep;
  preExecutionDecision: FirewallStepDecision;
  report: ReturnType<typeof analyzeTraceRisks>;
  app: DownstreamAppConfig;
  dispatch?: DownstreamCallResult;
  failure?: string;
}

interface DownstreamChainStage {
  index: number;
  appId: string;
  ok: boolean;
  blockedByPolicy: boolean;
  preExecutionWouldBlock: boolean;
  traceId: string;
  sessionId: string;
  stepIndex: number;
  preExecutionStepIndex: number;
  policy: ReturnType<typeof toPolicySnapshot>;
  failure?: string;
}

interface DownstreamChainDispatchResult {
  ok: boolean;
  blockedByPolicy: boolean;
  appIds: string[];
  stages: DownstreamChainStage[];
  finalResult: DownstreamDispatchLogResult;
  failure?: string;
}

interface DownstreamJsonRpcLogResult {
  ok: boolean;
  blockedByPolicy: boolean;
  preExecutionWouldBlock: boolean;
  trace: Trace;
  step: TraceStep;
  preExecutionStep: TraceStep;
  preExecutionDecision: FirewallStepDecision;
  report: ReturnType<typeof analyzeTraceRisks>;
  app: DownstreamAppConfig;
  forward?: DownstreamJsonRpcForwardResult;
  failure?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Single downstream dispatch with logging
// ═══════════════════════════════════════════════════════════════════════════════

async function dispatchDownstreamAndLog(options: {
  appId: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  traceId?: string;
  sessionId?: string;
  origin: "api" | "mcp" | "mcp_proxy";
}) {
  const app = resolveDownstreamApp(options.appId);
  const trace = resolveProxyTrace({
    traceId: options.traceId,
    sessionId: options.sessionId,
    appId: app.id,
  });

  const invocationSummary = toInvocationSummary(options.toolName, options.toolArgs);
  const preExecutionCandidateStep: TraceStep = {
    index: trace.steps.length,
    timestamp: new Date().toISOString(),
    actor: "agent",
    type: inferStepTypeFromDownstream(invocationSummary, options.toolName),
    prompt: `dispatch ${app.id}.${options.toolName}`,
    toolCall: {
      name: `${app.id}.${options.toolName}`,
      input: options.toolArgs,
    },
    output: invocationSummary,
    command: extractLikelyCommand(invocationSummary),
    externalUrl: extractFirstUrl(invocationSummary),
    metadata: {
      downstream: {
        appId: app.id,
        appName: app.name,
        toolName: options.toolName,
        origin: options.origin,
        stage: "pre_execution",
        mcpUrl: app.mcpUrl,
      },
    },
    riskScore: 0,
    riskFlags: [],
    guardStatus: "pending",
  };

  const preExecutionDecision = evaluateFirewallStep(preExecutionCandidateStep);
  const preExecutionWouldBlock = preExecutionDecision.shouldBlock;
  const preDecisionStep = preExecutionDecision.step ?? preExecutionCandidateStep;
  const preExecutionStep: TraceStep = {
    ...preDecisionStep,
    index: trace.steps.length,
    timestamp: new Date().toISOString(),
    output: preExecutionWouldBlock
      ? truncateText(
          `Policy denied before downstream execution (${preExecutionDecision.message}). Dispatch canceled by Maple firewall.`
        )
      : truncateText(
          `Pre-execution policy passed. Dispatching ${app.id}.${options.toolName} through Maple.`
        ),
    guardStatus: preExecutionWouldBlock ? "block" : "allow",
    metadata: {
      ...(preDecisionStep.metadata ?? {}),
      downstream: {
        appId: app.id,
        appName: app.name,
        toolName: options.toolName,
        origin: options.origin,
        stage: "pre_execution",
        mcpUrl: app.mcpUrl,
        policy: toPolicySnapshot(preExecutionDecision),
      },
    },
  };
  trace.steps.push(preExecutionStep);
  trace.metadata = {
    ...(trace.metadata ?? {}),
    mode: "maple-downstream-proxy",
    downstreamLastAppId: app.id,
    downstreamLastToolName: options.toolName,
    downstreamDispatchAt: new Date().toISOString(),
    downstreamPreExecutionWouldBlock: preExecutionWouldBlock,
  };

  if (preExecutionWouldBlock) {
    trace.status = "quarantined";
    upsertTraceForCurrentOwner(trace);
    const report = auditAndPersist(trace);
    return {
      ok: false,
      blockedByPolicy: true,
      preExecutionWouldBlock,
      trace,
      step: preExecutionStep,
      preExecutionStep,
      preExecutionDecision,
      report,
      app,
      failure: `Policy blocked before downstream execution: ${preExecutionDecision.message}`,
    } satisfies DownstreamDispatchLogResult;
  }

  const appendLoggedStep = (payload: {
    output: string;
    toolOutput: unknown;
    responseStatus?: number;
    requestId?: string;
    durationMs?: number;
    failed?: boolean;
    stage: "post_execution" | "dispatch_error";
  }) => {
    const summary = truncateText(payload.output.trim() || "No textual output returned.");
    const externalUrl = extractFirstUrl(summary);
    const command = extractLikelyCommand(summary);
    const candidateStep: TraceStep = {
      index: trace.steps.length,
      timestamp: new Date().toISOString(),
      actor: "tool",
      type: inferStepTypeFromDownstream(summary, options.toolName),
      prompt: `proxy ${app.id}.${options.toolName}`,
      toolCall: {
        name: `${app.id}.${options.toolName}`,
        input: options.toolArgs,
        output: compactUnknown(payload.toolOutput),
      },
      output: summary,
      command,
      externalUrl,
      metadata: {
        downstream: {
          appId: app.id,
          appName: app.name,
          toolName: options.toolName,
          requestId: payload.requestId,
          responseStatus: payload.responseStatus,
          durationMs: payload.durationMs,
          origin: options.origin,
          failed: payload.failed === true,
          mcpUrl: app.mcpUrl,
          stage: payload.stage,
          preExecutionStepIndex: preExecutionStep.index,
          preExecutionPolicy: toPolicySnapshot(preExecutionDecision),
        },
      },
      riskScore: 0,
      riskFlags: [],
      guardStatus: "pending",
    };

    const decision = evaluateFirewallStep(candidateStep);
    const loggedStep: TraceStep = {
      ...(decision.step ?? candidateStep),
      index: trace.steps.length,
      timestamp: new Date().toISOString(),
      guardStatus: decision.shouldBlock ? "block" : "allow",
    };

    trace.steps.push(loggedStep);
    trace.metadata = {
      ...(trace.metadata ?? {}),
      mode: "maple-downstream-proxy",
      downstreamLastAppId: app.id,
      downstreamLastToolName: options.toolName,
      downstreamDispatchAt: new Date().toISOString(),
      downstreamPreExecutionWouldBlock: preExecutionWouldBlock,
    };
    if (decision.shouldBlock) {
      trace.status = "quarantined";
    }
    upsertTraceForCurrentOwner(trace);
    const report = auditAndPersist(trace);
    return { loggedStep, report };
  };

  try {
    const dispatch = await dispatchToolToDownstream(
      app,
      options.toolName,
      options.toolArgs,
      {
        sessionId: trace.sessionId,
        traceId: trace.id,
      },
    );
    const { loggedStep, report } = appendLoggedStep({
      output: dispatch.textPreview,
      toolOutput: dispatch.result,
      requestId: dispatch.requestId,
      responseStatus: dispatch.responseStatus,
      durationMs: dispatch.durationMs,
      failed: false,
      stage: "post_execution",
    });
    return {
      ok: true,
      blockedByPolicy: false,
      preExecutionWouldBlock,
      trace,
      step: loggedStep,
      preExecutionStep,
      preExecutionDecision,
      report,
      app,
      dispatch,
    } satisfies DownstreamDispatchLogResult;
  } catch (dispatchError) {
    const failure = `Downstream dispatch failed: ${errorMessage(dispatchError)}`;
    const { loggedStep, report } = appendLoggedStep({
      output: failure,
      toolOutput: { error: failure },
      failed: true,
      stage: "dispatch_error",
    });
    return {
      ok: false,
      blockedByPolicy: false,
      preExecutionWouldBlock,
      trace,
      step: loggedStep,
      preExecutionStep,
      preExecutionDecision,
      report,
      app,
      failure,
    } satisfies DownstreamDispatchLogResult;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Chain dispatch (multi-app)
// ═══════════════════════════════════════════════════════════════════════════════

export async function dispatchDownstreamChainAndLog(options: {
  appIds: string[];
  toolName: string;
  toolArgs: Record<string, unknown>;
  traceId?: string;
  sessionId?: string;
  origin: "api" | "mcp" | "mcp_proxy";
}): Promise<DownstreamChainDispatchResult> {
  const normalizedAppIds = parseAppIdList(options.appIds);
  if (normalizedAppIds.length === 0) {
    throw new Error("At least one downstream app is required for chain dispatch.");
  }
  normalizedAppIds.forEach((appId) => resolveDownstreamApp(appId));

  const stages: DownstreamChainStage[] = [];
  let activeTraceId = asString(options.traceId);
  let finalResult: DownstreamDispatchLogResult | undefined;

  for (let index = 0; index < normalizedAppIds.length; index += 1) {
    const appId = normalizedAppIds[index];
    const stageResult = await dispatchDownstreamAndLog({
      appId,
      toolName: options.toolName,
      toolArgs: options.toolArgs,
      traceId: activeTraceId,
      sessionId: options.sessionId,
      origin: options.origin,
    });
    finalResult = stageResult;
    activeTraceId = stageResult.trace.id;

    stages.push({
      index,
      appId,
      ok: stageResult.ok,
      blockedByPolicy: stageResult.blockedByPolicy,
      preExecutionWouldBlock: stageResult.preExecutionWouldBlock,
      traceId: stageResult.trace.id,
      sessionId: stageResult.trace.sessionId,
      stepIndex: stageResult.step.index,
      preExecutionStepIndex: stageResult.preExecutionStep.index,
      policy: toPolicySnapshot(stageResult.preExecutionDecision),
      failure: stageResult.failure,
    });

    if (!stageResult.ok) {
      return {
        ok: false,
        blockedByPolicy: stageResult.blockedByPolicy,
        appIds: normalizedAppIds,
        stages,
        finalResult: stageResult,
        failure:
          stageResult.failure ??
          `Downstream chain failed on stage ${index + 1} (${appId}) for tool ${options.toolName}.`,
      };
    }
  }

  if (!finalResult) {
    throw new Error("Downstream chain completed without a final result.");
  }

  return {
    ok: true,
    blockedByPolicy: false,
    appIds: normalizedAppIds,
    stages,
    finalResult,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// JSON-RPC forwarding with logging
// ═══════════════════════════════════════════════════════════════════════════════

async function forwardJsonRpcAndLog(options: {
  appId: string;
  rpcMethod: string;
  rpcPayload: Record<string, unknown>;
  traceId?: string;
  sessionId?: string;
  origin: "mcp_proxy";
}): Promise<DownstreamJsonRpcLogResult> {
  const app = resolveDownstreamApp(options.appId);
  const trace = resolveProxyTrace({
    traceId: options.traceId,
    sessionId: options.sessionId,
    appId: app.id,
  });
  const payloadSummary = summarizeJsonRpcPayload(options.rpcPayload);

  const preExecutionCandidateStep: TraceStep = {
    index: trace.steps.length,
    timestamp: new Date().toISOString(),
    actor: "agent",
    type: "tool_call",
    prompt: `rpc ${app.id}.${options.rpcMethod}`,
    toolCall: {
      name: `${app.id}::${options.rpcMethod}`,
      input: options.rpcPayload,
    },
    output: payloadSummary,
    command: extractLikelyCommand(payloadSummary),
    externalUrl: extractFirstUrl(payloadSummary),
    metadata: {
      downstream: {
        appId: app.id,
        appName: app.name,
        rpcMethod: options.rpcMethod,
        origin: options.origin,
        stage: "pre_execution",
        mcpUrl: app.mcpUrl,
      },
    },
    riskScore: 0,
    riskFlags: [],
    guardStatus: "pending",
  };

  const preExecutionDecision = evaluateFirewallStep(preExecutionCandidateStep);
  const preExecutionWouldBlock = preExecutionDecision.shouldBlock;
  const preDecisionStep2 = preExecutionDecision.step ?? preExecutionCandidateStep;
  const preExecutionStep: TraceStep = {
    ...preDecisionStep2,
    index: trace.steps.length,
    timestamp: new Date().toISOString(),
    output: preExecutionWouldBlock
      ? truncateText(
          `Policy denied before downstream JSON-RPC execution (${preExecutionDecision.message}). Forward canceled by Maple firewall.`
        )
      : truncateText(`Pre-execution policy passed. Forwarding ${options.rpcMethod} through Maple.`),
    guardStatus: preExecutionWouldBlock ? "block" : "allow",
    metadata: {
      ...(preDecisionStep2.metadata ?? {}),
      downstream: {
        appId: app.id,
        appName: app.name,
        rpcMethod: options.rpcMethod,
        origin: options.origin,
        stage: "pre_execution",
        mcpUrl: app.mcpUrl,
        policy: toPolicySnapshot(preExecutionDecision),
      },
    },
  };
  trace.steps.push(preExecutionStep);
  trace.metadata = {
    ...(trace.metadata ?? {}),
    mode: "maple-downstream-proxy",
    downstreamLastAppId: app.id,
    downstreamLastRpcMethod: options.rpcMethod,
    downstreamDispatchAt: new Date().toISOString(),
    downstreamPreExecutionWouldBlock: preExecutionWouldBlock,
  };

  if (preExecutionWouldBlock) {
    trace.status = "quarantined";
    upsertTraceForCurrentOwner(trace);
    const report = auditAndPersist(trace);
    return {
      ok: false,
      blockedByPolicy: true,
      preExecutionWouldBlock,
      trace,
      step: preExecutionStep,
      preExecutionStep,
      preExecutionDecision,
      report,
      app,
      failure: `Policy blocked before downstream JSON-RPC execution: ${preExecutionDecision.message}`,
    };
  }

  const appendLoggedStep = (payload: {
    output: unknown;
    responseStatus?: number;
    durationMs?: number;
    failed?: boolean;
    stage: "post_execution" | "dispatch_error";
  }) => {
    const summary = summarizeJsonRpcPayload(payload.output);
    const candidateStep: TraceStep = {
      index: trace.steps.length,
      timestamp: new Date().toISOString(),
      actor: "tool",
      type: "network",
      prompt: `rpc_response ${app.id}.${options.rpcMethod}`,
      toolCall: {
        name: `${app.id}::${options.rpcMethod}`,
        input: options.rpcPayload,
        output: compactUnknown(payload.output),
      },
      output: summary,
      command: extractLikelyCommand(summary),
      externalUrl: extractFirstUrl(summary),
      metadata: {
        downstream: {
          appId: app.id,
          appName: app.name,
          rpcMethod: options.rpcMethod,
          responseStatus: payload.responseStatus,
          durationMs: payload.durationMs,
          origin: options.origin,
          failed: payload.failed === true,
          mcpUrl: app.mcpUrl,
          stage: payload.stage,
          preExecutionStepIndex: preExecutionStep.index,
          preExecutionPolicy: toPolicySnapshot(preExecutionDecision),
        },
      },
      riskScore: 0,
      riskFlags: [],
      guardStatus: "pending",
    };

    const decision = evaluateFirewallStep(candidateStep);
    const loggedStep: TraceStep = {
      ...(decision.step ?? candidateStep),
      index: trace.steps.length,
      timestamp: new Date().toISOString(),
      guardStatus: decision.shouldBlock ? "block" : "allow",
    };
    trace.steps.push(loggedStep);
    trace.metadata = {
      ...(trace.metadata ?? {}),
      mode: "maple-downstream-proxy",
      downstreamLastAppId: app.id,
      downstreamLastRpcMethod: options.rpcMethod,
      downstreamDispatchAt: new Date().toISOString(),
      downstreamPreExecutionWouldBlock: preExecutionWouldBlock,
    };
    if (decision.shouldBlock) {
      trace.status = "quarantined";
    }
    upsertTraceForCurrentOwner(trace);
    const report = auditAndPersist(trace);
    return { loggedStep, report };
  };

  try {
    const forwarded = await forwardJsonRpcToDownstream(app, options.rpcPayload, {
      sessionId: trace.sessionId,
      traceId: trace.id,
    });
    const { loggedStep, report } = appendLoggedStep({
      output: forwarded.payload,
      responseStatus: forwarded.responseStatus,
      durationMs: forwarded.durationMs,
      failed: false,
      stage: "post_execution",
    });
    return {
      ok: true,
      blockedByPolicy: false,
      preExecutionWouldBlock,
      trace,
      step: loggedStep,
      preExecutionStep,
      preExecutionDecision,
      report,
      app,
      forward: forwarded,
    };
  } catch (forwardError) {
    const failure = `Downstream JSON-RPC forward failed: ${errorMessage(forwardError)}`;
    const { loggedStep, report } = appendLoggedStep({
      output: { error: failure },
      failed: true,
      stage: "dispatch_error",
    });
    return {
      ok: false,
      blockedByPolicy: false,
      preExecutionWouldBlock,
      trace,
      step: loggedStep,
      preExecutionStep,
      preExecutionDecision,
      report,
      app,
      failure,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main MCP firewall proxy handler
// ═══════════════════════════════════════════════════════════════════════════════

export async function handleMcpFirewallProxy(c: {
  req: {
    header: (name: string) => string | undefined;
    query: (name: string) => string | undefined;
    json: () => Promise<unknown>;
    raw?: Request;
  };
  json: (body: unknown, status?: number) => Response;
}) {
  const body = c.req.raw
    ? await c.req.raw
        .clone()
        .json()
        .catch(() => ({}))
    : await c.req.json().catch(() => ({}));
  const rpc = asObject(body);
  const id = "id" in rpc ? (rpc as Record<string, unknown>).id : null;
  const method = asString(rpc.method);
  if (!method) {
    return c.json(
      jsonRpcErrorPayload(id, -32600, "Invalid JSON-RPC request: missing method."),
      400
    );
  }

  let target: McpProxyTargetResolution | undefined;
  let targetResolutionError: unknown;
  try {
    target = resolveMcpProxyTarget(c);
  } catch (resolutionError) {
    targetResolutionError = resolutionError;
  }

  const proxyTargetErrorResponse = () => {
    const detail = errorMessage(targetResolutionError ?? "No MCP proxy target resolved.");
    const isBypassDenied = detail.includes("bypass is disabled");
    const isRouteLockDenied = detail.includes("route-lock is enabled");
    const isStrictUnresolved = detail.includes("strict MCP firewall mode");
    const status = isBypassDenied || isRouteLockDenied ? 403 : isStrictUnresolved ? 503 : 400;
    const code = isBypassDenied || isRouteLockDenied ? -32003 : isStrictUnresolved ? -32004 : -32600;
    return c.json(
      jsonRpcErrorPayload(id, code, "Proxy target rejected.", {
        detail,
      }),
      status
    );
  };
  const targetResolutionDetail = errorMessage(targetResolutionError ?? "");
  const routeLockTargetOverrideDenied = targetResolutionDetail.includes("route-lock is enabled");

  const controlTools = getMarketplaceControlTools().map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    _meta: {
      mapleLocalControlTool: true,
    },
  }));

  if (method === "tools/list") {
    try {
      if (!target) {
        if (routeLockTargetOverrideDenied) {
          return proxyTargetErrorResponse();
        }
        if (mcpMarketplaceEnabled) {
          const enabledAppIds = listEnabledDownstreamAppIds();
          if (enabledAppIds.length > 0) {
            const catalog = await buildMarketplaceCatalogForAppIds(enabledAppIds);
            const multipleApps = new Set(catalog.appIds).size > 1;
            const tools = catalog.tools
              .sort((a, b) => a.qualifiedName.localeCompare(b.qualifiedName))
              .map((tool) => {
                const name = multipleApps ? tool.qualifiedName : tool.toolName;
                const baseDescription = tool.description ?? `Tool from ${tool.appName}`;
                const description = multipleApps ? `[${tool.appId}] ${baseDescription}` : baseDescription;
                return {
                  name,
                  ...(description ? { description } : {}),
                  ...(tool.inputSchema !== undefined ? { inputSchema: tool.inputSchema } : {}),
                  ...(tool.annotations ? { annotations: tool.annotations } : {}),
                  _meta: {
                    mapleProxyAppId: tool.appId,
                    mapleProxyToolName: tool.toolName,
                    mapleQualifiedName: tool.qualifiedName,
                  },
                };
              });
            const combinedTools = [...tools, ...controlTools];
            return c.json(
              {
                jsonrpc: "2.0",
                id,
                result: {
                  tools: combinedTools,
                  mapleMarketplace: {
                    enabled: true,
                    appCount: catalog.appIds.length,
                    warnings: catalog.warnings,
                    controlTools: controlTools.length,
                  },
                },
              },
              200
            );
          }
        }
        if (controlTools.length === 0) {
          return undefined; // Fall through to native MCP handler
        }
        return c.json(
          {
            jsonrpc: "2.0",
            id,
            result: {
              tools: controlTools,
              mapleMarketplace: {
                enabled: mcpMarketplaceEnabled,
                appCount: 0,
                warnings: [
                  {
                    appId: "none",
                    message:
                      "No downstream app is connected yet. Auto-connect is enabled; call maple_autoroute_call or call a downstream tool name directly and Maple will attempt to resolve/connect automatically.",
                  },
                ],
              },
            },
          },
          200
        );
      }

      if (mcpMarketplaceEnabled && target.mode === "configured") {
        const catalog = await buildMarketplaceCatalog(target);
        if (catalog.tools.length === 0 && catalog.warnings.length > 0 && controlTools.length === 0) {
          return c.json(
            jsonRpcErrorPayload(id, -32002, "Marketplace tools/list failed.", {
              warnings: catalog.warnings,
            }),
            502
          );
        }

        const multipleApps = new Set(catalog.appIds).size > 1;
        const tools = catalog.tools
          .sort((a, b) => a.qualifiedName.localeCompare(b.qualifiedName))
          .map((tool) => {
            const name = multipleApps ? tool.qualifiedName : tool.toolName;
            const baseDescription = tool.description ?? `Tool from ${tool.appName}`;
            const description = multipleApps ? `[${tool.appId}] ${baseDescription}` : baseDescription;
            return {
              name,
              ...(description ? { description } : {}),
              ...(tool.inputSchema !== undefined ? { inputSchema: tool.inputSchema } : {}),
              ...(tool.annotations ? { annotations: tool.annotations } : {}),
              _meta: {
                mapleProxyAppId: tool.appId,
                mapleProxyToolName: tool.toolName,
                mapleQualifiedName: tool.qualifiedName,
              },
            };
          });
        const combinedTools = [...tools, ...controlTools];

        return c.json(
          {
            jsonrpc: "2.0",
            id,
            result: {
              tools: combinedTools,
              mapleMarketplace: {
                enabled: true,
                appCount: catalog.appIds.length,
                warnings: catalog.warnings,
                controlTools: controlTools.length,
              },
            },
          },
          200
        );
      }

      const listed = await listToolsFromDownstreamCached(target.app);
      const toolsRaw = listed.tools.map((tool) => ({
        name: tool.name,
        ...(tool.description ? { description: tool.description } : {}),
        ...(tool.inputSchema !== undefined ? { inputSchema: tool.inputSchema } : {}),
        ...(tool.annotations ? { annotations: tool.annotations } : {}),
      }));
      const tools = [...applyToolAllowlist(target.app, toolsRaw), ...controlTools];
      return c.json(
        {
          jsonrpc: "2.0",
          id,
          result: {
            tools,
          },
        },
        200
      );
    } catch (listError) {
      return c.json(
        jsonRpcErrorPayload(id, -32002, "Downstream tools/list failed.", {
          detail: errorMessage(listError),
          appId: target?.app.id,
        }),
        502
      );
    }
  }

  if (method === "tools/call") {
    const params = asObject(rpc.params);
    const toolName = asString(params.name);
    if (!toolName) {
      return c.json(
        jsonRpcErrorPayload(id, -32602, "Invalid tools/call params: missing tool name."),
        400
      );
    }
    const rawToolArgs =
      params.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments)
        ? (params.arguments as Record<string, unknown>)
        : {};
    const toolArgs: Record<string, unknown> = { ...rawToolArgs };
    const autoConnectRequested = asBoolean(
      rawToolArgs._mapleAutoConnect,
      mcpMarketplaceAutoConnectEnabled
    );
    const autoConnectProvider = parseMarketplaceProvider(rawToolArgs._mapleProvider) ?? "all";
    const autoConnectSearchQuery = asString(rawToolArgs._mapleSearchQuery);
    const autoConnectSearchLimitRaw = asNumber(rawToolArgs._mapleSearchLimit);
    const autoConnectSearchLimit = autoConnectSearchLimitRaw
      ? Math.max(1, Math.min(20, Math.trunc(autoConnectSearchLimitRaw)))
      : 10;
    delete toolArgs._mapleAutoConnect;
    delete toolArgs._mapleProvider;
    delete toolArgs._mapleSearchQuery;
    delete toolArgs._mapleSearchLimit;

    if (isMarketplaceControlToolName(toolName)) {
      try {
        const result = await executeMarketplaceControlTool(toolName, toolArgs);
        return c.json(
          {
            jsonrpc: "2.0",
            id,
            result,
          },
          200
        );
      } catch (controlError) {
        return c.json(
          jsonRpcErrorPayload(id, -32603, "Marketplace control tool failed.", {
            toolName,
            detail: errorMessage(controlError),
          }),
          400
        );
      }
    }

    if (isMapleNativeToolName(toolName)) {
      return undefined;
    }

    if (!target && routeLockTargetOverrideDenied) {
      return proxyTargetErrorResponse();
    }

    const singleEnabledAppWhenUnresolved =
      !target && mcpMarketplaceEnabled && listEnabledDownstreamAppIds().length === 1
        ? listEnabledDownstreamAppIds()[0]
        : undefined;
    const sessionId =
      asString(c.req.header("x-maple-session-id")) ??
      asString(c.req.header("mcp-session-id")) ??
      `mcp-proxy-${target?.app.id ?? singleEnabledAppWhenUnresolved ?? "marketplace"}`;
    const traceId = asString(c.req.header("x-maple-trace-id"));
    const chainHeader = asString(c.req.header("x-maple-chain-apps"));
    const chainQuery = asString(c.req.query("mapleChain"));
    const qualifiedTool = parseMarketplaceToolName(toolName);
    let normalizedToolName = toolName;
    let explicitAppIds: string[] | undefined;
    let autoConnectDiagnostics:
      | {
          attempted: string[];
          warnings: string[];
        }
      | undefined;

    if (qualifiedTool) {
      const allowedMarketplaceAppIds = target
        ? resolveMarketplaceAppIds(target)
        : listEnabledDownstreamAppIds();
      if (mcpRouteLockEnabled && !allowedMarketplaceAppIds.includes(qualifiedTool.appId)) {
        return c.json(
          jsonRpcErrorPayload(
            id,
            -32003,
            `Tool "${toolName}" targets app "${qualifiedTool.appId}" which is outside locked marketplace route.`,
            {
              requestedAppId: qualifiedTool.appId,
              allowedAppIds: allowedMarketplaceAppIds,
            }
          ),
          403
        );
      }
      try {
        resolveDownstreamApp(qualifiedTool.appId);
      } catch (resolutionError) {
        return c.json(
          jsonRpcErrorPayload(id, -32602, "Invalid tools/call params: unknown marketplace app.", {
            detail: errorMessage(resolutionError),
            requestedAppId: qualifiedTool.appId,
          }),
          400
        );
      }
      normalizedToolName = qualifiedTool.toolName;
      explicitAppIds = [qualifiedTool.appId];
    } else if (!target) {
      const enabledMarketplaceApps = listEnabledDownstreamAppIds();
      if (enabledMarketplaceApps.length === 1) {
        explicitAppIds = [enabledMarketplaceApps[0]];
      } else if (enabledMarketplaceApps.length > 1) {
        return c.json(
          jsonRpcErrorPayload(
            id,
            -32602,
            "Multiple downstream apps are connected. Use namespaced tool format appId::toolName."
          ),
          400
        );
      } else if (mcpMarketplaceEnabled && autoConnectRequested) {
        const autoConnected = await autoConnectAndResolveToolMatch({
          toolName: normalizedToolName,
          provider: autoConnectProvider,
          searchQuery: autoConnectSearchQuery ?? normalizedToolName,
          searchLimit: autoConnectSearchLimit,
        });
        autoConnectDiagnostics = {
          attempted: autoConnected.attempted,
          warnings: autoConnected.warnings,
        };
        if (autoConnected.match) {
          explicitAppIds = [autoConnected.match.appId];
          normalizedToolName = autoConnected.match.toolName;
        } else {
          return c.json(
            jsonRpcErrorPayload(
              id,
              -32002,
              `Maple could not auto-resolve tool "${normalizedToolName}" to a downstream app.`,
              {
                autoConnectEnabled: true,
                provider: autoConnectProvider,
                attempted: autoConnected.attempted,
                warnings: autoConnected.warnings,
                hint: "Try namespaced appId::toolName, or call maple_marketplace_search to find a compatible server.",
              }
            ),
            400
          );
        }
      } else {
        return proxyTargetErrorResponse();
      }
    }

    try {
      const appIds =
        explicitAppIds ??
        resolveDispatchAppIds({
          explicitChain: chainHeader ?? chainQuery,
          fallbackAppId: target?.app.id,
          includeDefaultExecutionOrder: target ? target.mode !== "dynamic" : false,
        });
      if (target?.mode === "dynamic" && appIds.length > 1) {
        return c.json(
          jsonRpcErrorPayload(id, -32602, "Dynamic target mode does not support multi-app chain execution.", {
            mode: target.mode,
            appIds,
          }),
          400
        );
      }

      const chainResult = await dispatchDownstreamChainAndLog({
        appIds,
        toolName: normalizedToolName,
        toolArgs,
        sessionId,
        traceId,
        origin: "mcp_proxy",
      });

      if (!chainResult.ok) {
        const result = chainResult.finalResult;
        const blockedStatus = chainResult.blockedByPolicy ? 403 : 502;
        const blockedCode = chainResult.blockedByPolicy ? -32003 : -32002;
        return c.json(
          jsonRpcErrorPayload(id, blockedCode, result.failure ?? "Downstream tools/call failed.", {
            blocked: chainResult.blockedByPolicy,
            executeAllowed: false,
            policyWouldBlock: result.preExecutionWouldBlock,
            appId: result.app.id,
            chainAppIds: chainResult.appIds,
            chainStages: chainResult.stages,
            autoConnect: autoConnectDiagnostics ?? null,
            toolName: normalizedToolName,
            requestedToolName: toolName,
            traceId: result.trace.id,
            sessionId: result.trace.sessionId,
            stepIndex: result.step.index,
            preExecutionStepIndex: result.preExecutionStep.index,
            policy: toPolicySnapshot(result.preExecutionDecision),
          }),
          blockedStatus
        );
      }

      const final = chainResult.finalResult;

      return c.json(
        {
          jsonrpc: "2.0",
          id,
          result: final.dispatch?.result ?? {
            content: [
              {
                type: "text",
                text: "",
              },
            ],
          },
        },
        200
      );
    } catch (dispatchError) {
      return c.json(
        jsonRpcErrorPayload(id, -32603, "Downstream dispatch could not be completed.", {
          detail: errorMessage(dispatchError),
          appId: target?.app.id,
          autoConnect: autoConnectDiagnostics ?? null,
          toolName: normalizedToolName,
          requestedToolName: toolName,
        }),
        502
      );
    }
  }

  // For non-tool methods (initialize, notifications/*, resources/*, prompts/*, etc.),
  // fall through to the native MCP handler instead of proxying downstream.
  if (method !== "tools/list" && method !== "tools/call") {
    return undefined;
  }

  if (!target) {
    return proxyTargetErrorResponse();
  }

  try {
    const sessionId =
      asString(c.req.header("x-maple-session-id")) ??
      asString(c.req.header("mcp-session-id")) ??
      `mcp-proxy-${target.app.id}`;
    const traceId = asString(c.req.header("x-maple-trace-id"));
    const forwarded = await forwardJsonRpcAndLog({
      appId: target.app.id,
      rpcMethod: method,
      rpcPayload: rpc,
      sessionId,
      traceId,
      origin: "mcp_proxy",
    });
    if (!forwarded.ok) {
      const blockedStatus = forwarded.blockedByPolicy ? 403 : 502;
      const blockedCode = forwarded.blockedByPolicy ? -32003 : -32002;
      return c.json(
        jsonRpcErrorPayload(id, blockedCode, forwarded.failure ?? "Downstream MCP proxy forward failed.", {
          blocked: forwarded.blockedByPolicy,
          executeAllowed: false,
          policyWouldBlock: forwarded.preExecutionWouldBlock,
          appId: forwarded.app.id,
          rpcMethod: method,
          traceId: forwarded.trace.id,
          sessionId: forwarded.trace.sessionId,
          stepIndex: forwarded.step.index,
          preExecutionStepIndex: forwarded.preExecutionStep.index,
          policy: toPolicySnapshot(forwarded.preExecutionDecision),
        }),
        blockedStatus
      );
    }
    return c.json(forwarded.forward?.payload ?? {}, forwarded.forward?.responseStatus ?? 200);
  } catch (forwardError) {
    return c.json(
      jsonRpcErrorPayload(id, -32603, "Downstream MCP proxy forward failed.", {
        detail: errorMessage(forwardError),
        appId: target.app.id,
        mode: target.mode,
      }),
      502
    );
  }
}
