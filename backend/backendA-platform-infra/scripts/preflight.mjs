#!/usr/bin/env node

import { accessSync, constants } from "node:fs";
import { spawnSync } from "node:child_process";
import net from "node:net";
import { resolve } from "node:path";

function parseBoolean(rawValue, fallback = false) {
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

function parseArgs(argv) {
  const flags = new Set(argv.slice(2));
  const modeArg = [...flags].find((item) => item.startsWith("--mode="));
  const mode = modeArg ? modeArg.slice("--mode=".length) : "run";
  const strict = flags.has("--strict");
  const json = flags.has("--json");
  return { mode, strict, json };
}

function isProductionRuntime() {
  return String(process.env.NODE_ENV ?? "").trim().toLowerCase() === "production";
}

function safeAddress(rawAddress) {
  const normalized = String(rawAddress ?? "").trim();
  if (!normalized) {
    return "";
  }
  if (normalized.includes("://")) {
    try {
      const parsed = new URL(normalized);
      if (!parsed.hostname || !parsed.port) {
        return "";
      }
      return `${parsed.hostname}:${parsed.port}`;
    } catch {
      return "";
    }
  }
  return normalized;
}

function checkReadableFile(pathname) {
  if (!pathname) {
    return { ok: false, reason: "path_missing" };
  }
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

function checkTcpReachability(address) {
  return new Promise((resolve) => {
    const normalized = safeAddress(address);
    if (!normalized) {
      resolve({ ok: false, reason: "address_missing" });
      return;
    }
    const [host, portRaw] = normalized.split(":");
    const port = Number.parseInt(portRaw, 10);
    if (!host || !Number.isFinite(port) || port <= 0) {
      resolve({ ok: false, reason: `invalid_address:${normalized}` });
      return;
    }
    const socket = net.createConnection({ host, port });
    const done = (result) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(1_500);
    socket.on("connect", () => done({ ok: true }));
    socket.on("timeout", () => done({ ok: false, reason: `timeout:${normalized}` }));
    socket.on("error", (error) =>
      done({
        ok: false,
        reason: error instanceof Error ? error.message : String(error),
      })
    );
  });
}

function createCheck({ id, label, required, result, expected }) {
  return {
    id,
    label,
    required,
    ok: Boolean(result?.ok),
    reason: result?.ok ? "ok" : String(result?.reason ?? "unknown"),
    expected: expected ?? "",
  };
}

function runNodeScript(scriptPath, args = []) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status === 0) {
    return { ok: true };
  }
  const detail = String(result.stderr || result.stdout || "").trim();
  const firstLine = detail.split(/\r?\n/).find((line) => line.trim().length > 0) || "script_failed";
  return { ok: false, reason: firstLine };
}

