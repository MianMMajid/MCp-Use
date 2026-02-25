interface RuntimeStatusSnapshot {
  activeDownstreamApps: unknown[];
  strict: boolean;
  routeLock: boolean;
  routeSummary: string;
  bypassAllowed: boolean;
  executionOrder: string[];
  defaultTargetUrl?: string | null;
  marketplaceAutoConnectEnabled?: boolean;
}

interface SessionPollingConfig {
  enabled: boolean;
  intervalMs: number;
  bridgeUrl: string;
  bridgeToken: string;
  pollForNewSessions: () => Promise<void>;
}

interface LogServerStartupDeps {
  buildRuntimeStatus: () => RuntimeStatusSnapshot;
  downstreamConfiguredCount: number;
  mcpProxyAllowPrivateTargets: boolean;
  mcpProxyAllowDynamicTargets: boolean;
  mcpProxyAllowedHosts: string[];
  mcpMarketplaceEnabled: boolean;
  judgeUiRoutesEnabled: boolean;
  demoRoutesEnabled: boolean;
  legacySmitheryRoutesEnabled: boolean;
  apiKeyAuthEnabled: boolean;
  configuredApiKeyCount: number;
  configuredBridgeUrl: string;
  configuredBridgeToken: string;
  allowSelfSignup: boolean;
  sessionTtlSeconds: number;
  sessionOwnerScopeMode: string;
  primaryConfiguredApiKeyFingerprint?: string;
  sessionPolling: SessionPollingConfig;
}

export function logServerStartup(deps: LogServerStartupDeps): void {
  const {
    buildRuntimeStatus,
    downstreamConfiguredCount,
    mcpProxyAllowPrivateTargets,
    mcpProxyAllowDynamicTargets,
    mcpProxyAllowedHosts,
    mcpMarketplaceEnabled,
    judgeUiRoutesEnabled,
    demoRoutesEnabled,
    legacySmitheryRoutesEnabled,
    apiKeyAuthEnabled,
    configuredApiKeyCount,
    configuredBridgeUrl,
    configuredBridgeToken,
    allowSelfSignup,
    sessionTtlSeconds,
    sessionOwnerScopeMode,
    primaryConfiguredApiKeyFingerprint,
    sessionPolling,
  } = deps;

  console.log("Maple MCP server running");
  const runtimeStatus = buildRuntimeStatus();
  const activeDownstream = runtimeStatus.activeDownstreamApps;
  console.log(`[DOWNSTREAM] configured=${downstreamConfiguredCount} active=${activeDownstream.length}`);
  console.log(
    `[MCP-FIREWALL] strict=${runtimeStatus.strict ? "true" : "false"} routeLock=${
      runtimeStatus.routeLock ? "true" : "false"
    } route=${runtimeStatus.routeSummary} bypassAllowed=${runtimeStatus.bypassAllowed ? "true" : "false"}`
  );
  if (runtimeStatus.executionOrder.length > 0) {
    console.log(`[MCP-FIREWALL] executionOrder=${runtimeStatus.executionOrder.join(" -> ")}`);
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
    console.log(`[AUTH] API key auth enabled with ${configuredApiKeyCount} key(s).`);
  } else {
    console.log("[AUTH] API key auth bypass enabled (MAPLE_ALLOW_NO_AUTH=true).");
  }
  if (!configuredBridgeUrl || !configuredBridgeToken) {
    console.log(
      "[OPENCLAW] Bridge credentials are not fully configured. source=openclaw calls will fail; use source=auto/mock unless bridge vars are set."
    );
  }
  console.log(
    `[AUTH] Dashboard session auth enabled. selfSignup=${allowSelfSignup ? "true" : "false"} ttlSeconds=${sessionTtlSeconds}`
  );
  console.log(
    `[AUTH] session owner scope=${sessionOwnerScopeMode} primaryApiKeyFingerprint=${
      primaryConfiguredApiKeyFingerprint ?? "none"
    }`
  );
  if (sessionPolling.enabled && configuredBridgeUrl && configuredBridgeToken) {
    setInterval(() => {
      sessionPolling.pollForNewSessions().catch(() => {});
    }, sessionPolling.intervalMs);
    sessionPolling.pollForNewSessions().catch(() => {});
    console.log(
      `[SESSION-POLL] enabled, interval=${sessionPolling.intervalMs}ms, bridge=${sessionPolling.bridgeUrl}`
    );
  } else {
    console.log("[SESSION-POLL] disabled (no bridge credentials or MAPLE_SESSION_POLL=0)");
  }
}
