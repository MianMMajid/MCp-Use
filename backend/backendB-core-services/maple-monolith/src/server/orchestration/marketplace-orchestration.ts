import type {
  DownstreamAppConfig,
  DownstreamAppInfo,
  DownstreamToolInfo,
} from "../../control/downstream-proxy.js";
import type { FirewallStepDecision } from "../../security/firewall-policy.js";
import {
  fetchSmitheryServerDetails,
  listSmitheryServers,
  resolveSmitheryDeploymentUrl,
  toSmitheryDownstreamAppId,
} from "../../integrations/smithery.js";
import {
  resolveMcpSoDeploymentUrl,
  resolveMcpSoServerDetails,
  searchMcpSoServers,
  toMcpSoDownstreamAppId,
} from "../../integrations/mcpso.js";
import type { DownstreamChainDispatchResult } from "./downstream-orchestration.js";
import type { McpProxyTargetResolution } from "../routes/downstream-routes.js";

export type MarketplaceProvider = "smithery" | "mcpso";

interface MarketplaceSearchEntry {
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

interface MarketplaceResolvedServer {
  provider: MarketplaceProvider;
  id: string;
  title: string;
  description?: string;
  sourceUrl?: string;
  appIdSuggestion: string;
  mcpUrl?: string;
  defaultToolAllowlist?: string[];
}

interface RegisterMarketplaceDownstreamOptions {
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

interface MarketplaceToolEntry {
  appId: string;
  appName: string;
  toolName: string;
  qualifiedName: string;
  description?: string;
  inputSchema?: unknown;
  annotations?: Record<string, unknown>;
}

interface MarketplaceCatalogResult {
  appIds: string[];
  tools: MarketplaceToolEntry[];
  warnings: Array<{ appId: string; message: string }>;
}

interface MarketplaceControlToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface AutoRouteToolMatch {
  appId: string;
  appName: string;
  toolName: string;
  qualifiedName: string;
  source: "connected" | "auto_connected";
}

interface MarketplaceRuntimeStatus {
  routeMode: string;
  routeSummary: string;
  routeLock: boolean;
  marketplaceEnabled: boolean;
}

type DownstreamToolsListResult = {
  tools: DownstreamToolInfo[];
  requestId: string;
  durationMs: number;
};

interface CreateMarketplaceOrchestrationDeps {
  asBoolean: (value: unknown, fallback: boolean) => boolean;
  asNumber: (value: unknown) => number | undefined;
  asString: (value: unknown) => string | undefined;
  asStringArray: (value: unknown) => string[];
  asStringRecord: (value: unknown) => Record<string, string>;
  dedupeBy: <T>(items: T[], key: (item: T) => string) => T[];
  errorMessage: (error: unknown) => string;
  buildRuntimeStatus: () => MarketplaceRuntimeStatus;
  buildUrlWithQueryParams: (baseUrl: string, params: Record<string, string>) => string;
  clearDownstreamToolsCache: (appId?: string) => void;
  dispatchDownstreamChainAndLog: (options: {
    appIds: string[];
    toolName: string;
    toolArgs: Record<string, unknown>;
    traceId?: string;
    sessionId?: string;
    origin: "api" | "mcp" | "mcp_proxy";
  }) => Promise<DownstreamChainDispatchResult>;
  downstreamAppRegistry: Map<string, DownstreamAppConfig>;
  isMcpSoDownstreamApp: (app: DownstreamAppConfig) => boolean;
  isSmitheryDownstreamApp: (app: DownstreamAppConfig) => boolean;
  listDownstreamApps: (
    registry: Map<string, DownstreamAppConfig>,
    includeDisabled?: boolean
  ) => DownstreamAppInfo[];
  listToolsFromDownstreamCached: (
    app: DownstreamAppConfig,
    options?: { forceRefresh?: boolean }
  ) => Promise<DownstreamToolsListResult>;
  mcpExecutionOrderAppIds: string[];
  mcpFirewallDefaultAppId?: string;
  mcpMarketplaceEnabled: boolean;
  mcpRouteLockEnabled: boolean;
  mcpSoBaseUrl: string;
  mcpSoEnabled: boolean;
  mcpSoTimeoutMs: number;
  normalizeDynamicMcpUrl: (rawUrl: string) => string;
  resolveAutoConfiguredAppId: () => string | undefined;
  resolveDownstreamApp: (appId: string) => DownstreamAppConfig;
  smitheryApiBaseUrl: string;
  smitheryApiKey?: string;
  smitheryEnabled: boolean;
  smitheryTimeoutMs: number;
  toPolicySnapshot: (decision: FirewallStepDecision) => unknown;
  toPublicDownstreamApp: (app: DownstreamAppConfig) => DownstreamAppInfo;
  withAbortTimeout: <T>(
    timeoutMs: number,
    run: (signal: AbortSignal) => Promise<T>
  ) => Promise<T>;
}

export function createMarketplaceOrchestration(deps: CreateMarketplaceOrchestrationDeps): {
  autoConnectAndResolveToolMatch: (options: {
    toolName: string;
    provider: MarketplaceProvider | "all";
    searchQuery: string;
    searchLimit: number;
  }) => Promise<{
    match?: AutoRouteToolMatch;
    entries: MarketplaceSearchEntry[];
    attempted: string[];
    warnings: string[];
  }>;
  buildMarketplaceCatalog: (target: McpProxyTargetResolution) => Promise<MarketplaceCatalogResult>;
  buildMarketplaceCatalogForAppIds: (
    appIds: string[]
  ) => Promise<MarketplaceCatalogResult>;
  classifyMarketplaceProviderForApp: (
    app: DownstreamAppConfig
  ) => MarketplaceProvider | undefined;
  executeMarketplaceControlTool: (
    toolName: string,
    toolArgs: Record<string, unknown>
  ) => Promise<{
    content: Array<{ type: "text"; text: string }>;
    structuredContent: unknown;
  }>;
  getMarketplaceControlTools: () => MarketplaceControlToolDefinition[];
  isMapleNativeToolName: (toolName: string) => boolean;
  isMarketplaceControlToolName: (toolName: string) => boolean;
  listEnabledDownstreamAppIds: () => string[];
  normalizeMarketplaceId: (provider: MarketplaceProvider, rawId: string) => string;
  parseMarketplaceProvider: (value: unknown) => MarketplaceProvider | "all" | undefined;
  parseMarketplaceToolName: (
    value: string
  ) => { appId: string; toolName: string } | undefined;
  registerMarketplaceDownstream: (
    options: RegisterMarketplaceDownstreamOptions
  ) => Promise<{
    app: DownstreamAppConfig;
    appId: string;
    provider: MarketplaceProvider;
    resolved: MarketplaceResolvedServer;
    replaced: boolean;
  }>;
  resolveMarketplaceAppIds: (target: McpProxyTargetResolution) => string[];
  searchMarketplaceServers: (options: {
    provider?: MarketplaceProvider | "all";
    query?: string;
    limit?: number;
  }) => Promise<MarketplaceSearchEntry[]>;
} {
  const parseMarketplaceProvider = (
    value: unknown
  ): MarketplaceProvider | "all" | undefined => {
    const normalized = deps.asString(value)?.toLowerCase();
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
  };

  const parseMcpSoSlug = (value: string): { slug?: string; serverUrl?: string } => {
    const normalized = value.trim();
    if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
      return {
        serverUrl: normalized,
      };
    }
    return {
      slug: normalized.replace(/^\/+/, "").replace(/^server\//, ""),
    };
  };

  const normalizeMarketplaceId = (provider: MarketplaceProvider, rawId: string): string => {
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
  };

  const searchMarketplaceServers = async (options: {
    provider?: MarketplaceProvider | "all";
    query?: string;
    limit?: number;
  }): Promise<MarketplaceSearchEntry[]> => {
    const provider = options.provider ?? "all";
    const limit = options.limit ? Math.max(1, Math.min(100, Math.trunc(options.limit))) : 20;
    const query = deps.asString(options.query);
    const requests: Array<Promise<MarketplaceSearchEntry[]>> = [];

    if ((provider === "all" || provider === "smithery") && deps.smitheryEnabled) {
      requests.push(
        deps
          .withAbortTimeout(deps.smitheryTimeoutMs, (signal) =>
            listSmitheryServers({
              apiBaseUrl: deps.smitheryApiBaseUrl,
              apiKey: deps.smitheryApiKey,
              signal,
              query,
              page: 1,
              pageSize: Math.max(limit, 20),
            })
          )
          .then((smithery) =>
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

    if ((provider === "all" || provider === "mcpso") && deps.mcpSoEnabled) {
      requests.push(
        deps
          .withAbortTimeout(deps.mcpSoTimeoutMs, (signal) =>
            searchMcpSoServers({
              baseUrl: deps.mcpSoBaseUrl,
              signal,
              query,
              limit: Math.max(limit, 20),
            })
          )
          .then((mcpSo) =>
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
    const deduped = deps.dedupeBy(
      prioritized,
      (entry) => `${entry.provider}:${entry.id.toLowerCase()}`
    );
    return deduped.slice(0, limit);
  };

  const resolveMarketplaceServer = async (options: {
    provider: MarketplaceProvider;
    id: string;
  }): Promise<MarketplaceResolvedServer> => {
    if (options.provider === "smithery") {
      const detail = await deps.withAbortTimeout(deps.smitheryTimeoutMs, (signal) =>
        fetchSmitheryServerDetails(options.id, {
          apiBaseUrl: deps.smitheryApiBaseUrl,
          apiKey: deps.smitheryApiKey,
          signal,
        })
      );
      const deploymentUrl = resolveSmitheryDeploymentUrl(detail);
      const allowlist = Array.isArray(detail.tools)
        ? detail.tools
            .map((tool) => deps.asString(tool.name))
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
    const detail = await deps.withAbortTimeout(deps.mcpSoTimeoutMs, (signal) =>
      resolveMcpSoServerDetails({
        baseUrl: deps.mcpSoBaseUrl,
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
  };

  const registerMarketplaceDownstream = async (
    options: RegisterMarketplaceDownstreamOptions
  ): Promise<{
    app: DownstreamAppConfig;
    appId: string;
    provider: MarketplaceProvider;
    resolved: MarketplaceResolvedServer;
    replaced: boolean;
  }> => {
    const preResolvedMcpUrl = deps.asString(options.resolvedMcpUrl);
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

    const normalizedMcpUrl = deps.normalizeDynamicMcpUrl(resolved.mcpUrl);
    const mcpUrl = deps.buildUrlWithQueryParams(normalizedMcpUrl, options.query ?? {});
    const appId = options.appId ?? resolved.appIdSuggestion;
    const existing = deps.downstreamAppRegistry.get(appId);
    if (existing && !options.overwrite) {
      throw new Error(
        `Downstream app "${appId}" already exists. Set overwrite=true to replace it.`
      );
    }

    const timeoutMs = options.timeoutMs
      ? Math.max(1_000, Math.min(60_000, Math.trunc(options.timeoutMs)))
      : 12_000;
    const authHeader = options.authHeader?.trim() || "authorization";
    const authScheme = options.authScheme === "raw" ? "raw" : "bearer";
    const allowlist =
      options.toolAllowlist && options.toolAllowlist.length > 0
        ? options.toolAllowlist
        : options.restrictToCatalogTools !== false &&
            resolved.defaultToolAllowlist &&
            resolved.defaultToolAllowlist.length > 0
          ? resolved.defaultToolAllowlist
          : undefined;

    const app: DownstreamAppConfig = {
      id: appId,
      name: options.name ?? resolved.title,
      description: `[${resolved.provider}] ${resolved.id}${
        resolved.description ? ` - ${resolved.description}` : ""
      }`,
      mcpUrl,
      enabled: options.enabled ?? true,
      timeoutMs,
      apiKey: options.apiKey ?? (resolved.provider === "smithery" ? deps.smitheryApiKey : undefined),
      authHeader,
      authScheme,
      headers:
        options.headers && Object.keys(options.headers).length > 0 ? options.headers : undefined,
      toolAllowlist: allowlist,
    };
    deps.downstreamAppRegistry.set(appId, app);
    deps.clearDownstreamToolsCache(appId);
    return {
      app,
      appId,
      provider: resolved.provider,
      resolved,
      replaced: Boolean(existing),
    };
  };

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
            description:
              "Optional task goal (for example: weather lookup, web search, crm read).",
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
            description:
              "Tool name to execute. Supports plain toolName or namespaced appId::toolName.",
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
            description:
              "If true and tool is unresolved, Maple searches/connects marketplace apps automatically.",
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

  const getMarketplaceControlTools = () => {
    if (!deps.mcpMarketplaceEnabled) {
      return [] as MarketplaceControlToolDefinition[];
    }
    return MARKETPLACE_CONTROL_TOOLS;
  };

  const isMarketplaceControlToolName = (toolName: string) => {
    return getMarketplaceControlTools().some((tool) => tool.name === toolName);
  };

  const isMapleNativeToolName = (toolName: string) => {
    return MAPLE_NATIVE_TOOL_NAMES.has(toolName);
  };

  const namespaceMarketplaceToolName = (appId: string, toolName: string): string => {
    return `${appId}::${toolName}`;
  };

  const parseMarketplaceToolName = (
    value: string
  ): { appId: string; toolName: string } | undefined => {
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
  };

  const filterAllowedDownstreamTools = (
    app: DownstreamAppConfig,
    tools: DownstreamToolInfo[]
  ): DownstreamToolInfo[] => {
    const allowlist = app.toolAllowlist;
    if (!allowlist || allowlist.length === 0) {
      return tools;
    }
    return tools.filter((tool) => allowlist.includes(tool.name));
  };

  const resolveMarketplaceAppIds = (target: McpProxyTargetResolution): string[] => {
    if (target.mode === "dynamic") {
      return [target.app.id];
    }

    if (deps.mcpExecutionOrderAppIds.length > 0) {
      return [...new Set(deps.mcpExecutionOrderAppIds)];
    }

    if (deps.mcpFirewallDefaultAppId) {
      return [deps.mcpFirewallDefaultAppId];
    }

    const auto = deps.resolveAutoConfiguredAppId();
    if (auto) {
      return [auto];
    }

    if (!deps.mcpRouteLockEnabled) {
      const enabled = [...deps.downstreamAppRegistry.values()]
        .filter((app) => app.enabled)
        .map((app) => app.id);
      if (enabled.length > 0) {
        return enabled;
      }
    }

    return [target.app.id];
  };

  const buildMarketplaceCatalog = async (
    target: McpProxyTargetResolution
  ): Promise<MarketplaceCatalogResult> => {
    const appIds = resolveMarketplaceAppIds(target);
    return buildMarketplaceCatalogForAppIds(appIds);
  };

  const listEnabledDownstreamAppIds = (): string[] => {
    return [...deps.downstreamAppRegistry.values()]
      .filter((app) => app.enabled)
      .map((app) => app.id);
  };

  const buildMarketplaceCatalogForAppIds = async (
    appIds: string[]
  ): Promise<MarketplaceCatalogResult> => {
    const uniqueAppIds = [...new Set(appIds)];
    const warnings: Array<{ appId: string; message: string }> = [];
    const tools: MarketplaceToolEntry[] = [];

    const results = await Promise.all(
      uniqueAppIds.map(async (appId) => {
        try {
          const app = deps.resolveDownstreamApp(appId);
          const listed = await deps.listToolsFromDownstreamCached(app);
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
            error: deps.errorMessage(error),
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
  };

  const classifyMarketplaceProviderForApp = (
    app: DownstreamAppConfig
  ): MarketplaceProvider | undefined => {
    if (deps.isSmitheryDownstreamApp(app)) {
      return "smithery";
    }
    if (deps.isMcpSoDownstreamApp(app)) {
      return "mcpso";
    }
    return undefined;
  };

  const localToolResult = (payload: unknown) => {
    let textPayload = "";
    try {
      textPayload = JSON.stringify(payload, null, 2);
    } catch {
      textPayload = String(payload ?? "");
    }
    return {
      content: [
        {
          type: "text" as const,
          text: textPayload,
        },
      ],
      structuredContent: payload,
    };
  };

  const findConnectedToolMatches = async (
    toolName: string,
    appIds?: string[]
  ): Promise<AutoRouteToolMatch[]> => {
    const normalizedTool = toolName.trim();
    if (!normalizedTool) {
      return [];
    }
    const candidates = [
      ...new Set(appIds && appIds.length > 0 ? appIds : listEnabledDownstreamAppIds()),
    ];
    const matches: AutoRouteToolMatch[] = [];

    const results = await Promise.all(
      candidates.map(async (appId) => {
        try {
          const app = deps.resolveDownstreamApp(appId);
          const listed = await deps.listToolsFromDownstreamCached(app);
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
  };

  const buildMapleGetStartedPlan = (options: {
    goal?: string;
    provider: MarketplaceProvider | "all";
    connectedApps: Array<{
      id: string;
      name: string;
      provider?: MarketplaceProvider;
    }>;
  }) => {
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
  };

  const autoConnectAndResolveToolMatch = async (options: {
    toolName: string;
    provider: MarketplaceProvider | "all";
    searchQuery: string;
    searchLimit: number;
  }): Promise<{
    match?: AutoRouteToolMatch;
    entries: MarketplaceSearchEntry[];
    attempted: string[];
    warnings: string[];
  }> => {
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

      if (!deps.downstreamAppRegistry.has(appId)) {
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
          warnings.push(`${entry.provider}:${entry.id}: ${deps.errorMessage(connectError)}`);
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
  };

  const executeMarketplaceControlTool = async (
    toolName: string,
    toolArgs: Record<string, unknown>
  ) => {
    if (toolName === "maple_get_started") {
      const provider = parseMarketplaceProvider(toolArgs.provider) ?? "all";
      const goal = deps.asString(toolArgs.goal);
      const connectedApps = deps.listDownstreamApps(deps.downstreamAppRegistry, false).map((entry) => {
        const raw = deps.downstreamAppRegistry.get(entry.id);
        return {
          id: entry.id,
          name: entry.name,
          provider: raw ? classifyMarketplaceProviderForApp(raw) : undefined,
        };
      });
      const runtime = deps.buildRuntimeStatus();
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
      const requestedToolName = deps.asString(toolArgs.toolName);
      if (!requestedToolName) {
        throw new Error("toolName is required.");
      }
      const explicitAppId = deps.asString(toolArgs.appId);
      const parsedQualified = parseMarketplaceToolName(requestedToolName);
      const normalizedToolName = parsedQualified?.toolName ?? requestedToolName;
      const appIdHint = parsedQualified?.appId ?? explicitAppId;
      const downstreamArgs =
        toolArgs.arguments &&
        typeof toolArgs.arguments === "object" &&
        !Array.isArray(toolArgs.arguments)
          ? (toolArgs.arguments as Record<string, unknown>)
          : {};
      const sessionId =
        deps.asString(toolArgs.sessionId) ??
        `mcp-autoroute-${(appIdHint ?? normalizedToolName).replace(/[^a-z0-9_-]+/gi, "-").toLowerCase()}`;
      const traceId = deps.asString(toolArgs.traceId);
      const autoConnect = deps.asBoolean(toolArgs.autoConnect, true);
      const provider = parseMarketplaceProvider(toolArgs.provider) ?? "all";
      const searchQuery = deps.asString(toolArgs.searchQuery) ?? normalizedToolName;
      const searchLimitRaw = deps.asNumber(toolArgs.searchLimit);
      const searchLimit = searchLimitRaw ? Math.max(1, Math.min(20, Math.trunc(searchLimitRaw))) : 8;

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
          message: `Could not resolve tool "${normalizedToolName}" to a connected downstream app.`,
          guidance: [
            "Run maple_marketplace_search to find candidate servers.",
            "Run maple_marketplace_connect to attach one server.",
            "Retry maple_autoroute_call with appId or namespaced appId::toolName.",
          ],
          autoConnect: autoConnectContext ?? null,
        });
      }

      const chainResult = await deps.dispatchDownstreamChainAndLog({
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
          policy: deps.toPolicySnapshot(failed.preExecutionDecision),
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
        policy: deps.toPolicySnapshot(final.preExecutionDecision),
        chainStages: chainResult.stages,
        downstreamResult: final.dispatch?.result ?? null,
      });
    }

    if (toolName === "maple_marketplace_search") {
      const provider = parseMarketplaceProvider(toolArgs.provider) ?? "all";
      const query = deps.asString(toolArgs.query);
      const limitRaw = deps.asNumber(toolArgs.limit);
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
      const rawId = deps.asString(toolArgs.id);
      if (!rawId) {
        throw new Error("id is required.");
      }
      const normalizedId = normalizeMarketplaceId(provider, rawId);
      const timeoutMsRaw = deps.asNumber(toolArgs.timeoutMs);
      const registered = await registerMarketplaceDownstream({
        provider,
        id: normalizedId,
        overwrite: deps.asBoolean(toolArgs.overwrite, false),
        appId: deps.asString(toolArgs.appId),
        name: deps.asString(toolArgs.name),
        enabled: deps.asBoolean(toolArgs.enabled, true),
        timeoutMs: timeoutMsRaw ? Math.max(1_000, Math.min(60_000, Math.trunc(timeoutMsRaw))) : undefined,
        query: deps.asStringRecord(toolArgs.query),
        headers: deps.asStringRecord(toolArgs.headers),
        apiKey: deps.asString(toolArgs.apiKey),
        authHeader: deps.asString(toolArgs.authHeader),
        authScheme: deps.asString(toolArgs.authScheme)?.toLowerCase() === "raw" ? "raw" : "bearer",
        toolAllowlist: deps.asStringArray(toolArgs.toolAllowlist),
        restrictToCatalogTools: deps.asBoolean(toolArgs.restrictToCatalogTools, true),
      });
      return localToolResult({
        ok: true,
        action: "connect",
        provider: registered.provider,
        appId: registered.appId,
        replaced: registered.replaced,
        app: deps.toPublicDownstreamApp(registered.app),
        resolved: registered.resolved,
      });
    }

    if (toolName === "maple_marketplace_connected_apps") {
      const provider = parseMarketplaceProvider(toolArgs.provider) ?? "all";
      const apps = deps
        .listDownstreamApps(deps.downstreamAppRegistry, true)
        .map((entry) => {
          const raw = deps.downstreamAppRegistry.get(entry.id);
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
      const appId = deps.asString(toolArgs.appId);
      if (!appId) {
        throw new Error("appId is required.");
      }
      const existing = deps.downstreamAppRegistry.get(appId);
      if (!existing) {
        throw new Error(`Downstream app "${appId}" not found.`);
      }
      const provider = classifyMarketplaceProviderForApp(existing);
      if (!provider) {
        throw new Error(`Downstream app "${appId}" is not marketplace-managed.`);
      }
      deps.downstreamAppRegistry.delete(appId);
      deps.clearDownstreamToolsCache(appId);
      return localToolResult({
        ok: true,
        action: "disconnect",
        provider,
        appId,
      });
    }

    throw new Error(`Unsupported marketplace control tool: ${toolName}`);
  };

  return {
    autoConnectAndResolveToolMatch,
    buildMarketplaceCatalog,
    buildMarketplaceCatalogForAppIds,
    classifyMarketplaceProviderForApp,
    executeMarketplaceControlTool,
    getMarketplaceControlTools,
    isMapleNativeToolName,
    isMarketplaceControlToolName,
    listEnabledDownstreamAppIds,
    normalizeMarketplaceId,
    parseMarketplaceProvider,
    parseMarketplaceToolName,
    registerMarketplaceDownstream,
    resolveMarketplaceAppIds,
    searchMarketplaceServers,
  };
}
