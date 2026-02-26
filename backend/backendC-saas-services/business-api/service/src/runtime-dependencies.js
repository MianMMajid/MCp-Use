import { accessSync, constants } from "node:fs";
import {
  STRIPE_PLAN_PRICE_IDS,
  businessApiTlsCaPath,
  businessApiTlsCertPath,
  businessApiTlsKeyPath,
  databaseUrl,
  googleClientId,
  recoveryDeliveryRequired,
  recoveryEmailFrom,
  recoveryEmailProvider,
  recoveryResendApiKey,
  recoverySendgridApiKey,
  recoverySmsFrom,
  recoverySmsProvider,
  recoverySmsTo,
  stripeSecretKey,
  stripeWebhookSecret,
  twilioAccountSid,
  twilioAuthToken,
} from "./config.js";

const CACHE_TTL_MS = 2_000;
let cachedReport;
let cachedAt = 0;

function parseBooleanEnv(rawValue, fallback) {
  const normalized = String(rawValue ?? "")
    .trim()
    .toLowerCase();
  if (!normalized) {
    return fallback;
  }
  if (
    normalized === "1" ||
    normalized === "true" ||
    normalized === "yes" ||
    normalized === "on"
  ) {
    return true;
  }
  if (
    normalized === "0" ||
    normalized === "false" ||
    normalized === "no" ||
    normalized === "off"
  ) {
    return false;
  }
  return fallback;
}

function isProductionRuntime() {
  return String(process.env.NODE_ENV ?? "").trim().toLowerCase() === "production";
}