async function run() {
  const args = parseArgs(process.argv);
  const strict = args.strict || isProductionRuntime() || args.mode === "deploy";
  const checkReachability =
    parseBoolean(process.env.MAPLE_PREFLIGHT_CHECK_REACHABILITY, strict && args.mode === "deploy");
  const requireGoogle = parseBoolean(process.env.MAPLE_DEP_REQUIRE_GOOGLE_AUTH, strict);
  const requireStripe = parseBoolean(process.env.MAPLE_DEP_REQUIRE_STRIPE, strict);
  const requireRecoveryDelivery = parseBoolean(
    process.env.MAPLE_DEP_REQUIRE_RECOVERY_DELIVERY,
    strict
  );
  const requireOpenclaw = parseBoolean(process.env.MAPLE_DEP_REQUIRE_OPENCLAW, strict);
  const requireDatabase = parseBoolean(process.env.MAPLE_DEP_REQUIRE_DATABASE, strict);
  const checkContractSync = parseBoolean(process.env.MAPLE_PREFLIGHT_CHECK_CONTRACT_SYNC, true);
  const checkServiceSourceSync = parseBoolean(
    process.env.MAPLE_PREFLIGHT_CHECK_SOURCE_SYNC,
    strict || args.mode === "deploy"
  );

  const checks = [];
  const localCertDir = resolve(process.cwd(), "backend/backendA-platform-infra/certs");
  const localTlsCertPath = resolve(localCertDir, "tls.crt");
  const localTlsKeyPath = resolve(localCertDir, "tls.key");
  const localTlsCaPath = resolve(localCertDir, "ca.crt");

  const grpcCertPath = process.env.MAPLE_GRPC_TLS_CERT || localTlsCertPath;
  const grpcKeyPath = process.env.MAPLE_GRPC_TLS_KEY || localTlsKeyPath;
  const grpcCaPath = process.env.MAPLE_GRPC_TLS_CA || localTlsCaPath;
  checks.push(
    createCheck({
      id: "tls.grpc.cert",
      label: "gRPC TLS cert",
      required: strict,
      expected: "MAPLE_GRPC_TLS_CERT readable file",
      result: checkReadableFile(grpcCertPath),
    })
  );
  checks.push(
    createCheck({
      id: "tls.grpc.key",
      label: "gRPC TLS key",
      required: strict,
      expected: "MAPLE_GRPC_TLS_KEY readable file",
      result: checkReadableFile(grpcKeyPath),
    })
  );
  checks.push(
    createCheck({
      id: "tls.grpc.ca",
      label: "gRPC TLS CA",
      required: strict,
      expected: "MAPLE_GRPC_TLS_CA readable file",
      result: checkReadableFile(grpcCaPath),
    })
  );

  checks.push(
    createCheck({
      id: "tls.gateway.cert",
      label: "Gateway TLS cert",
      required: strict,
      expected: "MAPLE_GATEWAY_TLS_CERT readable file",
      result: checkReadableFile(process.env.MAPLE_GATEWAY_TLS_CERT || localTlsCertPath),
    })
  );
  checks.push(
    createCheck({
      id: "tls.gateway.key",
      label: "Gateway TLS key",
      required: strict,
      expected: "MAPLE_GATEWAY_TLS_KEY readable file",
      result: checkReadableFile(process.env.MAPLE_GATEWAY_TLS_KEY || localTlsKeyPath),
    })
  );
  checks.push(
    createCheck({
      id: "tls.gateway.ca",
      label: "Gateway TLS CA",
      required: strict,
      expected: "MAPLE_GATEWAY_TLS_CA readable file",
      result: checkReadableFile(process.env.MAPLE_GATEWAY_TLS_CA || localTlsCaPath),
    })
  );

  checks.push(
    createCheck({
      id: "auth.google.client_id",
      label: "Google client id",
      required: requireGoogle,
      expected: "GOOGLE_CLIENT_ID must be set",
      result: process.env.GOOGLE_CLIENT_ID
        ? { ok: true }
        : { ok: false, reason: "GOOGLE_CLIENT_ID missing" },
    })
  );
  checks.push(
    createCheck({
      id: "billing.stripe.secret",
      label: "Stripe secret key",
      required: requireStripe,
      expected: "STRIPE_SECRET_KEY must be set",
      result: process.env.STRIPE_SECRET_KEY
        ? { ok: true }
        : { ok: false, reason: "STRIPE_SECRET_KEY missing" },
    })
  );
  checks.push(
    createCheck({
      id: "billing.stripe.webhook",
      label: "Stripe webhook secret",
      required: requireStripe,
      expected: "STRIPE_WEBHOOK_SECRET must be set",
      result: process.env.STRIPE_WEBHOOK_SECRET
        ? { ok: true }
        : { ok: false, reason: "STRIPE_WEBHOOK_SECRET missing" },
    })
  );
  const recoveryEmailProvider = String(process.env.MAPLE_RECOVERY_EMAIL_PROVIDER || "none")
    .trim()
    .toLowerCase();
  const recoverySmsProvider = String(process.env.MAPLE_RECOVERY_SMS_PROVIDER || "none")
    .trim()
    .toLowerCase();
  checks.push(
    createCheck({
      id: "auth.recovery.provider",
      label: "Recovery delivery provider",
      required: requireRecoveryDelivery,
      expected: "MAPLE_RECOVERY_EMAIL_PROVIDER or MAPLE_RECOVERY_SMS_PROVIDER configured",
      result:
        recoveryEmailProvider !== "none" || recoverySmsProvider !== "none"
          ? { ok: true }
          : { ok: false, reason: "No recovery delivery provider configured" },
    })
  );
  checks.push(
    createCheck({
      id: "auth.recovery.email_from",
      label: "Recovery email from",
      required: requireRecoveryDelivery && recoveryEmailProvider !== "none",
      expected: "MAPLE_RECOVERY_EMAIL_FROM must be set",
      result: process.env.MAPLE_RECOVERY_EMAIL_FROM
        ? { ok: true }
        : { ok: false, reason: "MAPLE_RECOVERY_EMAIL_FROM missing" },
    })
  );
  checks.push(
    createCheck({
      id: "auth.recovery.sendgrid_key",
      label: "Recovery SendGrid key",
      required: requireRecoveryDelivery && recoveryEmailProvider === "sendgrid",
      expected: "SENDGRID_API_KEY or MAPLE_RECOVERY_SENDGRID_API_KEY must be set",
      result: process.env.SENDGRID_API_KEY || process.env.MAPLE_RECOVERY_SENDGRID_API_KEY
        ? { ok: true }
        : { ok: false, reason: "SENDGRID_API_KEY missing" },
    })
  );
  checks.push(
    createCheck({
      id: "auth.recovery.resend_key",
      label: "Recovery Resend key",
      required: requireRecoveryDelivery && recoveryEmailProvider === "resend",
      expected: "RESEND_API_KEY or MAPLE_RECOVERY_RESEND_API_KEY must be set",
      result: process.env.RESEND_API_KEY || process.env.MAPLE_RECOVERY_RESEND_API_KEY
        ? { ok: true }
        : { ok: false, reason: "RESEND_API_KEY missing" },
    })
  );
  checks.push(
    createCheck({
      id: "auth.recovery.sms_from",
      label: "Recovery SMS sender",
      required: requireRecoveryDelivery && recoverySmsProvider === "twilio",
      expected: "MAPLE_RECOVERY_SMS_FROM must be set",
      result: process.env.MAPLE_RECOVERY_SMS_FROM
        ? { ok: true }
        : { ok: false, reason: "MAPLE_RECOVERY_SMS_FROM missing" },
    })
  );
  checks.push(
    createCheck({
      id: "auth.recovery.sms_to",
      label: "Recovery SMS target",
      required: requireRecoveryDelivery && recoverySmsProvider === "twilio",
      expected: "MAPLE_RECOVERY_SMS_TO must be set",
      result: process.env.MAPLE_RECOVERY_SMS_TO
        ? { ok: true }
        : { ok: false, reason: "MAPLE_RECOVERY_SMS_TO missing" },
    })
  );
  checks.push(
    createCheck({
      id: "auth.recovery.twilio_sid",
      label: "Recovery Twilio SID",
      required: requireRecoveryDelivery && recoverySmsProvider === "twilio",
      expected: "TWILIO_ACCOUNT_SID or MAPLE_RECOVERY_TWILIO_ACCOUNT_SID must be set",
      result:
        process.env.TWILIO_ACCOUNT_SID || process.env.MAPLE_RECOVERY_TWILIO_ACCOUNT_SID
          ? { ok: true }
          : { ok: false, reason: "TWILIO_ACCOUNT_SID missing" },
    })
  );
  checks.push(
    createCheck({
      id: "auth.recovery.twilio_token",
      label: "Recovery Twilio token",
      required: requireRecoveryDelivery && recoverySmsProvider === "twilio",
      expected: "TWILIO_AUTH_TOKEN or MAPLE_RECOVERY_TWILIO_AUTH_TOKEN must be set",
      result:
        process.env.TWILIO_AUTH_TOKEN || process.env.MAPLE_RECOVERY_TWILIO_AUTH_TOKEN
          ? { ok: true }
          : { ok: false, reason: "TWILIO_AUTH_TOKEN missing" },
    })
  );

  const databaseUrl = String(process.env.DATABASE_URL ?? process.env.MAPLE_DATABASE_URL ?? "").trim();
  checks.push(
    createCheck({
      id: "db.database_url",
      label: "Database URL",
      required: requireDatabase,
      expected: "DATABASE_URL or MAPLE_DATABASE_URL must be set",
      result: databaseUrl ? { ok: true } : { ok: false, reason: "DATABASE_URL missing" },
    })
  );

  if (checkReachability) {
    const contextWallAddress =
      process.env.CONTEXT_WALL_ADDRESS || "context-wall.maple.svc.cluster.local:9000";
    const modelRouterAddress =
      process.env.MODEL_ROUTER_ADDRESS || "model-router.maple.svc.cluster.local:9100";
    const mcpProxyAddress =
      process.env.MCP_PROXY_ADDRESS || "mcp-proxy.maple.svc.cluster.local:9200";

    checks.push(
      createCheck({
        id: "reach.context_wall",
        label: "Context-wall reachability",
        required: strict,
        expected: contextWallAddress,
        result: await checkTcpReachability(contextWallAddress),
      })
    );
    checks.push(
      createCheck({
        id: "reach.model_router",
        label: "Model-router reachability",
        required: strict,
        expected: modelRouterAddress,
        result: await checkTcpReachability(modelRouterAddress),
      })
    );
    checks.push(
      createCheck({
        id: "reach.mcp_proxy",
        label: "MCP-proxy reachability",
        required: strict,
        expected: mcpProxyAddress,
        result: await checkTcpReachability(mcpProxyAddress),
      })
    );

    if (requireOpenclaw) {
      const openclawBridge = process.env.OPENCLAW_BRIDGE_URL;
      checks.push(
        createCheck({
          id: "reach.openclaw_bridge",
          label: "OpenClaw bridge reachability",
          required: true,
          expected: openclawBridge || "OPENCLAW_BRIDGE_URL host:port",
          result: await checkTcpReachability(openclawBridge),
        })
      );
    }

    if (requireDatabase && databaseUrl) {
      checks.push(
        createCheck({
          id: "reach.database",
          label: "Database reachability",
          required: strict,
          expected: databaseUrl,
          result: await checkTcpReachability(databaseUrl),
        })
      );
    }
  }

  if (checkContractSync) {
    checks.push(
      createCheck({
        id: "contracts.proto_sync",
        label: "Proto mirror sync",
        required: strict || args.mode === "deploy",
        expected: "Generated proto mirrors must match canonical backend/proto",
        result: runNodeScript(
          resolve(process.cwd(), "backend/backendA-platform-infra/scripts/check-proto-sync.mjs")
        ),
      })
    );
  }

  if (checkServiceSourceSync) {
    checks.push(
      createCheck({
        id: "services.source_sync",
        label: "Service source/dist sync",
        required: strict || args.mode === "deploy",
        expected: "service/src must be canonical for tracked service/dist outputs",
        result: runNodeScript(
          resolve(process.cwd(), "backend/backendA-platform-infra/scripts/check-service-sources.mjs")
        ),
      })
    );
  }

  const failures = checks.filter((check) => check.required && !check.ok);
  const result = {
    ok: failures.length === 0,
    strict,
    mode: args.mode,
    checkReachability,
    checks,
    failures,
  };

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(
      `[preflight] mode=${result.mode} strict=${result.strict} reachability=${result.checkReachability}`
    );
    for (const check of checks) {
      const icon = check.ok ? "PASS" : check.required ? "FAIL" : "WARN";
      const suffix = check.ok ? "" : ` :: ${check.reason}`;
      console.log(`[preflight] ${icon} ${check.id} - ${check.label}${suffix}`);
    }
  }

  if (!result.ok) {
    console.error(
      `[preflight] blocking failures: ${failures.length}. Fix required env/certs/dependencies before run/deploy.`
    );
    process.exit(1);
  }
}

run().catch((error) => {
  console.error(
    `[preflight] fatal error: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
});
