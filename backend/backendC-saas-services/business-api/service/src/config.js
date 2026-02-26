import { createHash } from "node:crypto";
import { asString, getEnvOrDefault, getEnvPort } from "@maple/common";
import { loadApiKeysFromEnv } from "@maple/security";
const isProductionRuntime = String(process.env.NODE_ENV ?? "").trim().toLowerCase() === "production";

export const serviceName = "business-api";
export const businessApiHost = getEnvOrDefault("BUSINESS_API_HOST", "0.0.0.0");
export const businessApiPort = getEnvPort("BUSINESS_API_PORT", 9550);

export const businessApiTlsCertPath = getEnvOrDefault(
  "MAPLE_BUSINESS_API_TLS_CERT",
  "/etc/maple/tls/tls.crt"
);
export const businessApiTlsKeyPath = getEnvOrDefault(
  "MAPLE_BUSINESS_API_TLS_KEY",
  "/etc/maple/tls/tls.key"
);
export const businessApiTlsCaPath = getEnvOrDefault(
  "MAPLE_BUSINESS_API_TLS_CA",
  "/etc/maple/tls/ca.crt"
);
const businessApiMtlsRequiredRaw = String(
  process.env.MAPLE_BUSINESS_API_MTLS_REQUIRED ?? "1"
)
  .trim()
  .toLowerCase();
export const businessApiMtlsRequired =
  businessApiMtlsRequiredRaw !== "0" && businessApiMtlsRequiredRaw !== "false";
const businessApiSkipDatabaseInitRaw = String(
  process.env.MAPLE_BUSINESS_API_SKIP_DB_INIT ?? "0"
)
  .trim()
  .toLowerCase();
export const businessApiSkipDatabaseInit =
  businessApiSkipDatabaseInitRaw === "1" ||
  businessApiSkipDatabaseInitRaw === "true" ||
  businessApiSkipDatabaseInitRaw === "yes";
if (businessApiSkipDatabaseInit) {
  throw new Error("MAPLE_BUSINESS_API_SKIP_DB_INIT is not supported.");
}

export const databaseUrl = asString(process.env.DATABASE_URL ?? process.env.MAPLE_DATABASE_URL);
if (!databaseUrl) {
  throw new Error("DATABASE_URL (or MAPLE_DATABASE_URL) is required for business-api runtime.");
}

export const stripeSecretKey = asString(process.env.STRIPE_SECRET_KEY);
export const stripeWebhookSecret = asString(process.env.STRIPE_WEBHOOK_SECRET);
export const STRIPE_PLAN_PRICE_IDS = {
  pro: asString(process.env.STRIPE_PRICE_PRO) ?? "",
  team: asString(process.env.STRIPE_PRICE_TEAM) ?? "",
  enterprise: asString(process.env.STRIPE_PRICE_ENTERPRISE) ?? "",
};
export const STRIPE_PRICE_TO_PLAN = {};
for (const [plan, priceId] of Object.entries(STRIPE_PLAN_PRICE_IDS)) {
  if (priceId) {
    STRIPE_PRICE_TO_PLAN[priceId] = plan;
  }
}

export const billingEnabled = Boolean(stripeSecretKey || stripeWebhookSecret);
export const sessionCookieName = getEnvOrDefault(
  "MAPLE_SESSION_COOKIE_NAME",
  "maple_session"
);
export const sessionTtlSeconds = Math.max(
  60,
  Number.parseInt(String(process.env.MAPLE_SESSION_TTL_SECONDS ?? "604800"), 10) ||
    604800
);
export const allowSelfSignup =
  String(process.env.MAPLE_AUTH_ALLOW_SELF_SIGNUP ?? "0").trim().toLowerCase() ===
    "true" ||
  String(process.env.MAPLE_AUTH_ALLOW_SELF_SIGNUP ?? "0").trim().toLowerCase() ===
    "1";
