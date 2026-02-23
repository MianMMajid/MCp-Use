import { createHash } from "node:crypto";
import { asString } from "./helpers.js";
import {
  loadDownstreamAppsFromEnv,
  type DownstreamAppConfig,
} from "./control/downstream-proxy.js";
import { loadApiKeysFromEnv } from "@maple/security";

export const isProductionRuntime = process.env.NODE_ENV === "production";

// -- Stripe billing setup ----------------------------------------------------
export const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim() || null;
export const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim() || null;
export const STRIPE_PLAN_PRICE_IDS: Record<string, string> = {
  pro: process.env.STRIPE_PRICE_PRO?.trim() || "",
  team: process.env.STRIPE_PRICE_TEAM?.trim() || "",
  enterprise: process.env.STRIPE_PRICE_ENTERPRISE?.trim() || "",
};
export const STRIPE_PRICE_TO_PLAN: Record<string, string> = {};
for (const [plan, priceId] of Object.entries(STRIPE_PLAN_PRICE_IDS)) {
  if (priceId) STRIPE_PRICE_TO_PLAN[priceId] = plan;
}
export const stripePublishableKey = process.env.STRIPE_PUBLISHABLE_KEY?.trim() || null;

export const downstreamAppRegistry = loadDownstreamAppsFromEnv();
export let evolvedSuggestionsServed = 0;
export function incrementEvolvedSuggestionsServed(count: number) {
  evolvedSuggestionsServed += count;
}

export const configuredApiKeys = loadApiKeysFromEnv();
export const apiKeyAuthEnabled = configuredApiKeys.length > 0;
export const allowNoAuth =
  String(process.env.MAPLE_ALLOW_NO_AUTH ?? "0").trim().toLowerCase() === "true" ||
  String(process.env.MAPLE_ALLOW_NO_AUTH ?? "0").trim().toLowerCase() === "1";
export const allowBridgeOverride =
  String(process.env.MAPLE_ALLOW_BRIDGE_OVERRIDE ?? "0").trim().toLowerCase() === "true" ||
  String(process.env.MAPLE_ALLOW_BRIDGE_OVERRIDE ?? "0").trim().toLowerCase() === "1";
export const explicitBridgeLock =
  String(process.env.MAPLE_LOCK_BRIDGE_TARGET ?? "0").trim().toLowerCase() === "true" ||
  String(process.env.MAPLE_LOCK_BRIDGE_TARGET ?? "0").trim().toLowerCase() === "1";
export const HARDCODED_BRIDGE_URL = "http://127.0.0.1:8787";
export const configuredBridgeUrl =
  asString(process.env.OPENCLAW_BRIDGE_URL) ??
  (process.env.NODE_ENV === "production" ? "" : HARDCODED_BRIDGE_URL);
export const configuredBridgeToken = asString(process.env.OPENCLAW_BRIDGE_TOKEN) ?? "";
export const bridgeOverrideLockEnabled =
  explicitBridgeLock || !allowBridgeOverride || process.env.NODE_ENV === "production";
export const sessionPollEnabled =
  String(process.env.MAPLE_SESSION_POLL ?? "1") !== "0";
export const sessionPollIntervalMs = (() => {
  const raw = process.env.MAPLE_SESSION_POLL_MS;
  if (!raw) return 5000;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5000;
})();
export const mcpFirewallDefaultAppId = asString(process.env.MAPLE_MCP_FIREWALL_DEFAULT_APP);
export const mcpProxyAllowDynamicTargets =
  String(process.env.MAPLE_MCP_PROXY_ALLOW_DYNAMIC_TARGETS ?? "0").trim().toLowerCase() ===
    "true" ||
  String(process.env.MAPLE_MCP_PROXY_ALLOW_DYNAMIC_TARGETS ?? "0").trim().toLowerCase() === "1";
export const mcpProxyAllowHttp =
  String(process.env.MAPLE_MCP_PROXY_ALLOW_HTTP ?? "0").trim().toLowerCase() === "true" ||
  String(process.env.MAPLE_MCP_PROXY_ALLOW_HTTP ?? "0").trim().toLowerCase() === "1";
export const mcpProxyAllowPrivateTargets =
  String(process.env.MAPLE_MCP_PROXY_ALLOW_PRIVATE_TARGETS ?? "0").trim().toLowerCase() ===
    "true" ||
  String(process.env.MAPLE_MCP_PROXY_ALLOW_PRIVATE_TARGETS ?? "0").trim().toLowerCase() === "1";
export const mcpProxyDefaultTargetUrl = asString(process.env.MAPLE_MCP_PROXY_DEFAULT_TARGET_URL);
export const mcpProxyAllowedHosts = String(process.env.MAPLE_MCP_PROXY_ALLOWED_HOSTS ?? "")
  .split(",")
  .map((entry) => entry.trim().toLowerCase())
  .filter((entry) => entry.length > 0);
