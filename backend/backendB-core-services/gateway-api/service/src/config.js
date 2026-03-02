import { createHash } from "node:crypto";
import { asString } from "./helpers.js";
import { loadDownstreamAppsFromEnv, } from "./control/downstream-proxy.js";
import { loadApiKeysFromEnv } from "@maple/security";
import { requireEnv, requireEnvPort } from "@maple/common";

function requireEnvBool(key) {
    const raw = requireEnv(key).toLowerCase();
    if (raw === "1" || raw === "true" || raw === "yes") return true;
    if (raw === "0" || raw === "false" || raw === "no") return false;
    throw new Error(`Invalid boolean for ${key}: "${raw}" (must be 0/1/true/false/yes/no)`);
}
function requireEnvInt(key, { min, max } = {}) {
    const raw = requireEnv(key);
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) {
        throw new Error(`Invalid integer for ${key}: "${raw}"`);
    }
    if (min !== undefined && parsed < min) {
        throw new Error(`${key} value ${parsed} is below minimum ${min}`);
    }
    if (max !== undefined && parsed > max) {
        throw new Error(`${key} value ${parsed} is above maximum ${max}`);
    }
    return parsed;
}
function requireCsvList(key) {
    const raw = requireEnv(key);
    const normalized = raw
        .split(",")
        .map((entry) => entry.trim().toLowerCase())
        .filter((entry) => entry.length > 0);
    if (normalized.length === 0) {
        throw new Error(`${key} must contain at least one comma-separated value`);
    }
    return [...new Set(normalized)];
}