export const googleClientId = asString(process.env.GOOGLE_CLIENT_ID) ?? null;
export const configuredApiKeys = loadApiKeysFromEnv();
export const apiKeyAuthEnabled = configuredApiKeys.length > 0;
const allowNoAuthRaw = String(process.env.MAPLE_ALLOW_NO_AUTH ?? "0")
  .trim()
  .toLowerCase();
const allowNoAuthRequested = allowNoAuthRaw === "true" || allowNoAuthRaw === "1";
if (isProductionRuntime && allowNoAuthRequested) {
  throw new Error("MAPLE_ALLOW_NO_AUTH cannot be enabled in production runtime.");
}
export const allowNoAuth = allowNoAuthRequested;
export const sessionOwnerScopeMode = (() => {
  const raw = String(process.env.MAPLE_SESSION_OWNER_SCOPE ?? "auto")
    .trim()
    .toLowerCase();
  if (raw === "user" || raw === "api_key_primary" || raw === "auto") {
    return raw;
  }
  return "auto";
})();
export const primaryConfiguredApiKeyFingerprint =
  configuredApiKeys.length > 0
    ? createHash("sha256").update(configuredApiKeys[0]).digest("hex").slice(0, 12)
    : undefined;
export const auditWriterAddress = getEnvOrDefault(
  "AUDIT_WRITER_ADDRESS",
  "audit-writer.maple.svc.cluster.local:9400"
);

function normalizeProvider(rawValue, fallback, allowedValues) {
  const normalized = String(rawValue ?? "")
    .trim()
    .toLowerCase();
  if (!normalized) {
    return fallback;
  }
  if (allowedValues.includes(normalized)) {
    return normalized;
  }
  return fallback;
}

export const recoveryDeliveryRequired =
  String(process.env.MAPLE_RECOVERY_DELIVERY_REQUIRED ?? "0")
    .trim()
    .toLowerCase() === "1" ||
  String(process.env.MAPLE_RECOVERY_DELIVERY_REQUIRED ?? "0")
    .trim()
    .toLowerCase() === "true";

export const recoveryEmailProvider = normalizeProvider(
  process.env.MAPLE_RECOVERY_EMAIL_PROVIDER,
  "none",
  ["none", "sendgrid", "resend"]
);
export const recoveryEmailFrom =
  asString(process.env.MAPLE_RECOVERY_EMAIL_FROM) ?? null;
export const recoveryEmailReplyTo =
  asString(process.env.MAPLE_RECOVERY_EMAIL_REPLY_TO) ?? null;
export const recoveryEmailSubjectPrefix =
  asString(process.env.MAPLE_RECOVERY_EMAIL_SUBJECT_PREFIX) ?? "[Maple]";
export const recoveryResetBaseUrl =
  asString(process.env.MAPLE_RECOVERY_RESET_BASE_URL) ?? null;
export const recoveryVerifyBaseUrl =
  asString(process.env.MAPLE_RECOVERY_VERIFY_BASE_URL) ?? null;
export const recoverySendgridApiKey =
  asString(process.env.SENDGRID_API_KEY) ??
  asString(process.env.MAPLE_RECOVERY_SENDGRID_API_KEY) ??
  null;
export const recoveryResendApiKey =
  asString(process.env.RESEND_API_KEY) ??
  asString(process.env.MAPLE_RECOVERY_RESEND_API_KEY) ??
  null;

export const recoverySmsProvider = normalizeProvider(
  process.env.MAPLE_RECOVERY_SMS_PROVIDER,
  "none",
  ["none", "twilio"]
);
export const recoverySmsTo = asString(process.env.MAPLE_RECOVERY_SMS_TO) ?? null;
export const recoverySmsFrom =
  asString(process.env.MAPLE_RECOVERY_SMS_FROM) ?? null;
export const twilioAccountSid =
  asString(process.env.TWILIO_ACCOUNT_SID) ??
  asString(process.env.MAPLE_RECOVERY_TWILIO_ACCOUNT_SID) ??
  null;
export const twilioAuthToken =
  asString(process.env.TWILIO_AUTH_TOKEN) ??
  asString(process.env.MAPLE_RECOVERY_TWILIO_AUTH_TOKEN) ??
  null;
