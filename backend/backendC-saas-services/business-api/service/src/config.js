import { createHash } from "node:crypto";
import { requireEnv, requireEnvPort } from "@maple/common";
import { loadApiKeysFromEnv } from "@maple/security";

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
function requireProvider(key, allowedValues) {
    const raw = requireEnv(key).toLowerCase();
    if (!allowedValues.includes(raw)) {
        throw new Error(`Invalid ${key}: "${raw}" (must be one of: ${allowedValues.join(", ")})`);
    }
    return raw;
}

const isProductionRuntime = requireEnv("NODE_ENV").toLowerCase() === "production";

export const serviceName = "business-api";
export const businessApiHost = requireEnv("BUSINESS_API_HOST");
export const businessApiPort = requireEnvPort("BUSINESS_API_PORT");

export const businessApiTlsCertPath = requireEnv("MAPLE_BUSINESS_API_TLS_CERT");
export const businessApiTlsKeyPath = requireEnv("MAPLE_BUSINESS_API_TLS_KEY");
export const businessApiTlsCaPath = requireEnv("MAPLE_BUSINESS_API_TLS_CA");
export const businessApiMtlsRequired = requireEnvBool("MAPLE_BUSINESS_API_MTLS_REQUIRED");
export const businessApiSkipDatabaseInit = requireEnvBool("MAPLE_BUSINESS_API_SKIP_DB_INIT");
if (businessApiSkipDatabaseInit) {
  throw new Error("MAPLE_BUSINESS_API_SKIP_DB_INIT is not supported.");
}

export const databaseUrl = requireEnv("DATABASE_URL");

export const stripeSecretKey = requireEnv("STRIPE_SECRET_KEY");
export const stripeWebhookSecret = requireEnv("STRIPE_WEBHOOK_SECRET");
export const STRIPE_PLAN_PRICE_IDS = {
  pro: requireEnv("STRIPE_PRICE_PRO"),
  team: requireEnv("STRIPE_PRICE_TEAM"),
  enterprise: requireEnv("STRIPE_PRICE_ENTERPRISE"),
};
export const STRIPE_PRICE_TO_PLAN = {};
for (const [plan, priceId] of Object.entries(STRIPE_PLAN_PRICE_IDS)) {
  if (priceId) {
    STRIPE_PRICE_TO_PLAN[priceId] = plan;
  }
}

export const billingEnabled = Boolean(stripeSecretKey || stripeWebhookSecret);
export const sessionCookieDomain = (process.env.MAPLE_SESSION_COOKIE_DOMAIN ?? "").trim() || "";
export const sessionCookieName = requireEnv("MAPLE_SESSION_COOKIE_NAME");
export const sessionTtlSeconds = requireEnvInt("MAPLE_SESSION_TTL_SECONDS", { min: 60 });
export const allowSelfSignup = requireEnvBool("MAPLE_AUTH_ALLOW_SELF_SIGNUP");
export const googleClientId = requireEnv("GOOGLE_CLIENT_ID");
export const configuredApiKeys = loadApiKeysFromEnv();
export const apiKeyAuthEnabled = configuredApiKeys.length > 0;
const allowNoAuthRequested = requireEnvBool("MAPLE_ALLOW_NO_AUTH");
if (isProductionRuntime && allowNoAuthRequested) {
  throw new Error("MAPLE_ALLOW_NO_AUTH cannot be enabled in production runtime.");
}
export const allowNoAuth = allowNoAuthRequested;
const sessionOwnerScopeRaw = requireEnv("MAPLE_SESSION_OWNER_SCOPE").toLowerCase();
if (sessionOwnerScopeRaw !== "user" && sessionOwnerScopeRaw !== "api_key_primary" && sessionOwnerScopeRaw !== "auto") {
    throw new Error(`Invalid MAPLE_SESSION_OWNER_SCOPE: "${sessionOwnerScopeRaw}" (must be "user", "api_key_primary", or "auto")`);
}
export const sessionOwnerScopeMode = sessionOwnerScopeRaw;
export const primaryConfiguredApiKeyFingerprint =
  configuredApiKeys.length > 0
    ? createHash("sha256").update(configuredApiKeys[0]).digest("hex").slice(0, 12)
    : undefined;
export const auditWriterAddress = requireEnv("AUDIT_WRITER_ADDRESS");

export const recoveryDeliveryRequired = requireEnvBool("MAPLE_RECOVERY_DELIVERY_REQUIRED");
export const recoveryEmailProvider = requireProvider("MAPLE_RECOVERY_EMAIL_PROVIDER", ["none", "sendgrid", "resend"]);
export const recoveryEmailFrom = requireEnv("MAPLE_RECOVERY_EMAIL_FROM");
export const recoveryEmailReplyTo = requireEnv("MAPLE_RECOVERY_EMAIL_REPLY_TO");
export const recoveryEmailSubjectPrefix = requireEnv("MAPLE_RECOVERY_EMAIL_SUBJECT_PREFIX");
export const recoveryResetBaseUrl = requireEnv("MAPLE_RECOVERY_RESET_BASE_URL");
export const recoveryVerifyBaseUrl = requireEnv("MAPLE_RECOVERY_VERIFY_BASE_URL");
export const recoverySendgridApiKey = requireEnv("SENDGRID_API_KEY");
export const recoveryResendApiKey = requireEnv("RESEND_API_KEY");
export const recoverySmsProvider = requireProvider("MAPLE_RECOVERY_SMS_PROVIDER", ["none", "twilio"]);
export const recoverySmsTo = requireEnv("MAPLE_RECOVERY_SMS_TO");
export const recoverySmsFrom = requireEnv("MAPLE_RECOVERY_SMS_FROM");
export const twilioAccountSid = requireEnv("TWILIO_ACCOUNT_SID");
export const twilioAuthToken = requireEnv("TWILIO_AUTH_TOKEN");
