import { accessSync, constants, existsSync, readFileSync } from "node:fs";
import net from "node:net";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { loadGrpcTlsConfig } from "@maple/common";
import { grpcUnary } from "../grpc-clients.js";
import {
  businessApiBaseUrl,
  businessApiProxyCaPath,
  businessApiProxyCertPath,
  businessApiProxyKeyPath,
  businessApiRequired,
  gatewayTlsCaPath,
  gatewayTlsCertPath,
  gatewayTlsKeyPath,
  googleClientId,
  modelRouterAddress,
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

function checkSimulationPolicy(simulationEnvName) {
  const simulationEnabled = parseBooleanEnv(process.env[simulationEnvName], false);
  if (!simulationEnabled) {
    return {
      ok: true,
      reason: "disabled",
    };
  }
  if (isProductionRuntime()) {
    return {
      ok: false,
      reason: `${simulationEnvName} cannot be enabled in production.`,
    };
  }
  return {
    ok: true,
    reason: "enabled_non_prod",
  };
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

function loadOptionalPem(pathname) {
  if (!pathname) {
    return undefined;
  }
  if (!existsSync(pathname)) {
    return undefined;
  }
  return readFileSync(pathname);
}

function resolveBusinessApiReadyUrl(baseUrl) {
  const normalized = String(baseUrl ?? "").trim();
  if (!normalized) {
    return undefined;
  }
  const suffix = normalized.endsWith("/") ? "" : "/";
  return `${normalized}${suffix}ready`;
}

async function checkBusinessApi(baseUrl) {
  const readyUrl = resolveBusinessApiReadyUrl(baseUrl);
  if (!readyUrl) {
    return {
      ok: false,
      reason: "MAPLE_BUSINESS_API_BASE_URL is not configured.",
    };
  }

  const url = new URL(readyUrl);
  const isHttps = url.protocol === "https:";
  const requestFn = isHttps ? httpsRequest : httpRequest;

  try {
    const tlsOptions =
      isHttps
        ? {
            ca: loadOptionalPem(businessApiProxyCaPath),
            cert: loadOptionalPem(businessApiProxyCertPath),
            key: loadOptionalPem(businessApiProxyKeyPath),
            rejectUnauthorized: true,
          }
        : {};
    const response = await withTimeout(
      new Promise((resolve, reject) => {
        const request = requestFn(
          {
            protocol: url.protocol,
            hostname: url.hostname,
            port: url.port || (isHttps ? 443 : 80),
            method: "GET",
            path: url.pathname + url.search,
            timeout: 2_000,
            ...tlsOptions,
          },
          (res) => {
            let body = "";
            res.setEncoding("utf8");
            res.on("data", (chunk) => {
              body += chunk;
            });
            res.on("end", () => {
              resolve({
                statusCode: res.statusCode ?? 502,
                body,
              });
            });
          }
        );
        request.on("error", reject);
        request.on("timeout", () => {
          request.destroy(new Error("Business API readiness probe timed out."));
        });
        request.end();
      }),
      2_500,
      "Business API readiness probe timed out."
    );
    const isOkStatus = response.statusCode >= 200 && response.statusCode < 300;
    if (!isOkStatus) {
      return {
        ok: false,
        reason: `Business API ready probe returned HTTP ${response.statusCode}.`,
      };
    }
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
  const businessApiReady = checkMap.get("http.business_api")?.ok === true;
  const googleSimulationAllowed =
    checkMap.get("policy.simulation_google")?.ok === true &&
    parseBooleanEnv(process.env.MAPLE_GOOGLE_AUTH_SIMULATION, false);
  const enabled = googleConfigured || businessApiReady || googleSimulationAllowed;
  let reason = "ok";
  if (!enabled) {
    reason =
      "Google auth unavailable: configure GOOGLE_CLIENT_ID or enable business-api reachability.";
  } else if (googleSimulationAllowed && !googleConfigured && !businessApiReady) {
    reason = "simulation_enabled_non_prod";
  }
  return {
    enabled,
    reason,
    requiredDeps: ["config.google_client_id"],
  };
}

export function buildFeatureCapabilitiesFromDependencyReport(report) {
  const checkMap = new Map(report.checks.map((check) => [check.id, check]));
  const businessApiCheck = checkMap.get("http.business_api");
  const businessApiRequired = businessApiCheck?.required === true;
  const businessApiReady = businessApiCheck?.ok === true;
  const features = {
    openclawAgent: capabilityFromDependencies(
      "openclawAgent",
      ["openclaw.runtime"],
      checkMap
    ),
    chatOrchestration: capabilityFromDependencies(
      "chatOrchestration",
      ["grpc.context_wall", "grpc.mcp_proxy"],
      checkMap
    ),
    hitlApprovals: capabilityFromDependencies(
      "hitlApprovals",
      ["grpc.context_wall"],
      checkMap
    ),
    toolsDispatch: capabilityFromDependencies(
      "toolsDispatch",
      ["grpc.mcp_proxy"],
      checkMap
    ),
    tracesAndLogs: {
      enabled: true,
      reason: "ok",
      requiredDeps: [],
    },
    authSession: {
      enabled: businessApiRequired ? businessApiReady : true,
      reason:
        businessApiRequired && !businessApiReady
          ? businessApiCheck?.reason ?? "Business API unavailable."
          : "ok",
      requiredDeps: businessApiRequired ? ["http.business_api"] : [],
    },
    billing: {
      enabled: businessApiReady,
      reason: businessApiReady
        ? "ok"
        : businessApiCheck?.reason ?? "Business API unavailable.",
      requiredDeps: ["http.business_api"],
    },
    orgRbac: {
      enabled: businessApiReady,
      reason: businessApiReady
        ? "ok"
        : businessApiCheck?.reason ?? "Business API unavailable.",
      requiredDeps: ["http.business_api"],
    },
    googleAuth: resolveGoogleAuthCapability(checkMap),
  };
  return {
    generatedAt: report.generatedAt,
    strict: report.strict,
    ready: report.ready,
    features,
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
  const requireBusinessApi = resolveFeatureRequired(
    "MAPLE_DEP_REQUIRE_BUSINESS_API",
    strict || businessApiRequired
  );
  const requireStripe = resolveFeatureRequired("MAPLE_DEP_REQUIRE_STRIPE", strict);
  const requireGoogle = resolveFeatureRequired("MAPLE_DEP_REQUIRE_GOOGLE_AUTH", strict);

  checks.push(
    buildCheckRecord(
      "tls.gateway_cert",
      "Gateway TLS certificate",
      strict,
      checkReadableFile(gatewayTlsCertPath)
    )
  );
  checks.push(
    buildCheckRecord(
      "tls.gateway_key",
      "Gateway TLS private key",
      strict,
      checkReadableFile(gatewayTlsKeyPath)
    )
  );
  checks.push(
    buildCheckRecord(
      "tls.gateway_ca",
      "Gateway TLS CA",
      strict,
      checkReadableFile(gatewayTlsCaPath)
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
              checkReadableFile(grpcTlsConfig.certPath).ok &&
              checkReadableFile(grpcTlsConfig.keyPath).ok &&
              checkReadableFile(grpcTlsConfig.caPath).ok,
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
      "policy.simulation_google",
      "Google auth simulation policy",
      true,
      checkSimulationPolicy("MAPLE_GOOGLE_AUTH_SIMULATION")
    )
  );
  checks.push(
    buildCheckRecord(
      "policy.simulation_billing",
      "Billing simulation policy",
      true,
      checkSimulationPolicy("MAPLE_BILLING_SIMULATION")
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
      "MCP-proxy gRPC reachability",
      requireMcpProxy,
      await checkGrpcCall(grpcClients?.mcpProxy, "ListDownstreamApps", {
        includeDisabled: false,
      })
    )
  );
  checks.push(
    buildCheckRecord(
      "http.business_api",
      "Business API readiness",
      requireBusinessApi,
      await checkBusinessApi(businessApiBaseUrl)
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

  const resolvedModelRouterAddress = String(
    process.env.MODEL_ROUTER_ADDRESS ?? modelRouterAddress
  ).trim();
  const modelRouterRequired = resolveFeatureRequired(
    "MAPLE_DEP_REQUIRE_MODEL_ROUTER",
    strict
  );
  checks.push(
    buildCheckRecord(
      "grpc.model_router",
      "Model-router TCP reachability",
      modelRouterRequired,
      await checkTcpAddress(resolvedModelRouterAddress)
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
