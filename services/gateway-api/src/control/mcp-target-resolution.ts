import { asString } from "../helpers.js";
import {
  mcpExecutionOrderAppIds,
  mcpFirewallDefaultAppId,
  mcpProxyAllowDynamicTargets,
  mcpRouteLockEnabled,
} from "../config.js";
import type { DownstreamAppConfig } from "./downstream-proxy.js";
import {
  resolveAutoConfiguredAppId,
  resolveDefaultTargetApp,
  resolveDownstreamApp,
  toDynamicDownstreamAppConfig,
} from "./downstream-resolution.js";

interface McpRouteRequestLike {
  header: (name: string) => string | undefined;
  query: (name: string) => string | undefined;
}

export interface McpRouteContextLike {
  req: McpRouteRequestLike;
}

export interface McpProxyTargetResolution {
  app: DownstreamAppConfig;
  mode: "configured" | "dynamic";
}

function collectMcpRouteOverrideFields(c: McpRouteContextLike): string[] {
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

export function resolveMcpProxyTarget(
  c: McpRouteContextLike,
): McpProxyTargetResolution | undefined {
  const bypassProxy =
    c.req.header("x-maple-proxy-bypass") === "1" || c.req.query("mapleProxy") === "off";
  if (bypassProxy) {
    throw new Error("MCP proxy bypass is disabled by policy.");
  }

  if (mcpRouteLockEnabled) {
    const overrides = collectMcpRouteOverrideFields(c);
    if (overrides.length > 0) {
      throw new Error(
        `MCP route-lock is enabled. Per-request route overrides are denied: ${overrides.join(", ")}.`,
      );
    }
  }

  const dynamicUrl =
    asString(c.req.header("x-maple-downstream-url")) || asString(c.req.query("mapleTargetUrl"));
  if (dynamicUrl) {
    if (!mcpProxyAllowDynamicTargets) {
      throw new Error(
        "Dynamic MCP targets are disabled. Configure MAPLE_MCP_PROXY_ALLOW_DYNAMIC_TARGETS=true.",
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
    `No downstream target resolved for strict MCP firewall mode. ${routeResolutionHint}`,
  );
}
