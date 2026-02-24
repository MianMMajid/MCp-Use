export interface MarketplaceControlToolDefinition {
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

export function getMarketplaceControlTools(enabled: boolean): MarketplaceControlToolDefinition[] {
  return enabled ? MARKETPLACE_CONTROL_TOOLS : [];
}

export function isMarketplaceControlToolName(toolName: string, enabled: boolean): boolean {
  return getMarketplaceControlTools(enabled).some((tool) => tool.name === toolName);
}

export function isMapleNativeToolName(toolName: string): boolean {
  return MAPLE_NATIVE_TOOL_NAMES.has(toolName);
}
