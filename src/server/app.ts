/**
 * Maple MCP Server — slim orchestrator.
 *
 * All business logic lives in dedicated modules; this file wires them
 * together, runs startup validation, and boots the server.
 */

// ── Core modules (order matters: helpers → logging → config → auth → state) ──
import {
  apiKeyAuthEnabled,
  allowNoAuth,
  allowSelfSignup,
  configuredApiKeys,
  configuredBridgeUrl,
  configuredBridgeToken,
  demoRoutesEnabled,
  downstreamAppRegistry,
  judgeUiRoutesEnabled,
  legacySmitheryRoutesEnabled,
  mcpExecutionOrderAppIds,
  mcpFirewallDefaultAppId,
  mcpMarketplaceEnabled,
  mcpProxyAllowDynamicTargets,
  mcpProxyAllowedHosts,
  mcpProxyAllowPrivateTargets,
  mcpProxyDefaultTargetUrl,
  mcpRouteLockEnabled,
  mcpSoBaseUrl,
  mcpSoEnabled,
  primaryConfiguredApiKeyFingerprint,
  sessionOwnerScopeMode,
  sessionPollEnabled,
  sessionPollIntervalMs,
  sessionTtlSeconds,
  smitheryApiBaseUrl,
  smitheryEnabled,
} from "./config.js";
import { bootstrapAuthUsers } from "./auth.js";
import { server, database, initializeDatabase, buildRuntimeStatus } from "./state.js";
import { normalizeDynamicMcpUrl } from "./firewall-proxy.js";
import { pollForNewSessions } from "./trace-helpers.js";

// ── Middleware (side-effect: registers CORS, logging, compression) ───────────
import "./middleware.js";

// ── Route modules (side-effect imports register routes on the shared server) ─
import "./routes/static-ui.js";
import "./routes/auth-routes.js";
import "./routes/billing-routes.js";
import "./routes/firewall-routes.js";
import "./routes/gpt-adapter.js";
import "./routes/demo-routes.js";
import "./routes/mcp-middleware.js";
import "./routes/mcp-tools.js";

// ── Route modules (explicit registration) ───────────────────────────────────
import { registerTraceRoutes } from "./routes/trace-routes.js";
import { registerDownstreamRoutes } from "./routes/downstream-routes.js";

registerTraceRoutes(server.app);
registerDownstreamRoutes(server.app);

// ── Startup validation ──────────────────────────────────────────────────────

if (!apiKeyAuthEnabled && !allowNoAuth) {
  throw new Error(
    "API key auth is required. Set MAPLE_API_KEY or MAPLE_API_KEYS. To bypass only in local dev, set MAPLE_ALLOW_NO_AUTH=true."
  );
}

if (process.env.NODE_ENV === "production" && allowNoAuth) {
  console.warn(
    "[MAPLE] WARNING: MAPLE_ALLOW_NO_AUTH is enabled in production. MCP endpoints are publicly accessible."
  );
}

if (mcpProxyAllowDynamicTargets && mcpProxyAllowedHosts.length === 0) {
  throw new Error(
    "MAPLE_MCP_PROXY_ALLOW_DYNAMIC_TARGETS requires MAPLE_MCP_PROXY_ALLOWED_HOSTS to be set."
  );
}