function checkReadableFile(pathname) {
  try {
    accessSync(pathname, constants.R_OK);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

function checkStripeConfig() {
  if (!stripeSecretKey || !stripeWebhookSecret) {
    return {
      ok: false,
      reason: "STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET must both be configured.",
    };
  }
  const missingPriceIds = Object.entries(STRIPE_PLAN_PRICE_IDS)
    .filter(([, value]) => !String(value ?? "").trim())
    .map(([plan]) => plan);
  if (missingPriceIds.length > 0) {
    return {
      ok: false,
      reason: `Missing Stripe price IDs for plans: ${missingPriceIds.join(", ")}`,
    };
  }
  return { ok: true };
}

function checkRecoveryDeliveryConfig() {
  const emailEnabled = recoveryEmailProvider !== "none";
  const smsEnabled = recoverySmsProvider !== "none";
  if (!emailEnabled && !smsEnabled) {
    return {
      ok: false,
      reason: "No recovery delivery provider configured.",
    };
  }
  if (emailEnabled && !recoveryEmailFrom) {
    return {
      ok: false,
      reason: "MAPLE_RECOVERY_EMAIL_FROM is missing.",
    };
  }
  if (recoveryEmailProvider === "sendgrid" && !recoverySendgridApiKey) {
    return {
      ok: false,
      reason: "SENDGRID_API_KEY (or MAPLE_RECOVERY_SENDGRID_API_KEY) is missing.",
    };
  }
  if (recoveryEmailProvider === "resend" && !recoveryResendApiKey) {
    return {
      ok: false,
      reason: "RESEND_API_KEY (or MAPLE_RECOVERY_RESEND_API_KEY) is missing.",
    };
  }
  if (smsEnabled && recoverySmsProvider === "twilio") {
    if (!twilioAccountSid) {
      return {
        ok: false,
        reason: "TWILIO_ACCOUNT_SID is missing.",
      };
    }
    if (!twilioAuthToken) {
      return {
        ok: false,
        reason: "TWILIO_AUTH_TOKEN is missing.",
      };
    }
    if (!recoverySmsFrom) {
      return {
        ok: false,
        reason: "MAPLE_RECOVERY_SMS_FROM is missing.",
      };
    }
    if (!recoverySmsTo) {
      return {
        ok: false,
        reason: "MAPLE_RECOVERY_SMS_TO is missing.",
      };
    }
  }
  return { ok: true };
}

function buildCheckRecord(id, label, required, result) {
  return {
    id,
    label,
    required,
    ok: Boolean(result?.ok),
    reason: result?.ok ? "ok" : String(result?.reason ?? "unknown"),
  };
}

export async function evaluateBusinessRuntimeDependencies(options = {}) {
  const force = options.force === true;
  const now = Date.now();
  if (!force && cachedReport && now - cachedAt < CACHE_TTL_MS) {
    return cachedReport;
  }

  const strict = parseBooleanEnv(
    process.env.MAPLE_RUNTIME_STRICT_DEPENDENCIES,
    isProductionRuntime()
  );
  const requireDatabase = parseBooleanEnv(process.env.MAPLE_DEP_REQUIRE_DATABASE, strict);
  const checks = [];

  checks.push(
    buildCheckRecord(
      "tls.business_cert",
      "Business API TLS certificate",
      strict,
      checkReadableFile(businessApiTlsCertPath)
    )
  );
  checks.push(
    buildCheckRecord(
      "tls.business_key",
      "Business API TLS private key",
      strict,
      checkReadableFile(businessApiTlsKeyPath)
    )
  );
  checks.push(
    buildCheckRecord(
      "tls.business_ca",
      "Business API TLS CA",
      strict,
      checkReadableFile(businessApiTlsCaPath)
    )
  );

  checks.push(
    buildCheckRecord(
      "config.database_url",
      "Database URL configured",
      requireDatabase,
      databaseUrl
        ? { ok: true }
        : {
            ok: false,
            reason: "DATABASE_URL (or MAPLE_DATABASE_URL) is missing.",
          }
    )
  );

  const requireGoogle = parseBooleanEnv(
    process.env.MAPLE_DEP_REQUIRE_GOOGLE_AUTH,
    strict
  );
  checks.push(
    buildCheckRecord(
      "config.google_client_id",
      "Google client id configured",
      requireGoogle,
      googleClientId
        ? { ok: true }
        : {
            ok: false,
            reason: "GOOGLE_CLIENT_ID is missing.",
          }
    )
  );

  const requireStripe = parseBooleanEnv(process.env.MAPLE_DEP_REQUIRE_STRIPE, strict);
  checks.push(
    buildCheckRecord(
      "config.stripe",
      "Stripe credentials configured",
      requireStripe,
      checkStripeConfig()
    )
  );

  const requireRecoveryDelivery = parseBooleanEnv(
    process.env.MAPLE_DEP_REQUIRE_RECOVERY_DELIVERY,
    strict || recoveryDeliveryRequired
  );
  checks.push(
    buildCheckRecord(
      "config.recovery_delivery",
      "Recovery email/SMS delivery configuration",
      requireRecoveryDelivery,
      checkRecoveryDeliveryConfig()
    )
  );

  const requiredFailures = checks.filter((check) => check.required && !check.ok);
  const report = {
    generatedAt: new Date().toISOString(),
    strict,
    ready: requiredFailures.length === 0,
    requiredFailures,
    checks,
  };
  cachedReport = report;
  cachedAt = Date.now();
  return report;
}

export async function enforceBusinessStartupDependencies() {
  const strict = parseBooleanEnv(
    process.env.MAPLE_RUNTIME_STRICT_DEPENDENCIES,
    isProductionRuntime()
  );
  const enforce = parseBooleanEnv(process.env.MAPLE_ENFORCE_STARTUP_DEPENDENCIES, strict);
  if (!enforce) {
    return {
      enforced: false,
      report: await evaluateBusinessRuntimeDependencies({ force: true }),
    };
  }
  const report = await evaluateBusinessRuntimeDependencies({ force: true });
  if (!report.ready) {
    const summary = report.requiredFailures
      .map((check) => `${check.id}: ${check.reason}`)
      .join("; ");
    throw new Error(
      `Business API startup blocked by missing required runtime dependencies. ${summary}`
    );
  }
  return { enforced: true, report };
}