export const isProductionRuntime = requireEnv("NODE_ENV") === "production";
export const isBehindTrustedProxy = (() => {
    const raw = (process.env.MAPLE_BEHIND_TRUSTED_PROXY ?? "").trim().toLowerCase();
    return raw === "1" || raw === "true" || raw === "yes";
})();
// -- Stripe billing setup ----------------------------------------------------
export const stripeSecretKey = requireEnv("STRIPE_SECRET_KEY");
export const stripeWebhookSecret = requireEnv("STRIPE_WEBHOOK_SECRET");
export const STRIPE_PLAN_PRICE_IDS = {
    pro: requireEnv("STRIPE_PRICE_PRO"),
    team: requireEnv("STRIPE_PRICE_TEAM"),
    enterprise: requireEnv("STRIPE_PRICE_ENTERPRISE"),
};
export const STRIPE_PRICE_TO_PLAN = {};
for (const [plan, priceId] of Object.entries(STRIPE_PLAN_PRICE_IDS)) {
    if (priceId)
        STRIPE_PRICE_TO_PLAN[priceId] = plan;
}
export const stripePublishableKey = requireEnv("STRIPE_PUBLISHABLE_KEY");
export const downstreamAppRegistry = loadDownstreamAppsFromEnv();
export let evolvedSuggestionsServed = 0;
export function incrementEvolvedSuggestionsServed(count) {
    evolvedSuggestionsServed += count;
}
export const configuredApiKeys = loadApiKeysFromEnv();
export const apiKeyAuthEnabled = configuredApiKeys.length > 0;
const allowNoAuthRequested = requireEnvBool("MAPLE_ALLOW_NO_AUTH");
if (isProductionRuntime && allowNoAuthRequested && !isBehindTrustedProxy) {
    throw new Error("MAPLE_ALLOW_NO_AUTH cannot be enabled in production runtime.");
}
if (isProductionRuntime && allowNoAuthRequested && isBehindTrustedProxy) {
    console.warn("[config] MAPLE_ALLOW_NO_AUTH is enabled in production behind trusted proxy. Ensure the proxy enforces authentication.");
}
export const allowNoAuth = allowNoAuthRequested;
export const allowBridgeOverride = requireEnvBool("MAPLE_ALLOW_BRIDGE_OVERRIDE");
export const explicitBridgeLock = requireEnvBool("MAPLE_LOCK_BRIDGE_TARGET");
export const configuredBridgeUrl = requireEnv("OPENCLAW_BRIDGE_URL");
export const configuredBridgeToken = requireEnv("OPENCLAW_BRIDGE_TOKEN");
export const bridgeOverrideLockEnabled = explicitBridgeLock || !allowBridgeOverride || isProductionRuntime;
export const openclawAgentEnabled = requireEnvBool("MAPLE_OPENCLAW_AGENT_ENABLED");
const openclawAgentModeRaw = requireEnv("MAPLE_OPENCLAW_AGENT_MODE").toLowerCase();
if (openclawAgentModeRaw !== "local" && openclawAgentModeRaw !== "gateway") {
    throw new Error(`Invalid MAPLE_OPENCLAW_AGENT_MODE: "${openclawAgentModeRaw}" (must be "local" or "gateway")`);
}
export const openclawAgentMode = openclawAgentModeRaw;
export const openclawAgentRequired = requireEnvBool("MAPLE_OPENCLAW_AGENT_REQUIRED");
export const openclawAgentDevProfile = requireEnvBool("MAPLE_OPENCLAW_AGENT_DEV_PROFILE");
export const openclawAgentAutoStartGateway = requireEnvBool("MAPLE_OPENCLAW_AGENT_AUTOSTART_GATEWAY");
export const openclawAgentGatewayPort = requireEnvPort("MAPLE_OPENCLAW_AGENT_GATEWAY_PORT");
export const openclawAgentGatewayBind = requireEnv("MAPLE_OPENCLAW_AGENT_GATEWAY_BIND");
export const openclawAgentDefaultSessionId = requireEnv("MAPLE_OPENCLAW_AGENT_DEFAULT_SESSION_ID");
export const openclawAgentDefaultThinking = requireEnv("MAPLE_OPENCLAW_AGENT_DEFAULT_THINKING");
export const openclawAgentDefaultTimeoutSeconds = requireEnvInt("MAPLE_OPENCLAW_AGENT_TIMEOUT_SECONDS", { min: 15, max: 1200 });
export const openclawModifierEnabled = requireEnvBool("MAPLE_OPENCLAW_MODIFIER_ENABLED");
export const openclawModifierAllowDevProfile = requireEnvBool("MAPLE_OPENCLAW_MODIFIER_ALLOW_DEV_PROFILE");
export const openclawModifierApprovalTtlSeconds = requireEnvInt("MAPLE_OPENCLAW_MODIFIER_APPROVAL_TTL_SECONDS", { min: 60, max: 86400 });
export const openclawModifierMaxTimeoutSeconds = requireEnvInt("MAPLE_OPENCLAW_MODIFIER_MAX_TIMEOUT_SECONDS", { min: 10, max: 300 });
export const openclawModifierMaxBufferMb = requireEnvInt("MAPLE_OPENCLAW_MODIFIER_MAX_BUFFER_MB", { min: 1, max: 32 });
export const openclawModifierSourceProfile = requireEnv("MAPLE_OPENCLAW_MODIFIER_SOURCE_PROFILE");
export const openclawModifierAllowedTools = requireCsvList("MAPLE_OPENCLAW_MODIFIER_ALLOWED_TOOLS");
export const openclawModifierDangerousTools = requireCsvList("MAPLE_OPENCLAW_MODIFIER_DANGEROUS_TOOLS");
export const openclawModifierBlockedTargetProfiles = requireCsvList("MAPLE_OPENCLAW_MODIFIER_BLOCKED_TARGET_PROFILES");
export const openclawModifierRequireScope = requireEnvBool("MAPLE_OPENCLAW_MODIFIER_REQUIRE_SCOPE");
export const openclawModifierRequireScopedOrgRbac = requireEnvBool("MAPLE_OPENCLAW_MODIFIER_REQUIRE_ORG_RBAC");
export const openclawModifierRequireTenantPolicy = requireEnvBool("MAPLE_OPENCLAW_MODIFIER_REQUIRE_TENANT_POLICY");
export const openclawModifierAutoBootstrapOwner = requireEnvBool("MAPLE_OPENCLAW_MODIFIER_AUTO_BOOTSTRAP_OWNER");
export const openclawModifierAuditOutboxEnabled = requireEnvBool("MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX");
export const openclawModifierAuditOutboxIntervalMs = requireEnvInt("MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX_INTERVAL_MS", { min: 1000, max: 60000 });
export const openclawModifierAuditOutboxBatchSize = requireEnvInt("MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX_BATCH_SIZE", { min: 1, max: 500 });
export const openclawModifierAuditOutboxMaxRetries = requireEnvInt("MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX_MAX_RETRIES", { min: 1, max: 20 });
// ── Enterprise module config ──────────────────────────────────────────────
export const stepUpRequiredForApprovals = requireEnvBool("MAPLE_STEP_UP_REQUIRED_FOR_APPROVALS");
export const escalationCheckIntervalMs = requireEnvInt("MAPLE_ESCALATION_CHECK_INTERVAL_MS", { min: 5000, max: 300000 });
export const retentionCheckIntervalMs = requireEnvInt("MAPLE_RETENTION_CHECK_INTERVAL_MS", { min: 60000 });
export const modifierGovernanceEnabled = requireEnvBool("MAPLE_MODIFIER_GOVERNANCE_ENABLED");
export const leaderElectionEnabled = requireEnvBool("MAPLE_LEADER_ELECTION_ENABLED");
// OTLP trace exporter
export const otlpEndpoint = requireEnv("MAPLE_OTLP_ENDPOINT");
export const otlpServiceName = requireEnv("MAPLE_OTLP_SERVICE_NAME");
export const otlpBatchSize = requireEnvInt("MAPLE_OTLP_BATCH_SIZE", { min: 1, max: 1000 });
export const otlpFlushIntervalMs = requireEnvInt("MAPLE_OTLP_FLUSH_INTERVAL_MS", { min: 1000, max: 60000 });

