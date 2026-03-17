import { access, constants } from "node:fs/promises";
import net from "node:net";
import { loadGrpcTlsConfig } from "@maple/common";
import { grpcUnary } from "../grpc-clients.js";
import {
  cyberQuarantineStorageDir,
  cyberQuarantineEnabled,
  cyberProxyAddress,
  downloadScanProvider,
  downloadScanVirusTotalApiKey,
  gatewayTlsCaPath,
  gatewayTlsCertPath,
  gatewayTlsKeyPath,
  googleClientId,
  mcpProxyAddress,
  openclawAgentRequired,
  stripeSecretKey,
} from "../config.js";
import { getGrpcClients } from "../state.js";
import { getOpenClawRuntimeStatus } from "./openclaw-agent-runtime.js";

const CACHE_TTL_MS = 2_000;
let cachedReport;
let cachedAt = 0;
let inflightReportPromise;

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

function resolveStrictMode() {
  const production = isProductionRuntime();
  return parseBooleanEnv(process.env.MAPLE_RUNTIME_STRICT_DEPENDENCIES, production);
}

function resolveFeatureRequired(rawEnvName, defaultValue) {
  return parseBooleanEnv(process.env[rawEnvName], defaultValue);
}

async function checkReadableFile(pathname) {
  try {
    await access(pathname, constants.R_OK);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

function withTimeout(promise, timeoutMs, timeoutReason) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(timeoutReason));
      }, timeoutMs);
    }),
  ]);
}

