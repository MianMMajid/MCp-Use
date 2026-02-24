import { mcpMarketplaceEnabled } from "../config.js";
import {
  asBoolean,
  asNumber,
  asString,
  jsonRpcErrorPayload,
} from "../helpers.js";
import { autoConnectAndResolveToolMatch } from "./marketplace-autoroute.js";
import { listEnabledDownstreamAppIds } from "./marketplace-catalog.js";
import { parseMarketplaceProvider } from "./marketplace-provider.js";
import type {
  McpToolsCallOptions,
  RegisterMarketplaceDownstreamFn,
  SearchMarketplaceServersFn,
} from "./mcp-tools-call-types.js";

export type UnqualifiedRoutingResult =
  | {
      kind: "resolved";
      explicitAppIds?: string[];
      normalizedToolName: string;
      autoConnectDiagnostics?: {
        attempted: string[];
        warnings: string[];
      };
    }
  | {
      kind: "error";
      response: Response;
    };

export async function resolveUnqualifiedMarketplaceTool(options: {
  request: Pick<McpToolsCallOptions, "c" | "id" | "target" | "proxyTargetErrorResponse">;
  toolArgs: Record<string, unknown>;
  normalizedToolName: string;
  searchMarketplaceServers: SearchMarketplaceServersFn;
  registerMarketplaceDownstream: RegisterMarketplaceDownstreamFn;
}): Promise<UnqualifiedRoutingResult> {
  const { request } = options;
  if (request.target) {
    return {
      kind: "resolved",
      explicitAppIds: undefined,
      normalizedToolName: options.normalizedToolName,
    };
  }

  const enabledMarketplaceApps = listEnabledDownstreamAppIds();
  if (enabledMarketplaceApps.length === 1) {
    return {
      kind: "resolved",
      explicitAppIds: [enabledMarketplaceApps[0]],
      normalizedToolName: options.normalizedToolName,
    };
  }
  if (enabledMarketplaceApps.length > 1) {
    return {
      kind: "error",
      response: request.c.json(
        jsonRpcErrorPayload(
          request.id,
          -32602,
          "Multiple downstream apps are connected. Use namespaced tool format appId::toolName.",
        ),
        400,
      ),
    };
  }

  if (!mcpMarketplaceEnabled || !asBoolean(options.toolArgs._mapleAutoConnect, true)) {
    return { kind: "error", response: request.proxyTargetErrorResponse() };
  }

  const autoConnectProvider = parseMarketplaceProvider(options.toolArgs._mapleProvider) ?? "all";
  const autoConnectSearchQuery = asString(options.toolArgs._mapleSearchQuery);
  const autoConnectSearchLimitRaw = asNumber(options.toolArgs._mapleSearchLimit);
  const autoConnectSearchLimit = autoConnectSearchLimitRaw
    ? Math.max(1, Math.min(20, Math.trunc(autoConnectSearchLimitRaw)))
    : 10;

  const autoConnected = await autoConnectAndResolveToolMatch({
    toolName: options.normalizedToolName,
    provider: autoConnectProvider,
    searchQuery: autoConnectSearchQuery ?? options.normalizedToolName,
    searchLimit: autoConnectSearchLimit,
    searchMarketplaceServers: options.searchMarketplaceServers,
    registerMarketplaceDownstream: options.registerMarketplaceDownstream,
  });
  const autoConnectDiagnostics = {
    attempted: autoConnected.attempted,
    warnings: autoConnected.warnings,
  };
  if (autoConnected.match) {
    return {
      kind: "resolved",
      explicitAppIds: [autoConnected.match.appId],
      normalizedToolName: autoConnected.match.toolName,
      autoConnectDiagnostics,
    };
  }

  return {
    kind: "error",
    response: request.c.json(
      jsonRpcErrorPayload(
        request.id,
        -32002,
        `Maple could not auto-resolve tool "${options.normalizedToolName}" to a downstream app.`,
        {
          autoConnectEnabled: true,
          provider: autoConnectProvider,
          attempted: autoConnected.attempted,
          warnings: autoConnected.warnings,
          hint: "Try namespaced appId::toolName, or call maple_marketplace_search to find a compatible server.",
        },
      ),
      400,
    ),
  };
}