if (smitheryEnabled) {
  try {
    const parsed = new URL(smitheryApiBaseUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error("Smithery API base URL must be http/https.");
    }
  } catch (error) {
    throw new Error(
      `MAPLE_SMITHERY_API_BASE_URL is invalid: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

if (mcpSoEnabled) {
  try {
    const parsed = new URL(mcpSoBaseUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error("MCP.so base URL must be http/https.");
    }
  } catch (error) {
    throw new Error(
      `MAPLE_MCPSO_BASE_URL is invalid: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

if (mcpProxyDefaultTargetUrl) {
  try {
    normalizeDynamicMcpUrl(mcpProxyDefaultTargetUrl);
  } catch (error) {
    throw new Error(
      `MAPLE_MCP_PROXY_DEFAULT_TARGET_URL is invalid: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

if (
  mcpFirewallDefaultAppId &&
  !downstreamAppRegistry.has(mcpFirewallDefaultAppId) &&
  !(smitheryEnabled && mcpFirewallDefaultAppId.startsWith("smithery-"))
) {
  throw new Error(
    `MAPLE_MCP_FIREWALL_DEFAULT_APP="${mcpFirewallDefaultAppId}" is not present in MAPLE_DOWNSTREAM_APPS.`
  );
}

for (const appId of mcpExecutionOrderAppIds) {
  const app = downstreamAppRegistry.get(appId);
  if (!app) {
    if (smitheryEnabled && appId.startsWith("smithery-")) {
      continue;
    }
    throw new Error(
      `MAPLE_MCP_EXECUTION_ORDER includes unknown app "${appId}". Configure it in MAPLE_DOWNSTREAM_APPS.`
    );
  }
  if (!app.enabled) {
    throw new Error(`MAPLE_MCP_EXECUTION_ORDER includes disabled app "${appId}".`);
  }
}

const activeDownstreamAppCount = [...downstreamAppRegistry.values()].filter(
  (app) => app.enabled
).length;
if (
  activeDownstreamAppCount === 0 &&
  !mcpProxyAllowDynamicTargets &&
  !mcpProxyDefaultTargetUrl &&
  !smitheryEnabled &&
  !mcpSoEnabled
) {
  throw new Error(
    "Maple MCP firewall requires MAPLE_DOWNSTREAM_APPS, MAPLE_MCP_PROXY_ALLOW_DYNAMIC_TARGETS=true, MAPLE_MCP_PROXY_DEFAULT_TARGET_URL, or an enabled marketplace provider (MAPLE_SMITHERY_ENABLED / MAPLE_MCPSO_ENABLED)."
  );
}

if (process.env.NODE_ENV === "production" && mcpProxyAllowDynamicTargets) {
  throw new Error(
    "MAPLE_MCP_PROXY_ALLOW_DYNAMIC_TARGETS is not allowed in production route-lock mode."
  );
}

if (process.env.NODE_ENV === "production" && mcpProxyAllowPrivateTargets) {
  throw new Error(
    "MAPLE_MCP_PROXY_ALLOW_PRIVATE_TARGETS is not allowed in production."
  );
}

if (mcpRouteLockEnabled) {
  const deterministicRouteConfigured = Boolean(
    mcpExecutionOrderAppIds.length > 0 ||
      mcpFirewallDefaultAppId ||
      mcpProxyDefaultTargetUrl ||
      activeDownstreamAppCount === 1 ||
      smitheryEnabled ||
      mcpSoEnabled
  );
  if (!deterministicRouteConfigured) {
    throw new Error(
      "Route-lock mode requires one deterministic route: set MAPLE_MCP_EXECUTION_ORDER, MAPLE_MCP_FIREWALL_DEFAULT_APP, MAPLE_MCP_PROXY_DEFAULT_TARGET_URL, or keep only one enabled downstream app."
    );
  }
}

// ── Database & Auth bootstrap ───────────────────────────────────────────────

initializeDatabase();
bootstrapAuthUsers(database).catch((err) =>
  console.error("[AUTH] Bootstrap failed:", err)
);

// ── Start server ────────────────────────────────────────────────────────────

server.listen().then(() => {
  console.log("Maple MCP server running");
  const runtimeStatus = buildRuntimeStatus();
  const activeDownstream = runtimeStatus.activeDownstreamApps;
  console.log(
    `[DOWNSTREAM] configured=${downstreamAppRegistry.size} active=${activeDownstream.length}`
  );
  console.log(
    `[MCP-FIREWALL] strict=${runtimeStatus.strict ? "true" : "false"} routeLock=${
      runtimeStatus.routeLock ? "true" : "false"
    } route=${runtimeStatus.routeSummary} bypassAllowed=${
      runtimeStatus.bypassAllowed ? "true" : "false"
    }`
  );
  if (runtimeStatus.executionOrder.length > 0) {
    console.log(
      `[MCP-FIREWALL] executionOrder=${runtimeStatus.executionOrder.join(" -> ")}`
    );
  }
  if (runtimeStatus.defaultTargetUrl) {
    console.log(`[MCP-FIREWALL] defaultTarget=${runtimeStatus.defaultTargetUrl}`);
  }
  if (mcpProxyAllowPrivateTargets) {
    console.log("[MCP-FIREWALL] private target override enabled (non-production only).");
  }
  if (mcpProxyAllowDynamicTargets) {
    console.log(
      `[MCP-FIREWALL] dynamic targets enabled; allowlist hosts=${mcpProxyAllowedHosts.join(",")}`
    );
  }
  if (mcpMarketplaceEnabled) {
    console.log(
      `[MCP-FIREWALL] marketplace mode enabled (native namespaced tool browse/call). autoConnect=${
        runtimeStatus.marketplaceAutoConnectEnabled ? "true" : "false"
      }`
    );
  }
  console.log(
    `[ROUTES] judgeUI=${judgeUiRoutesEnabled ? "enabled" : "disabled"} demo=${
      demoRoutesEnabled ? "enabled" : "disabled"
    } legacySmithery=${legacySmitheryRoutesEnabled ? "enabled" : "disabled"}`
  );
  if (apiKeyAuthEnabled) {
    console.log(`[AUTH] API key auth enabled with ${configuredApiKeys.length} key(s).`);
  } else {
    console.log("[AUTH] API key auth bypass enabled (MAPLE_ALLOW_NO_AUTH=true).");
  }
  if (!configuredBridgeUrl || !configuredBridgeToken) {
    console.log(
      "[OPENCLAW] Bridge credentials are not fully configured. source=openclaw calls will fail; use source=auto/mock unless bridge vars are set."
    );
  }
  console.log(
    `[AUTH] Dashboard session auth enabled. selfSignup=${
      allowSelfSignup ? "true" : "false"
    } ttlSeconds=${sessionTtlSeconds}`
  );
  console.log(
    `[AUTH] session owner scope=${sessionOwnerScopeMode} primaryApiKeyFingerprint=${
      primaryConfiguredApiKeyFingerprint ?? "none"
    }`
  );
  if (sessionPollEnabled && configuredBridgeUrl && configuredBridgeToken) {
    setInterval(() => {
      pollForNewSessions().catch(() => {});
    }, sessionPollIntervalMs);
    pollForNewSessions().catch(() => {});
    console.log(
      `[SESSION-POLL] enabled, interval=${sessionPollIntervalMs}ms, bridge=${configuredBridgeUrl}`
    );
  } else {
    console.log("[SESSION-POLL] disabled (no bridge credentials or MAPLE_SESSION_POLL=0)");
  }
});