// ── Event transport config ────────────────────────────────────────────────
const eventTransportBackendRaw = requireEnv("MAPLE_EVENT_TRANSPORT_BACKEND").toLowerCase();
if (eventTransportBackendRaw !== "pg" && eventTransportBackendRaw !== "redis") {
    throw new Error(`Invalid MAPLE_EVENT_TRANSPORT_BACKEND: "${eventTransportBackendRaw}" (must be "pg" or "redis")`);
}
export const eventTransportBackend = eventTransportBackendRaw;
export const redisUrl = requireEnv("MAPLE_REDIS_URL");

export const firewallChatPreferOpenClaw = requireEnvBool("MAPLE_FIREWALL_CHAT_PREFER_OPENCLAW");
export const firewallChatStrictMode = requireEnvBool("MAPLE_FIREWALL_CHAT_STRICT_MODE");
export const sessionPollEnabled = requireEnvBool("MAPLE_SESSION_POLL");
export const sessionPollIntervalMs = requireEnvInt("MAPLE_SESSION_POLL_MS", { min: 1 });
export const mcpFirewallDefaultAppId = requireEnv("MAPLE_MCP_FIREWALL_DEFAULT_APP");
export const mcpProxyAllowDynamicTargets = requireEnvBool("MAPLE_MCP_PROXY_ALLOW_DYNAMIC_TARGETS");
export const mcpProxyAllowHttp = requireEnvBool("MAPLE_MCP_PROXY_ALLOW_HTTP");
export const mcpProxyAllowPrivateTargets = requireEnvBool("MAPLE_MCP_PROXY_ALLOW_PRIVATE_TARGETS");
export const mcpProxyDefaultTargetUrl = requireEnv("MAPLE_MCP_PROXY_DEFAULT_TARGET_URL");
export const mcpProxyAllowedHosts = requireEnv("MAPLE_MCP_PROXY_ALLOWED_HOSTS")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
export const mcpExecutionOrderAppIds = requireEnv("MAPLE_MCP_EXECUTION_ORDER")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
export const downstreamToolsCacheTtlMs = requireEnvInt("MAPLE_DOWNSTREAM_TOOLS_CACHE_TTL_MS", { min: 500, max: 60000 });
export const explicitRouteLock = requireEnvBool("MAPLE_MCP_ROUTE_LOCK");
export const mcpRouteLockEnabled = explicitRouteLock || isProductionRuntime;
export const MAPLE_DEFAULT_TARGET_APP_ID = "__maple_default_target__";
const sessionOwnerScopeRaw = requireEnv("MAPLE_SESSION_OWNER_SCOPE").toLowerCase();
if (sessionOwnerScopeRaw !== "user" && sessionOwnerScopeRaw !== "api_key_primary" && sessionOwnerScopeRaw !== "auto") {
    throw new Error(`Invalid MAPLE_SESSION_OWNER_SCOPE: "${sessionOwnerScopeRaw}" (must be "user", "api_key_primary", or "auto")`);
}
export const sessionOwnerScopeMode = sessionOwnerScopeRaw;
export const primaryConfiguredApiKeyFingerprint = configuredApiKeys.length > 0
    ? createHash("sha256").update(configuredApiKeys[0]).digest("hex").slice(0, 12)
    : undefined;
