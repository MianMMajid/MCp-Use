import {
  downstreamAppRegistry,
  mcpExecutionOrderAppIds,
  mcpFirewallDefaultAppId,
  mcpRouteLockEnabled,
} from "../config.js";
import { errorMessage } from "../helpers.js";
import type { DownstreamAppConfig, DownstreamToolInfo } from "./downstream-proxy.js";
import {
  listToolsFromDownstreamCached,
  resolveAutoConfiguredAppId,
  resolveDownstreamApp,
} from "./downstream-resolution.js";
import type { McpProxyTargetResolution } from "./mcp-target-resolution.js";

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

function namespaceMarketplaceToolName(appId: string, toolName: string): string {
  return `${appId}::${toolName}`;
}

export function filterAllowedDownstreamTools(
  app: DownstreamAppConfig,
  tools: DownstreamToolInfo[],
): DownstreamToolInfo[] {
  const allowlist = app.toolAllowlist;
  if (!allowlist || allowlist.length === 0) {
    return tools;
  }
  return tools.filter((tool) => allowlist.includes(tool.name));
}

export function resolveMarketplaceAppIds(target: McpProxyTargetResolution): string[] {
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

export async function buildMarketplaceCatalog(
  target: McpProxyTargetResolution,
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
  appIds: string[],
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
    }),
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
