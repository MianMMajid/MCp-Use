import { createHash } from "node:crypto";
import { isIP } from "node:net";
import type { DownstreamAppConfig } from "../../control/downstream-proxy.js";
import { asString } from "./value-utils.js";

export type SessionOwnerScopeMode = "auto" | "user" | "api_key_primary";
export type FirewallChatAiProvider = "openai" | "anthropic";

interface CreateRuntimeConfigOptions {
  configuredApiKeys: string[];
  downstreamAppRegistry: Map<string, DownstreamAppConfig>;
}

export interface RuntimeConfig {
  allowNoAuth: boolean;
  allowSelfSignup: boolean;
  apiKeyAuthEnabled: boolean;
  bridgeOverrideLockEnabled: boolean;
  configuredBridgeToken: string;
  configuredBridgeUrl: string;
  demoRoutesEnabled: boolean;
  downstreamToolsCacheTtlMs: number;
  firewallChatAiEnabled: boolean;
  firewallChatAnthropicApiKey?: string;
  firewallChatAnthropicModel: string;
  firewallChatOpenAiApiKey?: string;
  firewallChatOpenAiModel: string;
  firewallChatPrimaryProvider: FirewallChatAiProvider;
  firewallChatTimeoutMs: number;
  judgeUiRoutesEnabled: boolean;
  legacySmitheryRoutesEnabled: boolean;
  mapleDefaultTargetAppId: string;
  mcpExecutionOrderAppIds: string[];
  mcpFirewallDefaultAppId?: string;
  mcpMarketplaceAutoConnectEnabled: boolean;
  mcpMarketplaceEnabled: boolean;
  mcpProxyAllowDynamicTargets: boolean;
  mcpProxyAllowHttp: boolean;
  mcpProxyAllowPrivateTargets: boolean;
  mcpProxyAllowedHosts: string[];
  mcpProxyDefaultTargetUrl?: string;
  mcpRouteLockEnabled: boolean;
  mcpSoBaseUrl: string;
  mcpSoEnabled: boolean;
  mcpSoTimeoutMs: number;
  normalizeDynamicMcpUrl: (rawUrl: string) => string;
  primaryConfiguredApiKeyFingerprint?: string;
  sessionCookieName: string;
  sessionOwnerScopeMode: SessionOwnerScopeMode;
  sessionPollEnabled: boolean;
  sessionPollIntervalMs: number;
  sessionTtlSeconds: number;
  smitheryApiBaseUrl: string;
  smitheryApiKey?: string;
  smitheryEnabled: boolean;
  smitheryTimeoutMs: number;
}

function envBool(key: string, fallback = "0"): boolean {
  const value = String(process.env[key] ?? fallback).trim().toLowerCase();
  return value === "true" || value === "1";
}