export const demoRoutesEnabled = requireEnvBool("MAPLE_ENABLE_DEMO_ROUTES");
export const judgeUiRoutesEnabled = requireEnvBool("MAPLE_ENABLE_JUDGE_UI");
export const firewallChatOpenAiApiKey = requireEnv("OPENAI_API_KEY");
export const firewallChatAnthropicApiKey = requireEnv("ANTHROPIC_API_KEY");
const firewallChatPrimaryProviderRaw = requireEnv("MAPLE_FIREWALL_CHAT_PRIMARY").toLowerCase();
if (firewallChatPrimaryProviderRaw !== "openai" && firewallChatPrimaryProviderRaw !== "anthropic") {
    throw new Error(`Invalid MAPLE_FIREWALL_CHAT_PRIMARY: "${firewallChatPrimaryProviderRaw}" (must be "openai" or "anthropic")`);
}
export const firewallChatPrimaryProvider = firewallChatPrimaryProviderRaw;
export const firewallChatOpenAiModel = requireEnv("MAPLE_FIREWALL_CHAT_OPENAI_MODEL");
export const firewallChatAnthropicModel = requireEnv("MAPLE_FIREWALL_CHAT_ANTHROPIC_MODEL");
export const firewallChatTimeoutMs = requireEnvInt("MAPLE_FIREWALL_CHAT_TIMEOUT_MS", { min: 2000, max: 60000 });
export const firewallChatAiEnabled = Boolean(firewallChatOpenAiApiKey || firewallChatAnthropicApiKey);
export const sessionCookieName = requireEnv("MAPLE_SESSION_COOKIE_NAME");
export const sessionTtlSeconds = requireEnvInt("MAPLE_SESSION_TTL_SECONDS", { min: 60 });
export const allowSelfSignup = requireEnvBool("MAPLE_AUTH_ALLOW_SELF_SIGNUP");
export const googleClientId = requireEnv("GOOGLE_CLIENT_ID");
export const GPT_OAUTH_CLIENT_ID = requireEnv("MAPLE_GPT_OAUTH_CLIENT_ID");
export const GPT_OAUTH_CLIENT_SECRET = requireEnv("MAPLE_GPT_OAUTH_CLIENT_SECRET");
export const GPT_SPEC_TTL_MS = 5 * 60 * 1000;
// ── Service infrastructure ────────────────────────────────────────────────
export const gatewayPort = requireEnvPort("GATEWAY_PORT");
export const gatewayHost = requireEnv("GATEWAY_HOST");
export const gatewayTlsCertPath = requireEnv("MAPLE_GATEWAY_TLS_CERT");
export const gatewayTlsKeyPath = requireEnv("MAPLE_GATEWAY_TLS_KEY");
export const gatewayTlsCaPath = requireEnv("MAPLE_GATEWAY_TLS_CA");
export const databaseUrl = requireEnv("DATABASE_URL");
export const contextWallAddress = requireEnv("CONTEXT_WALL_ADDRESS");
/** @deprecated Gateway no longer calls model-router directly; all LLM calls route through context-wall */
export const modelRouterAddress = requireEnv("MODEL_ROUTER_ADDRESS");
export const mcpProxyAddress = requireEnv("MCP_PROXY_ADDRESS");
export const toolRunnerAddress = requireEnv("TOOL_RUNNER_ADDRESS");
export const cyberProxyAddress = requireEnv("CYBER_PROXY_ADDRESS");
export const secretsBrokerAddress = requireEnv("SECRETS_BROKER_ADDRESS");
export const auditWriterAddress = requireEnv("AUDIT_WRITER_ADDRESS");
export const businessApiBaseUrl = requireEnv("MAPLE_BUSINESS_API_BASE_URL");
export const businessApiRequired = requireEnvBool("MAPLE_BUSINESS_API_REQUIRED");
export const businessApiProxyCaPath = requireEnv("MAPLE_BUSINESS_API_CA");
export const businessApiProxyCertPath = requireEnv("MAPLE_BUSINESS_API_CERT");
export const businessApiProxyKeyPath = requireEnv("MAPLE_BUSINESS_API_KEY");
export const businessApiProxyTimeoutMs = requireEnvInt("MAPLE_BUSINESS_API_TIMEOUT_MS", { min: 250, max: 15000 });
export const corsOrigin = requireEnv("CORS_ORIGIN");
//# sourceMappingURL=config.js.map