async function checkGrpcCall(client, method, request) {
  if (!client) {
    return {
      ok: false,
      reason: "gRPC client not initialized.",
    };
  }
  try {
    await withTimeout(
      grpcUnary(client, method, request),
      1_500,
      `Timed out calling gRPC method ${method}.`
    );
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}


function checkTcpAddress(address) {
  return new Promise((resolve) => {
    const normalized = String(address ?? "").trim();
    if (!normalized) {
      resolve({
        ok: false,
        reason: "Address is not configured.",
      });
      return;
    }
    const [host, portRaw] = normalized.split(":");
    const port = Number.parseInt(portRaw, 10);
    if (!host || !Number.isFinite(port) || port <= 0) {
      resolve({
        ok: false,
        reason: `Invalid address format: ${normalized}`,
      });
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
    socket.on("timeout", () =>
      done({
        ok: false,
        reason: `TCP check timed out for ${normalized}.`,
      })
    );
    socket.on("error", (error) =>
      done({
        ok: false,
        reason: error instanceof Error ? error.message : String(error),
      })
    );
  });
}

function buildCheckRecord(id, label, required, result, requiredDeps = []) {
  return {
    id,
    label,
    required,
    ok: Boolean(result?.ok),
    reason: result?.ok ? "ok" : String(result?.reason ?? "unknown"),
    requiredDeps,
  };
}

function capabilityFromDependencies(name, requiredDeps, checkMap) {
  const failed = requiredDeps.find((dep) => checkMap.get(dep)?.ok !== true);
  if (!failed) {
    return {
      enabled: true,
      reason: "ok",
      requiredDeps,
    };
  }
  return {
    enabled: false,
    reason: checkMap.get(failed)?.reason ?? `${failed} unavailable`,
    requiredDeps,
  };
}

function resolveGoogleAuthCapability(checkMap) {
  const googleConfigured = checkMap.get("config.google_client_id")?.ok === true;
  return {
    enabled: googleConfigured,
    reason: googleConfigured
      ? "ok"
      : "Google auth unavailable: configure GOOGLE_CLIENT_ID.",
    requiredDeps: ["config.google_client_id"],
  };
}

export function buildFeatureCapabilitiesFromDependencyReport(report) {
  const checkMap = new Map(report.checks.map((check) => [check.id, check]));
  const features = {
    openclawAgent: capabilityFromDependencies(
      "openclawAgent",
      ["openclaw.runtime"],
      checkMap
    ),
    chatOrchestration: capabilityFromDependencies(
      "chatOrchestration",
      ["grpc.context_wall"],
      checkMap
    ),
    contextFirewall: capabilityFromDependencies(
      "contextFirewall",
      ["grpc.context_wall"],
      checkMap
    ),
    cyberFirewall: capabilityFromDependencies(
      "cyberFirewall",
      ["grpc.cyber_proxy"],
      checkMap
    ),
    hitlApprovals: capabilityFromDependencies(
      "hitlApprovals",
      ["grpc.context_wall"],
      checkMap
    ),
    toolsDispatch: capabilityFromDependencies(
      "toolsDispatch",
      [
        "grpc.context_wall",
        "grpc.mcp_proxy",
        "grpc.cyber_proxy",
      ],
      checkMap
    ),
    tracesAndLogs: {
      enabled: true,
      reason: "ok",
      requiredDeps: [],
    },
    authSession: {
      enabled: true,
      reason: "ok",
      requiredDeps: [],
    },
    billing: {
      enabled: true,
      reason: "ok",
      requiredDeps: [],
    },
    orgRbac: {
      enabled: true,
      reason: "ok",
      requiredDeps: [],
    },
    integrations: {
      enabled: true,
      reason: "ok",
      requiredDeps: [],
    },
    downloadScanning: {
      enabled: true,
      reason: downloadScanProvider === "virustotal" && !downloadScanVirusTotalApiKey
        ? "VirusTotal enrichment unavailable: MAPLE_VIRUSTOTAL_API_KEY is not configured."
        : "ok",
      requiredDeps: [],
    },
    scanEnrichment: {
      enabled: downloadScanProvider !== "virustotal" || Boolean(downloadScanVirusTotalApiKey),
      reason: downloadScanProvider !== "virustotal" || Boolean(downloadScanVirusTotalApiKey)
        ? "ok"
        : "VirusTotal enrichment unavailable: MAPLE_VIRUSTOTAL_API_KEY is not configured.",
      requiredDeps: [],
    },
    googleAuth: resolveGoogleAuthCapability(checkMap),
  };
  return {
    generatedAt: report.generatedAt,
    strict: report.strict,
    ready: report.ready,
    features,
    firewall: {
      contextWallReachable: checkMap.get("grpc.context_wall")?.ok === true,
      mcpProxyReachable: checkMap.get("grpc.mcp_proxy")?.ok === true,
      cyberProxyReachable: checkMap.get("grpc.cyber_proxy")?.ok === true,
      scanProvider: downloadScanProvider,
      quarantineEnabled: cyberQuarantineEnabled,
      degradedStates: {
        contextPolicyUnavailable: checkMap.get("grpc.context_wall")?.ok !== true,
        cyberScanUnavailable: checkMap.get("grpc.cyber_proxy")?.ok !== true,
        virustotalUnavailable: downloadScanProvider === "virustotal" && !downloadScanVirusTotalApiKey,
        evidenceStoreUnavailable: checkMap.get("db.postgres")?.ok !== true,
        quarantineStoreUnavailable: checkMap.get("storage.cyber_quarantine")?.ok !== true,
      },
    },
    dependencies: report.checks.map((check) => ({
      id: check.id,
      label: check.label,
      required: check.required,
      ok: check.ok,
      reason: check.reason,
    })),
  };
}

async function evaluateGatewayRuntimeDependenciesUncached() {
  const strict = resolveStrictMode();
  const checks = [];

  const grpcClients = getGrpcClients();
  const grpcTlsConfig = loadGrpcTlsConfig();
  const openclawStatus = getOpenClawRuntimeStatus();

  const requireOpenclaw = resolveFeatureRequired(
    "MAPLE_DEP_REQUIRE_OPENCLAW",
    strict || openclawAgentRequired
  );
  const requireContextWall = resolveFeatureRequired(
    "MAPLE_DEP_REQUIRE_CONTEXT_WALL",
    strict
  );
  const requireMcpProxy = resolveFeatureRequired("MAPLE_DEP_REQUIRE_MCP_PROXY", strict);
  const requireCyberProxy = resolveFeatureRequired("MAPLE_DEP_REQUIRE_CYBER_PROXY", strict);
  const requireStripe = resolveFeatureRequired("MAPLE_DEP_REQUIRE_STRIPE", strict);
  const requireGoogle = resolveFeatureRequired("MAPLE_DEP_REQUIRE_GOOGLE_AUTH", strict);

  checks.push(
    buildCheckRecord(
      "tls.gateway_cert",
      "Gateway TLS certificate",
      strict,
      await checkReadableFile(gatewayTlsCertPath)
    )
  );
  checks.push(
    buildCheckRecord(
      "tls.gateway_key",
      "Gateway TLS private key",
      strict,
      await checkReadableFile(gatewayTlsKeyPath)
    )
  );
  checks.push(
    buildCheckRecord(
      "tls.gateway_ca",
      "Gateway TLS CA",
      strict,
      await checkReadableFile(gatewayTlsCaPath)
    )
  );
  checks.push(
    buildCheckRecord(
      "tls.grpc_material",
      "gRPC TLS material",
      strict,
      grpcTlsConfig
        ? {
            ok:
              (await checkReadableFile(grpcTlsConfig.certPath)).ok &&
              (await checkReadableFile(grpcTlsConfig.keyPath)).ok &&
              (await checkReadableFile(grpcTlsConfig.caPath)).ok,
            reason: "ok",
          }
        : {
            ok: false,
            reason:
              "MAPLE_GRPC_TLS_CERT/MAPLE_GRPC_TLS_KEY/MAPLE_GRPC_TLS_CA are not configured.",
          }
    )
  );

  checks.push(
    buildCheckRecord(
      "openclaw.runtime",
      "OpenClaw runtime ready",
      requireOpenclaw,
      openclawStatus.ready
        ? { ok: true }
        : {
            ok: false,
            reason:
              openclawStatus.lastError ||
              "OpenClaw runtime is not ready. Check bridge/token/runtime process.",
          }
    )
  );

  checks.push(
    buildCheckRecord(
      "grpc.context_wall",
      "Context-wall gRPC reachability",
      requireContextWall,
      await checkGrpcCall(grpcClients?.contextWall, "listPolicyRules", {})
    )
  );
  checks.push(
    buildCheckRecord(
      "grpc.mcp_proxy",
      "MCP-proxy TCP reachability",
      requireMcpProxy,
      await checkTcpAddress(String(process.env.MCP_PROXY_ADDRESS ?? mcpProxyAddress).trim())
    )
  );
  checks.push(
    buildCheckRecord(
      "grpc.cyber_proxy",
      "Cyber-proxy TCP reachability",
      requireCyberProxy,
      await checkTcpAddress(String(process.env.CYBER_PROXY_ADDRESS ?? cyberProxyAddress).trim())
    )
  );
  checks.push(
    buildCheckRecord(
      "config.stripe",
      "Stripe credentials configured",
      requireStripe,
      stripeSecretKey
        ? { ok: true }
        : {
            ok: false,
            reason: "STRIPE_SECRET_KEY is missing.",
          }
    )
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

  // Database connectivity check — required for auth, orchestration, platform routes.
  // If DB init failed at startup, the process can still serve stateless routes,
  // but /ready must report not-ready so K8s stops routing DB-dependent traffic.
  const requireDatabase = resolveFeatureRequired("MAPLE_DEP_REQUIRE_DATABASE", true);
  const { database } = await import("../state.js");
  let dbCheckResult;
  if (database?.pool) {
    try {
      await Promise.race([
        database.pool.query("SELECT 1"),
        new Promise((_, reject) => setTimeout(() => reject(new Error("DB health check timed out")), 2000)),
      ]);
      dbCheckResult = { ok: true };
    } catch (err) {
      dbCheckResult = { ok: false, reason: `Database unreachable: ${err.message}` };
    }
  } else {
    dbCheckResult = { ok: false, reason: "Database pool not initialized." };
  }
  checks.push(buildCheckRecord("db.postgres", "PostgreSQL connectivity", requireDatabase, dbCheckResult));
  checks.push(
    buildCheckRecord(
      "storage.cyber_quarantine",
      "Cyber quarantine storage path",
      strict || cyberQuarantineEnabled,
      await checkReadableFile(cyberQuarantineStorageDir)
    )
  );

  const requiredFailures = checks.filter((check) => check.required && !check.ok);
  return {
    generatedAt: new Date().toISOString(),
    strict,
    ready: requiredFailures.length === 0,
    requiredFailures,
    checks,
  };
}

export async function evaluateGatewayRuntimeDependencies(options = {}) {
  const force = options.force === true;
  const now = Date.now();
  if (!force && cachedReport && now - cachedAt < CACHE_TTL_MS) {
    return cachedReport;
  }
  if (!force && inflightReportPromise) {
    return inflightReportPromise;
  }
  inflightReportPromise = evaluateGatewayRuntimeDependenciesUncached()
    .then((report) => {
      cachedReport = report;
      cachedAt = Date.now();
      return report;
    })
    .finally(() => {
      inflightReportPromise = undefined;
    });
  return inflightReportPromise;
}

export async function enforceGatewayStartupDependencies() {
  const strict = resolveStrictMode();
  const enforce = parseBooleanEnv(process.env.MAPLE_ENFORCE_STARTUP_DEPENDENCIES, strict);
  if (!enforce) {
    return {
      enforced: false,
      report: await evaluateGatewayRuntimeDependencies({ force: true }),
    };
  }
  const report = await evaluateGatewayRuntimeDependencies({ force: true });
  if (!report.ready) {
    const summary = report.requiredFailures
      .map((check) => `${check.id}: ${check.reason}`)
      .join("; ");
    throw new Error(
      `Gateway startup blocked by missing required runtime dependencies. ${summary}`
    );
  }
  return { enforced: true, report };
}