export const mcpExecutionOrderAppIds = String(process.env.MAPLE_MCP_EXECUTION_ORDER ?? "")
  .split(",")
  .map((entry) => entry.trim())
  .filter((entry) => entry.length > 0);
export const marketplaceHardDisabled = true;
export const mcpMarketplaceEnabled =
  !marketplaceHardDisabled &&
  (String(process.env.MAPLE_MCP_MARKETPLACE_ENABLED ?? "0").trim().toLowerCase() === "true" ||
    String(process.env.MAPLE_MCP_MARKETPLACE_ENABLED ?? "0").trim().toLowerCase() === "1");
export const mcpMarketplaceAutoConnectEnabled =
  !marketplaceHardDisabled &&
  (String(process.env.MAPLE_MCP_MARKETPLACE_AUTO_CONNECT ?? "0").trim().toLowerCase() === "true" ||
    String(process.env.MAPLE_MCP_MARKETPLACE_AUTO_CONNECT ?? "0").trim().toLowerCase() === "1");
export const smitheryEnabled =
  !marketplaceHardDisabled &&
  (String(process.env.MAPLE_SMITHERY_ENABLED ?? "0").trim().toLowerCase() === "true" ||
    String(process.env.MAPLE_SMITHERY_ENABLED ?? "0").trim().toLowerCase() === "1");
export const smitheryApiBaseUrl =
  asString(process.env.MAPLE_SMITHERY_API_BASE_URL) ?? "https://api.smithery.ai";
export const smitheryApiKey = asString(process.env.MAPLE_SMITHERY_API_KEY);
const smitheryTimeoutMsRaw = Number.parseInt(String(process.env.MAPLE_SMITHERY_TIMEOUT_MS ?? "12000"), 10);
export const smitheryTimeoutMs = Number.isFinite(smitheryTimeoutMsRaw)
  ? Math.max(1_000, Math.min(60_000, smitheryTimeoutMsRaw))
  : 12_000;
export const mcpSoEnabled =
  !marketplaceHardDisabled &&
  (String(process.env.MAPLE_MCPSO_ENABLED ?? "0").trim().toLowerCase() === "true" ||
    String(process.env.MAPLE_MCPSO_ENABLED ?? "0").trim().toLowerCase() === "1");
export const mcpSoBaseUrl = asString(process.env.MAPLE_MCPSO_BASE_URL) ?? "https://mcp.so";
const mcpSoTimeoutMsRaw = Number.parseInt(String(process.env.MAPLE_MCPSO_TIMEOUT_MS ?? "12000"), 10);
export const mcpSoTimeoutMs = Number.isFinite(mcpSoTimeoutMsRaw)
  ? Math.max(1_000, Math.min(60_000, mcpSoTimeoutMsRaw))
  : 12_000;
const downstreamToolsCacheTtlMsRaw = Number.parseInt(
  String(process.env.MAPLE_DOWNSTREAM_TOOLS_CACHE_TTL_MS ?? "15000"),
  10
);
export const downstreamToolsCacheTtlMs = Number.isFinite(downstreamToolsCacheTtlMsRaw)
  ? Math.max(500, Math.min(60_000, downstreamToolsCacheTtlMsRaw))
  : 15_000;

export const explicitRouteLock =
  String(process.env.MAPLE_MCP_ROUTE_LOCK ?? "0").trim().toLowerCase() === "true" ||
  String(process.env.MAPLE_MCP_ROUTE_LOCK ?? "0").trim().toLowerCase() === "1";
export const mcpRouteLockEnabled = explicitRouteLock || process.env.NODE_ENV === "production";
export const MAPLE_DEFAULT_TARGET_APP_ID = "__maple_default_target__";

export const sessionOwnerScopeMode = (() => {
  const raw = String(process.env.MAPLE_SESSION_OWNER_SCOPE ?? "auto").trim().toLowerCase();
  if (raw === "user" || raw === "api_key_primary" || raw === "auto") {
    return raw;
  }
  return "auto";
})();

export const primaryConfiguredApiKeyFingerprint =
  configuredApiKeys.length > 0
    ? createHash("sha256").update(configuredApiKeys[0]).digest("hex").slice(0, 12)
    : undefined;

export const demoRoutesEnabled =
  String(process.env.MAPLE_ENABLE_DEMO_ROUTES ?? "1")
    .trim()
    .toLowerCase() === "true" ||
  String(process.env.MAPLE_ENABLE_DEMO_ROUTES ?? "1")
    .trim()
    .toLowerCase() === "1";

export const legacySmitheryRoutesEnabled =
  String(process.env.MAPLE_ENABLE_LEGACY_SMITHERY_ROUTES ?? "0").trim().toLowerCase() === "true" ||
  String(process.env.MAPLE_ENABLE_LEGACY_SMITHERY_ROUTES ?? "0").trim().toLowerCase() === "1";

