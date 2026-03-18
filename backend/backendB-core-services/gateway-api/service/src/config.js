import { createHash } from "node:crypto";
import { asString } from "./helpers.js";
import { loadDownstreamAppsFromEnv, } from "./control/downstream-proxy.js";
import { loadApiKeysFromEnv } from "@maple/security";
import { requireEnv, requireEnvPort } from "@maple/common";

function loadAdminApiKeys(env = process.env) {
    return loadApiKeysFromEnv({
        ...env,
        MAPLE_API_KEY: env.MAPLE_ADMIN_API_KEY ?? env.MAPLE_API_KEY,
        MAPLE_API_KEYS: env.MAPLE_ADMIN_API_KEYS ?? env.MAPLE_API_KEYS,
    });
}

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
function optionalEnv(key, fallback = "") {
    const raw = (process.env[key] ?? "").trim();
    return raw.length > 0 ? raw : fallback;
}
function optionalEnvBool(key, fallback) {
    const raw = (process.env[key] ?? "").trim().toLowerCase();
    if (!raw) {
        return fallback;
    }
    if (raw === "1" || raw === "true" || raw === "yes")
        return true;
    if (raw === "0" || raw === "false" || raw === "no")
        return false;
    throw new Error(`Invalid boolean for ${key}: "${raw}" (must be 0/1/true/false/yes/no)`);
}
function optionalEnvInt(key, fallback, { min, max } = {}) {
    const raw = (process.env[key] ?? "").trim();
    if (!raw) {
        return fallback;
    }
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
function optionalJsonArrayEnv(key, fallback = []) {
    const raw = (process.env[key] ?? "").trim();
    if (!raw) {
        return [...fallback];
    }
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [...fallback];
    }
    catch {
        return [...fallback];
    }
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
export const openclawAgentMediationEnabled = optionalEnvBool("MAPLE_OPENCLAW_AGENT_MEDIATION_ENABLED", false);
export const openclawAgentRequireVirustotal = optionalEnvBool("MAPLE_OPENCLAW_AGENT_REQUIRE_VIRUSTOTAL", false);
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
const downloadScanProviderRaw = optionalEnv("MAPLE_DOWNLOAD_SCAN_PROVIDER", "local").toLowerCase();
if (downloadScanProviderRaw !== "local" && downloadScanProviderRaw !== "virustotal") {
    throw new Error(`Invalid MAPLE_DOWNLOAD_SCAN_PROVIDER: "${downloadScanProviderRaw}" (must be "local" or "virustotal")`);
}
export const downloadScanProvider = downloadScanProviderRaw;
export const downloadScanVirusTotalApiKey = optionalEnv("MAPLE_VIRUSTOTAL_API_KEY");
export const downloadScanVirusTotalApiUrl = optionalEnv("MAPLE_VIRUSTOTAL_API_URL", "https://www.virustotal.com/api/v3");
export const downloadScanVirusTotalUploadFallback = optionalEnvBool("MAPLE_VIRUSTOTAL_UPLOAD_FALLBACK", false);
export const downloadScanTimeoutMs = optionalEnvInt("MAPLE_DOWNLOAD_SCAN_TIMEOUT_MS", 4000, { min: 250, max: 30000 });
export const cyberEvidenceSyncTtlMs = optionalEnvInt("MAPLE_CYBER_EVIDENCE_SYNC_TTL_MS", 2500, { min: 250, max: 60000 });
export const cyberQuarantineStorageDir = optionalEnv("MAPLE_CYBER_QUARANTINE_STORAGE_DIR", `${process.cwd()}/.maple-security/quarantine`);
const cyberObjectStoreModeRaw = optionalEnv("MAPLE_CYBER_OBJECT_STORE_MODE", "filesystem").toLowerCase();
if (cyberObjectStoreModeRaw !== "filesystem" && cyberObjectStoreModeRaw !== "http") {
    throw new Error(`Invalid MAPLE_CYBER_OBJECT_STORE_MODE: "${cyberObjectStoreModeRaw}" (must be "filesystem" or "http")`);
}
export const cyberObjectStoreMode = cyberObjectStoreModeRaw;
export const cyberObjectStoreStorageDir = optionalEnv("MAPLE_CYBER_OBJECT_STORE_STORAGE_DIR", cyberQuarantineStorageDir);
export const cyberObjectStoreBaseUrl = optionalEnv("MAPLE_CYBER_OBJECT_STORE_BASE_URL");
export const cyberObjectStoreToken = optionalEnv("MAPLE_CYBER_OBJECT_STORE_TOKEN");
export const cyberObjectStorePrefix = optionalEnv("MAPLE_CYBER_OBJECT_STORE_PREFIX", "cyber-evidence");
const malwareSandboxProviderRaw = optionalEnv("MAPLE_MALWARE_SANDBOX_PROVIDER", "none").toLowerCase();
if (malwareSandboxProviderRaw !== "none" && malwareSandboxProviderRaw !== "http") {
    throw new Error(`Invalid MAPLE_MALWARE_SANDBOX_PROVIDER: "${malwareSandboxProviderRaw}" (must be "none" or "http")`);
}
export const malwareSandboxProvider = malwareSandboxProviderRaw;
export const malwareSandboxApiUrl = optionalEnv("MAPLE_MALWARE_SANDBOX_API_URL");
export const malwareSandboxApiToken = optionalEnv("MAPLE_MALWARE_SANDBOX_API_TOKEN");
export const malwareSandboxTimeoutMs = optionalEnvInt("MAPLE_MALWARE_SANDBOX_TIMEOUT_MS", 5000, { min: 250, max: 60000 });
export const malwareSandboxRequired = optionalEnvBool("MAPLE_MALWARE_SANDBOX_REQUIRED", false);
export const cyberRequireStepUpForSensitiveMutations = optionalEnvBool("MAPLE_CYBER_REQUIRE_STEP_UP", true);
export const filesystemMutationAllowedRoots = optionalJsonArrayEnv("MAPLE_FILESYSTEM_GUARD_ALLOWED_ROOTS", [process.cwd()]);
export const filesystemMutationProtectedRoots = optionalJsonArrayEnv("MAPLE_FILESYSTEM_GUARD_PROTECTED_ROOTS", []);
export const filesystemMutationGeneratedPatterns = optionalJsonArrayEnv("MAPLE_FILESYSTEM_GUARD_GENERATED_PATTERNS", []);
export const filesystemMutationSensitivePatterns = optionalJsonArrayEnv("MAPLE_FILESYSTEM_GUARD_SENSITIVE_PATTERNS", []);
export const filesystemMutationDirectMaxPaths = optionalEnvInt("MAPLE_FILESYSTEM_GUARD_DIRECT_MAX_PATHS", 4, { min: 1, max: 500 });
export const filesystemMutationPromotionMaxPaths = optionalEnvInt("MAPLE_FILESYSTEM_GUARD_PROMOTION_MAX_PATHS", 200, { min: 1, max: 10_000 });
export const filesystemMutationForksEnabled = optionalEnvBool("MAPLE_FILESYSTEM_GUARD_FORKS_ENABLED", true);
export const filesystemMutationModel = optionalEnv("MAPLE_FILESYSTEM_GUARD_MODEL", "gpt-4o-mini");
export const filesystemMutationClassifierRequired = optionalEnvBool("MAPLE_FILESYSTEM_GUARD_CLASSIFIER_REQUIRED", false);
export const cyberAllowedDomains = optionalEnv("CYBER_ALLOWED_DOMAINS")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
export const cyberBlockedDomains = optionalEnv("CYBER_BLOCKED_DOMAINS")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
export const cyberToolAllowedDomains = (() => {
    const raw = optionalEnv("CYBER_TOOL_ALLOWED_DOMAINS_JSON", "{}");
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    }
    catch {
        return {};
    }
})();
export const cyberAllowLocalTargets = optionalEnvBool("CYBER_ALLOW_LOCAL_TARGETS", false);
export const cyberAllowedLocalHosts = optionalEnv("CYBER_ALLOWED_LOCAL_HOSTS")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
export const cyberMaxResponseBytes = optionalEnvInt("CYBER_MAX_RESPONSE_BYTES", 10 * 1024 * 1024, { min: 1024, max: 500 * 1024 * 1024 });
export const cyberQuarantineEnabled = optionalEnvBool("CYBER_QUARANTINE_ENABLED", true);
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
const demoRoutesRequested = requireEnvBool("MAPLE_ENABLE_DEMO_ROUTES");
if (isProductionRuntime && demoRoutesRequested) {
    console.error("[config] MAPLE_ENABLE_DEMO_ROUTES is forced OFF in production. Demo routes will not be registered.");
}
export const demoRoutesEnabled = demoRoutesRequested && !isProductionRuntime;
export const judgeUiRoutesEnabled = requireEnvBool("MAPLE_ENABLE_JUDGE_UI");
export const firewallChatOpenAiApiKey = requireEnv("OPENAI_API_KEY");
export const firewallChatAnthropicApiKey = requireEnv("ANTHROPIC_API_KEY");
// ── Production credential validation ────────────────────────────────────────
if (isProductionRuntime) {
    const PLACEHOLDER_PATTERNS = [/^sk_test_/i, /^ci-test-/i, /^test-/i, /^pk_test_/i, /^whsec_test$/i, /placeholder/i, /^local-dev-/i, /^maple-dev-key/i];
    const criticalCredentials = {
        STRIPE_SECRET_KEY: stripeSecretKey,
        OPENAI_API_KEY: firewallChatOpenAiApiKey,
        ANTHROPIC_API_KEY: firewallChatAnthropicApiKey,
    };
    for (const [name, value] of Object.entries(criticalCredentials)) {
        if (PLACEHOLDER_PATTERNS.some((p) => p.test(value))) {
            console.error(`[config] CRITICAL: ${name} appears to be a test/placeholder value in production. Replace with a real credential immediately.`);
        }
    }
}
const firewallChatPrimaryProviderRaw = requireEnv("MAPLE_FIREWALL_CHAT_PRIMARY").toLowerCase();
if (firewallChatPrimaryProviderRaw !== "openai" && firewallChatPrimaryProviderRaw !== "anthropic") {
    throw new Error(`Invalid MAPLE_FIREWALL_CHAT_PRIMARY: "${firewallChatPrimaryProviderRaw}" (must be "openai" or "anthropic")`);
}
export const firewallChatPrimaryProvider = firewallChatPrimaryProviderRaw;
export const firewallChatOpenAiModel = requireEnv("MAPLE_FIREWALL_CHAT_OPENAI_MODEL");
export const firewallChatAnthropicModel = requireEnv("MAPLE_FIREWALL_CHAT_ANTHROPIC_MODEL");
export const firewallChatTimeoutMs = requireEnvInt("MAPLE_FIREWALL_CHAT_TIMEOUT_MS", { min: 2000, max: 60000 });
const UNUSABLE_KEY_PATTERNS = [/^not-configured$/i, /^ci-test-/i, /^test-/i, /placeholder/i, /^sk-proj-placeholder/i, /^sk-ant-placeholder/i];
function isUsableApiKey(key) {
    if (!key) return false;
    return !UNUSABLE_KEY_PATTERNS.some((p) => p.test(key));
}
export const firewallChatAiEnabled = isUsableApiKey(firewallChatOpenAiApiKey) || isUsableApiKey(firewallChatAnthropicApiKey);
export const sessionCookieDomain = (process.env.MAPLE_SESSION_COOKIE_DOMAIN ?? "").trim() || "";
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
export const mcpProxyAddress = requireEnv("MCP_PROXY_ADDRESS");
export const cyberProxyAddress = requireEnv("CYBER_PROXY_ADDRESS");
export const auditWriterAddress = requireEnv("AUDIT_WRITER_ADDRESS");
export const corsOrigin = requireEnv("CORS_ORIGIN");
// ── Admin console config (merged from admin-console-api) ──────────────────
export const adminApiKeys = loadAdminApiKeys();
const adminAllowNoAuthRequested = optionalEnvBool("MAPLE_ADMIN_ALLOW_NO_AUTH", false);
if (isProductionRuntime && adminAllowNoAuthRequested) {
    console.error("[config] MAPLE_ADMIN_ALLOW_NO_AUTH is forced OFF in production. Admin routes will require authentication.");
}
export const adminAllowNoAuth = adminAllowNoAuthRequested && !isProductionRuntime;
export const auditWriterHttpOrigin = optionalEnv("AUDIT_WRITER_HTTP_ORIGIN");
// ── Recovery config (merged from business-api) ────────────────────────────
function optionalProvider(key, allowedValues, fallback) {
    const raw = (process.env[key] ?? "").trim().toLowerCase();
    if (!raw) return fallback;
    if (!allowedValues.includes(raw)) return fallback;
    return raw;
}
export const recoveryDeliveryRequired = optionalEnvBool("MAPLE_RECOVERY_DELIVERY_REQUIRED", false);
export const recoveryEmailProvider = optionalProvider("MAPLE_RECOVERY_EMAIL_PROVIDER", ["none", "sendgrid", "resend"], "none");
export const recoveryEmailFrom = optionalEnv("MAPLE_RECOVERY_EMAIL_FROM");
export const recoveryEmailReplyTo = optionalEnv("MAPLE_RECOVERY_EMAIL_REPLY_TO");
export const recoveryEmailSubjectPrefix = optionalEnv("MAPLE_RECOVERY_EMAIL_SUBJECT_PREFIX", "Maple");
export const recoveryResetBaseUrl = optionalEnv("MAPLE_RECOVERY_RESET_BASE_URL");
export const recoveryVerifyBaseUrl = optionalEnv("MAPLE_RECOVERY_VERIFY_BASE_URL");
export const recoverySendgridApiKey = optionalEnv("SENDGRID_API_KEY");
export const recoveryResendApiKey = optionalEnv("RESEND_API_KEY");
export const recoverySmsProvider = optionalProvider("MAPLE_RECOVERY_SMS_PROVIDER", ["none", "twilio"], "none");
export const recoverySmsTo = optionalEnv("MAPLE_RECOVERY_SMS_TO");
export const recoverySmsFrom = optionalEnv("MAPLE_RECOVERY_SMS_FROM");
export const twilioAccountSid = optionalEnv("TWILIO_ACCOUNT_SID");
export const twilioAuthToken = optionalEnv("TWILIO_AUTH_TOKEN");
//# sourceMappingURL=config.js.map