function validateHttpUrl(name: string, value: string): void {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error(`${name} must be http/https.`);
    }
  } catch (error) {
    throw new Error(
      `${name} is invalid: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

function isPrivateOrLocalHost(hostname: string): boolean {
  const lower = hostname.trim().toLowerCase();
  if (!lower) {
    return true;
  }
  if (lower === "localhost" || lower.endsWith(".local")) {
    return true;
  }

  const family = isIP(lower);
  if (family === 4) {
    const parts = lower.split(".").map((part) => Number(part));
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
      return true;
    }
    const [a, b] = parts;
    if (a === 10 || a === 127 || a === 0) {
      return true;
    }
    if (a === 169 && b === 254) {
      return true;
    }
    if (a === 172 && b >= 16 && b <= 31) {
      return true;
    }
    if (a === 192 && b === 168) {
      return true;
    }
    if (a >= 224) {
      return true;
    }
  }

  if (family === 6) {
    if (lower === "::1" || lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) {
      return true;
    }
  }

  return false;
}

function hostAllowedByPolicy(hostname: string, allowedHosts: string[]): boolean {
  if (allowedHosts.length === 0) {
    return true;
  }
  if (allowedHosts.includes("*")) {
    return true;
  }
  const lower = hostname.toLowerCase();
  return allowedHosts.some((allowed) => lower === allowed || lower.endsWith(`.${allowed}`));
}

export function createRuntimeConfig(options: CreateRuntimeConfigOptions): RuntimeConfig {
  const { configuredApiKeys, downstreamAppRegistry } = options;

  const apiKeyAuthEnabled = configuredApiKeys.length > 0;
  const allowNoAuth = envBool("MAPLE_ALLOW_NO_AUTH");
  const allowBridgeOverride = envBool("MAPLE_ALLOW_BRIDGE_OVERRIDE");
  const explicitBridgeLock = envBool("MAPLE_LOCK_BRIDGE_TARGET");
  const hardcodedBridgeUrl = "http://127.0.0.1:8787";
  const configuredBridgeUrl =
    asString(process.env.OPENCLAW_BRIDGE_URL) ??
    (process.env.NODE_ENV === "production" ? "" : hardcodedBridgeUrl);
  const configuredBridgeToken = asString(process.env.OPENCLAW_BRIDGE_TOKEN) ?? "";
  const bridgeOverrideLockEnabled =
    explicitBridgeLock || !allowBridgeOverride || process.env.NODE_ENV === "production";

  const sessionPollEnabled = String(process.env.MAPLE_SESSION_POLL ?? "1") !== "0";
  const sessionPollIntervalMs = (() => {
    const raw = process.env.MAPLE_SESSION_POLL_MS;
    if (!raw) {
      return 5000;
    }
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 5000;
  })();

  const mcpFirewallDefaultAppId = asString(process.env.MAPLE_MCP_FIREWALL_DEFAULT_APP);
  const mcpProxyAllowDynamicTargets = envBool("MAPLE_MCP_PROXY_ALLOW_DYNAMIC_TARGETS");
  const mcpProxyAllowHttp = envBool("MAPLE_MCP_PROXY_ALLOW_HTTP");
  const mcpProxyAllowPrivateTargets = envBool("MAPLE_MCP_PROXY_ALLOW_PRIVATE_TARGETS");
  const mcpProxyDefaultTargetUrl = asString(process.env.MAPLE_MCP_PROXY_DEFAULT_TARGET_URL);
  const mcpProxyAllowedHosts = String(process.env.MAPLE_MCP_PROXY_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
  const mcpExecutionOrderAppIds = String(process.env.MAPLE_MCP_EXECUTION_ORDER ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  const marketplaceHardDisabled = true;
  const mcpMarketplaceEnabled =
    !marketplaceHardDisabled && envBool("MAPLE_MCP_MARKETPLACE_ENABLED");
  const mcpMarketplaceAutoConnectEnabled =
    !marketplaceHardDisabled && envBool("MAPLE_MCP_MARKETPLACE_AUTO_CONNECT");
  const smitheryEnabled = !marketplaceHardDisabled && envBool("MAPLE_SMITHERY_ENABLED");
  const smitheryApiBaseUrl = asString(process.env.MAPLE_SMITHERY_API_BASE_URL) ?? "https://api.smithery.ai";
  const smitheryApiKey = asString(process.env.MAPLE_SMITHERY_API_KEY);
  const smitheryTimeoutMsRaw = Number.parseInt(
    String(process.env.MAPLE_SMITHERY_TIMEOUT_MS ?? "12000"),
    10
  );
  const smitheryTimeoutMs = Number.isFinite(smitheryTimeoutMsRaw)
    ? Math.max(1_000, Math.min(60_000, smitheryTimeoutMsRaw))
    : 12_000;
  const mcpSoEnabled = !marketplaceHardDisabled && envBool("MAPLE_MCPSO_ENABLED");
  const mcpSoBaseUrl = asString(process.env.MAPLE_MCPSO_BASE_URL) ?? "https://mcp.so";
  const mcpSoTimeoutMsRaw = Number.parseInt(
    String(process.env.MAPLE_MCPSO_TIMEOUT_MS ?? "12000"),
    10
  );
  const mcpSoTimeoutMs = Number.isFinite(mcpSoTimeoutMsRaw)
    ? Math.max(1_000, Math.min(60_000, mcpSoTimeoutMsRaw))
    : 12_000;

  const downstreamToolsCacheTtlMsRaw = Number.parseInt(
    String(process.env.MAPLE_DOWNSTREAM_TOOLS_CACHE_TTL_MS ?? "15000"),
    10
  );
  const downstreamToolsCacheTtlMs = Number.isFinite(downstreamToolsCacheTtlMsRaw)
    ? Math.max(500, Math.min(60_000, downstreamToolsCacheTtlMsRaw))
    : 15_000;

  const explicitRouteLock = envBool("MAPLE_MCP_ROUTE_LOCK");
  const mcpRouteLockEnabled = explicitRouteLock || process.env.NODE_ENV === "production";
  const mapleDefaultTargetAppId = "__maple_default_target__";

  const sessionOwnerScopeMode = (() => {
    const raw = String(process.env.MAPLE_SESSION_OWNER_SCOPE ?? "auto").trim().toLowerCase();
    if (raw === "user" || raw === "api_key_primary" || raw === "auto") {
      return raw;
    }
    return "auto";
  })() as SessionOwnerScopeMode;

  const primaryConfiguredApiKeyFingerprint =
    configuredApiKeys.length > 0
      ? createHash("sha256").update(configuredApiKeys[0]).digest("hex").slice(0, 12)
      : undefined;

  const demoRoutesEnabled = envBool("MAPLE_ENABLE_DEMO_ROUTES", "1");
  const legacySmitheryRoutesEnabled = envBool("MAPLE_ENABLE_LEGACY_SMITHERY_ROUTES");
  const judgeUiRoutesEnabled = envBool("MAPLE_ENABLE_JUDGE_UI", "1");

  const firewallChatOpenAiApiKey =
    asString(process.env.OPENAI_API_KEY) ?? asString(process.env.MAPLE_OPENAI_API_KEY);
  const firewallChatAnthropicApiKey =
    asString(process.env.ANTHROPIC_API_KEY) ?? asString(process.env.MAPLE_ANTHROPIC_API_KEY);
  const firewallChatPrimaryProviderRaw = String(
    process.env.MAPLE_FIREWALL_CHAT_PRIMARY ?? "openai"
  )
    .trim()
    .toLowerCase();
  const firewallChatPrimaryProvider: FirewallChatAiProvider =
    firewallChatPrimaryProviderRaw === "anthropic" ? "anthropic" : "openai";
  const firewallChatOpenAiModel =
    asString(process.env.MAPLE_FIREWALL_CHAT_OPENAI_MODEL) ?? "gpt-4o-mini";
  const firewallChatAnthropicModel =
    asString(process.env.MAPLE_FIREWALL_CHAT_ANTHROPIC_MODEL) ?? "claude-sonnet-4-6";
  const firewallChatTimeoutMsRaw = Number.parseInt(
    String(process.env.MAPLE_FIREWALL_CHAT_TIMEOUT_MS ?? "15000"),
    10
  );
  const firewallChatTimeoutMs = Number.isFinite(firewallChatTimeoutMsRaw)
    ? Math.max(2_000, Math.min(60_000, firewallChatTimeoutMsRaw))
    : 15_000;
  const firewallChatAiEnabled = Boolean(firewallChatOpenAiApiKey || firewallChatAnthropicApiKey);

  const sessionCookieName = "maple_session";
  const sessionTtlSeconds = Math.max(
    60,
    Number.parseInt(String(process.env.MAPLE_SESSION_TTL_SECONDS ?? "604800"), 10) || 604800
  );
  const allowSelfSignup = envBool("MAPLE_AUTH_ALLOW_SELF_SIGNUP");

  const normalizeDynamicMcpUrl = (rawUrl: string): string => {
    const parsed = new URL(rawUrl);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol !== "https:" && !(protocol === "http:" && mcpProxyAllowHttp)) {
      throw new Error(
        "Dynamic MCP target must use https (or http when MAPLE_MCP_PROXY_ALLOW_HTTP=true)."
      );
    }
    if (process.env.NODE_ENV === "production" && protocol !== "https:") {
      throw new Error("Dynamic MCP target must use https in production.");
    }
    const privateHost = isPrivateOrLocalHost(parsed.hostname);
    const privateAllowed =
      privateHost && mcpProxyAllowPrivateTargets && process.env.NODE_ENV !== "production";
    if (privateHost && !privateAllowed) {
      throw new Error("Dynamic MCP target host is private/local and is denied by policy.");
    }
    if (!hostAllowedByPolicy(parsed.hostname, mcpProxyAllowedHosts)) {
      throw new Error("Dynamic MCP target host is not allowlisted.");
    }
    return parsed.toString();
  };

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
    validateHttpUrl("MAPLE_SMITHERY_API_BASE_URL", smitheryApiBaseUrl);
  }

  if (mcpSoEnabled) {
    validateHttpUrl("MAPLE_MCPSO_BASE_URL", mcpSoBaseUrl);
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

  const activeDownstreamAppCount = [...downstreamAppRegistry.values()].filter((app) => app.enabled).length;
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
    throw new Error("MAPLE_MCP_PROXY_ALLOW_PRIVATE_TARGETS is not allowed in production.");
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

  return {
    allowNoAuth,
    allowSelfSignup,
    apiKeyAuthEnabled,
    bridgeOverrideLockEnabled,
    configuredBridgeToken,
    configuredBridgeUrl,
    demoRoutesEnabled,
    downstreamToolsCacheTtlMs,
    firewallChatAiEnabled,
    firewallChatAnthropicApiKey,
    firewallChatAnthropicModel,
    firewallChatOpenAiApiKey,
    firewallChatOpenAiModel,
    firewallChatPrimaryProvider,
    firewallChatTimeoutMs,
    judgeUiRoutesEnabled,
    legacySmitheryRoutesEnabled,
    mapleDefaultTargetAppId,
    mcpExecutionOrderAppIds,
    mcpFirewallDefaultAppId,
    mcpMarketplaceAutoConnectEnabled,
    mcpMarketplaceEnabled,
    mcpProxyAllowDynamicTargets,
    mcpProxyAllowHttp,
    mcpProxyAllowPrivateTargets,
    mcpProxyAllowedHosts,
    mcpProxyDefaultTargetUrl,
    mcpRouteLockEnabled,
    mcpSoBaseUrl,
    mcpSoEnabled,
    mcpSoTimeoutMs,
    normalizeDynamicMcpUrl,
    primaryConfiguredApiKeyFingerprint,
    sessionCookieName,
    sessionOwnerScopeMode,
    sessionPollEnabled,
    sessionPollIntervalMs,
    sessionTtlSeconds,
    smitheryApiBaseUrl,
    smitheryApiKey,
    smitheryEnabled,
    smitheryTimeoutMs,
  };
}