export const judgeUiRoutesEnabled =
  String(process.env.MAPLE_ENABLE_JUDGE_UI ?? "1").trim().toLowerCase() === "true" ||
  String(process.env.MAPLE_ENABLE_JUDGE_UI ?? "1").trim().toLowerCase() === "1";

export type FirewallChatAiProvider = "openai" | "anthropic";
export const firewallChatOpenAiApiKey =
  asString(process.env.OPENAI_API_KEY) ?? asString(process.env.MAPLE_OPENAI_API_KEY);
export const firewallChatAnthropicApiKey =
  asString(process.env.ANTHROPIC_API_KEY) ?? asString(process.env.MAPLE_ANTHROPIC_API_KEY);
const firewallChatPrimaryProviderRaw = String(process.env.MAPLE_FIREWALL_CHAT_PRIMARY ?? "openai")
  .trim()
  .toLowerCase();
export const firewallChatPrimaryProvider: FirewallChatAiProvider =
  firewallChatPrimaryProviderRaw === "anthropic" ? "anthropic" : "openai";
export const firewallChatOpenAiModel =
  asString(process.env.MAPLE_FIREWALL_CHAT_OPENAI_MODEL) ?? "gpt-4o-mini";
export const firewallChatAnthropicModel =
  asString(process.env.MAPLE_FIREWALL_CHAT_ANTHROPIC_MODEL) ?? "claude-sonnet-4-6";
const firewallChatTimeoutMsRaw = Number.parseInt(
  String(process.env.MAPLE_FIREWALL_CHAT_TIMEOUT_MS ?? "15000"),
  10
);
export const firewallChatTimeoutMs = Number.isFinite(firewallChatTimeoutMsRaw)
  ? Math.max(2_000, Math.min(60_000, firewallChatTimeoutMsRaw))
  : 15_000;
export const firewallChatAiEnabled = Boolean(firewallChatOpenAiApiKey || firewallChatAnthropicApiKey);

export const sessionCookieName = "maple_session";
export const sessionTtlSeconds = Math.max(
  60,
  Number.parseInt(String(process.env.MAPLE_SESSION_TTL_SECONDS ?? "604800"), 10) || 604800
);
export const allowSelfSignup =
  String(process.env.MAPLE_AUTH_ALLOW_SELF_SIGNUP ?? "0").trim().toLowerCase() === "true" ||
  String(process.env.MAPLE_AUTH_ALLOW_SELF_SIGNUP ?? "0").trim().toLowerCase() === "1";

export const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim() || null;

export const GPT_OAUTH_CLIENT_ID = String(process.env.MAPLE_GPT_OAUTH_CLIENT_ID || "maple-gpt-client");
export const GPT_OAUTH_CLIENT_SECRET = String(process.env.MAPLE_GPT_OAUTH_CLIENT_SECRET || configuredApiKeys[0] || "maple-secret");
export const GPT_SPEC_TTL_MS = 5 * 60 * 1000;

// ── Service infrastructure ────────────────────────────────────────────────
import { getEnvOrDefault, getEnvPort } from "@maple/common";
export const gatewayPort = getEnvPort("GATEWAY_PORT", 8443);
export const gatewayHost = getEnvOrDefault("GATEWAY_HOST", "0.0.0.0");
export const gatewayTlsCertPath = getEnvOrDefault("MAPLE_GATEWAY_TLS_CERT", "/etc/maple/gateway-tls/tls.crt");
export const gatewayTlsKeyPath = getEnvOrDefault("MAPLE_GATEWAY_TLS_KEY", "/etc/maple/gateway-tls/tls.key");
export const gatewayTlsCaPath = getEnvOrDefault("MAPLE_GATEWAY_TLS_CA", "/etc/maple/gateway-tls/ca.crt");
export const databaseUrl = getEnvOrDefault("DATABASE_URL", "postgresql://maple:maple@localhost:5432/maple");
export const contextWallAddress = getEnvOrDefault("CONTEXT_WALL_ADDRESS", "localhost:9000");
/** @deprecated Gateway no longer calls model-router directly; all LLM calls route through context-wall */
export const modelRouterAddress = getEnvOrDefault("MODEL_ROUTER_ADDRESS", "localhost:9100");
export const mcpProxyAddress = getEnvOrDefault("MCP_PROXY_ADDRESS", "localhost:9200");
export const secretsBrokerAddress = getEnvOrDefault("SECRETS_BROKER_ADDRESS", "localhost:9300");
export const auditWriterAddress = getEnvOrDefault("AUDIT_WRITER_ADDRESS", "localhost:9400");
export const corsOrigin = getEnvOrDefault("CORS_ORIGIN", "*");
