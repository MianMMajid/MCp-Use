import { MCPServer, error, object, text, widget } from "mcp-use/server";
import { compress } from "hono/compress";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, createPublicKey, createVerify, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isIP } from "node:net";
import { resolve } from "node:path";
import { z } from "zod";
import { startObservation, stepFromBridgeEvent } from "../bridge/openclaw-bridge.js";
import { forkTrace } from "../core/forking.js";
import {
  toReplayWidgetProps,
  toRiskWidgetProps,
  toTimelineWidgetProps,
  toTraceSummary,
} from "../core/presenters.js";
import { applyAuditToTrace, analyzeTraceRisks } from "../core/risk-engine.js";
import { TraceStore } from "../core/trace-store.js";
import {
  auditRiskInputSchema,
  dispatchDownstreamToolInputSchema,
  exportTraceInputSchema,
  guardActionInputSchema,
  guardActionOutputSchema,
  listDownstreamAppsInputSchema,
  listDownstreamToolsInputSchema,
  listTracesInputSchema,
  mlAnomalyReportInputSchema,
  observeSessionInputSchema,
  replayForkInputSchema,
  shareTraceAnonInputSchema,
  suggestEvolvedSkillsInputSchema,
  ycAppBriefInputSchema,
} from "../core/tool-schemas.js";
import type { OpenClawRawEvent, Trace, TraceForkEdits, TraceStep } from "../core/types.js";
import { SharedTraceStore } from "../network/shared-trace-store.js";
import { buildYcAppBrief, type YcBriefFocus } from "../strategy/yc-narrative.js";
import {
  MapleSqliteDatabase,
  type MapleSessionWithUser,
  type MapleUser,
} from "../persistence/sqlite-db.js";
import {
  extractApiKeyFromHeaders,
  loadApiKeysFromEnv,
  verifyApiKey,
} from "../security/api-key.js";
import { hashPassword, verifyPassword } from "../security/password-auth.js";
import {
  enforceTraceFirewall,
  evaluateFirewallStep,
  type FirewallStepDecision,
} from "../security/firewall-policy.js";
import {
  dispatchToolToDownstream,
  forwardJsonRpcToDownstream,
  listDownstreamApps,
  listToolsFromDownstream,
  loadDownstreamAppsFromEnv,
  type DownstreamAppConfig,
  type DownstreamAppInfo,
  type DownstreamCallResult,
  type DownstreamJsonRpcForwardResult,
  type DownstreamToolInfo,
} from "../control/downstream-proxy.js";
import {
  fetchSmitheryServerDetails,
  listSmitheryServers,
  resolveSmitheryDeploymentUrl,
  toSmitheryDownstreamAppId,
} from "../integrations/smithery.js";
import {
  resolveMcpSoDeploymentUrl,
  resolveMcpSoServerDetails,
  searchMcpSoServers,
  toMcpSoDownstreamAppId,
} from "../integrations/mcpso.js";

const server = new MCPServer({
  name: "maple",
  title: "Maple",
  version: "1.0.0",
  description:
    "Unified MCP control plane for agent observability, replay/forking, risk auditing, and guardrails.",
  baseUrl: process.env.MCP_URL || "http://localhost:3000",
  favicon: "favicon.ico",
  websiteUrl: "https://github.com/mcp-use/mcp-use",
  icons: [
    {
      src: "icon.svg",
      mimeType: "image/svg+xml",
      sizes: ["512x512"],
    },
  ],
});

const responseCompression = compress();

server.app.use("*", async (c, next) => {
  const method = c.req.method;
  const path = c.req.path;
  const requestIdHeader = c.req.header("x-request-id");
  const requestId =
    typeof requestIdHeader === "string" && requestIdHeader.trim().length > 0
      ? requestIdHeader.trim()
      : randomUUID().slice(0, 12);
  const startedAt = Date.now();

  await requestContextStorage.run(
    {
      requestId,
      method,
      path,
    },
    async () => {
      const shouldLogRequest = mapleLogRequestsEnabled && shouldLogHttpRequestPath(path);
      if (shouldLogRequest) {
        const includeBody =
          mapleLogIncludeBodies &&
          (method === "POST" || method === "PUT" || method === "PATCH") &&
          shouldLogLevel("debug");
        const bodyPreview =
          includeBody && c.req.raw ? await requestBodyPreview(c.req.raw) : undefined;
        mapleLog("info", "http.request.start", {
          path,
          method,
          query: c.req.raw.url.includes("?") ? c.req.raw.url.split("?")[1] : "",
          userAgent: c.req.header("user-agent") ?? undefined,
          ...(includeBody ? { body: bodyPreview } : {}),
        });
      }

      try {
        await next();
      } catch (error) {
        mapleLog("error", "http.request.exception", {
          path,
          method,
          durationMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      } finally {
        if (shouldLogRequest) {
          const durationMs = Date.now() - startedAt;
          const status = c.res.status;
          const level: MapleLogLevel =
            status >= 500 ? "error" : status >= 400 ? "warn" : durationMs > 2000 ? "warn" : "info";
          mapleLog(level, "http.request.end", {
            path,
            method,
            status,
            durationMs,
            contentType: c.res.headers.get("content-type") ?? undefined,
          });
        }
      }
    }
  );
});

server.app.use("*", async (c, next) => {
  if (c.req.path.startsWith("/sse")) {
    await next();
    return;
  }
  await responseCompression(c, next);
});

const database = new MapleSqliteDatabase();
const traceStore = new TraceStore({
  persistence: {
    loadTraces: () => database.loadTraces(10_000),
    saveTrace: (trace) => database.upsertTrace(trace),
    removeTrace: (traceId) => database.removeTrace(traceId),
  },
});
const sharedTraceStore = new SharedTraceStore(undefined, {
  loadSharedTraces: () => database.loadSharedTraces(10_000),
  saveSharedTrace: (trace) => database.upsertSharedTrace(trace),
  removeSharedTrace: (traceId) => database.removeSharedTrace(traceId),
});
const downstreamAppRegistry = loadDownstreamAppsFromEnv();
let evolvedSuggestionsServed = 0;
const configuredApiKeys = loadApiKeysFromEnv();
const apiKeyAuthEnabled = configuredApiKeys.length > 0;
const allowNoAuth =
  String(process.env.MAPLE_ALLOW_NO_AUTH ?? "0").trim().toLowerCase() === "true" ||
  String(process.env.MAPLE_ALLOW_NO_AUTH ?? "0").trim().toLowerCase() === "1";
const allowBridgeOverride =
  String(process.env.MAPLE_ALLOW_BRIDGE_OVERRIDE ?? "0").trim().toLowerCase() === "true" ||
  String(process.env.MAPLE_ALLOW_BRIDGE_OVERRIDE ?? "0").trim().toLowerCase() === "1";
const explicitBridgeLock =
  String(process.env.MAPLE_LOCK_BRIDGE_TARGET ?? "0").trim().toLowerCase() === "true" ||
  String(process.env.MAPLE_LOCK_BRIDGE_TARGET ?? "0").trim().toLowerCase() === "1";
const HARDCODED_BRIDGE_URL = "http://127.0.0.1:8787";
const configuredBridgeUrl =
  asString(process.env.OPENCLAW_BRIDGE_URL) ??
  (process.env.NODE_ENV === "production" ? "" : HARDCODED_BRIDGE_URL);
const configuredBridgeToken = asString(process.env.OPENCLAW_BRIDGE_TOKEN) ?? "";
const bridgeOverrideLockEnabled =
  explicitBridgeLock || !allowBridgeOverride || process.env.NODE_ENV === "production";
const sessionPollEnabled =
  String(process.env.MAPLE_SESSION_POLL ?? "1") !== "0";
const sessionPollIntervalMs = (() => {
  const raw = process.env.MAPLE_SESSION_POLL_MS;
  if (!raw) return 5000;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5000;
})();
const mcpFirewallDefaultAppId = asString(process.env.MAPLE_MCP_FIREWALL_DEFAULT_APP);
const mcpProxyAllowDynamicTargets =
  String(process.env.MAPLE_MCP_PROXY_ALLOW_DYNAMIC_TARGETS ?? "0").trim().toLowerCase() ===
    "true" ||
  String(process.env.MAPLE_MCP_PROXY_ALLOW_DYNAMIC_TARGETS ?? "0").trim().toLowerCase() === "1";
const mcpProxyAllowHttp =
  String(process.env.MAPLE_MCP_PROXY_ALLOW_HTTP ?? "0").trim().toLowerCase() === "true" ||
  String(process.env.MAPLE_MCP_PROXY_ALLOW_HTTP ?? "0").trim().toLowerCase() === "1";
const mcpProxyAllowPrivateTargets =
  String(process.env.MAPLE_MCP_PROXY_ALLOW_PRIVATE_TARGETS ?? "0").trim().toLowerCase() ===
    "true" ||
  String(process.env.MAPLE_MCP_PROXY_ALLOW_PRIVATE_TARGETS ?? "0").trim().toLowerCase() === "1";
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
  !marketplaceHardDisabled &&
  (String(process.env.MAPLE_MCP_MARKETPLACE_ENABLED ?? "0").trim().toLowerCase() === "true" ||
    String(process.env.MAPLE_MCP_MARKETPLACE_ENABLED ?? "0").trim().toLowerCase() === "1");
const mcpMarketplaceAutoConnectEnabled =
  !marketplaceHardDisabled &&
  (String(process.env.MAPLE_MCP_MARKETPLACE_AUTO_CONNECT ?? "0").trim().toLowerCase() === "true" ||
    String(process.env.MAPLE_MCP_MARKETPLACE_AUTO_CONNECT ?? "0").trim().toLowerCase() === "1");
const smitheryEnabled =
  !marketplaceHardDisabled &&
  (String(process.env.MAPLE_SMITHERY_ENABLED ?? "0").trim().toLowerCase() === "true" ||
    String(process.env.MAPLE_SMITHERY_ENABLED ?? "0").trim().toLowerCase() === "1");
const smitheryApiBaseUrl =
  asString(process.env.MAPLE_SMITHERY_API_BASE_URL) ?? "https://api.smithery.ai";
const smitheryApiKey = asString(process.env.MAPLE_SMITHERY_API_KEY);
const smitheryTimeoutMsRaw = Number.parseInt(String(process.env.MAPLE_SMITHERY_TIMEOUT_MS ?? "12000"), 10);
const smitheryTimeoutMs = Number.isFinite(smitheryTimeoutMsRaw)
  ? Math.max(1_000, Math.min(60_000, smitheryTimeoutMsRaw))
  : 12_000;
const mcpSoEnabled =
  !marketplaceHardDisabled &&
  (String(process.env.MAPLE_MCPSO_ENABLED ?? "0").trim().toLowerCase() === "true" ||
    String(process.env.MAPLE_MCPSO_ENABLED ?? "0").trim().toLowerCase() === "1");
const mcpSoBaseUrl = asString(process.env.MAPLE_MCPSO_BASE_URL) ?? "https://mcp.so";
const mcpSoTimeoutMsRaw = Number.parseInt(String(process.env.MAPLE_MCPSO_TIMEOUT_MS ?? "12000"), 10);
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
type DownstreamToolsListResult = Awaited<ReturnType<typeof listToolsFromDownstream>>;
const downstreamToolsCache = new Map<
  string,
  {
    expiresAt: number;
    value: DownstreamToolsListResult;
  }
>();
const downstreamToolsInFlight = new Map<string, Promise<DownstreamToolsListResult>>();
const explicitRouteLock =
  String(process.env.MAPLE_MCP_ROUTE_LOCK ?? "0").trim().toLowerCase() === "true" ||
  String(process.env.MAPLE_MCP_ROUTE_LOCK ?? "0").trim().toLowerCase() === "1";
const mcpRouteLockEnabled = explicitRouteLock || process.env.NODE_ENV === "production";
const MAPLE_DEFAULT_TARGET_APP_ID = "__maple_default_target__";
const sessionOwnerScopeMode = (() => {
  const raw = String(process.env.MAPLE_SESSION_OWNER_SCOPE ?? "auto").trim().toLowerCase();
  if (raw === "user" || raw === "api_key_primary" || raw === "auto") {
    return raw;
  }
  return "auto";
})();
const primaryConfiguredApiKeyFingerprint =
  configuredApiKeys.length > 0
    ? createHash("sha256").update(configuredApiKeys[0]).digest("hex").slice(0, 12)
    : undefined;
const demoRoutesEnabled =
  String(process.env.MAPLE_ENABLE_DEMO_ROUTES ?? "1")
    .trim()
    .toLowerCase() === "true" ||
  String(process.env.MAPLE_ENABLE_DEMO_ROUTES ?? "1")
    .trim()
    .toLowerCase() === "1";
const legacySmitheryRoutesEnabled =
  String(process.env.MAPLE_ENABLE_LEGACY_SMITHERY_ROUTES ?? "0").trim().toLowerCase() === "true" ||
  String(process.env.MAPLE_ENABLE_LEGACY_SMITHERY_ROUTES ?? "0").trim().toLowerCase() === "1";
const judgeUiRoutesEnabled =
  String(process.env.MAPLE_ENABLE_JUDGE_UI ?? "1").trim().toLowerCase() === "true" ||
  String(process.env.MAPLE_ENABLE_JUDGE_UI ?? "1").trim().toLowerCase() === "1";
type FirewallChatAiProvider = "openai" | "anthropic";
const firewallChatOpenAiApiKey =
  asString(process.env.OPENAI_API_KEY) ?? asString(process.env.MAPLE_OPENAI_API_KEY);
const firewallChatAnthropicApiKey =
  asString(process.env.ANTHROPIC_API_KEY) ?? asString(process.env.MAPLE_ANTHROPIC_API_KEY);
const firewallChatPrimaryProviderRaw = String(process.env.MAPLE_FIREWALL_CHAT_PRIMARY ?? "openai")
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
const allowSelfSignup =
  String(process.env.MAPLE_AUTH_ALLOW_SELF_SIGNUP ?? "0").trim().toLowerCase() === "true" ||
  String(process.env.MAPLE_AUTH_ALLOW_SELF_SIGNUP ?? "0").trim().toLowerCase() === "1";
const authContextStorage = new AsyncLocalStorage<{
  method: "api_key" | "session" | "bypass";
  keyFingerprint?: string;
  userId?: string;
  username?: string;
  authBypass: boolean;
}>();

if (!apiKeyAuthEnabled && !allowNoAuth) {
  throw new Error(
    "API key auth is required. Set MAPLE_API_KEY or MAPLE_API_KEYS. To bypass only in local dev, set MAPLE_ALLOW_NO_AUTH=true."
  );
}

if (process.env.NODE_ENV === "production" && allowNoAuth) {
  mapleLog("warn", "startup.allow_no_auth_production", {
    message: "MAPLE_ALLOW_NO_AUTH is enabled in production. MCP endpoints are publicly accessible.",
  });
}

if (mcpProxyAllowDynamicTargets && mcpProxyAllowedHosts.length === 0) {
  throw new Error(
    "MAPLE_MCP_PROXY_ALLOW_DYNAMIC_TARGETS requires MAPLE_MCP_PROXY_ALLOWED_HOSTS to be set."
  );
}

if (smitheryEnabled) {
  try {
    const parsed = new URL(smitheryApiBaseUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error("Smithery API base URL must be http/https.");
    }
  } catch (error) {
    throw new Error(
      `MAPLE_SMITHERY_API_BASE_URL is invalid: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

if (mcpSoEnabled) {
  try {
    const parsed = new URL(mcpSoBaseUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error("MCP.so base URL must be http/https.");
    }
  } catch (error) {
    throw new Error(
      `MAPLE_MCPSO_BASE_URL is invalid: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
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
  throw new Error(
    "MAPLE_MCP_PROXY_ALLOW_PRIVATE_TARGETS is not allowed in production."
  );
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

bootstrapAuthUsers();

const requestContextStorage = new AsyncLocalStorage<{
  requestId: string;
  method: string;
  path: string;
}>();

type MapleLogLevel = "error" | "warn" | "info" | "debug" | "trace";
const MAPLE_LOG_LEVEL_ORDER: Record<MapleLogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4,
};
const mapleLogLevelRaw = String(process.env.MAPLE_LOG_LEVEL ?? "info").trim().toLowerCase();
const mapleLogLevel: MapleLogLevel =
  mapleLogLevelRaw === "error" ||
  mapleLogLevelRaw === "warn" ||
  mapleLogLevelRaw === "info" ||
  mapleLogLevelRaw === "debug" ||
  mapleLogLevelRaw === "trace"
    ? mapleLogLevelRaw
    : "info";
const mapleLogIncludeBodies =
  String(process.env.MAPLE_LOG_INCLUDE_BODIES ?? "0").trim().toLowerCase() === "true" ||
  String(process.env.MAPLE_LOG_INCLUDE_BODIES ?? "0").trim().toLowerCase() === "1";
const mapleLogRequestsEnabled =
  String(process.env.MAPLE_LOG_REQUESTS ?? "1").trim().toLowerCase() !== "false" &&
  String(process.env.MAPLE_LOG_REQUESTS ?? "1").trim().toLowerCase() !== "0";
const mapleLogBodyMaxCharsRaw = Number.parseInt(String(process.env.MAPLE_LOG_BODY_MAX_CHARS ?? "4000"), 10);
const mapleLogBodyMaxChars = Number.isFinite(mapleLogBodyMaxCharsRaw)
  ? Math.max(256, Math.min(40_000, mapleLogBodyMaxCharsRaw))
  : 4000;

function shouldLogLevel(level: MapleLogLevel): boolean {
  return MAPLE_LOG_LEVEL_ORDER[level] <= MAPLE_LOG_LEVEL_ORDER[mapleLogLevel];
}

function currentRequestContext():
  | {
      requestId: string;
      method: string;
      path: string;
    }
  | undefined {
  return requestContextStorage.getStore();
}

function isSensitiveKeyName(key: string): boolean {
  const lower = key.toLowerCase();
  return (
    lower.includes("password") ||
    lower.includes("secret") ||
    lower.includes("token") ||
    lower.includes("api_key") ||
    lower === "apikey" ||
    lower.includes("authorization") ||
    lower.includes("cookie")
  );
}

function redactForLogs(value: unknown, depth = 0): unknown {
  if (depth > 5) {
    return "[truncated-depth]";
  }
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === "string") {
    if (value.length <= mapleLogBodyMaxChars) {
      return value;
    }
    return `${value.slice(0, mapleLogBodyMaxChars)}...<truncated>`;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > 100) {
      const sliced = value.slice(0, 100).map((entry) => redactForLogs(entry, depth + 1));
      sliced.push(`...<truncated ${value.length - 100} items>`);
      return sliced;
    }
    return value.map((entry) => redactForLogs(entry, depth + 1));
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(record)) {
      if (isSensitiveKeyName(key)) {
        out[key] = "[redacted]";
        continue;
      }
      out[key] = redactForLogs(entry, depth + 1);
    }
    return out;
  }
  return String(value);
}

function stringifyLogPayload(payload: unknown): string {
  try {
    const redacted = redactForLogs(payload);
    return JSON.stringify(redacted);
  } catch {
    return "{\"serialization\":\"failed\"}";
  }
}

function mapleLog(level: MapleLogLevel, event: string, payload?: Record<string, unknown>): void {
  if (!shouldLogLevel(level)) {
    return;
  }
  const now = new Date().toISOString();
  const context = currentRequestContext();
  const envelope: Record<string, unknown> = {
    ts: now,
    level,
    event,
    ...(context
      ? {
          requestId: context.requestId,
          requestPath: context.path,
          requestMethod: context.method,
        }
      : {}),
    ...(payload ?? {}),
  };
  const line = `[MAPLE] ${stringifyLogPayload(envelope)}`;
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}

function shouldLogHttpRequestPath(path: string): boolean {
  if (path.startsWith("/api/")) {
    return true;
  }
  if (path === "/mcp" || path.startsWith("/mcp/")) {
    return true;
  }
  if (path === "/sse" || path.startsWith("/sse/")) {
    return true;
  }
  if (path === "/judge" || path.startsWith("/judge") || path === "/landing" || path === "/") {
    return true;
  }
  return false;
}

async function requestBodyPreview(raw: Request): Promise<unknown> {
  const contentType = String(raw.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.includes("application/json")) {
    return undefined;
  }
  try {
    const payload = (await raw.clone().json()) as unknown;
    return payload;
  } catch {
    return "[unparseable-json]";
  }
}

function unauthorizedBody(reason: string) {
  return {
    error: "Unauthorized",
    reason,
    hint: "Provide x-api-key / Authorization bearer token or sign in via /landing.",
  };
}

function resolveSessionOwnerFingerprint(userId: string): string {
  const userScoped = `user:${userId}`;
  const primaryKeyScoped = primaryConfiguredApiKeyFingerprint;
  if (sessionOwnerScopeMode === "user") {
    return userScoped;
  }
  if (sessionOwnerScopeMode === "api_key_primary") {
    return primaryKeyScoped ?? userScoped;
  }
  return primaryKeyScoped ?? userScoped;
}

function currentOwnerKeyFingerprintsForLookup(): string[] | undefined {
  const auth = authContextStorage.getStore();
  if (!auth || auth.authBypass) {
    return undefined;
  }
  if (auth.method === "session" && auth.userId) {
    const userScoped = `user:${auth.userId}`;
    const sessionScoped = resolveSessionOwnerFingerprint(auth.userId);
    const out = [sessionScoped];
    if (sessionScoped !== userScoped) {
      out.push(userScoped);
    }
    return dedupeBy(out, (entry) => entry);
  }
  if (auth.keyFingerprint) {
    return [auth.keyFingerprint];
  }
  return undefined;
}

function currentOwnerKeyFingerprint(): string | undefined {
  const auth = authContextStorage.getStore();
  if (!auth || auth.authBypass) {
    return undefined;
  }
  if (auth.method === "session" && auth.userId) {
    return resolveSessionOwnerFingerprint(auth.userId);
  }
  return auth.keyFingerprint;
}

function parseCookieHeader(header?: string): Record<string, string> {
  if (!header) {
    return {};
  }
  const cookies: Record<string, string> = {};
  for (const part of header.split(";")) {
    const [rawName, ...rawValue] = part.split("=");
    const name = rawName?.trim();
    if (!name) {
      continue;
    }
    const value = rawValue.join("=").trim();
    cookies[name] = decodeURIComponent(value);
  }
  return cookies;
}

function sessionCookieValue(cookieHeader?: string): string | undefined {
  const cookies = parseCookieHeader(cookieHeader);
  const sessionId = cookies[sessionCookieName];
  return sessionId && sessionId.trim().length > 0 ? sessionId.trim() : undefined;
}

function buildSessionCookie(sessionId: string, maxAgeSeconds: number): string {
  const parts = [
    `${sessionCookieName}=${encodeURIComponent(sessionId)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.max(0, Math.trunc(maxAgeSeconds))}`,
  ];
  if (process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }
  return parts.join("; ");
}

function clearSessionCookieHeader(): string {
  const parts = [
    `${sessionCookieName}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }
  return parts.join("; ");
}

function findRequestSession(cookieHeader?: string): MapleSessionWithUser | undefined {
  const sessionId = sessionCookieValue(cookieHeader);
  if (!sessionId) {
    return undefined;
  }
  return database.findActiveSession(sessionId);
}

function toPublicUser(user: Pick<MapleUser, "id" | "username" | "email">) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
  };
}

function bootstrapAuthUsers() {
  database.purgeExpiredSessions();
  const existingUsers = database.countUsers();
  const adminUsername = envValue(process.env.MAPLE_ADMIN_USERNAME) ?? "";
  const adminPassword = envValue(process.env.MAPLE_ADMIN_PASSWORD) ?? "";
  const adminEmail = envValue(process.env.MAPLE_ADMIN_EMAIL);

  if (adminUsername && adminPassword) {
    const syncedUser = database.syncUserPasswordByUsername({
      username: adminUsername,
      email: adminEmail,
      passwordHash: hashPassword(adminPassword),
    });
    const action = existingUsers > 0 ? "Synced" : "Bootstrapped";
    console.log(`[AUTH] ${action} admin user "${syncedUser.username}" from MAPLE_ADMIN_* env.`);
    return;
  }

  if (existingUsers > 0) {
    return;
  }

  if (!adminUsername || !adminPassword) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "No users found. Set MAPLE_ADMIN_USERNAME and MAPLE_ADMIN_PASSWORD for production startup."
      );
    }
    const devUser = envValue(process.env.MAPLE_DEV_USERNAME) || "admin";
    const devPass = envValue(process.env.MAPLE_DEV_PASSWORD) || "maple-demo-password";
    database.createUser({
      username: devUser,
      email: envValue(process.env.MAPLE_DEV_EMAIL) || "admin@local.maple",
      passwordHash: hashPassword(devPass),
    });
    console.log(`[AUTH] Bootstrapped local dev user "${devUser}" with MAPLE_DEV_PASSWORD/default.`);
    return;
  }
}

function verifyIncomingApiKey(xApiKey?: string, authorization?: string) {
  if (!apiKeyAuthEnabled) {
    if (allowNoAuth) {
      return { ok: true as const };
    }
    return {
      ok: false as const,
      reason: "misconfigured" as const,
    };
  }

  const fromHeaders = extractApiKeyFromHeaders(xApiKey, authorization);

  // If no key provided but allowNoAuth is enabled, bypass auth
  if (!fromHeaders && allowNoAuth) {
    return { ok: true as const };
  }

  const result = verifyApiKey(configuredApiKeys, fromHeaders);
  if (!result.ok) {
    return result;
  }

  return result;
}

function isApiKeyPresent(xApiKey?: string, authorization?: string): boolean {
  return Boolean(extractApiKeyFromHeaders(xApiKey, authorization));
}

interface RequireAuthOptions {
  allowSession?: boolean;
  requireApiKey?: boolean;
}

function requireApiKeyResponse(c: {
  req: {
    header: (name: string) => string | undefined;
  };
  json: (body: unknown, status?: number) => Response;
}, options: RequireAuthOptions = {}) {
  const allowSessionAuth = options.allowSession ?? true;
  const requireApiKey = options.requireApiKey ?? false;
  const xApiKey = c.req.header("x-api-key");
  const authorization = c.req.header("authorization");
  const cookieHeader = c.req.header("cookie");

  const apiKeyResult = verifyIncomingApiKey(xApiKey, authorization);
  const apiKeyProvided = isApiKeyPresent(xApiKey, authorization);
  if (apiKeyResult.ok && (requireApiKey || apiKeyProvided || apiKeyAuthEnabled || allowNoAuth)) {
    authContextStorage.enterWith({
      method: apiKeyAuthEnabled ? "api_key" : "bypass",
      keyFingerprint: apiKeyResult.keyFingerprint,
      authBypass: !apiKeyAuthEnabled && allowNoAuth,
    });
    return undefined;
  }

  if (!requireApiKey && allowSessionAuth) {
    const session = findRequestSession(cookieHeader);
    if (session) {
      authContextStorage.enterWith({
        method: "session",
        keyFingerprint: undefined,
        userId: session.userId,
        username: session.user.username,
        authBypass: false,
      });
      return undefined;
    }
  }

  if (requireApiKey) {
    return c.json(unauthorizedBody(apiKeyResult.reason ?? "missing_key"), 401);
  }

  if (!apiKeyAuthEnabled && allowNoAuth) {
    authContextStorage.enterWith({
      method: "bypass",
      authBypass: true,
    });
    return undefined;
  }

  const reason = apiKeyResult.reason ?? "unauthorized";
  return c.json(unauthorizedBody(reason), 401);
}

server.get("/inspector/demo", (c) => {
  const requestUrl = new URL(c.req.url);
  const host =
    requestUrl.hostname === "0.0.0.0" || requestUrl.hostname === "::"
      ? "localhost"
      : requestUrl.hostname;
  const base = `${requestUrl.protocol}//${host}${requestUrl.port ? `:${requestUrl.port}` : ""}`;
  const mcpUrl = new URL("/mcp", base);

  const target = `/inspector?autoConnect=${encodeURIComponent(mcpUrl.toString())}`;
  return c.redirect(target, 302);
});

function getCommunityBaselines(enabled = true): number[][] {
  if (!enabled) {
    return [];
  }
  return sharedTraceStore.getEmbeddingBaselines(250);
}

function auditAndPersist(
  trace: Trace,
  options: { useCommunityBaseline?: boolean; threshold?: number } = {}
) {
  const firewall = enforceTraceFirewall(trace);
  const report = analyzeTraceRisks(trace.steps, {
    communityBaselines: getCommunityBaselines(options.useCommunityBaseline ?? true),
    embeddingThreshold: options.threshold,
  });
  applyAuditToTrace(trace, report);
  trace.metadata = {
    ...(trace.metadata ?? {}),
    firewall: {
      ...(trace.metadata?.firewall && typeof trace.metadata.firewall === "object"
        ? (trace.metadata.firewall as Record<string, unknown>)
        : {}),
      blockedSteps: firewall.blockedSteps,
      redactedSteps: firewall.redactedSteps,
      enforcedAt: firewall.enforcedAt,
      enabled: firewall.enabled,
      defaultAction: firewall.defaultAction,
      ruleHits: firewall.ruleHits,
    },
  };
  upsertTraceForCurrentOwner(trace);
  return report;
}

async function pollForNewSessions(): Promise<void> {
  if (!configuredBridgeUrl || !configuredBridgeToken) return;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);
    let bridgeSessions: string[];
    try {
      const res = await fetch(new URL("/sessions", configuredBridgeUrl), {
        headers: { Authorization: `Bearer ${configuredBridgeToken}` },
        signal: controller.signal,
      });
      if (!res.ok) return; // silent fail, retry next cycle
      const body = (await res.json()) as { sessions?: unknown };
      bridgeSessions = Array.isArray(body.sessions) ? body.sessions : [];
    } finally {
      clearTimeout(timeout);
    }

    if (bridgeSessions.length === 0) return;

    const ownerFingerprint = primaryConfiguredApiKeyFingerprint;
    const tracked = new Set(traceStore.listSessionIds(ownerFingerprint));

    for (const sessionId of bridgeSessions) {
      if (tracked.has(sessionId)) {
        await refreshExistingSession(sessionId, ownerFingerprint);
        continue;
      }

      try {
        const trace = await startObservation({
          sessionId,
          source: "openclaw",
          bridgeUrl: configuredBridgeUrl,
          token: configuredBridgeToken,
        });

        if (trace.steps.length === 0) continue;

        trace.ownerKeyFingerprint = ownerFingerprint;
        traceStore.upsertTrace(trace, ownerFingerprint);

        const firewall = enforceTraceFirewall(trace);
        const report = analyzeTraceRisks(trace.steps, {
          communityBaselines: getCommunityBaselines(true),
        });
        applyAuditToTrace(trace, report);
        trace.metadata = {
          ...(trace.metadata ?? {}),
          autoDiscovered: true,
          discoveredAt: new Date().toISOString(),
          firewall: {
            blockedSteps: firewall.blockedSteps,
            redactedSteps: firewall.redactedSteps,
            enforcedAt: firewall.enforcedAt,
            enabled: firewall.enabled,
            defaultAction: firewall.defaultAction,
            ruleHits: firewall.ruleHits,
          },
        };
        traceStore.upsertTrace(trace, ownerFingerprint);

        console.log(
          `[SESSION-POLL] New session: ${sessionId} (${trace.steps.length} steps, risk: ${report.overallRiskScore}, severity: ${report.severity})`
        );
      } catch (err) {
        console.error(
          `[SESSION-POLL] Failed to ingest ${sessionId}:`,
          err instanceof Error ? err.message : err
        );
      }
    }
  } catch {
    // Bridge unreachable or other top-level error — silent, retry next cycle
  }
}

async function refreshExistingSession(
  sessionId: string,
  ownerFingerprint?: string
): Promise<void> {
  const existing = traceStore.getLatestTraceBySession(sessionId, ownerFingerprint);
  if (!existing) return;

  try {
    const latest = await startObservation({
      sessionId,
      source: "openclaw",
      bridgeUrl: configuredBridgeUrl,
      token: configuredBridgeToken,
    });

    if (latest.steps.length <= existing.steps.length) return;

    const merged = mergeLiveOpenClawTrace(existing, latest);
    traceStore.upsertTrace(merged, ownerFingerprint);

    const firewall = enforceTraceFirewall(merged);
    const report = analyzeTraceRisks(merged.steps, {
      communityBaselines: getCommunityBaselines(true),
    });
    applyAuditToTrace(merged, report);
    merged.metadata = {
      ...(merged.metadata ?? {}),
      firewall: {
        blockedSteps: firewall.blockedSteps,
        redactedSteps: firewall.redactedSteps,
        enforcedAt: firewall.enforcedAt,
        enabled: firewall.enabled,
        defaultAction: firewall.defaultAction,
        ruleHits: firewall.ruleHits,
      },
    };
    traceStore.upsertTrace(merged, ownerFingerprint);

    const newStepCount = latest.steps.length - existing.steps.length;
    console.log(
      `[SESSION-POLL] Updated session: ${sessionId} (+${newStepCount} steps, total: ${merged.steps.length}, risk: ${report.overallRiskScore})`
    );
  } catch {
    // Silent failure for refresh — will retry next cycle
  }
}

function buildYcMetrics() {
  const traces = listTracesForCurrentOwner(1000);
  const community = sharedTraceStore.getStats();

  return {
    totalObservedTraces: traces.length,
    openclawTraces: traces.filter((trace) => trace.source === "openclaw").length,
    sharedTraces: community.sharedTraces,
    uniqueSignatures: community.uniqueSignatures,
    highRiskDetections: traces.filter((trace) => Number(trace.metadata?.overallRiskScore ?? 0) >= 60)
      .length,
    evolvedSuggestionsServed,
  };
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function envValue(value: unknown): string | undefined {
  const normalized = asString(value);
  if (!normalized) {
    return undefined;
  }
  if (normalized.length >= 2) {
    const first = normalized[0];
    const last = normalized[normalized.length - 1];
    if ((first === `"` && last === `"`) || (first === `'` && last === `'`)) {
      const unwrapped = normalized.slice(1, -1).trim();
      return unwrapped.length > 0 ? unwrapped : undefined;
    }
  }
  return normalized;
}

function parseAppIdList(value: unknown): string[] {
  const rawEntries: string[] = [];
  if (typeof value === "string") {
    rawEntries.push(...value.split(","));
  } else if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry === "string") {
        rawEntries.push(entry);
      }
    }
  }

  const unique = new Set<string>();
  for (const entry of rawEntries) {
    const normalized = entry.trim();
    if (normalized.length > 0) {
      unique.add(normalized);
    }
  }
  return [...unique];
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
}

function asStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const record: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw !== "string") {
      continue;
    }
    const normalizedKey = key.trim();
    const normalizedValue = raw.trim();
    if (!normalizedKey || !normalizedValue) {
      continue;
    }
    record[normalizedKey] = normalizedValue;
  }
  return record;
}

function dedupeBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const normalized = key(item);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    out.push(item);
  }
  return out;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "Unknown error");
}

function jsonRpcErrorPayload(
  id: unknown,
  code: number,
  message: string,
  data?: Record<string, unknown>
) {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    error: {
      code,
      message,
      ...(data ? { data } : {}),
    },
  };
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

function hostAllowedByPolicy(hostname: string): boolean {
  if (mcpProxyAllowedHosts.length === 0) {
    return true;
  }
  if (mcpProxyAllowedHosts.includes("*")) {
    return true;
  }
  const lower = hostname.toLowerCase();
  return mcpProxyAllowedHosts.some((allowed) => lower === allowed || lower.endsWith(`.${allowed}`));
}

function normalizeDynamicMcpUrl(rawUrl: string): string {
  const parsed = new URL(rawUrl);
  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== "https:" && !(protocol === "http:" && mcpProxyAllowHttp)) {
    throw new Error("Dynamic MCP target must use https (or http when MAPLE_MCP_PROXY_ALLOW_HTTP=true).");
  }
  if (process.env.NODE_ENV === "production" && protocol !== "https:") {
    throw new Error("Dynamic MCP target must use https in production.");
  }
  const privateHost = isPrivateOrLocalHost(parsed.hostname);
  const privateAllowed = privateHost && mcpProxyAllowPrivateTargets && process.env.NODE_ENV !== "production";
  if (privateHost && !privateAllowed) {
    throw new Error("Dynamic MCP target host is private/local and is denied by policy.");
  }
  if (!hostAllowedByPolicy(parsed.hostname)) {
    throw new Error("Dynamic MCP target host is not allowlisted.");
  }
  return parsed.toString();
}

function clearDownstreamToolsCache(appId?: string): void {
  if (appId) {
    downstreamToolsCache.delete(appId);
    downstreamToolsInFlight.delete(appId);
    return;
  }
  downstreamToolsCache.clear();
  downstreamToolsInFlight.clear();
}

function getCachedDownstreamTools(appId: string): DownstreamToolsListResult | undefined {
  const cached = downstreamToolsCache.get(appId);
  if (!cached) {
    return undefined;
  }
  if (Date.now() >= cached.expiresAt) {
    downstreamToolsCache.delete(appId);
    return undefined;
  }
  return cached.value;
}

function setCachedDownstreamTools(appId: string, value: DownstreamToolsListResult): void {
  downstreamToolsCache.set(appId, {
    expiresAt: Date.now() + downstreamToolsCacheTtlMs,
    value,
  });
}

async function listToolsFromDownstreamCached(
  app: DownstreamAppConfig,
  options: { forceRefresh?: boolean } = {}
): Promise<DownstreamToolsListResult> {
  if (!options.forceRefresh) {
    const cached = getCachedDownstreamTools(app.id);
    if (cached) {
      return cached;
    }
    const inFlight = downstreamToolsInFlight.get(app.id);
    if (inFlight) {
      return inFlight;
    }
  }

  const task = listToolsFromDownstream(app)
    .then((listed) => {
      setCachedDownstreamTools(app.id, listed);
      return listed;
    })
    .finally(() => {
      downstreamToolsInFlight.delete(app.id);
    });
  downstreamToolsInFlight.set(app.id, task);
  return task;
}

function truncateText(value: string, maxLength = 2400): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 3)}...`;
}

function compactUnknown(value: unknown, maxChars = 24_000): unknown {
  try {
    const json = JSON.stringify(value);
    if (!json) {
      return value;
    }
    if (json.length <= maxChars) {
      return value;
    }
    return {
      truncated: true,
      preview: `${json.slice(0, maxChars - 3)}...`,
      originalBytes: Buffer.byteLength(json, "utf8"),
    };
  } catch {
    const fallback = String(value ?? "");
    return {
      truncated: true,
      preview: truncateText(fallback, Math.min(maxChars, 3000)),
    };
  }
}

function summarizeJsonRpcPayload(payload: unknown, maxLength = 2400): string {
  try {
    const json = JSON.stringify(payload);
    if (!json) {
      return "";
    }
    return truncateText(json, maxLength);
  } catch {
    return truncateText(String(payload ?? ""), maxLength);
  }
}

function extractFirstUrl(value: string): string | undefined {
  const match = value.match(/https?:\/\/[^\s)]+/i);
  return match ? match[0] : undefined;
}

function extractLikelyCommand(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const fenced = trimmed.match(/```(?:bash|sh|zsh|shell)?\n([\s\S]*?)```/i);
  if (fenced && fenced[1]) {
    const line = fenced[1]
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .find((entry) => entry.length > 0);
    if (line) {
      return line;
    }
  }

  return trimmed
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) =>
      /^(curl|wget|bash|zsh|sh|python|node|npm|pnpm|yarn|pip|git|rm|chmod|scp|ssh)\b/i.test(
        entry
      )
    );
}

function inferStepTypeFromDownstream(summary: string, toolName: string): TraceStep["type"] {
  const lower = `${toolName}\n${summary}`.toLowerCase();
  if (
    /(curl|wget|bash|zsh|sh|python|node|npm|pnpm|rm\s+-|chmod|sudo|terminal|shell|command)/.test(
      lower
    )
  ) {
    return "shell";
  }
  if (
    /https?:\/\/|web_fetch|browser|search|http|dns|socket|upload|download|request|fetch/.test(lower)
  ) {
    return "network";
  }
  if (/(mail|email|gmail|inbox|smtp|imap)/.test(lower)) {
    return "email";
  }
  return "tool_call";
}

function toInvocationSummary(toolName: string, toolArgs: Record<string, unknown>): string {
  const compact = compactUnknown(toolArgs, 8_000);
  let serialized = "";
  try {
    serialized = JSON.stringify(compact, null, 2);
  } catch {
    serialized = String(compact ?? "");
  }
  const summary = serialized.trim().length > 0 ? `${toolName}\n${serialized}` : toolName;
  return truncateText(summary, 2400);
}

function toPolicySnapshot(decision: FirewallStepDecision) {
  return {
    action: decision.action,
    shouldBlock: decision.shouldBlock,
    severity: decision.severity,
    rule: decision.rule,
    message: decision.message,
    recommendation: decision.recommendation,
    evaluatedAt: decision.evaluatedAt,
    redactedPatterns: decision.redactedPatterns,
    defaultAction: decision.defaultAction,
  };
}

function resolveDefaultTargetApp(): DownstreamAppConfig | undefined {
  if (!mcpProxyDefaultTargetUrl) {
    return undefined;
  }
  const dynamic = toDynamicDownstreamAppConfig(mcpProxyDefaultTargetUrl);
  return {
    ...dynamic,
    id: MAPLE_DEFAULT_TARGET_APP_ID,
    name: "default-target",
  };
}

function resolveAutoConfiguredAppId(): string | undefined {
  if (mcpFirewallDefaultAppId) {
    return mcpFirewallDefaultAppId;
  }
  const enabled = [...downstreamAppRegistry.values()].filter((app) => app.enabled);
  if (enabled.length === 1) {
    return enabled[0].id;
  }
  return undefined;
}

type RuntimeRouteMode =
  | "execution_order"
  | "default_app"
  | "default_target"
  | "single_app"
  | "marketplace"
  | "none";

function buildRuntimeStatus() {
  const activeDownstreamApps = listDownstreamApps(downstreamAppRegistry, false);
  const activeDownstreamIds = activeDownstreamApps.map((app) => app.id);
  const singleActiveAppId = activeDownstreamApps.length === 1 ? activeDownstreamApps[0]?.id : undefined;

  let routeMode: RuntimeRouteMode = "none";
  let routeSummary = "none";

  if (mcpExecutionOrderAppIds.length > 0) {
    routeMode = "execution_order";
    routeSummary = `execution_order:${mcpExecutionOrderAppIds.join("->")}`;
  } else if (mcpFirewallDefaultAppId) {
    routeMode = "default_app";
    routeSummary = `default_app:${mcpFirewallDefaultAppId}`;
  } else if (mcpProxyDefaultTargetUrl) {
    routeMode = "default_target";
    routeSummary = `default_target:${mcpProxyDefaultTargetUrl}`;
  } else if (singleActiveAppId) {
    routeMode = "single_app";
    routeSummary = `single_app:${singleActiveAppId}`;
  } else if (mcpMarketplaceEnabled) {
    routeMode = "marketplace";
    routeSummary = "marketplace:auto";
  }

  return {
    strict: true,
    routeLock: mcpRouteLockEnabled,
    routeMode,
    routeSummary,
    bypassAllowed: false,
    executionOrder: [...mcpExecutionOrderAppIds],
    defaultAppId: mcpFirewallDefaultAppId ?? null,
    defaultTargetUrl: mcpProxyDefaultTargetUrl ?? null,
    dynamicTargetsAllowed: mcpProxyAllowDynamicTargets,
    privateTargetsAllowed: mcpProxyAllowPrivateTargets,
    allowedHosts: [...mcpProxyAllowedHosts],
    marketplaceEnabled: mcpMarketplaceEnabled,
    marketplaceAutoConnectEnabled: mcpMarketplaceAutoConnectEnabled,
    smitheryEnabled,
    mcpsoEnabled: mcpSoEnabled,
    activeDownstreamCount: activeDownstreamApps.length,
    activeDownstreamIds,
    activeDownstreamApps,
  };
}

function resolveDownstreamApp(appId: string): DownstreamAppConfig {
  const app = downstreamAppRegistry.get(appId);
  if (!app && appId === MAPLE_DEFAULT_TARGET_APP_ID) {
    const defaultTargetApp = resolveDefaultTargetApp();
    if (defaultTargetApp) {
      return defaultTargetApp;
    }
  }
  if (!app) {
    throw new Error(`Downstream app "${appId}" is not configured.`);
  }
  if (!app.enabled) {
    throw new Error(`Downstream app "${appId}" is disabled.`);
  }
  return app;
}

function isSmitheryDownstreamApp(app: DownstreamAppConfig): boolean {
  return app.id.startsWith("smithery-") || app.description?.startsWith("[smithery] ") === true;
}

function isMcpSoDownstreamApp(app: DownstreamAppConfig): boolean {
  return app.id.startsWith("mcpso-") || app.description?.startsWith("[mcpso] ") === true;
}

type MarketplaceProvider = "smithery" | "mcpso";

interface MarketplaceSearchEntry {
  provider: MarketplaceProvider;
  id: string;
  title: string;
  description?: string;
  sourceUrl?: string;
  appIdSuggestion: string;
  connectable?: boolean;
  resolvedMcpUrl?: string;
  allowCall?: boolean;
}

interface MarketplaceResolvedServer {
  provider: MarketplaceProvider;
  id: string;
  title: string;
  description?: string;
  sourceUrl?: string;
  appIdSuggestion: string;
  mcpUrl?: string;
  defaultToolAllowlist?: string[];
}

interface RegisterMarketplaceDownstreamOptions {
  provider: MarketplaceProvider;
  id: string;
  overwrite?: boolean;
  appId?: string;
  name?: string;
  enabled?: boolean;
  timeoutMs?: number;
  resolvedTitle?: string;
  resolvedDescription?: string;
  resolvedSourceUrl?: string;
  resolvedMcpUrl?: string;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  apiKey?: string;
  authHeader?: string;
  authScheme?: "raw" | "bearer";
  toolAllowlist?: string[];
  restrictToCatalogTools?: boolean;
}

function parseMarketplaceProvider(value: unknown): MarketplaceProvider | "all" | undefined {
  const normalized = asString(value)?.toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (normalized === "all") {
    return "all";
  }
  if (normalized === "smithery" || normalized === "mcpso") {
    return normalized;
  }
  return undefined;
}

function parseMcpSoSlug(value: string): { slug?: string; serverUrl?: string } {
  const normalized = value.trim();
  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    return {
      serverUrl: normalized,
    };
  }
  return {
    slug: normalized.replace(/^\/+/, "").replace(/^server\//, ""),
  };
}

function normalizeMarketplaceId(provider: MarketplaceProvider, rawId: string): string {
  const trimmed = rawId.trim();
  if (provider === "smithery") {
    return trimmed;
  }
  const mcpSoParsed = parseMcpSoSlug(trimmed);
  if (mcpSoParsed.serverUrl) {
    try {
      const parsed = new URL(mcpSoParsed.serverUrl);
      if (parsed.pathname.startsWith("/server/")) {
        return parsed.pathname.replace(/^\/server\//, "").replace(/\/+$/, "");
      }
    } catch {
      return trimmed;
    }
  }
  return mcpSoParsed.slug ?? trimmed;
}

async function searchMarketplaceServers(options: {
  provider?: MarketplaceProvider | "all";
  query?: string;
  limit?: number;
}): Promise<MarketplaceSearchEntry[]> {
  const provider = options.provider ?? "all";
  const limit = options.limit ? Math.max(1, Math.min(100, Math.trunc(options.limit))) : 20;
  const query = asString(options.query);
  const requests: Array<Promise<MarketplaceSearchEntry[]>> = [];

  if ((provider === "all" || provider === "smithery") && smitheryEnabled) {
    requests.push(
      withAbortTimeout(smitheryTimeoutMs, (signal) =>
        listSmitheryServers({
          apiBaseUrl: smitheryApiBaseUrl,
          apiKey: smitheryApiKey,
          signal,
          query,
          page: 1,
          pageSize: Math.max(limit, 20),
        })
      ).then((smithery) =>
        smithery.servers.map((server) => {
          const id = server.qualifiedName;
          return {
            provider: "smithery" as const,
            id,
            title: server.displayName ?? id,
            description: server.description,
            sourceUrl: `https://smithery.ai/server/${encodeURIComponent(id)}`,
            appIdSuggestion: toSmitheryDownstreamAppId(id),
            connectable: server.isDeployed,
          };
        })
      )
    );
  }

  if ((provider === "all" || provider === "mcpso") && mcpSoEnabled) {
    requests.push(
      withAbortTimeout(mcpSoTimeoutMs, (signal) =>
        searchMcpSoServers({
          baseUrl: mcpSoBaseUrl,
          signal,
          query,
          limit: Math.max(limit, 20),
        })
      ).then((mcpSo) =>
        mcpSo.map((server) => {
          const id = server.slug || server.id;
          return {
            provider: "mcpso" as const,
            id,
            title: server.title,
            description: server.description,
            sourceUrl: server.sourceUrl,
            allowCall: server.allowCall,
            appIdSuggestion: toMcpSoDownstreamAppId(server.slug),
            connectable: Boolean(server.resolvedMcpUrl),
            resolvedMcpUrl: server.resolvedMcpUrl,
          };
        })
      )
    );
  }

  const entries = (await Promise.all(requests)).flat();
  const prioritized = [...entries].sort((a, b) => {
    const rank = (entry: MarketplaceSearchEntry): number => {
      if (entry.connectable === true) {
        return 2;
      }
      if (entry.connectable === false) {
        return 0;
      }
      return 1;
    };
    return rank(b) - rank(a);
  });
  const deduped = dedupeBy(prioritized, (entry) => `${entry.provider}:${entry.id.toLowerCase()}`);
  return deduped.slice(0, limit);
}

async function resolveMarketplaceServer(options: {
  provider: MarketplaceProvider;
  id: string;
}): Promise<MarketplaceResolvedServer> {
  if (options.provider === "smithery") {
    const detail = await withAbortTimeout(smitheryTimeoutMs, (signal) =>
      fetchSmitheryServerDetails(options.id, {
        apiBaseUrl: smitheryApiBaseUrl,
        apiKey: smitheryApiKey,
        signal,
      })
    );
    const deploymentUrl = resolveSmitheryDeploymentUrl(detail);
    const allowlist = Array.isArray(detail.tools)
      ? detail.tools
          .map((tool) => asString(tool.name))
          .filter((name): name is string => Boolean(name))
      : [];
    return {
      provider: "smithery",
      id: detail.qualifiedName,
      title: detail.displayName ?? detail.qualifiedName,
      description: detail.description,
      sourceUrl: `https://smithery.ai/server/${encodeURIComponent(detail.qualifiedName)}`,
      appIdSuggestion: toSmitheryDownstreamAppId(detail.qualifiedName),
      mcpUrl: deploymentUrl,
      defaultToolAllowlist: allowlist,
    };
  }

  const parsed = parseMcpSoSlug(options.id);
  const detail = await withAbortTimeout(mcpSoTimeoutMs, (signal) =>
    resolveMcpSoServerDetails({
      baseUrl: mcpSoBaseUrl,
      signal,
      slug: parsed.slug,
      serverUrl: parsed.serverUrl,
    })
  );
  return {
    provider: "mcpso",
    id: detail.slug || detail.id,
    title: detail.title,
    description: detail.description,
    sourceUrl: detail.pageUrl,
    appIdSuggestion: toMcpSoDownstreamAppId(detail.slug),
    mcpUrl: resolveMcpSoDeploymentUrl({
      sse_url: detail.sseUrl,
      server_config: detail.serverConfig,
      server_command: detail.serverCommand,
      url: detail.sourceUrl,
    }),
  };
}

async function registerMarketplaceDownstream(
  options: RegisterMarketplaceDownstreamOptions
): Promise<{
  app: DownstreamAppConfig;
  appId: string;
  provider: MarketplaceProvider;
  resolved: MarketplaceResolvedServer;
  replaced: boolean;
}> {
  const preResolvedMcpUrl = asString(options.resolvedMcpUrl);
  const resolved = preResolvedMcpUrl
    ? {
        provider: options.provider,
        id: options.id,
        title: options.resolvedTitle ?? options.name ?? options.id,
        description: options.resolvedDescription,
        sourceUrl: options.resolvedSourceUrl,
        appIdSuggestion:
          options.provider === "smithery"
            ? toSmitheryDownstreamAppId(options.id)
            : toMcpSoDownstreamAppId(options.id),
        mcpUrl: preResolvedMcpUrl,
      }
    : await resolveMarketplaceServer({
        provider: options.provider,
        id: options.id,
      });
  if (!resolved.mcpUrl) {
    throw new Error(
      `${resolved.provider} server "${resolved.id}" does not expose a public HTTP MCP endpoint.`
    );
  }

  const normalizedMcpUrl = normalizeDynamicMcpUrl(resolved.mcpUrl);
  const mcpUrl = buildUrlWithQueryParams(normalizedMcpUrl, options.query ?? {});
  const appId = options.appId ?? resolved.appIdSuggestion;
  const existing = downstreamAppRegistry.get(appId);
  if (existing && !options.overwrite) {
    throw new Error(`Downstream app "${appId}" already exists. Set overwrite=true to replace it.`);
  }

  const timeoutMs = options.timeoutMs
    ? Math.max(1_000, Math.min(60_000, Math.trunc(options.timeoutMs)))
    : 12_000;
  const authHeader = options.authHeader?.trim() || "authorization";
  const authScheme = options.authScheme === "raw" ? "raw" : "bearer";
  const allowlist =
    options.toolAllowlist && options.toolAllowlist.length > 0
      ? options.toolAllowlist
      : options.restrictToCatalogTools !== false && resolved.defaultToolAllowlist && resolved.defaultToolAllowlist.length > 0
        ? resolved.defaultToolAllowlist
        : undefined;

  const app: DownstreamAppConfig = {
    id: appId,
    name: options.name ?? resolved.title,
    description: `[${resolved.provider}] ${resolved.id}${resolved.description ? ` - ${resolved.description}` : ""}`,
    mcpUrl,
    enabled: options.enabled ?? true,
    timeoutMs,
    apiKey:
      options.apiKey ??
      (resolved.provider === "smithery" ? smitheryApiKey : undefined),
    authHeader,
    authScheme,
    headers: options.headers && Object.keys(options.headers).length > 0 ? options.headers : undefined,
    toolAllowlist: allowlist,
  };
  downstreamAppRegistry.set(appId, app);
  clearDownstreamToolsCache(appId);
  return {
    app,
    appId,
    provider: resolved.provider,
    resolved,
    replaced: Boolean(existing),
  };
}

function buildUrlWithQueryParams(baseUrl: string, params: Record<string, string>): string {
  const parsed = new URL(baseUrl);
  for (const [key, value] of Object.entries(params)) {
    const normalizedKey = key.trim();
    const normalizedValue = value.trim();
    if (!normalizedKey || !normalizedValue) {
      continue;
    }
    parsed.searchParams.set(normalizedKey, normalizedValue);
  }
  return parsed.toString();
}

function resolveDispatchAppIds(options: {
  explicitChain?: unknown;
  fallbackAppId?: string;
  includeDefaultExecutionOrder?: boolean;
}): string[] {
  const explicit = parseAppIdList(options.explicitChain);
  if (explicit.length > 0) {
    explicit.forEach((appId) => resolveDownstreamApp(appId));
    return explicit;
  }

  if ((options.includeDefaultExecutionOrder ?? true) && mcpExecutionOrderAppIds.length > 0) {
    mcpExecutionOrderAppIds.forEach((appId) => resolveDownstreamApp(appId));
    return [...mcpExecutionOrderAppIds];
  }

  const fallbackAppId = asString(options.fallbackAppId) ?? resolveAutoConfiguredAppId();
  if (!fallbackAppId) {
    if (mcpProxyDefaultTargetUrl) {
      return [MAPLE_DEFAULT_TARGET_APP_ID];
    }
    throw new Error(
      "No downstream app resolved. Provide appId, chainAppIds, set MAPLE_MCP_EXECUTION_ORDER, or set MAPLE_MCP_PROXY_DEFAULT_TARGET_URL."
    );
  }
  resolveDownstreamApp(fallbackAppId);
  return [fallbackAppId];
}

function toDynamicDownstreamAppConfig(rawUrl: string): DownstreamAppConfig {
  const normalizedUrl = normalizeDynamicMcpUrl(rawUrl);
  const parsed = new URL(normalizedUrl);
  const id = `dynamic-${parsed.host.replace(/[^a-z0-9.-]+/gi, "-").toLowerCase()}`;
  return {
    id,
    name: id,
    mcpUrl: normalizedUrl,
    enabled: true,
    timeoutMs: 12_000,
    authHeader: "authorization",
    authScheme: "raw",
  };
}

function toPublicDownstreamApp(app: DownstreamAppConfig): DownstreamAppInfo {
  return {
    id: app.id,
    name: app.name,
    description: app.description,
    mcpUrl: app.mcpUrl,
    enabled: app.enabled,
    timeoutMs: app.timeoutMs,
    authHeader: app.authHeader,
    authScheme: app.authScheme,
    hasApiKey: Boolean(app.apiKey),
    headerKeys: app.headers ? Object.keys(app.headers) : [],
    toolAllowlist: app.toolAllowlist,
  };
}

function applyToolAllowlist(app: DownstreamAppConfig, tools: Array<Record<string, unknown>>) {
  const allowlist = app.toolAllowlist;
  if (!allowlist || allowlist.length === 0) {
    return tools;
  }
  return tools.filter((tool) => {
    const name = asString(tool.name);
    return Boolean(name && allowlist.includes(name));
  });
}

interface McpProxyTargetResolution {
  app: DownstreamAppConfig;
  mode: "configured" | "dynamic";
}

interface MarketplaceToolEntry {
  appId: string;
  appName: string;
  toolName: string;
  qualifiedName: string;
  description?: string;
  inputSchema?: unknown;
}

interface MarketplaceCatalogResult {
  appIds: string[];
  tools: MarketplaceToolEntry[];
  warnings: Array<{ appId: string; message: string }>;
}

interface MarketplaceControlToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const MARKETPLACE_CONTROL_TOOLS: MarketplaceControlToolDefinition[] = [
  {
    name: "maple_get_started",
    description:
      "LLM quickstart for Maple routing. Returns the exact next MCP calls (search/connect/call) based on current Maple state so no UI steps are required.",
    inputSchema: {
      type: "object",
      properties: {
        goal: {
          type: "string",
          description: "Optional task goal (for example: weather lookup, web search, crm read).",
        },
        provider: {
          type: "string",
          enum: ["all", "smithery", "mcpso"],
          description: "Marketplace provider preference for suggested next calls.",
        },
      },
    },
  },
  {
    name: "maple_autoroute_call",
    description:
      "One-call execution path for LLMs: resolve downstream app, optionally auto-connect from marketplace, then call the requested tool through Maple firewall.",
    inputSchema: {
      type: "object",
      properties: {
        toolName: {
          type: "string",
          description: "Tool name to execute. Supports plain toolName or namespaced appId::toolName.",
        },
        arguments: {
          type: "object",
          description: "Arguments for the downstream tool call.",
        },
        appId: {
          type: "string",
          description: "Optional explicit downstream app ID.",
        },
        sessionId: {
          type: "string",
          description: "Optional session ID used for trace grouping.",
        },
        traceId: {
          type: "string",
          description: "Optional existing trace ID to append to.",
        },
        autoConnect: {
          type: "boolean",
          description: "If true and tool is unresolved, Maple searches/connects marketplace apps automatically.",
        },
        provider: {
          type: "string",
          enum: ["all", "smithery", "mcpso"],
          description: "Marketplace provider used for auto-connect lookup.",
        },
        searchQuery: {
          type: "string",
          description: "Optional marketplace search query. Defaults to toolName.",
        },
        searchLimit: {
          type: "number",
          minimum: 1,
          maximum: 20,
          description: "Maximum marketplace entries to try during auto-connect.",
        },
      },
      required: ["toolName"],
    },
  },
  {
    name: "maple_marketplace_search",
    description:
      "Search MCP marketplaces (Smithery and MCP.so) and return connectable servers Maple can route through firewall policy.",
    inputSchema: {
      type: "object",
      properties: {
        provider: {
          type: "string",
          enum: ["all", "smithery", "mcpso"],
          description: "Marketplace provider to search. Default is all.",
        },
        query: {
          type: "string",
          description: "Search query.",
        },
        limit: {
          type: "number",
          minimum: 1,
          maximum: 50,
          description: "Maximum results to return.",
        },
      },
    },
  },
  {
    name: "maple_marketplace_connect",
    description:
      "Connect/register a marketplace server as a downstream MCP app in Maple so tools can be called through Maple firewall.",
    inputSchema: {
      type: "object",
      properties: {
        provider: {
          type: "string",
          enum: ["smithery", "mcpso"],
          description: "Marketplace provider.",
        },
        id: {
          type: "string",
          description:
            "Server identifier. Smithery: qualifiedName (@owner/name). MCP.so: slug (name/author) or full server URL.",
        },
        appId: {
          type: "string",
          description: "Optional custom downstream app ID.",
        },
        overwrite: {
          type: "boolean",
          description: "Replace existing app with same appId.",
        },
        timeoutMs: {
          type: "number",
          minimum: 1000,
          maximum: 60000,
          description: "Per-request timeout for downstream app.",
        },
      },
      required: ["provider", "id"],
    },
  },
  {
    name: "maple_marketplace_connected_apps",
    description: "List currently connected marketplace apps registered in Maple.",
    inputSchema: {
      type: "object",
      properties: {
        provider: {
          type: "string",
          enum: ["all", "smithery", "mcpso"],
          description: "Optional provider filter.",
        },
      },
    },
  },
  {
    name: "maple_marketplace_disconnect",
    description: "Disconnect/unregister a connected marketplace app from Maple.",
    inputSchema: {
      type: "object",
      properties: {
        appId: {
          type: "string",
          description: "Downstream app ID to remove.",
        },
      },
      required: ["appId"],
    },
  },
];

function getMarketplaceControlTools() {
  if (!mcpMarketplaceEnabled) {
    return [] as MarketplaceControlToolDefinition[];
  }
  return MARKETPLACE_CONTROL_TOOLS;
}

function isMarketplaceControlToolName(toolName: string): boolean {
  return getMarketplaceControlTools().some((tool) => tool.name === toolName);
}

const MAPLE_NATIVE_TOOL_NAMES = new Set<string>([
  "observe_session",
  "replay_fork",
  "audit_risk",
  "ml_anomaly_report",
  "guard_action",
  "ingest_session_event",
  "share_trace_anon",
  "suggest_evolved_skills",
  "yc_app_brief",
  "list_traces",
  "export_trace",
  "list_downstream_apps",
  "list_downstream_tools",
  "dispatch_downstream_tool",
]);

function isMapleNativeToolName(toolName: string): boolean {
  return MAPLE_NATIVE_TOOL_NAMES.has(toolName);
}

function namespaceMarketplaceToolName(appId: string, toolName: string): string {
  return `${appId}::${toolName}`;
}

function parseMarketplaceToolName(value: string): { appId: string; toolName: string } | undefined {
  const separatorIndex = value.indexOf("::");
  if (separatorIndex <= 0) {
    return undefined;
  }
  const appId = value.slice(0, separatorIndex).trim();
  const toolName = value.slice(separatorIndex + 2).trim();
  if (!appId || !toolName) {
    return undefined;
  }
  return {
    appId,
    toolName,
  };
}

function filterAllowedDownstreamTools(
  app: DownstreamAppConfig,
  tools: DownstreamToolInfo[]
): DownstreamToolInfo[] {
  const allowlist = app.toolAllowlist;
  if (!allowlist || allowlist.length === 0) {
    return tools;
  }
  return tools.filter((tool) => allowlist.includes(tool.name));
}

function resolveMarketplaceAppIds(target: McpProxyTargetResolution): string[] {
  if (target.mode === "dynamic") {
    return [target.app.id];
  }

  if (mcpExecutionOrderAppIds.length > 0) {
    return [...new Set(mcpExecutionOrderAppIds)];
  }

  if (mcpFirewallDefaultAppId) {
    return [mcpFirewallDefaultAppId];
  }

  const auto = resolveAutoConfiguredAppId();
  if (auto) {
    return [auto];
  }

  if (!mcpRouteLockEnabled) {
    const enabled = [...downstreamAppRegistry.values()]
      .filter((app) => app.enabled)
      .map((app) => app.id);
    if (enabled.length > 0) {
      return enabled;
    }
  }

  return [target.app.id];
}

async function buildMarketplaceCatalog(
  target: McpProxyTargetResolution
): Promise<MarketplaceCatalogResult> {
  const appIds = resolveMarketplaceAppIds(target);
  return buildMarketplaceCatalogForAppIds(appIds);
}

function listEnabledDownstreamAppIds(): string[] {
  return [...downstreamAppRegistry.values()]
    .filter((app) => app.enabled)
    .map((app) => app.id);
}

async function buildMarketplaceCatalogForAppIds(
  appIds: string[]
): Promise<MarketplaceCatalogResult> {
  const uniqueAppIds = [...new Set(appIds)];
  const warnings: Array<{ appId: string; message: string }> = [];
  const tools: MarketplaceToolEntry[] = [];

  const results = await Promise.all(
    uniqueAppIds.map(async (appId) => {
      try {
        const app = resolveDownstreamApp(appId);
        const listed = await listToolsFromDownstreamCached(app);
        return {
          appId,
          app,
          tools: filterAllowedDownstreamTools(app, listed.tools),
          error: undefined,
        };
      } catch (error) {
        return {
          appId,
          app: undefined,
          tools: [] as DownstreamToolInfo[],
          error: errorMessage(error),
        };
      }
    })
  );

  for (const result of results) {
    if (!result.app) {
      warnings.push({
        appId: result.appId,
        message: result.error ?? "Unknown marketplace listing error.",
      });
      continue;
    }

    for (const tool of result.tools) {
      tools.push({
        appId: result.app.id,
        appName: result.app.name,
        toolName: tool.name,
        qualifiedName: namespaceMarketplaceToolName(result.app.id, tool.name),
        description: tool.description,
        inputSchema: tool.inputSchema,
      });
    }
  }

  return {
    appIds: uniqueAppIds,
    tools,
    warnings,
  };
}

function classifyMarketplaceProviderForApp(
  app: DownstreamAppConfig
): MarketplaceProvider | undefined {
  if (isSmitheryDownstreamApp(app)) {
    return "smithery";
  }
  if (isMcpSoDownstreamApp(app)) {
    return "mcpso";
  }
  return undefined;
}

function localToolResult(payload: unknown) {
  let textPayload = "";
  try {
    textPayload = JSON.stringify(payload, null, 2);
  } catch {
    textPayload = String(payload ?? "");
  }
  return {
    content: [
      {
        type: "text",
        text: textPayload,
      },
    ],
    structuredContent: payload,
  };
}

interface AutoRouteToolMatch {
  appId: string;
  appName: string;
  toolName: string;
  qualifiedName: string;
  source: "connected" | "auto_connected";
}

async function findConnectedToolMatches(
  toolName: string,
  appIds?: string[]
): Promise<AutoRouteToolMatch[]> {
  const normalizedTool = toolName.trim();
  if (!normalizedTool) {
    return [];
  }
  const candidates = [...new Set(appIds && appIds.length > 0 ? appIds : listEnabledDownstreamAppIds())];
  const matches: AutoRouteToolMatch[] = [];

  const results = await Promise.all(
    candidates.map(async (appId) => {
      try {
        const app = resolveDownstreamApp(appId);
        const listed = await listToolsFromDownstreamCached(app);
        const allowedTools = filterAllowedDownstreamTools(app, listed.tools);
        const exact = allowedTools.find((tool) => tool.name === normalizedTool);
        if (!exact) {
          return undefined;
        }
        return {
          appId: app.id,
          appName: app.name,
          toolName: exact.name,
          qualifiedName: namespaceMarketplaceToolName(app.id, exact.name),
        };
      } catch {
        return undefined;
      }
    })
  );

  for (const result of results) {
    if (!result) {
      continue;
    }
    matches.push({
      ...result,
      source: "connected",
    });
  }
  return matches;
}

function buildMapleGetStartedPlan(options: {
  goal?: string;
  provider: MarketplaceProvider | "all";
  connectedApps: Array<{
    id: string;
    name: string;
    provider?: MarketplaceProvider;
  }>;
}) {
  const goal = options.goal ?? "general task";
  if (options.connectedApps.length > 0) {
    return {
      mode: "ready",
      message:
        "Maple already has connected downstream apps. Call maple_autoroute_call with the desired toolName to execute without UI steps.",
      nextCalls: [
        {
          step: 1,
          method: "tools/call",
          params: {
            name: "maple_autoroute_call",
            arguments: {
              toolName: "replace_with_tool_name",
              arguments: {},
              autoConnect: true,
            },
          },
        },
      ],
      guidance: [
        "Run tools/list to inspect currently available downstream tools.",
        "If multiple apps expose the same tool, pass appId or use appId::toolName.",
      ],
    };
  }

  return {
    mode: "needs_connection",
    message:
      "No downstream apps are connected yet. Use the next calls below in order; no dashboard buttons are required.",
    nextCalls: [
      {
        step: 1,
        method: "tools/call",
        params: {
          name: "maple_marketplace_search",
          arguments: {
            provider: options.provider,
            query: goal,
            limit: 5,
          },
        },
      },
      {
        step: 2,
        method: "tools/call",
        params: {
          name: "maple_marketplace_connect",
          arguments: {
            provider: options.provider === "all" ? "mcpso" : options.provider,
            id: "choose_id_from_step_1",
          },
        },
      },
      {
        step: 3,
        method: "tools/call",
        params: {
          name: "maple_autoroute_call",
          arguments: {
            toolName: "replace_with_tool_name",
            arguments: {},
            autoConnect: true,
          },
        },
      },
    ],
    guidance: [
      "Prefer maple_autoroute_call for execution; it resolves/auto-connects apps when possible.",
      "Use maple_marketplace_connected_apps to verify connected app IDs.",
    ],
  };
}

async function autoConnectAndResolveToolMatch(options: {
  toolName: string;
  provider: MarketplaceProvider | "all";
  searchQuery: string;
  searchLimit: number;
}): Promise<{
  match?: AutoRouteToolMatch;
  entries: MarketplaceSearchEntry[];
  attempted: string[];
  warnings: string[];
}> {
  const entries = await searchMarketplaceServers({
    provider: options.provider,
    query: options.searchQuery,
    limit: options.searchLimit,
  });
  const prioritizedEntries = [...entries].sort((a, b) => {
    const rank = (entry: MarketplaceSearchEntry): number => {
      if (entry.connectable === true) {
        return 2;
      }
      if (entry.connectable === false) {
        return 0;
      }
      return 1;
    };
    return rank(b) - rank(a);
  });
  const attempted: string[] = [];
  const warnings: string[] = [];

  for (const entry of prioritizedEntries) {
    const normalizedId = normalizeMarketplaceId(entry.provider, entry.id);
    const appId = entry.appIdSuggestion;
    attempted.push(`${entry.provider}:${entry.id}`);

    if (entry.connectable === false) {
      warnings.push(
        `${entry.provider}:${entry.id}: skipped because no request/response HTTP MCP endpoint was advertised`
      );
      continue;
    }

    if (!downstreamAppRegistry.has(appId)) {
      try {
        await registerMarketplaceDownstream({
          provider: entry.provider,
          id: normalizedId,
          appId,
          overwrite: false,
          restrictToCatalogTools: true,
          resolvedTitle: entry.title,
          resolvedDescription: entry.description,
          resolvedSourceUrl: entry.sourceUrl,
          resolvedMcpUrl: entry.resolvedMcpUrl,
        });
      } catch (connectError) {
        warnings.push(`${entry.provider}:${entry.id}: ${errorMessage(connectError)}`);
        continue;
      }
    }

    const matches = await findConnectedToolMatches(options.toolName, [appId]);
    if (matches.length > 0) {
      return {
        match: {
          ...matches[0],
          source: "auto_connected",
        },
        entries: prioritizedEntries,
        attempted,
        warnings,
      };
    }
  }

  return {
    entries: prioritizedEntries,
    attempted,
    warnings,
  };
}

async function executeMarketplaceControlTool(
  toolName: string,
  toolArgs: Record<string, unknown>
) {
  if (toolName === "maple_get_started") {
    const provider = parseMarketplaceProvider(toolArgs.provider) ?? "all";
    const goal = asString(toolArgs.goal);
    const connectedApps = listDownstreamApps(downstreamAppRegistry, false).map((entry) => {
      const raw = downstreamAppRegistry.get(entry.id);
      return {
        id: entry.id,
        name: entry.name,
        provider: raw ? classifyMarketplaceProviderForApp(raw) : undefined,
      };
    });
    const runtime = buildRuntimeStatus();
    const plan = buildMapleGetStartedPlan({
      goal,
      provider,
      connectedApps,
    });
    return localToolResult({
      ok: true,
      action: "get_started",
      provider,
      goal: goal ?? null,
      runtime: {
        routeMode: runtime.routeMode,
        routeSummary: runtime.routeSummary,
        routeLock: runtime.routeLock,
        marketplaceEnabled: runtime.marketplaceEnabled,
        connectedAppCount: connectedApps.length,
      },
      connectedApps,
      ...plan,
    });
  }

  if (toolName === "maple_autoroute_call") {
    const requestedToolName = asString(toolArgs.toolName);
    if (!requestedToolName) {
      throw new Error("toolName is required.");
    }
    const explicitAppId = asString(toolArgs.appId);
    const parsedQualified = parseMarketplaceToolName(requestedToolName);
    const normalizedToolName = parsedQualified?.toolName ?? requestedToolName;
    const appIdHint = parsedQualified?.appId ?? explicitAppId;
    const downstreamArgs =
      toolArgs.arguments && typeof toolArgs.arguments === "object" && !Array.isArray(toolArgs.arguments)
        ? (toolArgs.arguments as Record<string, unknown>)
        : {};
    const sessionId =
      asString(toolArgs.sessionId) ??
      `mcp-autoroute-${(appIdHint ?? normalizedToolName).replace(/[^a-z0-9_-]+/gi, "-").toLowerCase()}`;
    const traceId = asString(toolArgs.traceId);
    const autoConnect = asBoolean(toolArgs.autoConnect, true);
    const provider = parseMarketplaceProvider(toolArgs.provider) ?? "all";
    const searchQuery = asString(toolArgs.searchQuery) ?? normalizedToolName;
    const searchLimitRaw = asNumber(toolArgs.searchLimit);
    const searchLimit = searchLimitRaw
      ? Math.max(1, Math.min(20, Math.trunc(searchLimitRaw)))
      : 8;

    let selectedMatch: AutoRouteToolMatch | undefined;
    let autoConnectContext:
      | {
          entries: MarketplaceSearchEntry[];
          attempted: string[];
          warnings: string[];
        }
      | undefined;

    if (appIdHint) {
      const explicitMatches = await findConnectedToolMatches(normalizedToolName, [appIdHint]);
      if (explicitMatches.length === 0) {
        throw new Error(
          `Tool "${normalizedToolName}" is not available on app "${appIdHint}". Run tools/list and choose an available tool name.`
        );
      }
      selectedMatch = explicitMatches[0];
    } else {
      const connectedMatches = await findConnectedToolMatches(normalizedToolName);
      if (connectedMatches.length === 1) {
        selectedMatch = connectedMatches[0];
      } else if (connectedMatches.length > 1) {
        return localToolResult({
          ok: false,
          action: "autoroute_call",
          status: "ambiguous_tool",
          message:
            `Tool "${normalizedToolName}" exists in multiple apps. Specify appId or use namespaced appId::toolName.`,
          matches: connectedMatches.map((match) => ({
            appId: match.appId,
            appName: match.appName,
            qualifiedName: match.qualifiedName,
          })),
        });
      } else if (autoConnect) {
        const autoConnected = await autoConnectAndResolveToolMatch({
          toolName: normalizedToolName,
          provider,
          searchQuery,
          searchLimit,
        });
        autoConnectContext = {
          entries: autoConnected.entries,
          attempted: autoConnected.attempted,
          warnings: autoConnected.warnings,
        };
        if (autoConnected.match) {
          selectedMatch = autoConnected.match;
        }
      }
    }

    if (!selectedMatch) {
      return localToolResult({
        ok: false,
        action: "autoroute_call",
        status: "tool_not_resolved",
        message:
          `Could not resolve tool "${normalizedToolName}" to a connected downstream app.`,
        guidance: [
          "Run maple_marketplace_search to find candidate servers.",
          "Run maple_marketplace_connect to attach one server.",
          "Retry maple_autoroute_call with appId or namespaced appId::toolName.",
        ],
        autoConnect: autoConnectContext ?? null,
      });
    }

    const chainResult = await dispatchDownstreamChainAndLog({
      appIds: [selectedMatch.appId],
      toolName: selectedMatch.toolName,
      toolArgs: downstreamArgs,
      sessionId,
      traceId,
      origin: "mcp_proxy",
    });

    if (!chainResult.ok) {
      const failed = chainResult.finalResult;
      return localToolResult({
        ok: false,
        action: "autoroute_call",
        status: chainResult.blockedByPolicy ? "blocked_by_policy" : "dispatch_failed",
        appId: failed.app.id,
        qualifiedToolName: namespaceMarketplaceToolName(failed.app.id, selectedMatch.toolName),
        toolName: selectedMatch.toolName,
        requestedToolName,
        blockedByPolicy: chainResult.blockedByPolicy,
        policyWouldBlock: failed.preExecutionWouldBlock,
        traceId: failed.trace.id,
        sessionId: failed.trace.sessionId,
        stepIndex: failed.step.index,
        preExecutionStepIndex: failed.preExecutionStep.index,
        policy: toPolicySnapshot(failed.preExecutionDecision),
        chainStages: chainResult.stages,
        error: failed.failure ?? "Downstream dispatch failed.",
      });
    }

    const final = chainResult.finalResult;
    return localToolResult({
      ok: true,
      action: "autoroute_call",
      status: "executed",
      source: selectedMatch.source,
      appId: final.app.id,
      appName: selectedMatch.appName,
      qualifiedToolName: namespaceMarketplaceToolName(final.app.id, selectedMatch.toolName),
      toolName: selectedMatch.toolName,
      requestedToolName,
      traceId: final.trace.id,
      sessionId: final.trace.sessionId,
      stepIndex: final.step.index,
      preExecutionStepIndex: final.preExecutionStep.index,
      policyWouldBlock: final.preExecutionWouldBlock,
      policy: toPolicySnapshot(final.preExecutionDecision),
      chainStages: chainResult.stages,
      downstreamResult: final.dispatch?.result ?? null,
    });
  }

  if (toolName === "maple_marketplace_search") {
    const provider = parseMarketplaceProvider(toolArgs.provider) ?? "all";
    const query = asString(toolArgs.query);
    const limitRaw = asNumber(toolArgs.limit);
    const limit = limitRaw ? Math.max(1, Math.min(50, Math.trunc(limitRaw))) : 12;
    const entries = await searchMarketplaceServers({
      provider,
      query,
      limit,
    });
    return localToolResult({
      provider,
      query: query ?? null,
      count: entries.length,
      entries,
    });
  }

  if (toolName === "maple_marketplace_connect") {
    const provider = parseMarketplaceProvider(toolArgs.provider);
    if (provider !== "smithery" && provider !== "mcpso") {
      throw new Error("provider must be smithery or mcpso.");
    }
    const rawId = asString(toolArgs.id);
    if (!rawId) {
      throw new Error("id is required.");
    }
    const normalizedId = normalizeMarketplaceId(provider, rawId);
    const timeoutMsRaw = asNumber(toolArgs.timeoutMs);
    const registered = await registerMarketplaceDownstream({
      provider,
      id: normalizedId,
      overwrite: asBoolean(toolArgs.overwrite, false),
      appId: asString(toolArgs.appId),
      name: asString(toolArgs.name),
      enabled: asBoolean(toolArgs.enabled, true),
      timeoutMs: timeoutMsRaw ? Math.max(1_000, Math.min(60_000, Math.trunc(timeoutMsRaw))) : undefined,
      query: asStringRecord(toolArgs.query),
      headers: asStringRecord(toolArgs.headers),
      apiKey: asString(toolArgs.apiKey),
      authHeader: asString(toolArgs.authHeader),
      authScheme: asString(toolArgs.authScheme)?.toLowerCase() === "raw" ? "raw" : "bearer",
      toolAllowlist: asStringArray(toolArgs.toolAllowlist),
      restrictToCatalogTools: asBoolean(toolArgs.restrictToCatalogTools, true),
    });
    return localToolResult({
      ok: true,
      action: "connect",
      provider: registered.provider,
      appId: registered.appId,
      replaced: registered.replaced,
      app: toPublicDownstreamApp(registered.app),
      resolved: registered.resolved,
    });
  }

  if (toolName === "maple_marketplace_connected_apps") {
    const provider = parseMarketplaceProvider(toolArgs.provider) ?? "all";
    const apps = listDownstreamApps(downstreamAppRegistry, true)
      .map((entry) => {
        const raw = downstreamAppRegistry.get(entry.id);
        if (!raw) {
          return undefined;
        }
        const detectedProvider = classifyMarketplaceProviderForApp(raw);
        if (!detectedProvider) {
          return undefined;
        }
        return {
          ...entry,
          provider: detectedProvider,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .filter((entry) => provider === "all" || entry.provider === provider);

    return localToolResult({
      provider,
      count: apps.length,
      apps,
    });
  }

  if (toolName === "maple_marketplace_disconnect") {
    const appId = asString(toolArgs.appId);
    if (!appId) {
      throw new Error("appId is required.");
    }
    const existing = downstreamAppRegistry.get(appId);
    if (!existing) {
      throw new Error(`Downstream app "${appId}" not found.`);
    }
    const provider = classifyMarketplaceProviderForApp(existing);
    if (!provider) {
      throw new Error(`Downstream app "${appId}" is not marketplace-managed.`);
    }
    downstreamAppRegistry.delete(appId);
    clearDownstreamToolsCache(appId);
    return localToolResult({
      ok: true,
      action: "disconnect",
      provider,
      appId,
    });
  }

  throw new Error(`Unsupported marketplace control tool: ${toolName}`);
}

function collectMcpRouteOverrideFields(c: {
  req: {
    header: (name: string) => string | undefined;
    query: (name: string) => string | undefined;
  };
}): string[] {
  const overrides: string[] = [];
  if (asString(c.req.header("x-maple-downstream-app"))) {
    overrides.push("x-maple-downstream-app");
  }
  if (asString(c.req.header("x-maple-chain-apps"))) {
    overrides.push("x-maple-chain-apps");
  }
  if (asString(c.req.header("x-maple-downstream-url"))) {
    overrides.push("x-maple-downstream-url");
  }
  if (asString(c.req.query("mapleApp"))) {
    overrides.push("mapleApp");
  }
  if (asString(c.req.query("mapleChain"))) {
    overrides.push("mapleChain");
  }
  if (asString(c.req.query("mapleTargetUrl"))) {
    overrides.push("mapleTargetUrl");
  }
  return overrides;
}

function resolveMcpProxyTarget(c: {
  req: {
    header: (name: string) => string | undefined;
    query: (name: string) => string | undefined;
  };
}): McpProxyTargetResolution | undefined {
  const bypassProxy =
    c.req.header("x-maple-proxy-bypass") === "1" || c.req.query("mapleProxy") === "off";
  if (bypassProxy) {
    throw new Error("MCP proxy bypass is disabled by policy.");
  }

  if (mcpRouteLockEnabled) {
    const overrides = collectMcpRouteOverrideFields(c);
    if (overrides.length > 0) {
      throw new Error(
        `MCP route-lock is enabled. Per-request route overrides are denied: ${overrides.join(", ")}.`
      );
    }
  }

  const dynamicUrl =
    asString(c.req.header("x-maple-downstream-url")) || asString(c.req.query("mapleTargetUrl"));
  if (dynamicUrl) {
    if (!mcpProxyAllowDynamicTargets) {
      throw new Error(
        "Dynamic MCP targets are disabled. Configure MAPLE_MCP_PROXY_ALLOW_DYNAMIC_TARGETS=true."
      );
    }
    return {
      app: toDynamicDownstreamAppConfig(dynamicUrl),
      mode: "dynamic",
    };
  }

  const autoDefaultAppId = resolveAutoConfiguredAppId();
  const executionOrderDefaultAppId =
    mcpExecutionOrderAppIds.length > 0 ? mcpExecutionOrderAppIds[0] : undefined;

  const appId =
    asString(c.req.header("x-maple-downstream-app")) ||
    asString(c.req.query("mapleApp")) ||
    mcpFirewallDefaultAppId ||
    executionOrderDefaultAppId ||
    autoDefaultAppId;
  if (appId) {
    return {
      app: resolveDownstreamApp(appId),
      mode: "configured",
    };
  }

  const defaultTargetApp = resolveDefaultTargetApp();
  if (defaultTargetApp) {
    return {
      app: defaultTargetApp,
      mode: "dynamic",
    };
  }

  const routeResolutionHint = mcpRouteLockEnabled
    ? "Set MAPLE_MCP_EXECUTION_ORDER, MAPLE_MCP_FIREWALL_DEFAULT_APP, MAPLE_MCP_PROXY_DEFAULT_TARGET_URL, or keep exactly one downstream app enabled."
    : "Set MAPLE_MCP_FIREWALL_DEFAULT_APP, MAPLE_MCP_EXECUTION_ORDER, MAPLE_MCP_PROXY_DEFAULT_TARGET_URL, send x-maple-downstream-app, or enable dynamic targets.";
  throw new Error(
    `No downstream target resolved for strict MCP firewall mode. ${routeResolutionHint}`
  );
}

function resolveProxyTrace(options: {
  traceId?: string;
  sessionId?: string;
  appId: string;
}): Trace {
  const traceId = options.traceId ? options.traceId.trim() : "";
  const sessionId = options.sessionId ? options.sessionId.trim() : "";

  if (traceId) {
    const existing = getTraceForCurrentOwner(traceId);
    if (!existing) {
      throw new Error(`Trace ${traceId} not found.`);
    }
    return existing;
  }

  if (sessionId) {
    const existing = getLatestTraceBySessionForCurrentOwner(sessionId);
    if (existing) {
      return existing;
    }
  }

  const nextSessionId = sessionId || `proxy-${Date.now().toString(36)}`;
  return createTraceForCurrentOwner({
    sessionId: nextSessionId,
    source: "manual",
    status: "active",
    metadata: {
      mode: "maple-downstream-proxy",
      downstreamAppId: options.appId,
      createdFromProxy: true,
    },
    steps: [],
  });
}

interface DownstreamDispatchLogResult {
  ok: boolean;
  blockedByPolicy: boolean;
  preExecutionWouldBlock: boolean;
  trace: Trace;
  step: TraceStep;
  preExecutionStep: TraceStep;
  preExecutionDecision: FirewallStepDecision;
  report: ReturnType<typeof analyzeTraceRisks>;
  app: DownstreamAppConfig;
  dispatch?: DownstreamCallResult;
  failure?: string;
}

interface DownstreamChainStage {
  index: number;
  appId: string;
  ok: boolean;
  blockedByPolicy: boolean;
  preExecutionWouldBlock: boolean;
  traceId: string;
  sessionId: string;
  stepIndex: number;
  preExecutionStepIndex: number;
  policy: ReturnType<typeof toPolicySnapshot>;
  failure?: string;
}

interface DownstreamChainDispatchResult {
  ok: boolean;
  blockedByPolicy: boolean;
  appIds: string[];
  stages: DownstreamChainStage[];
  finalResult: DownstreamDispatchLogResult;
  failure?: string;
}

interface DownstreamJsonRpcLogResult {
  ok: boolean;
  blockedByPolicy: boolean;
  preExecutionWouldBlock: boolean;
  trace: Trace;
  step: TraceStep;
  preExecutionStep: TraceStep;
  preExecutionDecision: FirewallStepDecision;
  report: ReturnType<typeof analyzeTraceRisks>;
  app: DownstreamAppConfig;
  forward?: DownstreamJsonRpcForwardResult;
  failure?: string;
}

async function dispatchDownstreamAndLog(options: {
  appId: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  traceId?: string;
  sessionId?: string;
  origin: "api" | "mcp" | "mcp_proxy";
}) {
  const app = resolveDownstreamApp(options.appId);
  const trace = resolveProxyTrace({
    traceId: options.traceId,
    sessionId: options.sessionId,
    appId: app.id,
  });

  const invocationSummary = toInvocationSummary(options.toolName, options.toolArgs);
  const preExecutionCandidateStep: TraceStep = {
    index: trace.steps.length,
    timestamp: new Date().toISOString(),
    actor: "agent",
    type: inferStepTypeFromDownstream(invocationSummary, options.toolName),
    prompt: `dispatch ${app.id}.${options.toolName}`,
    toolCall: {
      name: `${app.id}.${options.toolName}`,
      input: options.toolArgs,
    },
    output: invocationSummary,
    command: extractLikelyCommand(invocationSummary),
    externalUrl: extractFirstUrl(invocationSummary),
    metadata: {
      downstream: {
        appId: app.id,
        appName: app.name,
        toolName: options.toolName,
        origin: options.origin,
        stage: "pre_execution",
        mcpUrl: app.mcpUrl,
      },
    },
    riskScore: 0,
    riskFlags: [],
    guardStatus: "pending",
  };

  const preExecutionDecision = evaluateFirewallStep(preExecutionCandidateStep);
  const preExecutionWouldBlock = preExecutionDecision.shouldBlock;
  const preExecutionStep: TraceStep = {
    ...preExecutionDecision.step,
    index: trace.steps.length,
    timestamp: new Date().toISOString(),
    output: preExecutionWouldBlock
      ? truncateText(
          `Policy denied before downstream execution (${preExecutionDecision.message}). Dispatch canceled by Maple firewall.`
        )
      : truncateText(
          `Pre-execution policy passed. Dispatching ${app.id}.${options.toolName} through Maple.`
        ),
    guardStatus: preExecutionWouldBlock ? "block" : "allow",
    metadata: {
      ...(preExecutionDecision.step.metadata ?? {}),
      downstream: {
        appId: app.id,
        appName: app.name,
        toolName: options.toolName,
        origin: options.origin,
        stage: "pre_execution",
        mcpUrl: app.mcpUrl,
        policy: toPolicySnapshot(preExecutionDecision),
      },
    },
  };
  trace.steps.push(preExecutionStep);
  trace.metadata = {
    ...(trace.metadata ?? {}),
    mode: "maple-downstream-proxy",
    downstreamLastAppId: app.id,
    downstreamLastToolName: options.toolName,
    downstreamDispatchAt: new Date().toISOString(),
    downstreamPreExecutionWouldBlock: preExecutionWouldBlock,
  };

  if (preExecutionWouldBlock) {
    trace.status = "quarantined";
    upsertTraceForCurrentOwner(trace);
    const report = auditAndPersist(trace);
    return {
      ok: false,
      blockedByPolicy: true,
      preExecutionWouldBlock,
      trace,
      step: preExecutionStep,
      preExecutionStep,
      preExecutionDecision,
      report,
      app,
      failure: `Policy blocked before downstream execution: ${preExecutionDecision.message}`,
    } satisfies DownstreamDispatchLogResult;
  }

  const appendLoggedStep = (payload: {
    output: string;
    toolOutput: unknown;
    responseStatus?: number;
    requestId?: string;
    durationMs?: number;
    failed?: boolean;
    stage: "post_execution" | "dispatch_error";
  }) => {
    const summary = truncateText(payload.output.trim() || "No textual output returned.");
    const externalUrl = extractFirstUrl(summary);
    const command = extractLikelyCommand(summary);
    const candidateStep: TraceStep = {
      index: trace.steps.length,
      timestamp: new Date().toISOString(),
      actor: "tool",
      type: inferStepTypeFromDownstream(summary, options.toolName),
      prompt: `proxy ${app.id}.${options.toolName}`,
      toolCall: {
        name: `${app.id}.${options.toolName}`,
        input: options.toolArgs,
        output: compactUnknown(payload.toolOutput),
      },
      output: summary,
      command,
      externalUrl,
      metadata: {
        downstream: {
          appId: app.id,
          appName: app.name,
          toolName: options.toolName,
          requestId: payload.requestId,
          responseStatus: payload.responseStatus,
          durationMs: payload.durationMs,
          origin: options.origin,
          failed: payload.failed === true,
          mcpUrl: app.mcpUrl,
          stage: payload.stage,
          preExecutionStepIndex: preExecutionStep.index,
          preExecutionPolicy: toPolicySnapshot(preExecutionDecision),
        },
      },
      riskScore: 0,
      riskFlags: [],
      guardStatus: "pending",
    };

    const decision = evaluateFirewallStep(candidateStep);
    const loggedStep: TraceStep = {
      ...decision.step,
      index: trace.steps.length,
      timestamp: new Date().toISOString(),
      guardStatus: decision.shouldBlock ? "block" : "allow",
    };

    trace.steps.push(loggedStep);
    trace.metadata = {
      ...(trace.metadata ?? {}),
      mode: "maple-downstream-proxy",
      downstreamLastAppId: app.id,
      downstreamLastToolName: options.toolName,
      downstreamDispatchAt: new Date().toISOString(),
      downstreamPreExecutionWouldBlock: preExecutionWouldBlock,
    };
    if (decision.shouldBlock) {
      trace.status = "quarantined";
    }
    upsertTraceForCurrentOwner(trace);
    const report = auditAndPersist(trace);
    return { loggedStep, report };
  };

  try {
    const dispatch = await dispatchToolToDownstream(app, options.toolName, options.toolArgs);
    const { loggedStep, report } = appendLoggedStep({
      output: dispatch.textPreview,
      toolOutput: dispatch.result,
      requestId: dispatch.requestId,
      responseStatus: dispatch.responseStatus,
      durationMs: dispatch.durationMs,
      failed: false,
      stage: "post_execution",
    });
    return {
      ok: true,
      blockedByPolicy: false,
      preExecutionWouldBlock,
      trace,
      step: loggedStep,
      preExecutionStep,
      preExecutionDecision,
      report,
      app,
      dispatch,
    } satisfies DownstreamDispatchLogResult;
  } catch (dispatchError) {
    const failure = `Downstream dispatch failed: ${errorMessage(dispatchError)}`;
    const { loggedStep, report } = appendLoggedStep({
      output: failure,
      toolOutput: { error: failure },
      failed: true,
      stage: "dispatch_error",
    });
    return {
      ok: false,
      blockedByPolicy: false,
      preExecutionWouldBlock,
      trace,
      step: loggedStep,
      preExecutionStep,
      preExecutionDecision,
      report,
      app,
      failure,
    } satisfies DownstreamDispatchLogResult;
  }
}

async function dispatchDownstreamChainAndLog(options: {
  appIds: string[];
  toolName: string;
  toolArgs: Record<string, unknown>;
  traceId?: string;
  sessionId?: string;
  origin: "api" | "mcp" | "mcp_proxy";
}): Promise<DownstreamChainDispatchResult> {
  const normalizedAppIds = parseAppIdList(options.appIds);
  if (normalizedAppIds.length === 0) {
    throw new Error("At least one downstream app is required for chain dispatch.");
  }
  normalizedAppIds.forEach((appId) => resolveDownstreamApp(appId));

  const stages: DownstreamChainStage[] = [];
  let activeTraceId = asString(options.traceId);
  let finalResult: DownstreamDispatchLogResult | undefined;

  for (let index = 0; index < normalizedAppIds.length; index += 1) {
    const appId = normalizedAppIds[index];
    const stageResult = await dispatchDownstreamAndLog({
      appId,
      toolName: options.toolName,
      toolArgs: options.toolArgs,
      traceId: activeTraceId,
      sessionId: options.sessionId,
      origin: options.origin,
    });
    finalResult = stageResult;
    activeTraceId = stageResult.trace.id;

    stages.push({
      index,
      appId,
      ok: stageResult.ok,
      blockedByPolicy: stageResult.blockedByPolicy,
      preExecutionWouldBlock: stageResult.preExecutionWouldBlock,
      traceId: stageResult.trace.id,
      sessionId: stageResult.trace.sessionId,
      stepIndex: stageResult.step.index,
      preExecutionStepIndex: stageResult.preExecutionStep.index,
      policy: toPolicySnapshot(stageResult.preExecutionDecision),
      failure: stageResult.failure,
    });

    if (!stageResult.ok) {
      return {
        ok: false,
        blockedByPolicy: stageResult.blockedByPolicy,
        appIds: normalizedAppIds,
        stages,
        finalResult: stageResult,
        failure:
          stageResult.failure ??
          `Downstream chain failed on stage ${index + 1} (${appId}) for tool ${options.toolName}.`,
      };
    }
  }

  if (!finalResult) {
    throw new Error("Downstream chain completed without a final result.");
  }

  return {
    ok: true,
    blockedByPolicy: false,
    appIds: normalizedAppIds,
    stages,
    finalResult,
  };
}

async function forwardJsonRpcAndLog(options: {
  appId: string;
  rpcMethod: string;
  rpcPayload: Record<string, unknown>;
  traceId?: string;
  sessionId?: string;
  origin: "mcp_proxy";
}): Promise<DownstreamJsonRpcLogResult> {
  const app = resolveDownstreamApp(options.appId);
  const trace = resolveProxyTrace({
    traceId: options.traceId,
    sessionId: options.sessionId,
    appId: app.id,
  });
  const payloadSummary = summarizeJsonRpcPayload(options.rpcPayload);

  const preExecutionCandidateStep: TraceStep = {
    index: trace.steps.length,
    timestamp: new Date().toISOString(),
    actor: "agent",
    type: "tool_call",
    prompt: `rpc ${app.id}.${options.rpcMethod}`,
    toolCall: {
      name: `${app.id}::${options.rpcMethod}`,
      input: options.rpcPayload,
    },
    output: payloadSummary,
    command: extractLikelyCommand(payloadSummary),
    externalUrl: extractFirstUrl(payloadSummary),
    metadata: {
      downstream: {
        appId: app.id,
        appName: app.name,
        rpcMethod: options.rpcMethod,
        origin: options.origin,
        stage: "pre_execution",
        mcpUrl: app.mcpUrl,
      },
    },
    riskScore: 0,
    riskFlags: [],
    guardStatus: "pending",
  };

  const preExecutionDecision = evaluateFirewallStep(preExecutionCandidateStep);
  const preExecutionWouldBlock = preExecutionDecision.shouldBlock;
  const preExecutionStep: TraceStep = {
    ...preExecutionDecision.step,
    index: trace.steps.length,
    timestamp: new Date().toISOString(),
    output: preExecutionWouldBlock
      ? truncateText(
          `Policy denied before downstream JSON-RPC execution (${preExecutionDecision.message}). Forward canceled by Maple firewall.`
        )
      : truncateText(`Pre-execution policy passed. Forwarding ${options.rpcMethod} through Maple.`),
    guardStatus: preExecutionWouldBlock ? "block" : "allow",
    metadata: {
      ...(preExecutionDecision.step.metadata ?? {}),
      downstream: {
        appId: app.id,
        appName: app.name,
        rpcMethod: options.rpcMethod,
        origin: options.origin,
        stage: "pre_execution",
        mcpUrl: app.mcpUrl,
        policy: toPolicySnapshot(preExecutionDecision),
      },
    },
  };
  trace.steps.push(preExecutionStep);
  trace.metadata = {
    ...(trace.metadata ?? {}),
    mode: "maple-downstream-proxy",
    downstreamLastAppId: app.id,
    downstreamLastRpcMethod: options.rpcMethod,
    downstreamDispatchAt: new Date().toISOString(),
    downstreamPreExecutionWouldBlock: preExecutionWouldBlock,
  };

  if (preExecutionWouldBlock) {
    trace.status = "quarantined";
    upsertTraceForCurrentOwner(trace);
    const report = auditAndPersist(trace);
    return {
      ok: false,
      blockedByPolicy: true,
      preExecutionWouldBlock,
      trace,
      step: preExecutionStep,
      preExecutionStep,
      preExecutionDecision,
      report,
      app,
      failure: `Policy blocked before downstream JSON-RPC execution: ${preExecutionDecision.message}`,
    };
  }

  const appendLoggedStep = (payload: {
    output: unknown;
    responseStatus?: number;
    durationMs?: number;
    failed?: boolean;
    stage: "post_execution" | "dispatch_error";
  }) => {
    const summary = summarizeJsonRpcPayload(payload.output);
    const candidateStep: TraceStep = {
      index: trace.steps.length,
      timestamp: new Date().toISOString(),
      actor: "tool",
      type: "network",
      prompt: `rpc_response ${app.id}.${options.rpcMethod}`,
      toolCall: {
        name: `${app.id}::${options.rpcMethod}`,
        input: options.rpcPayload,
        output: compactUnknown(payload.output),
      },
      output: summary,
      command: extractLikelyCommand(summary),
      externalUrl: extractFirstUrl(summary),
      metadata: {
        downstream: {
          appId: app.id,
          appName: app.name,
          rpcMethod: options.rpcMethod,
          responseStatus: payload.responseStatus,
          durationMs: payload.durationMs,
          origin: options.origin,
          failed: payload.failed === true,
          mcpUrl: app.mcpUrl,
          stage: payload.stage,
          preExecutionStepIndex: preExecutionStep.index,
          preExecutionPolicy: toPolicySnapshot(preExecutionDecision),
        },
      },
      riskScore: 0,
      riskFlags: [],
      guardStatus: "pending",
    };

    const decision = evaluateFirewallStep(candidateStep);
    const loggedStep: TraceStep = {
      ...decision.step,
      index: trace.steps.length,
      timestamp: new Date().toISOString(),
      guardStatus: decision.shouldBlock ? "block" : "allow",
    };
    trace.steps.push(loggedStep);
    trace.metadata = {
      ...(trace.metadata ?? {}),
      mode: "maple-downstream-proxy",
      downstreamLastAppId: app.id,
      downstreamLastRpcMethod: options.rpcMethod,
      downstreamDispatchAt: new Date().toISOString(),
      downstreamPreExecutionWouldBlock: preExecutionWouldBlock,
    };
    if (decision.shouldBlock) {
      trace.status = "quarantined";
    }
    upsertTraceForCurrentOwner(trace);
    const report = auditAndPersist(trace);
    return { loggedStep, report };
  };

  try {
    const forwarded = await forwardJsonRpcToDownstream(app, options.rpcPayload);
    const { loggedStep, report } = appendLoggedStep({
      output: forwarded.payload,
      responseStatus: forwarded.responseStatus,
      durationMs: forwarded.durationMs,
      failed: false,
      stage: "post_execution",
    });
    return {
      ok: true,
      blockedByPolicy: false,
      preExecutionWouldBlock,
      trace,
      step: loggedStep,
      preExecutionStep,
      preExecutionDecision,
      report,
      app,
      forward: forwarded,
    };
  } catch (forwardError) {
    const failure = `Downstream JSON-RPC forward failed: ${errorMessage(forwardError)}`;
    const { loggedStep, report } = appendLoggedStep({
      output: { error: failure },
      failed: true,
      stage: "dispatch_error",
    });
    return {
      ok: false,
      blockedByPolicy: false,
      preExecutionWouldBlock,
      trace,
      step: loggedStep,
      preExecutionStep,
      preExecutionDecision,
      report,
      app,
      failure,
    };
  }
}

async function handleMcpFirewallProxy(c: {
  req: {
    header: (name: string) => string | undefined;
    query: (name: string) => string | undefined;
    json: () => Promise<unknown>;
    raw?: Request;
  };
  json: (body: unknown, status?: number) => Response;
}) {
  const body = c.req.raw
    ? await c.req.raw
        .clone()
        .json()
        .catch(() => ({}))
    : await c.req.json().catch(() => ({}));
  const rpc = asObject(body);
  const id = "id" in rpc ? (rpc as Record<string, unknown>).id : null;
  const method = asString(rpc.method);
  if (!method) {
    return c.json(
      jsonRpcErrorPayload(id, -32600, "Invalid JSON-RPC request: missing method."),
      400
    );
  }

  let target: McpProxyTargetResolution | undefined;
  let targetResolutionError: unknown;
  try {
    target = resolveMcpProxyTarget(c);
  } catch (resolutionError) {
    targetResolutionError = resolutionError;
  }

  const proxyTargetErrorResponse = () => {
    const detail = errorMessage(targetResolutionError ?? "No MCP proxy target resolved.");
    const isBypassDenied = detail.includes("bypass is disabled");
    const isRouteLockDenied = detail.includes("route-lock is enabled");
    const isStrictUnresolved = detail.includes("strict MCP firewall mode");
    const status = isBypassDenied || isRouteLockDenied ? 403 : isStrictUnresolved ? 503 : 400;
    const code = isBypassDenied || isRouteLockDenied ? -32003 : isStrictUnresolved ? -32004 : -32600;
    return c.json(
      jsonRpcErrorPayload(id, code, "Proxy target rejected.", {
        detail,
      }),
      status
    );
  };
  const targetResolutionDetail = errorMessage(targetResolutionError ?? "");
  const routeLockTargetOverrideDenied = targetResolutionDetail.includes("route-lock is enabled");

  const controlTools = getMarketplaceControlTools().map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    _meta: {
      mapleLocalControlTool: true,
    },
  }));

  if (method === "tools/list") {
    try {
      if (!target) {
        if (routeLockTargetOverrideDenied) {
          return proxyTargetErrorResponse();
        }
        if (mcpMarketplaceEnabled) {
          const enabledAppIds = listEnabledDownstreamAppIds();
          if (enabledAppIds.length > 0) {
            const catalog = await buildMarketplaceCatalogForAppIds(enabledAppIds);
            const multipleApps = new Set(catalog.appIds).size > 1;
            const tools = catalog.tools
              .sort((a, b) => a.qualifiedName.localeCompare(b.qualifiedName))
              .map((tool) => {
                const name = multipleApps ? tool.qualifiedName : tool.toolName;
                const baseDescription = tool.description ?? `Tool from ${tool.appName}`;
                const description = multipleApps ? `[${tool.appId}] ${baseDescription}` : baseDescription;
                return {
                  name,
                  ...(description ? { description } : {}),
                  ...(tool.inputSchema !== undefined ? { inputSchema: tool.inputSchema } : {}),
                  _meta: {
                    mapleProxyAppId: tool.appId,
                    mapleProxyToolName: tool.toolName,
                    mapleQualifiedName: tool.qualifiedName,
                  },
                };
              });
            const combinedTools = [...tools, ...controlTools];
            return c.json(
              {
                jsonrpc: "2.0",
                id,
                result: {
                  tools: combinedTools,
                  mapleMarketplace: {
                    enabled: true,
                    appCount: catalog.appIds.length,
                    warnings: catalog.warnings,
                    controlTools: controlTools.length,
                  },
                },
              },
              200
            );
          }
        }
        if (controlTools.length === 0) {
          return undefined;  // Fall through to native MCP handler
        }
        return c.json(
          {
            jsonrpc: "2.0",
            id,
            result: {
              tools: controlTools,
              mapleMarketplace: {
                enabled: mcpMarketplaceEnabled,
                appCount: 0,
                warnings: [
                  {
                    appId: "none",
                    message:
                      "No downstream app is connected yet. Auto-connect is enabled; call maple_autoroute_call or call a downstream tool name directly and Maple will attempt to resolve/connect automatically.",
                  },
                ],
              },
            },
          },
          200
        );
      }

      if (mcpMarketplaceEnabled && target.mode === "configured") {
        const catalog = await buildMarketplaceCatalog(target);
        if (catalog.tools.length === 0 && catalog.warnings.length > 0 && controlTools.length === 0) {
          return c.json(
            jsonRpcErrorPayload(id, -32002, "Marketplace tools/list failed.", {
              warnings: catalog.warnings,
            }),
            502
          );
        }

        const multipleApps = new Set(catalog.appIds).size > 1;
        const tools = catalog.tools
          .sort((a, b) => a.qualifiedName.localeCompare(b.qualifiedName))
          .map((tool) => {
            const name = multipleApps ? tool.qualifiedName : tool.toolName;
            const baseDescription = tool.description ?? `Tool from ${tool.appName}`;
            const description = multipleApps ? `[${tool.appId}] ${baseDescription}` : baseDescription;
            return {
              name,
              ...(description ? { description } : {}),
              ...(tool.inputSchema !== undefined ? { inputSchema: tool.inputSchema } : {}),
              _meta: {
                mapleProxyAppId: tool.appId,
                mapleProxyToolName: tool.toolName,
                mapleQualifiedName: tool.qualifiedName,
              },
            };
          });
        const combinedTools = [...tools, ...controlTools];

        return c.json(
          {
            jsonrpc: "2.0",
            id,
            result: {
              tools: combinedTools,
              mapleMarketplace: {
                enabled: true,
                appCount: catalog.appIds.length,
                warnings: catalog.warnings,
                controlTools: controlTools.length,
              },
            },
          },
          200
        );
      }

      const listed = await listToolsFromDownstreamCached(target.app);
      const toolsRaw = listed.tools.map((tool) => ({
        name: tool.name,
        ...(tool.description ? { description: tool.description } : {}),
        ...(tool.inputSchema !== undefined ? { inputSchema: tool.inputSchema } : {}),
      }));
      const tools = [...applyToolAllowlist(target.app, toolsRaw), ...controlTools];
      return c.json(
        {
          jsonrpc: "2.0",
          id,
          result: {
            tools,
          },
        },
        200
      );
    } catch (listError) {
      return c.json(
        jsonRpcErrorPayload(id, -32002, "Downstream tools/list failed.", {
          detail: errorMessage(listError),
          appId: target?.app.id,
        }),
        502
      );
    }
  }

  if (method === "tools/call") {
    const params = asObject(rpc.params);
    const toolName = asString(params.name);
    if (!toolName) {
      return c.json(
        jsonRpcErrorPayload(id, -32602, "Invalid tools/call params: missing tool name."),
        400
      );
    }
    const rawToolArgs =
      params.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments)
        ? (params.arguments as Record<string, unknown>)
        : {};
    const toolArgs: Record<string, unknown> = { ...rawToolArgs };
    const autoConnectRequested = asBoolean(
      rawToolArgs._mapleAutoConnect,
      mcpMarketplaceAutoConnectEnabled
    );
    const autoConnectProvider = parseMarketplaceProvider(rawToolArgs._mapleProvider) ?? "all";
    const autoConnectSearchQuery = asString(rawToolArgs._mapleSearchQuery);
    const autoConnectSearchLimitRaw = asNumber(rawToolArgs._mapleSearchLimit);
    const autoConnectSearchLimit = autoConnectSearchLimitRaw
      ? Math.max(1, Math.min(20, Math.trunc(autoConnectSearchLimitRaw)))
      : 10;
    delete toolArgs._mapleAutoConnect;
    delete toolArgs._mapleProvider;
    delete toolArgs._mapleSearchQuery;
    delete toolArgs._mapleSearchLimit;

    if (isMarketplaceControlToolName(toolName)) {
      try {
        const result = await executeMarketplaceControlTool(toolName, toolArgs);
        return c.json(
          {
            jsonrpc: "2.0",
            id,
            result,
          },
          200
        );
      } catch (controlError) {
        return c.json(
          jsonRpcErrorPayload(id, -32603, "Marketplace control tool failed.", {
            toolName,
            detail: errorMessage(controlError),
          }),
          400
        );
      }
    }

    if (isMapleNativeToolName(toolName)) {
      return undefined;
    }

    if (!target && routeLockTargetOverrideDenied) {
      return proxyTargetErrorResponse();
    }

    const singleEnabledAppWhenUnresolved =
      !target && mcpMarketplaceEnabled && listEnabledDownstreamAppIds().length === 1
        ? listEnabledDownstreamAppIds()[0]
        : undefined;
    const sessionId =
      asString(c.req.header("x-maple-session-id")) ??
      asString(c.req.header("mcp-session-id")) ??
      `mcp-proxy-${target?.app.id ?? singleEnabledAppWhenUnresolved ?? "marketplace"}`;
    const traceId = asString(c.req.header("x-maple-trace-id"));
    const chainHeader = asString(c.req.header("x-maple-chain-apps"));
    const chainQuery = asString(c.req.query("mapleChain"));
    const qualifiedTool = parseMarketplaceToolName(toolName);
    let normalizedToolName = toolName;
    let explicitAppIds: string[] | undefined;
    let autoConnectDiagnostics:
      | {
          attempted: string[];
          warnings: string[];
        }
      | undefined;

    if (qualifiedTool) {
      const allowedMarketplaceAppIds = target
        ? resolveMarketplaceAppIds(target)
        : listEnabledDownstreamAppIds();
      if (mcpRouteLockEnabled && !allowedMarketplaceAppIds.includes(qualifiedTool.appId)) {
        return c.json(
          jsonRpcErrorPayload(
            id,
            -32003,
            `Tool "${toolName}" targets app "${qualifiedTool.appId}" which is outside locked marketplace route.`,
            {
              requestedAppId: qualifiedTool.appId,
              allowedAppIds: allowedMarketplaceAppIds,
            }
          ),
          403
        );
      }
      try {
        resolveDownstreamApp(qualifiedTool.appId);
      } catch (resolutionError) {
        return c.json(
          jsonRpcErrorPayload(id, -32602, "Invalid tools/call params: unknown marketplace app.", {
            detail: errorMessage(resolutionError),
            requestedAppId: qualifiedTool.appId,
          }),
          400
        );
      }
      normalizedToolName = qualifiedTool.toolName;
      explicitAppIds = [qualifiedTool.appId];
    } else if (!target) {
      const enabledMarketplaceApps = listEnabledDownstreamAppIds();
      if (enabledMarketplaceApps.length === 1) {
        explicitAppIds = [enabledMarketplaceApps[0]];
      } else if (enabledMarketplaceApps.length > 1) {
        return c.json(
          jsonRpcErrorPayload(
            id,
            -32602,
            "Multiple downstream apps are connected. Use namespaced tool format appId::toolName."
          ),
          400
        );
      } else if (mcpMarketplaceEnabled && autoConnectRequested) {
        const autoConnected = await autoConnectAndResolveToolMatch({
          toolName: normalizedToolName,
          provider: autoConnectProvider,
          searchQuery: autoConnectSearchQuery ?? normalizedToolName,
          searchLimit: autoConnectSearchLimit,
        });
        autoConnectDiagnostics = {
          attempted: autoConnected.attempted,
          warnings: autoConnected.warnings,
        };
        if (autoConnected.match) {
          explicitAppIds = [autoConnected.match.appId];
          normalizedToolName = autoConnected.match.toolName;
        } else {
          return c.json(
            jsonRpcErrorPayload(
              id,
              -32002,
              `Maple could not auto-resolve tool "${normalizedToolName}" to a downstream app.`,
              {
                autoConnectEnabled: true,
                provider: autoConnectProvider,
                attempted: autoConnected.attempted,
                warnings: autoConnected.warnings,
                hint: "Try namespaced appId::toolName, or call maple_marketplace_search to find a compatible server.",
              }
            ),
            400
          );
        }
      } else {
        return proxyTargetErrorResponse();
      }
    }

    try {
      const appIds =
        explicitAppIds ??
        resolveDispatchAppIds({
          explicitChain: chainHeader ?? chainQuery,
          fallbackAppId: target?.app.id,
          includeDefaultExecutionOrder: target ? target.mode !== "dynamic" : false,
        });
      if (target?.mode === "dynamic" && appIds.length > 1) {
        return c.json(
          jsonRpcErrorPayload(id, -32602, "Dynamic target mode does not support multi-app chain execution.", {
            mode: target.mode,
            appIds,
          }),
          400
        );
      }

      const chainResult = await dispatchDownstreamChainAndLog({
        appIds,
        toolName: normalizedToolName,
        toolArgs,
        sessionId,
        traceId,
        origin: "mcp_proxy",
      });

      if (!chainResult.ok) {
        const result = chainResult.finalResult;
        const blockedStatus = chainResult.blockedByPolicy ? 403 : 502;
        const blockedCode = chainResult.blockedByPolicy ? -32003 : -32002;
        return c.json(
          jsonRpcErrorPayload(id, blockedCode, result.failure ?? "Downstream tools/call failed.", {
            blocked: chainResult.blockedByPolicy,
            executeAllowed: false,
            policyWouldBlock: result.preExecutionWouldBlock,
            appId: result.app.id,
            chainAppIds: chainResult.appIds,
            chainStages: chainResult.stages,
            autoConnect: autoConnectDiagnostics ?? null,
            toolName: normalizedToolName,
            requestedToolName: toolName,
            traceId: result.trace.id,
            sessionId: result.trace.sessionId,
            stepIndex: result.step.index,
            preExecutionStepIndex: result.preExecutionStep.index,
            policy: toPolicySnapshot(result.preExecutionDecision),
          }),
          blockedStatus
        );
      }

      const final = chainResult.finalResult;

      return c.json(
        {
          jsonrpc: "2.0",
          id,
          result: final.dispatch?.result ?? {
            content: [
              {
                type: "text",
                text: "",
              },
            ],
          },
        },
        200
      );
    } catch (dispatchError) {
      return c.json(
        jsonRpcErrorPayload(id, -32603, "Downstream dispatch could not be completed.", {
          detail: errorMessage(dispatchError),
          appId: target?.app.id,
          autoConnect: autoConnectDiagnostics ?? null,
          toolName: normalizedToolName,
          requestedToolName: toolName,
        }),
        502
      );
    }
  }

  if (!target) {
    // For non-tool methods (initialize, notifications/*, resources/*, prompts/*, etc.),
    // fall through to the native MCP handler instead of returning a proxy error.
    if (method !== "tools/list" && method !== "tools/call") {
      return undefined;
    }
    return proxyTargetErrorResponse();
  }

  try {
    const sessionId =
      asString(c.req.header("x-maple-session-id")) ??
      asString(c.req.header("mcp-session-id")) ??
      `mcp-proxy-${target.app.id}`;
    const traceId = asString(c.req.header("x-maple-trace-id"));
    const forwarded = await forwardJsonRpcAndLog({
      appId: target.app.id,
      rpcMethod: method,
      rpcPayload: rpc,
      sessionId,
      traceId,
      origin: "mcp_proxy",
    });
    if (!forwarded.ok) {
      const blockedStatus = forwarded.blockedByPolicy ? 403 : 502;
      const blockedCode = forwarded.blockedByPolicy ? -32003 : -32002;
      return c.json(
        jsonRpcErrorPayload(id, blockedCode, forwarded.failure ?? "Downstream MCP proxy forward failed.", {
          blocked: forwarded.blockedByPolicy,
          executeAllowed: false,
          policyWouldBlock: forwarded.preExecutionWouldBlock,
          appId: forwarded.app.id,
          rpcMethod: method,
          traceId: forwarded.trace.id,
          sessionId: forwarded.trace.sessionId,
          stepIndex: forwarded.step.index,
          preExecutionStepIndex: forwarded.preExecutionStep.index,
          policy: toPolicySnapshot(forwarded.preExecutionDecision),
        }),
        blockedStatus
      );
    }
    return c.json(forwarded.forward?.payload ?? {}, forwarded.forward?.responseStatus ?? 200);
  } catch (forwardError) {
    return c.json(
      jsonRpcErrorPayload(id, -32603, "Downstream MCP proxy forward failed.", {
        detail: errorMessage(forwardError),
        appId: target.app.id,
        mode: target.mode,
      }),
      502
    );
  }
}

function createTraceForCurrentOwner(base: Omit<Trace, "id" | "startedAt" | "updatedAt">): Trace {
  return traceStore.createTrace(base, currentOwnerKeyFingerprint());
}

function upsertTraceForCurrentOwner(trace: Trace): Trace {
  return traceStore.upsertTrace(trace, trace.ownerKeyFingerprint ?? currentOwnerKeyFingerprint());
}

function getTraceForCurrentOwner(traceId: string): Trace | undefined {
  const ownerScopes = currentOwnerKeyFingerprintsForLookup();
  if (!ownerScopes) {
    return traceStore.getTrace(traceId);
  }
  for (const owner of ownerScopes) {
    const matched = traceStore.getTrace(traceId, owner);
    if (matched) {
      return matched;
    }
  }
  return undefined;
}

function getLatestTraceBySessionForCurrentOwner(sessionId: string): Trace | undefined {
  const ownerScopes = currentOwnerKeyFingerprintsForLookup();
  if (!ownerScopes) {
    return traceStore.getLatestTraceBySession(sessionId);
  }
  const candidates = ownerScopes
    .map((owner) => traceStore.getLatestTraceBySession(sessionId, owner))
    .filter((trace): trace is Trace => Boolean(trace))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return candidates[0];
}

function listTracesForCurrentOwner(limit: number, sessionId?: string): Trace[] {
  const ownerScopes = currentOwnerKeyFingerprintsForLookup();
  if (!ownerScopes) {
    return traceStore.listTraces(limit, sessionId);
  }
  const merged = ownerScopes.flatMap((owner) => traceStore.listTraces(limit, sessionId, owner));
  const deduped = dedupeBy(merged, (trace) => trace.id);
  return deduped
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit);
}

function clearTracesForCurrentOwner(): number {
  let removed = 0;
  while (true) {
    const batch = listTracesForCurrentOwner(200);
    if (batch.length === 0) {
      break;
    }
    for (const trace of batch) {
      if (traceStore.deleteTrace(trace.id, trace.ownerKeyFingerprint)) {
        removed += 1;
      }
    }
  }
  return removed;
}

function asOpenClawRawEvent(value: unknown): OpenClawRawEvent | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as OpenClawRawEvent;
}

function eventIdFromStep(step: TraceStep): string | undefined {
  const maybe = step.metadata?.eventId;
  if (typeof maybe !== "string") {
    return undefined;
  }
  const trimmed = maybe.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

interface OpenClawIngestResult {
  trace: Trace;
  appendedCount: number;
  skippedDuplicateCount: number;
  report: ReturnType<typeof auditAndPersist>;
}

function ingestOpenClawEvents(options: {
  traceId?: string;
  sessionId?: string;
  events: OpenClawRawEvent[];
  sourceHint?: Trace["source"];
  metadata?: Record<string, unknown>;
}): OpenClawIngestResult {
  const { traceId, sessionId, events, sourceHint, metadata } = options;
  mapleLog("debug", "openclaw.ingest.begin", {
    traceId: traceId ?? null,
    sessionId: sessionId ?? null,
    sourceHint: sourceHint ?? null,
    eventCount: events.length,
    ingress: metadata?.ingress,
  });

  let trace = traceId ? getTraceForCurrentOwner(traceId) : undefined;
  if (traceId && !trace) {
    mapleLog("warn", "openclaw.ingest.trace_not_found", {
      traceId,
      sessionId: sessionId ?? null,
      eventCount: events.length,
    });
    throw new Error(`Trace ${traceId} not found.`);
  }

  if (!trace && sessionId) {
    trace = getLatestTraceBySessionForCurrentOwner(sessionId);
  }

  if (!trace) {
    trace = createTraceForCurrentOwner({
      sessionId: sessionId ?? `openclaw-${Date.now()}`,
      source: sourceHint === "manual" ? sourceHint : "openclaw",
      status: "active",
      metadata: {
        mode: "openclaw-push",
        ingestMode: "push",
        ...(metadata ?? {}),
      },
      steps: [],
    });
  }

  const seenEventIds = new Set<string>();
  for (const existingStep of trace.steps) {
    const eventId = eventIdFromStep(existingStep);
    if (eventId) {
      seenEventIds.add(eventId);
    }
  }

  let appendedCount = 0;
  let skippedDuplicateCount = 0;
  for (const event of events) {
    const nextIndex = trace.steps.length;
    const step = stepFromBridgeEvent(event, nextIndex);
    const eventId = eventIdFromStep(step);
    if (eventId && seenEventIds.has(eventId)) {
      skippedDuplicateCount += 1;
      continue;
    }

    trace.steps.push(step);
    appendedCount += 1;
    if (eventId) {
      seenEventIds.add(eventId);
    }
  }

  trace.source = sourceHint === "manual" ? sourceHint : "openclaw";
  trace.metadata = {
    ...(trace.metadata ?? {}),
    mode: trace.source === "openclaw" ? "openclaw-push" : trace.metadata?.mode,
    ingestMode: "push",
    ingestLastAt: new Date().toISOString(),
    ingestLastCount: appendedCount,
    ingestSkippedDuplicates: skippedDuplicateCount,
    ...(metadata ?? {}),
  };

  upsertTraceForCurrentOwner(trace);
  const report = auditAndPersist(trace);
  mapleLog("info", "openclaw.ingest.complete", {
    traceId: trace.id,
    sessionId: trace.sessionId,
    source: trace.source,
    appendedCount,
    skippedDuplicateCount,
    stepCount: trace.steps.length,
    status: trace.status,
    overallRiskScore: report.overallRiskScore,
    severity: report.severity,
    ingress: metadata?.ingress,
  });

  return {
    trace,
    appendedCount,
    skippedDuplicateCount,
    report,
  };
}

function setGuardActionForCurrentOwner(
  traceId: string,
  stepIndex: number,
  action: "allow" | "block" | "pending",
  reason?: string
): Trace | undefined {
  const preferredOwner = currentOwnerKeyFingerprint();
  if (preferredOwner) {
    const updated = traceStore.setGuardAction(traceId, stepIndex, action, reason, preferredOwner);
    if (updated) {
      return updated;
    }
  }
  const ownerScopes = currentOwnerKeyFingerprintsForLookup();
  if (!ownerScopes) {
    return traceStore.setGuardAction(traceId, stepIndex, action, reason);
  }
  for (const owner of ownerScopes) {
    if (owner === preferredOwner) {
      continue;
    }
    const updated = traceStore.setGuardAction(traceId, stepIndex, action, reason, owner);
    if (updated) {
      return updated;
    }
  }
  return undefined;
}

interface FirewallBlockedStepSummary {
  stepIndex: number;
  actor: TraceStep["actor"];
  type: TraceStep["type"];
  timestamp: string;
  rule: string | null;
  reason: string;
  commandOrUrl: string;
}

interface FirewallActionSummary {
  stepIndex: number;
  actor: TraceStep["actor"];
  type: TraceStep["type"];
  timestamp: string;
  toolName: string | null;
  command: string | null;
  url: string | null;
  prompt: string;
  outputPreview: string;
  riskScore: number;
  guardStatus: TraceStep["guardStatus"];
}

interface FirewallChatContext {
  generatedAt: string;
  trace:
    | {
        id: string;
        sessionId: string;
        source: Trace["source"];
        status: Trace["status"];
        startedAt: string;
        updatedAt: string;
        lastEventAt: string;
        stepCount: number;
        overallRiskScore: number;
        riskSeverity: string;
      }
    | null;
  firewall:
    | {
        enabled: boolean;
        defaultAction: string;
        blockedSteps: number;
        redactedSteps: number;
        highRiskSteps: number;
        guardCounts: {
          allow: number;
          block: number;
          pending: number;
        };
        ruleHits: Record<string, number>;
        topRules: Array<{ rule: string; count: number }>;
        quarantinedAt: string | null;
        lastBlockedStep: FirewallBlockedStepSummary | null;
        recentBlockedSteps: FirewallBlockedStepSummary[];
      }
    | null;
  activity:
    | {
        recentActions: FirewallActionSummary[];
        networkActions: FirewallActionSummary[];
        shellActions: FirewallActionSummary[];
      }
    | null;
  highlights: string[];
  recommendations: string[];
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  const parsed = asNumber(value);
  return Number.isFinite(parsed) ? Number(parsed) : fallback;
}

function formatRuleLabel(rule: string): string {
  return rule
    .replace(/^firewall_/i, "")
    .replace(/[_-]+/g, " ")
    .trim();
}

function stepCommandOrUrl(step: TraceStep): string {
  if (step.command) {
    return step.command;
  }
  if (step.externalUrl) {
    return step.externalUrl;
  }
  if (step.toolCall?.name) {
    return `tool:${step.toolCall.name}`;
  }
  if (step.prompt) {
    return step.prompt;
  }
  if (step.output) {
    return step.output;
  }
  return `${step.actor}:${step.type}`;
}

function stepGuardReason(step: TraceStep): string {
  const guardReason =
    step.metadata && typeof step.metadata.guardReason === "string"
      ? step.metadata.guardReason
      : undefined;
  if (guardReason && guardReason.trim().length > 0) {
    return guardReason;
  }

  const firewallMessage =
    step.metadata &&
    typeof step.metadata.firewall === "object" &&
    step.metadata.firewall &&
    typeof (step.metadata.firewall as Record<string, unknown>).message === "string"
      ? String((step.metadata.firewall as Record<string, unknown>).message)
      : undefined;
  if (firewallMessage && firewallMessage.trim().length > 0) {
    return firewallMessage;
  }

  const firstFlag = Array.isArray(step.riskFlags) ? step.riskFlags[0] : undefined;
  if (firstFlag?.message) {
    return firstFlag.message;
  }

  return "Blocked by policy.";
}

function stepFirewallRule(step: TraceStep): string | null {
  const rawRule =
    step.metadata &&
    typeof step.metadata.firewall === "object" &&
    step.metadata.firewall &&
    typeof (step.metadata.firewall as Record<string, unknown>).rule === "string"
      ? String((step.metadata.firewall as Record<string, unknown>).rule)
      : undefined;
  return rawRule && rawRule.trim().length > 0 ? rawRule : null;
}

function toFirewallActionSummary(step: TraceStep): FirewallActionSummary {
  const prompt = typeof step.prompt === "string" ? step.prompt.trim() : "";
  const output = typeof step.output === "string" ? step.output.trim() : "";
  const inferredCommand = extractLikelyCommand([step.command ?? "", prompt, output].join("\n"));
  const inferredUrl =
    step.externalUrl ??
    extractFirstUrl([step.command ?? "", prompt, output, stepCommandOrUrl(step)].join("\n")) ??
    null;

  return {
    stepIndex: step.index,
    actor: step.actor,
    type: step.type,
    timestamp: step.timestamp,
    toolName: step.toolCall?.name ?? null,
    command: step.command ?? inferredCommand ?? null,
    url: inferredUrl,
    prompt: truncateText(prompt, 220),
    outputPreview: truncateText(output, 220),
    riskScore: toFiniteNumber(step.riskScore, 0),
    guardStatus: step.guardStatus,
  };
}

function resolveTraceForFirewallContext(options: { traceId?: string; sessionId?: string }): Trace | undefined {
  if (options.traceId) {
    return getTraceForCurrentOwner(options.traceId);
  }
  if (options.sessionId) {
    return getLatestTraceBySessionForCurrentOwner(options.sessionId);
  }
  return listTracesForCurrentOwner(1)[0];
}

function buildFirewallRecommendations(context: FirewallChatContext): string[] {
  if (!context.trace || !context.firewall) {
    return [
      "Start or ingest a trace first so Maple can evaluate firewall state.",
      "Use /api/firewall/decision before executing shell or network actions.",
    ];
  }

  const suggestions: string[] = [];
  if (context.firewall.blockedSteps > 0) {
    suggestions.push("Review blocked steps and keep deny decisions unless explicitly approved.");
  }
  if (context.firewall.highRiskSteps > 0) {
    suggestions.push("Run audit_risk and ml_anomaly_report to validate high-risk behavior clusters.");
  }
  if (context.firewall.redactedSteps > 0) {
    suggestions.push("Rotate credentials if redaction detected sensitive token patterns.");
  }
  if (context.trace.status !== "quarantined" && context.firewall.blockedSteps === 0) {
    suggestions.push("Keep pre-execution gating enabled to catch first risky action before execution.");
  }

  const topRule = context.firewall.topRules[0];
  if (topRule) {
    suggestions.push(`Most frequent firewall hit: ${formatRuleLabel(topRule.rule)}.`);
  }

  if (suggestions.length === 0) {
    suggestions.push("No immediate firewall actions required. Continue monitoring.");
  }
  return suggestions;
}

function buildFirewallChatContext(options: { traceId?: string; sessionId?: string } = {}): FirewallChatContext {
  const generatedAt = new Date().toISOString();
  const trace = resolveTraceForFirewallContext(options);
  if (!trace) {
    const empty: FirewallChatContext = {
      generatedAt,
      trace: null,
      firewall: null,
      activity: null,
      highlights: ["No active trace available yet."],
      recommendations: [],
    };
    empty.recommendations = buildFirewallRecommendations(empty);
    return empty;
  }

  const overallRiskScore = toFiniteNumber(
    trace.metadata?.overallRiskScore,
    Math.max(0, ...trace.steps.map((step) => toFiniteNumber(step.riskScore, 0)))
  );
  const riskSeverity =
    (typeof trace.metadata?.riskSeverity === "string" && trace.metadata.riskSeverity) ||
    (overallRiskScore >= 80
      ? "critical"
      : overallRiskScore >= 60
        ? "high"
        : overallRiskScore >= 35
          ? "medium"
          : "low");
  const lastStep = trace.steps[trace.steps.length - 1];
  const lastEventAt = typeof lastStep?.timestamp === "string" ? lastStep.timestamp : trace.updatedAt;

  const guardCounts = {
    allow: trace.steps.filter((step) => step.guardStatus === "allow").length,
    block: trace.steps.filter((step) => step.guardStatus === "block").length,
    pending: trace.steps.filter((step) => step.guardStatus === "pending").length,
  };

  const blockedSteps = trace.steps
    .filter((step) => step.guardStatus === "block")
    .map((step) => ({
      stepIndex: step.index,
      actor: step.actor,
      type: step.type,
      timestamp: step.timestamp,
      rule: stepFirewallRule(step),
      reason: stepGuardReason(step),
      commandOrUrl: stepCommandOrUrl(step),
    }))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const ruleHitsFromStepScan = new Map<string, number>();
  for (const step of trace.steps) {
    const rule = stepFirewallRule(step);
    if (!rule) {
      continue;
    }
    ruleHitsFromStepScan.set(rule, (ruleHitsFromStepScan.get(rule) ?? 0) + 1);
  }
  const ruleHitsFromMetadata =
    trace.metadata &&
    typeof trace.metadata.firewall === "object" &&
    trace.metadata.firewall &&
    typeof (trace.metadata.firewall as Record<string, unknown>).ruleHits === "object"
      ? ((trace.metadata.firewall as Record<string, unknown>).ruleHits as Record<string, unknown>)
      : {};

  const mergedRuleHits = new Map<string, number>(ruleHitsFromStepScan.entries());
  for (const [rule, countValue] of Object.entries(ruleHitsFromMetadata)) {
    const count = toFiniteNumber(countValue, 0);
    if (count <= 0) {
      continue;
    }
    mergedRuleHits.set(rule, Math.max(count, mergedRuleHits.get(rule) ?? 0));
  }

  const ruleHits = Object.fromEntries(mergedRuleHits.entries());
  const topRules = [...mergedRuleHits.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([rule, count]) => ({ rule, count }));

  const firewallMetadata =
    trace.metadata && typeof trace.metadata.firewall === "object" && trace.metadata.firewall
      ? (trace.metadata.firewall as Record<string, unknown>)
      : {};

  const redactedStepsComputed = trace.steps.filter((step) => {
    const redactedPatterns =
      step.metadata &&
      typeof step.metadata.firewall === "object" &&
      step.metadata.firewall &&
      Array.isArray((step.metadata.firewall as Record<string, unknown>).redactedPatterns)
        ? ((step.metadata.firewall as Record<string, unknown>).redactedPatterns as unknown[])
        : [];
    return redactedPatterns.length > 0;
  }).length;

  const blockedStepsCount = toFiniteNumber(firewallMetadata.blockedSteps, blockedSteps.length);
  const redactedSteps = toFiniteNumber(firewallMetadata.redactedSteps, redactedStepsComputed);
  const highRiskSteps = trace.steps.filter((step) => toFiniteNumber(step.riskScore, 0) >= 60).length;
  const recentActions = trace.steps
    .slice(-20)
    .map((step) => toFirewallActionSummary(step))
    .reverse();
  const networkActions = trace.steps
    .filter(
      (step) =>
        step.type === "network" ||
        Boolean(step.externalUrl) ||
        /web_search|web_fetch|wikipedia|weather|hn_search|arxiv_search|openlibrary|github_repo_info/i.test(
          step.toolCall?.name ?? ""
        )
    )
    .slice(-20)
    .map((step) => toFirewallActionSummary(step))
    .reverse();
  const shellActions = trace.steps
    .filter((step) => step.type === "shell")
    .slice(-20)
    .map((step) => toFirewallActionSummary(step))
    .reverse();
  const quarantinedAt =
    trace.status === "quarantined"
      ? blockedSteps[blockedSteps.length - 1]?.timestamp ?? trace.updatedAt
      : null;

  const context: FirewallChatContext = {
    generatedAt,
    trace: {
      id: trace.id,
      sessionId: trace.sessionId,
      source: trace.source,
      status: trace.status,
      startedAt: trace.startedAt,
      updatedAt: trace.updatedAt,
      lastEventAt,
      stepCount: trace.steps.length,
      overallRiskScore,
      riskSeverity,
    },
    firewall: {
      enabled:
        typeof firewallMetadata.enabled === "boolean" ? Boolean(firewallMetadata.enabled) : true,
      defaultAction:
        typeof firewallMetadata.defaultAction === "string"
          ? String(firewallMetadata.defaultAction)
          : "allow",
      blockedSteps: blockedStepsCount,
      redactedSteps,
      highRiskSteps,
      guardCounts,
      ruleHits,
      topRules,
      quarantinedAt,
      lastBlockedStep: blockedSteps.length > 0 ? blockedSteps[blockedSteps.length - 1] : null,
      recentBlockedSteps: blockedSteps.slice(-8).reverse(),
    },
    activity: {
      recentActions,
      networkActions,
      shellActions,
    },
    highlights: [],
    recommendations: [],
  };

  const traceSummary = context.trace!;
  const firewallSummary = context.firewall!;
  const topRule = firewallSummary.topRules[0];
  context.highlights = [
    `Trace ${traceSummary.id} (${traceSummary.source}) is ${traceSummary.status}.`,
    `Risk ${traceSummary.overallRiskScore} (${traceSummary.riskSeverity}), ${firewallSummary.blockedSteps} blocked step(s).`,
    topRule
      ? `Most frequent policy hit: ${formatRuleLabel(topRule.rule)} (${topRule.count}).`
      : "No explicit firewall rule hits yet.",
  ];
  context.recommendations = buildFirewallRecommendations(context);

  return context;
}

function extractStepIndexFromQuestion(question: string): number | null {
  const match = question.match(/step\s*#?\s*(\d+)/i);
  if (!match || !match[1]) {
    return null;
  }
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function answerFirewallChatQuestion(question: string, context: FirewallChatContext): string {
  const normalized = question.trim().toLowerCase();
  if (!context.trace || !context.firewall) {
    return [
      "No active trace is loaded yet.",
      "Start a session (demo start or observe_session), then ask again for live firewall status.",
    ].join("\n");
  }

  const trace = context.trace;
  const firewall = context.firewall;
  const latestBlocked = firewall.lastBlockedStep;
  const stepIndex = extractStepIndexFromQuestion(question);
  if (stepIndex !== null) {
    const byStep = firewall.recentBlockedSteps.find((entry) => entry.stepIndex === stepIndex);
    if (byStep) {
      return [
        `Step #${byStep.stepIndex} is blocked.`,
        `Rule: ${byStep.rule ? formatRuleLabel(byStep.rule) : "manual guard action"}.`,
        `Reason: ${byStep.reason}`,
        `Action: ${byStep.commandOrUrl}`,
      ].join("\n");
    }
    return `Step #${stepIndex} is not in the recent blocked list. Current blocked steps: ${firewall.blockedSteps}.`;
  }

  if (/status|summary|update|overview|health|what(?:'s| is)? going on/.test(normalized)) {
    return [
      `Trace ${trace.id} (${trace.source}) is ${trace.status}.`,
      `Risk score is ${trace.overallRiskScore} (${trace.riskSeverity}).`,
      `Firewall: ${firewall.blockedSteps} blocked, ${firewall.redactedSteps} redacted, ${firewall.highRiskSteps} high-risk steps.`,
      latestBlocked
        ? `Latest block: step #${latestBlocked.stepIndex} (${latestBlocked.type}) - ${latestBlocked.reason}`
        : "No blocked steps yet.",
    ].join("\n");
  }

  if (/blocked|block|deny|denied|quarantine|quarantined|why/.test(normalized)) {
    if (!latestBlocked) {
      return "No blocked steps recorded yet. Firewall default action is allow, with active deny rules for risky patterns.";
    }
    return [
      `Trace is ${trace.status}. Blocked steps: ${firewall.blockedSteps}.`,
      `Latest block: step #${latestBlocked.stepIndex} at ${latestBlocked.timestamp}.`,
      `Rule: ${latestBlocked.rule ? formatRuleLabel(latestBlocked.rule) : "manual guard action"}.`,
      `Reason: ${latestBlocked.reason}`,
    ].join("\n");
  }

  if (/network|web|http|https|url|request|fetch|download|upload/.test(normalized)) {
    const networkActions = context.activity?.networkActions ?? [];
    if (networkActions.length === 0) {
      return "No network actions are recorded in this trace window.";
    }
    const lines = networkActions.slice(0, 8).map((action) => {
      const surface = action.url ?? action.command ?? action.toolName ?? action.prompt ?? "unknown";
      return `#${action.stepIndex} ${action.type} ${action.actor}: ${truncateText(surface, 140)}`;
    });
    return [`Network actions (${networkActions.length} total in context):`, ...lines].join("\n");
  }

  if (/risk|severity|safe|danger|score/.test(normalized)) {
    return [
      `Current risk is ${trace.overallRiskScore} (${trace.riskSeverity}).`,
      `High-risk steps: ${firewall.highRiskSteps}.`,
      `Guard decisions: allow=${firewall.guardCounts.allow}, block=${firewall.guardCounts.block}, pending=${firewall.guardCounts.pending}.`,
    ].join("\n");
  }

  if (/latest|last|recent/.test(normalized)) {
    const latestSummary = latestBlocked
      ? `Latest blocked step #${latestBlocked.stepIndex}: ${latestBlocked.commandOrUrl}`
      : "No blocked step in the latest window.";
    return [
      `Last event: ${trace.lastEventAt}.`,
      latestSummary,
      `Trace status: ${trace.status}.`,
    ].join("\n");
  }

  if (/next|recommend|what should|mitigate|fix|action/.test(normalized)) {
    return context.recommendations.map((item, index) => `${index + 1}. ${item}`).join("\n");
  }

  if (/source|openclaw|mock|manual/.test(normalized)) {
    return [
      `Source: ${trace.source}.`,
      `Session: ${trace.sessionId}.`,
      `Trace status: ${trace.status}.`,
      "This trace is from live or ingested runtime events.",
    ].join("\n");
  }

  return [
    context.highlights[0],
    context.highlights[1],
    context.recommendations[0],
    "Ask: 'status update', 'why blocked', 'risk summary', or 'what should we do next'.",
  ]
    .filter((entry) => Boolean(entry))
    .join("\n");
}

type FirewallChatRole = "user" | "assistant";
interface FirewallChatTurn {
  role: FirewallChatRole;
  content: string;
}

interface FirewallChatReplyResult {
  reply: string;
  mode: "ai" | "rules";
  provider: FirewallChatAiProvider | null;
  attempts: Array<{ provider: FirewallChatAiProvider; ok: boolean; error?: string }>;
}

function parseChatTurnContent(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (Array.isArray(value)) {
    const parts = value
      .map((entry) => {
        if (
          entry &&
          typeof entry === "object" &&
          (entry as Record<string, unknown>).type === "text" &&
          typeof (entry as Record<string, unknown>).text === "string"
        ) {
          return String((entry as Record<string, unknown>).text).trim();
        }
        return "";
      })
      .filter((item) => item.length > 0);
    if (parts.length > 0) {
      return parts.join("\n");
    }
  }
  return undefined;
}

function normalizeFirewallChatHistory(rawMessages: unknown, fallbackQuestion: string): FirewallChatTurn[] {
  const normalized: FirewallChatTurn[] = [];
  if (Array.isArray(rawMessages)) {
    for (const candidate of rawMessages) {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
        continue;
      }
      const roleRaw = asString((candidate as Record<string, unknown>).role);
      const role: FirewallChatRole | null =
        roleRaw === "assistant" ? "assistant" : roleRaw === "user" ? "user" : null;
      if (!role) {
        continue;
      }
      const content = parseChatTurnContent((candidate as Record<string, unknown>).content);
      if (!content) {
        continue;
      }
      normalized.push({ role, content });
    }
  }

  const recent = normalized.slice(-16);
  if (recent.length === 0 || recent[recent.length - 1]?.role !== "user") {
    recent.push({ role: "user", content: fallbackQuestion });
  }
  return recent;
}

function buildFirewallChatSystemPrompt(context: FirewallChatContext): string {
  const contextSnapshot = {
    generatedAt: context.generatedAt,
    trace: context.trace,
    firewall: context.firewall,
    highlights: context.highlights,
    recommendations: context.recommendations,
  };

  return [
    "You are Maple Firewall Assistant for agent traces.",
    "Use only the provided context and chat history. Do not invent events, steps, rules, or tools.",
    "If data is missing in context, explicitly say it is unavailable.",
    "Keep answers concise and operational; reference concrete step indexes and rule labels when present.",
    "When recommending next actions, prioritize Maple-native controls like guard_action, /api/firewall/decision, audit_risk, and ml_anomaly_report.",
    "Context JSON:",
    JSON.stringify(contextSnapshot, null, 2),
  ].join("\n");
}

function isNetworkActionQuery(question: string): boolean {
  const normalized = question.trim().toLowerCase();
  return (
    /(network|web|http|https|url|request|fetch|download|upload)/.test(normalized) &&
    /(action|actions|occur|occurred|happen|happened|list|show|which|what)/.test(normalized)
  );
}

function firewallChatProviderOrder(): FirewallChatAiProvider[] {
  const ordered: FirewallChatAiProvider[] = [];
  if (firewallChatPrimaryProvider === "anthropic") {
    if (firewallChatAnthropicApiKey) {
      ordered.push("anthropic");
    }
    if (firewallChatOpenAiApiKey) {
      ordered.push("openai");
    }
  } else {
    if (firewallChatOpenAiApiKey) {
      ordered.push("openai");
    }
    if (firewallChatAnthropicApiKey) {
      ordered.push("anthropic");
    }
  }
  return ordered;
}

async function callOpenAiFirewallChat(history: FirewallChatTurn[], context: FirewallChatContext): Promise<string> {
  if (!firewallChatOpenAiApiKey) {
    throw new Error("OpenAI API key is not configured.");
  }

  const response = await withAbortTimeout(firewallChatTimeoutMs, (signal) =>
    fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${firewallChatOpenAiApiKey}`,
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        model: firewallChatOpenAiModel,
        temperature: 0.2,
        max_tokens: 700,
        messages: [
          { role: "system", content: buildFirewallChatSystemPrompt(context) },
          ...history.map((turn) => ({ role: turn.role, content: turn.content })),
        ],
      }),
      signal,
    })
  );

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI HTTP ${response.status}: ${truncateText(responseText, 220)}`);
  }

  const payload = JSON.parse(responseText) as Record<string, unknown>;
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const firstChoice =
    choices.length > 0 && choices[0] && typeof choices[0] === "object"
      ? (choices[0] as Record<string, unknown>)
      : undefined;
  const message =
    firstChoice && typeof firstChoice.message === "object" && firstChoice.message
      ? (firstChoice.message as Record<string, unknown>)
      : undefined;
  const rawContent = message?.content;
  const content = parseChatTurnContent(rawContent);
  if (!content) {
    throw new Error("OpenAI response did not include assistant text.");
  }
  return content;
}

async function callAnthropicFirewallChat(
  history: FirewallChatTurn[],
  context: FirewallChatContext
): Promise<string> {
  if (!firewallChatAnthropicApiKey) {
    throw new Error("Anthropic API key is not configured.");
  }

  const response = await withAbortTimeout(firewallChatTimeoutMs, (signal) =>
    fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": firewallChatAnthropicApiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        model: firewallChatAnthropicModel,
        temperature: 0.2,
        max_tokens: 700,
        system: buildFirewallChatSystemPrompt(context),
        messages: history.map((turn) => ({ role: turn.role, content: turn.content })),
      }),
      signal,
    })
  );

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`Anthropic HTTP ${response.status}: ${truncateText(responseText, 220)}`);
  }

  const payload = JSON.parse(responseText) as Record<string, unknown>;
  const blocks = Array.isArray(payload.content) ? payload.content : [];
  const textChunks = blocks
    .map((block) => {
      if (
        block &&
        typeof block === "object" &&
        (block as Record<string, unknown>).type === "text" &&
        typeof (block as Record<string, unknown>).text === "string"
      ) {
        return String((block as Record<string, unknown>).text).trim();
      }
      return "";
    })
    .filter((chunk) => chunk.length > 0);

  if (textChunks.length === 0) {
    throw new Error("Anthropic response did not include assistant text.");
  }
  return textChunks.join("\n");
}

async function generateFirewallChatReply(options: {
  question: string;
  context: FirewallChatContext;
  messages?: unknown;
}): Promise<FirewallChatReplyResult> {
  const fallbackReply = answerFirewallChatQuestion(options.question, options.context);
  if (
    isNetworkActionQuery(options.question) &&
    (options.context.activity?.networkActions?.length ?? 0) > 0
  ) {
    return {
      reply: fallbackReply,
      mode: "rules",
      provider: null,
      attempts: [],
    };
  }

  if (!firewallChatAiEnabled) {
    return {
      reply: fallbackReply,
      mode: "rules",
      provider: null,
      attempts: [],
    };
  }

  const history = normalizeFirewallChatHistory(options.messages, options.question);
  const providers = firewallChatProviderOrder();
  const attempts: Array<{ provider: FirewallChatAiProvider; ok: boolean; error?: string }> = [];
  for (const provider of providers) {
    try {
      const reply =
        provider === "openai"
          ? await callOpenAiFirewallChat(history, options.context)
          : await callAnthropicFirewallChat(history, options.context);
      attempts.push({ provider, ok: true });
      return {
        reply,
        mode: "ai",
        provider,
        attempts,
      };
    } catch (providerError) {
      attempts.push({
        provider,
        ok: false,
        error: errorMessage(providerError),
      });
    }
  }

  mapleLog("warn", "firewall.chat.ai_fallback_to_rules", {
    attempts,
    traceId: options.context.trace?.id ?? null,
  });

  return {
    reply: fallbackReply,
    mode: "rules",
    provider: null,
    attempts,
  };
}

async function readJsonBody(c: { req: { json: () => Promise<unknown> } }): Promise<Record<string, unknown>> {
  try {
    return asObject(await c.req.json());
  } catch {
    return {};
  }
}

async function withAbortTimeout<T>(
  timeoutMs: number,
  run: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}

function resolveTraceByIdOrLatest(traceId?: string): Trace | undefined {
  if (traceId) {
    return getTraceForCurrentOwner(traceId);
  }
  return listTracesForCurrentOwner(1)[0];
}

function clampStepIndex(trace: Trace, stepIndex: number): number {
  if (trace.steps.length === 0) {
    return 0;
  }
  return Math.max(0, Math.min(Math.trunc(stepIndex), trace.steps.length - 1));
}

function recommendedRiskStepIndex(trace: Trace): number {
  if (trace.steps.length === 0) {
    return 0;
  }

  const blocked = trace.steps.find((step) => step.guardStatus === "block");
  if (blocked) {
    return blocked.index;
  }

  const highRisk = trace.steps.find((step) => step.riskScore >= 60);
  if (highRisk) {
    return highRisk.index;
  }

  const shellOrNetwork = trace.steps.find((step) => step.type === "shell" || step.type === "network");
  if (shellOrNetwork) {
    return shellOrNetwork.index;
  }

  return trace.steps.reduce((best, current) =>
    current.riskScore > best.riskScore ? current : best
  ).index;
}

function eventIdentity(step: TraceStep): string {
  const rawEventId =
    step.metadata && typeof step.metadata.eventId === "string"
      ? String(step.metadata.eventId)
      : undefined;
  if (rawEventId && rawEventId.trim().length > 0) {
    return `event:${rawEventId}`;
  }
  return [
    "fallback",
    String(step.actor ?? ""),
    String(step.type ?? ""),
    String(step.timestamp ?? ""),
    String(step.prompt ?? ""),
    String(step.command ?? ""),
    String(step.externalUrl ?? ""),
    String(step.output ?? ""),
  ].join("|");
}

function mergeLiveOpenClawTrace(existing: Trace, latest: Trace): Trace {
  const preservedByIdentity = new Map<string, TraceStep>();
  for (const step of existing.steps) {
    preservedByIdentity.set(eventIdentity(step), step);
  }

  const mergedSteps = latest.steps.map((step, index) => {
    const preserved = preservedByIdentity.get(eventIdentity(step));
    return {
      ...step,
      index,
      riskScore: preserved?.riskScore ?? step.riskScore ?? 0,
      riskFlags: preserved?.riskFlags ?? step.riskFlags ?? [],
      guardStatus: preserved?.guardStatus ?? step.guardStatus ?? "pending",
      metadata: {
        ...(preserved?.metadata ?? {}),
        ...(step.metadata ?? {}),
      },
    };
  });

  const merged: Trace = {
    ...existing,
    source: latest.source,
    status: existing.status,
    updatedAt: new Date().toISOString(),
    steps: mergedSteps,
    metadata: {
      ...(existing.metadata ?? {}),
      ...(latest.metadata ?? {}),
      mode: "openclaw-live-sync",
      fetchedEventCount: latest.steps.length,
    },
  };

  if (!merged.startedAt) {
    merged.startedAt = latest.startedAt;
  }
  return merged;
}

function defaultForkEdits(editsValue: unknown): TraceForkEdits {
  const edits = asObject(editsValue);
  return {
    prompt: asString(edits.prompt),
    output:
      asString(edits.output) ?? "Remote script execution blocked by Maple guardrails for safe replay.",
    command: asString(edits.command) ?? "echo 'blocked untrusted remote script'; exit 1",
    toolName: asString(edits.toolName),
    toolResponse: asString(edits.toolResponse),
    appendSimulationNote:
      asString(edits.appendSimulationNote) ??
      "Fork replay generated by Maple guided demo flow (dry-run).",
  };
}

interface ResolvedBridgeTarget {
  bridgeUrl: string;
  token: string;
  overrideLocked: boolean;
  overrideRejected: boolean;
}

function resolveBridgeTarget(
  body: Record<string, unknown>,
  options: { defaultBridgeUrl?: string; defaultToken?: string } = {}
): ResolvedBridgeTarget {
  const requestedBridgeUrl = asString(body.bridgeUrl);
  const requestedToken = asString(body.token);

  if (bridgeOverrideLockEnabled) {
    const overrideRejected =
      (requestedBridgeUrl !== undefined && requestedBridgeUrl !== configuredBridgeUrl) ||
      (requestedToken !== undefined && requestedToken !== configuredBridgeToken);
    return {
      bridgeUrl: configuredBridgeUrl,
      token: configuredBridgeToken,
      overrideLocked: true,
      overrideRejected,
    };
  }

  return {
    bridgeUrl: requestedBridgeUrl ?? options.defaultBridgeUrl ?? configuredBridgeUrl,
    token: requestedToken ?? options.defaultToken ?? configuredBridgeToken,
    overrideLocked: false,
    overrideRejected: false,
  };
}

function bridgeOverrideDeniedBody() {
  return {
    error: "Bridge override denied",
    reason:
      "Per-request bridgeUrl/token overrides are disabled by policy. Use configured OPENCLAW_BRIDGE_URL and OPENCLAW_BRIDGE_TOKEN when running source=openclaw.",
    hint: "Unset request bridgeUrl/token, use source=auto/mock, or set MAPLE_ALLOW_BRIDGE_OVERRIDE=true in non-production.",
  };
}

function asStepActor(value: unknown): TraceStep["actor"] {
  if (value === "agent" || value === "tool" || value === "system" || value === "user") {
    return value;
  }
  return "agent";
}

function asStepType(value: unknown): TraceStep["type"] {
  if (
    value === "prompt" ||
    value === "tool_call" ||
    value === "shell" ||
    value === "browser" ||
    value === "network" ||
    value === "email" ||
    value === "system"
  ) {
    return value;
  }
  return "prompt";
}

function asTraceToolCall(value: unknown): TraceStep["toolCall"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const raw = value as Record<string, unknown>;
  const name = asString(raw.name);
  if (!name) {
    return undefined;
  }

  return {
    name,
    input:
      raw.input && typeof raw.input === "object" && !Array.isArray(raw.input)
        ? (raw.input as Record<string, unknown>)
        : undefined,
    output: raw.output,
  };
}

function buildCandidateStep(
  body: Record<string, unknown>,
  index: number,
  defaults: { actor: TraceStep["actor"]; type: TraceStep["type"] } = {
    actor: "agent",
    type: "prompt",
  }
): TraceStep {
  const toolCall = asTraceToolCall(body.toolCall);
  const command = asString(body.command);
  const externalUrl =
    asString(body.externalUrl) ??
    asString(body.url) ??
    asString(body.externalURL) ??
    asString(body.endpoint);
  const explicitType = asString(body.type);
  const inferredType: TraceStep["type"] = command
    ? "shell"
    : externalUrl
      ? "network"
      : toolCall
        ? "tool_call"
        : defaults.type;

  return {
    index,
    timestamp: new Date().toISOString(),
    actor: asStepActor(body.actor ?? defaults.actor),
    type: explicitType ? asStepType(explicitType) : inferredType,
    prompt: asString(body.prompt),
    toolCall,
    output: asString(body.output),
    command,
    externalUrl,
    metadata:
      body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
        ? (body.metadata as Record<string, unknown>)
        : undefined,
    riskScore: 0,
    riskFlags: [],
    guardStatus: "pending",
  };
}

function sanitizeSessionId(value: string): string {
  const normalized = value.replace(/[^a-zA-Z0-9._:-]/g, "-").replace(/-+/g, "-").slice(0, 96);
  return normalized.length > 0 ? normalized : `fork-${Date.now().toString(36)}`;
}

function stepToBridgeEvent(step: TraceStep): Record<string, unknown> {
  return {
    eventId: `${step.index}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: step.timestamp,
    actor: step.actor,
    type: step.type,
    prompt: step.prompt,
    output: step.output,
    command: step.command,
    toolName: step.toolCall?.name,
    toolInput: step.toolCall?.input,
    toolOutput: step.toolCall?.output,
    url: step.externalUrl,
  };
}

async function writeEventsToBridgeSession(
  sessionId: string,
  events: Record<string, unknown>[],
  bridgeUrl: string,
  token?: string
) {
  const target = new URL(`/sessions/${encodeURIComponent(sessionId)}/events`, bridgeUrl);
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const resetResponse = await fetch(target, {
    method: "POST",
    headers,
    body: JSON.stringify({ reset: true }),
  });
  if (!resetResponse.ok) {
    throw new Error(`Bridge reset failed (${resetResponse.status}).`);
  }

  const appendResponse = await fetch(target, {
    method: "POST",
    headers,
    body: JSON.stringify({ events }),
  });
  if (!appendResponse.ok) {
    throw new Error(`Bridge append failed (${appendResponse.status}).`);
  }
}

async function launchIsolatedForkSession(options: {
  forkedTrace: Trace;
  parentTrace: Trace;
  body: Record<string, unknown>;
}) {
  const { forkedTrace, parentTrace, body } = options;
  const requestedForkSessionId = asString(body.forkSessionId);
  const generatedForkSessionId = `${parentTrace.sessionId}-fork-${Date.now().toString(36)}`;
  const forkSessionId = sanitizeSessionId(requestedForkSessionId ?? generatedForkSessionId);
  const bridgeTarget = resolveBridgeTarget(body);
  if (bridgeTarget.overrideRejected) {
    throw new Error(bridgeOverrideDeniedBody().reason);
  }
  const { bridgeUrl, token } = bridgeTarget;
  const events = forkedTrace.steps.map((step) => stepToBridgeEvent(step));

  await writeEventsToBridgeSession(forkSessionId, events, bridgeUrl, token);

  const runtimeTrace = await startObservation({
    sessionId: forkSessionId,
    source: "openclaw",
    bridgeUrl,
    token,
  });

  runtimeTrace.metadata = {
    ...(runtimeTrace.metadata ?? {}),
    mode: "openclaw-fork-runtime",
    parentTraceId: parentTrace.id,
    parentSessionId: parentTrace.sessionId,
    forkedTraceId: forkedTrace.id,
  };
  runtimeTrace.ownerKeyFingerprint = parentTrace.ownerKeyFingerprint;
  traceStore.upsertTrace(runtimeTrace, parentTrace.ownerKeyFingerprint);
  const runtimeReport = auditAndPersist(runtimeTrace);

  return {
    sessionId: forkSessionId,
    traceId: runtimeTrace.id,
    source: runtimeTrace.source,
    overallRiskScore: runtimeReport.overallRiskScore,
    severity: runtimeReport.severity,
  };
}

function renderTraceMarkdown(trace: Trace): string {
  const lines: string[] = [];
  lines.push(`# Maple Trace Export`);
  lines.push(``);
  lines.push(`- Trace ID: ${trace.id}`);
  lines.push(`- Session ID: ${trace.sessionId}`);
  lines.push(`- Source: ${trace.source}`);
  lines.push(`- Status: ${trace.status}`);
  lines.push(`- Started: ${trace.startedAt}`);
  lines.push(`- Updated: ${trace.updatedAt}`);
  lines.push(`- Risk Score: ${trace.metadata?.overallRiskScore ?? 0}`);
  lines.push(`- Risk Severity: ${trace.metadata?.riskSeverity ?? "low"}`);
  lines.push(``);
  lines.push(`## Steps`);
  lines.push(``);

  for (const step of trace.steps) {
    lines.push(`### Step ${step.index}`);
    lines.push(`- Time: ${step.timestamp}`);
    lines.push(`- Actor: ${step.actor}`);
    lines.push(`- Type: ${step.type}`);
    lines.push(`- Guard: ${step.guardStatus}`);
    lines.push(`- Risk Score: ${step.riskScore}`);
    if (step.prompt) {
      lines.push(`- Prompt: ${step.prompt}`);
    }
    if (step.command) {
      lines.push(`- Command: ${step.command}`);
    }
    if (step.toolCall?.name) {
      lines.push(`- Tool: ${step.toolCall.name}`);
    }
    if (step.output) {
      lines.push(`- Output: ${step.output}`);
    }
    if (step.riskFlags.length > 0) {
      lines.push(`- Flags:`);
      for (const flag of step.riskFlags) {
        lines.push(
          `  - [${flag.severity}] ${flag.type}: ${flag.message}${flag.evidence ? ` (evidence: ${flag.evidence})` : ""}`
        );
      }
    }
    lines.push(``);
  }

  return lines.join("\n");
}

async function readJudgeAsset(
  filename:
    | "judges.html"
    | "judges.css"
    | "judges.js"
    | "judges-app.js"
    | "judges-auth.js"
    | "judges-http.js"
    | "landing.html"
    | "landing.css"
    | "landing.js"
) {
  const candidates = [
    resolve(process.cwd(), "public", filename),
    resolve(process.cwd(), "dist", "public", filename),
  ];

  for (const candidate of candidates) {
    try {
      return await readFile(candidate, "utf8");
    } catch {
      // try next candidate
    }
  }

  throw new Error(`Public asset not found: ${filename}`);
}

async function readJudgeBinaryAsset(filename: "logo.png") {
  const candidates = [
    resolve(process.cwd(), "public", filename),
    resolve(process.cwd(), "dist", "public", filename),
  ];

  for (const candidate of candidates) {
    try {
      return await readFile(candidate);
    } catch {
      // try next candidate
    }
  }

  throw new Error(`Public binary asset not found: ${filename}`);
}

if (judgeUiRoutesEnabled) {
  server.get("/", async (c) => {
    try {
      const html = await readJudgeAsset("landing.html");
      return c.body(html, 200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store, max-age=0",
        pragma: "no-cache",
        expires: "0",
      });
    } catch (assetError) {
      return c.text(
        assetError instanceof Error ? assetError.message : "Unable to load landing page.",
        500
      );
    }
  });

  server.get("/landing", async (c) => {
    try {
      const html = await readJudgeAsset("landing.html");
      return c.body(html, 200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store, max-age=0",
        pragma: "no-cache",
        expires: "0",
      });
    } catch (assetError) {
      return c.text(
        assetError instanceof Error ? assetError.message : "Unable to load landing page.",
        500
      );
    }
  });

  server.get("/landing.css", async (c) => {
    try {
      const css = await readJudgeAsset("landing.css");
      return c.body(css, 200, {
        "content-type": "text/css; charset=utf-8",
        "cache-control": "no-store, max-age=0",
        pragma: "no-cache",
        expires: "0",
      });
    } catch (assetError) {
      return c.text(
        assetError instanceof Error ? assetError.message : "Unable to load landing css.",
        500
      );
    }
  });

  server.get("/landing.js", async (c) => {
    try {
      const js = await readJudgeAsset("landing.js");
      return c.body(js, 200, {
        "content-type": "application/javascript; charset=utf-8",
        "cache-control": "no-store, max-age=0",
        pragma: "no-cache",
        expires: "0",
      });
    } catch (assetError) {
      return c.text(
        assetError instanceof Error ? assetError.message : "Unable to load landing js.",
        500
      );
    }
  });

  server.get("/logo.png", async (c) => {
    try {
      const png = await readJudgeBinaryAsset("logo.png");
      return c.body(png, 200, {
        "content-type": "image/png",
        "cache-control": "public, max-age=3600",
      });
    } catch (assetError) {
      return c.text(
        assetError instanceof Error ? assetError.message : "Unable to load logo image.",
        500
      );
    }
  });
}

server.get("/health", (c) =>
  c.json({
    ok: true,
    name: "maple",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  })
);

if (judgeUiRoutesEnabled) {
  const redirectToLandingWhenUnauthenticated = (
    c: {
      req: { header: (name: string) => string | undefined };
      redirect: (location: string, status?: 301 | 302 | 303 | 307 | 308 | undefined) => Response;
    },
    nextPath: string
  ): Response | undefined => {
    const session = findRequestSession(c.req.header("cookie"));
    if (session) {
      return undefined;
    }
    const target = `/landing?next=${encodeURIComponent(nextPath)}`;
    return c.redirect(target, 302);
  };

  server.get("/judge", async (c) => {
    const redirect = redirectToLandingWhenUnauthenticated(c, "/judge");
    if (redirect) {
      return redirect;
    }
    try {
      const html = await readJudgeAsset("judges.html");
      return c.body(html, 200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store, max-age=0",
        pragma: "no-cache",
        expires: "0",
      });
    } catch (assetError) {
      return c.text(
        assetError instanceof Error ? assetError.message : "Unable to load judge page.",
        500
      );
    }
  });

  server.get("/judges.html", async (c) => {
    const redirect = redirectToLandingWhenUnauthenticated(c, "/judge");
    if (redirect) {
      return redirect;
    }
    try {
      const html = await readJudgeAsset("judges.html");
      return c.body(html, 200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store, max-age=0",
        pragma: "no-cache",
        expires: "0",
      });
    } catch (assetError) {
      return c.text(
        assetError instanceof Error ? assetError.message : "Unable to load judge page.",
        500
      );
    }
  });

  server.get("/judges.css", async (c) => {
    try {
      const css = await readJudgeAsset("judges.css");
      return c.body(css, 200, {
        "content-type": "text/css; charset=utf-8",
        "cache-control": "no-store, max-age=0",
        pragma: "no-cache",
        expires: "0",
      });
    } catch (assetError) {
      return c.text(
        assetError instanceof Error ? assetError.message : "Unable to load judge css.",
        500
      );
    }
  });

  server.get("/judges.js", async (c) => {
    try {
      const js = await readJudgeAsset("judges.js");
      return c.body(js, 200, {
        "content-type": "application/javascript; charset=utf-8",
        "cache-control": "no-store, max-age=0",
        pragma: "no-cache",
        expires: "0",
      });
    } catch (assetError) {
      return c.text(
        assetError instanceof Error ? assetError.message : "Unable to load judge js.",
        500
      );
    }
  });

  server.get("/judges-app.js", async (c) => {
    try {
      const js = await readJudgeAsset("judges-app.js");
      return c.body(js, 200, {
        "content-type": "application/javascript; charset=utf-8",
        "cache-control": "no-store, max-age=0",
        pragma: "no-cache",
        expires: "0",
      });
    } catch (assetError) {
      return c.text(
        assetError instanceof Error ? assetError.message : "Unable to load judge app js.",
        500
      );
    }
  });

  server.get("/judges-auth.js", async (c) => {
    try {
      const js = await readJudgeAsset("judges-auth.js");
      return c.body(js, 200, {
        "content-type": "application/javascript; charset=utf-8",
        "cache-control": "no-store, max-age=0",
        pragma: "no-cache",
        expires: "0",
      });
    } catch (assetError) {
      return c.text(
        assetError instanceof Error ? assetError.message : "Unable to load judge auth js.",
        500
      );
    }
  });

  server.get("/judges-http.js", async (c) => {
    try {
      const js = await readJudgeAsset("judges-http.js");
      return c.body(js, 200, {
        "content-type": "application/javascript; charset=utf-8",
        "cache-control": "no-store, max-age=0",
        pragma: "no-cache",
        expires: "0",
      });
    } catch (assetError) {
      return c.text(
        assetError instanceof Error ? assetError.message : "Unable to load judge http js.",
        500
      );
    }
  });
}

server.get("/api/auth/me", (c) => {
  const session = findRequestSession(c.req.header("cookie"));
  if (session) {
    const userScoped = `user:${session.user.id}`;
    const sessionScoped = resolveSessionOwnerFingerprint(session.user.id);
    const ownerScopes = dedupeBy([sessionScoped, userScoped], (entry) => entry);
    return c.json({
      ok: true,
      authenticated: true,
      method: "session",
      user: toPublicUser(session.user),
      ownerScopes,
    });
  }

  const xApiKey = c.req.header("x-api-key");
  const authorization = c.req.header("authorization");
  const apiKeyProvided = isApiKeyPresent(xApiKey, authorization);
  const apiKeyResult = verifyIncomingApiKey(xApiKey, authorization);
  if (apiKeyProvided) {
    if (!apiKeyResult.ok) {
      return c.json(unauthorizedBody(apiKeyResult.reason ?? "invalid_key"), 401);
    }
    return c.json({
      ok: true,
      authenticated: true,
      method: "api_key",
      user: null,
      ownerScopes: apiKeyResult.keyFingerprint ? [apiKeyResult.keyFingerprint] : [],
    });
  }

  return c.json({
    ok: true,
    authenticated: false,
    method: null,
    user: null,
    ownerScopes: [],
  });
});

server.app.post("/api/auth/login", async (c) => {
  const body = await readJsonBody(c);
  const username = asString(body.username);
  const password = asString(body.password);
  console.log(`[LOGIN-DEBUG] username=${JSON.stringify(username)} password=${JSON.stringify(password)} bodyKeys=${JSON.stringify(Object.keys(body))}`);
  if (!username || !password) {
    return c.json({ error: "username and password are required." }, 400);
  }

  const user = database.findUserByUsername(username);
  console.log(`[LOGIN-DEBUG] userFound=${!!user} hashPrefix=${user?.passwordHash?.slice(0, 20)}`);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    console.log(`[LOGIN-DEBUG] REJECTED — verifyPassword=${user ? verifyPassword(password, user.passwordHash) : "no-user"}`);
    return c.json({ error: "Invalid username or password." }, 401);
  }

  const session = database.createSession(user.id, sessionTtlSeconds);
  c.header("set-cookie", buildSessionCookie(session.id, sessionTtlSeconds));
  return c.json({
    ok: true,
    authenticated: true,
    method: "session",
    user: toPublicUser(user),
    session: {
      id: session.id,
      expiresAt: session.expiresAt,
    },
  });
});

// ── Google Sign-In ──────────────────────────────────────────────────────────

const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim() || null;

let googleCertsCache: { keys: Record<string, string>; expiresAt: number } | null = null;

async function getGooglePublicKeys(): Promise<Record<string, string>> {
  if (googleCertsCache && Date.now() < googleCertsCache.expiresAt) {
    return googleCertsCache.keys;
  }
  const res = await fetch("https://www.googleapis.com/oauth2/v3/certs");
  if (!res.ok) throw new Error("Failed to fetch Google public keys");
  const jwks = (await res.json()) as { keys: Array<{ kid: string; n: string; e: string; kty: string }> };
  const keys: Record<string, string> = {};
  for (const jwk of jwks.keys) {
    const pubKey = createPublicKey({ key: jwk, format: "jwk" });
    keys[jwk.kid] = pubKey.export({ type: "spki", format: "pem" }) as string;
  }
  googleCertsCache = { keys, expiresAt: Date.now() + 3600_000 };
  return keys;
}

function decodeJwtPart(part: string): Record<string, unknown> {
  const padded = part.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
}

async function verifyGoogleJwt(token: string): Promise<{ email: string; name: string }> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT format");

  const header = decodeJwtPart(parts[0]) as { kid?: string; alg?: string };
  const payload = decodeJwtPart(parts[1]) as {
    iss?: string; aud?: string; exp?: number; email?: string; name?: string;
  };

  // Validate claims
  const validIssuers = ["accounts.google.com", "https://accounts.google.com"];
  if (!payload.iss || !validIssuers.includes(payload.iss)) {
    throw new Error("Invalid issuer");
  }
  if (payload.aud !== googleClientId) {
    throw new Error("Invalid audience");
  }
  if (!payload.exp || payload.exp * 1000 < Date.now()) {
    throw new Error("Token expired");
  }
  if (!payload.email) {
    throw new Error("No email in token");
  }

  // Verify signature
  const keys = await getGooglePublicKeys();
  const kid = header.kid;
  if (!kid || !keys[kid]) {
    throw new Error("Unknown signing key");
  }

  const signatureInput = parts[0] + "." + parts[1];
  const signature = Buffer.from(parts[2].replace(/-/g, "+").replace(/_/g, "/"), "base64");
  const verifier = createVerify("RSA-SHA256");
  verifier.update(signatureInput);
  if (!verifier.verify(keys[kid], signature)) {
    throw new Error("Invalid signature");
  }

  return { email: payload.email, name: payload.name || "" };
}

server.app.get("/api/auth/google/client-id", (c) => {
  return c.json({ clientId: googleClientId });
});

server.app.post("/api/auth/google", async (c) => {
  if (!googleClientId) {
    return c.json({ error: "Google sign-in is not configured." }, 501);
  }

  const body = await readJsonBody(c);
  const credential = asString(body.credential);
  if (!credential) {
    return c.json({ error: "credential is required." }, 400);
  }

  let googleUser: { email: string; name: string };
  try {
    googleUser = await verifyGoogleJwt(credential);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Token verification failed";
    return c.json({ error: msg }, 401);
  }

  let user = database.findUserByEmail(googleUser.email);

  if (!user) {
    // Auto-create user from Google account
    let baseUsername = googleUser.email.split("@")[0].replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 30);
    if (!baseUsername) baseUsername = "user";
    let username = baseUsername;
    while (database.findUserByUsername(username)) {
      username = baseUsername + "_" + randomUUID().slice(0, 6);
    }
    user = database.createUser({
      username,
      email: googleUser.email,
      passwordHash: "google-oauth:no-password",
    });
  }

  const session = database.createSession(user.id, sessionTtlSeconds);
  c.header("set-cookie", buildSessionCookie(session.id, sessionTtlSeconds));
  return c.json({
    ok: true,
    authenticated: true,
    method: "session",
    user: toPublicUser(user),
    session: {
      id: session.id,
      expiresAt: session.expiresAt,
    },
  });
});

server.app.post("/api/auth/register", async (c) => {
  const existingUsers = database.countUsers();
  if (!allowSelfSignup && existingUsers > 0) {
    return c.json({ error: "Self-signup is disabled." }, 403);
  }

  const body = await readJsonBody(c);
  const username = asString(body.username);
  const password = asString(body.password);
  const email = asString(body.email);
  if (!username || !password) {
    return c.json({ error: "username and password are required." }, 400);
  }
  if (password.length < 8) {
    return c.json({ error: "password must be at least 8 characters." }, 400);
  }

  if (database.findUserByUsername(username)) {
    return c.json({ error: "Username already exists." }, 409);
  }

  const user = database.createUser({
    username,
    email,
    passwordHash: hashPassword(password),
  });
  const session = database.createSession(user.id, sessionTtlSeconds);
  c.header("set-cookie", buildSessionCookie(session.id, sessionTtlSeconds));
  return c.json({
    ok: true,
    authenticated: true,
    method: "session",
    user: toPublicUser(user),
    session: {
      id: session.id,
      expiresAt: session.expiresAt,
    },
  });
});

server.app.post("/api/auth/logout", (c) => {
  const sessionId = sessionCookieValue(c.req.header("cookie"));
  if (sessionId) {
    database.revokeSession(sessionId);
  }
  c.header("set-cookie", clearSessionCookieHeader());
  return c.json({ ok: true });
});

server.get("/api/traces", (c) => {
  const unauthorized = requireApiKeyResponse(c);
  if (unauthorized) {
    return unauthorized;
  }

  const traces = listTracesForCurrentOwner(100).map((trace) => toTraceSummary(trace));
  return c.json({ traces, count: traces.length });
});

server.get("/api/trace", (c) => {
  const unauthorized = requireApiKeyResponse(c);
  if (unauthorized) {
    return unauthorized;
  }

  const traceId = c.req.query("traceId");
  if (!traceId) {
    return c.json({ error: "traceId query parameter is required" }, 400);
  }

  const trace = getTraceForCurrentOwner(traceId);
  if (!trace) {
    return c.json({ error: "Trace not found" }, 404);
  }

  return c.json(trace);
});

server.get("/api/traces/:traceId", (c) => {
  const unauthorized = requireApiKeyResponse(c);
  if (unauthorized) {
    return unauthorized;
  }

  const traceId = c.req.param("traceId");
  const trace = getTraceForCurrentOwner(traceId);
  if (!trace) {
    return c.json({ error: "Trace not found" }, 404);
  }

  return c.json(trace);
});

server.get("/api/community/stats", (c) => {
  const unauthorized = requireApiKeyResponse(c);
  if (unauthorized) {
    return unauthorized;
  }

  return c.json({
    stats: sharedTraceStore.getStats(),
    ycMetrics: buildYcMetrics(),
  });
});

server.get("/api/community/traces", (c) => {
  const unauthorized = requireApiKeyResponse(c);
  if (unauthorized) {
    return unauthorized;
  }

  const sharedTraces = sharedTraceStore.listSharedTraces(50).map((trace) => ({
    id: trace.id,
    taskLabel: trace.taskLabel,
    objective: trace.objective,
    sharedAt: trace.sharedAt,
    behaviorSignature: trace.behaviorSignature,
    riskScore: trace.riskScore,
    riskSeverity: trace.riskSeverity,
    stepCount: trace.stepCount,
    tags: trace.tags,
  }));

  return c.json({
    count: sharedTraces.length,
    traces: sharedTraces,
  });
});

if (legacySmitheryRoutesEnabled) {
server.get("/api/smithery/servers", async (c) => {
  const unauthorized = requireApiKeyResponse(c);
  if (unauthorized) {
    return unauthorized;
  }
  if (!smitheryEnabled) {
    return c.json(
      {
        error: "Smithery integration is disabled.",
        hint: "Set MAPLE_SMITHERY_ENABLED=true.",
      },
      400
    );
  }

  const page = asNumber(c.req.query("page"));
  const pageSize = asNumber(c.req.query("pageSize"));
  const query = asString(c.req.query("q")) ?? asString(c.req.query("query"));
  const remote = asString(c.req.query("remote"));
  const verified = asString(c.req.query("verified"));
  const deployed = asString(c.req.query("deployed"));

  try {
    const data = await withAbortTimeout(smitheryTimeoutMs, (signal) =>
      listSmitheryServers({
        apiBaseUrl: smitheryApiBaseUrl,
        apiKey: smitheryApiKey,
        signal,
        page: page ? Math.max(1, Math.trunc(page)) : 1,
        pageSize: pageSize ? Math.max(1, Math.min(100, Math.trunc(pageSize))) : 20,
        query,
        remote: remote ? remote.toLowerCase() === "true" : undefined,
        verified: verified ? verified.toLowerCase() === "true" : undefined,
        deployed: deployed ? deployed.toLowerCase() === "true" : undefined,
      })
    );

    return c.json({
      source: "smithery",
      apiBaseUrl: smitheryApiBaseUrl,
      count: data.servers.length,
      pagination: data.pagination ?? null,
      servers: data.servers,
    });
  } catch (error) {
    return c.json(
      {
        error: "Failed to fetch Smithery servers.",
        detail: errorMessage(error),
      },
      502
    );
  }
});

server.get("/api/smithery/server", async (c) => {
  const unauthorized = requireApiKeyResponse(c);
  if (unauthorized) {
    return unauthorized;
  }
  if (!smitheryEnabled) {
    return c.json(
      {
        error: "Smithery integration is disabled.",
        hint: "Set MAPLE_SMITHERY_ENABLED=true.",
      },
      400
    );
  }

  const qualifiedName = asString(c.req.query("qualifiedName")) ?? asString(c.req.query("server"));
  if (!qualifiedName) {
    return c.json(
      {
        error: "qualifiedName query parameter is required.",
      },
      400
    );
  }

  try {
    const detail = await withAbortTimeout(smitheryTimeoutMs, (signal) =>
      fetchSmitheryServerDetails(qualifiedName, {
        apiBaseUrl: smitheryApiBaseUrl,
        apiKey: smitheryApiKey,
        signal,
      })
    );
    const deploymentUrl = resolveSmitheryDeploymentUrl(detail);
    return c.json({
      source: "smithery",
      apiBaseUrl: smitheryApiBaseUrl,
      server: detail,
      deploymentUrl: deploymentUrl ?? null,
    });
  } catch (error) {
    return c.json(
      {
        error: `Failed to resolve Smithery server "${qualifiedName}".`,
        detail: errorMessage(error),
      },
      502
    );
  }
});

server.get("/api/smithery/downstream/registered", (c) => {
  const unauthorized = requireApiKeyResponse(c);
  if (unauthorized) {
    return unauthorized;
  }

  const smitheryApps = listDownstreamApps(downstreamAppRegistry, true).filter((app) => {
    const raw = downstreamAppRegistry.get(app.id);
    return Boolean(raw && isSmitheryDownstreamApp(raw));
  });

  return c.json({
    source: "smithery",
    count: smitheryApps.length,
    apps: smitheryApps,
  });
});

server.app.post("/api/smithery/downstream/register", async (c) => {
  const unauthorized = requireApiKeyResponse(c);
  if (unauthorized) {
    return unauthorized;
  }
  if (!smitheryEnabled) {
    return c.json(
      {
        error: "Smithery integration is disabled.",
        hint: "Set MAPLE_SMITHERY_ENABLED=true.",
      },
      400
    );
  }

  const body = await readJsonBody(c);
  const qualifiedName = asString(body.qualifiedName) ?? asString(body.server);
  if (!qualifiedName) {
    return c.json(
      {
        error: "qualifiedName is required.",
      },
      400
    );
  }

  const overwrite = asBoolean(body.overwrite, false);
  const enabled = asBoolean(body.enabled, true);
  const explicitAppId = asString(body.appId);
  const explicitName = asString(body.name);
  const explicitAuthHeader = asString(body.authHeader);
  const explicitAuthScheme = asString(body.authScheme)?.toLowerCase();
  const explicitApiKey = asString(body.apiKey) ?? smitheryApiKey;
  const query = asStringRecord(body.query);
  const headers = asStringRecord(body.headers);
  const explicitAllowlist = asStringArray(body.toolAllowlist);
  const restrictToCatalogTools = asBoolean(body.restrictToCatalogTools, true);
  const timeoutMsRaw = asNumber(body.timeoutMs);
  const timeoutMs = timeoutMsRaw ? Math.max(1_000, Math.min(60_000, Math.trunc(timeoutMsRaw))) : 12_000;

  let detail;
  try {
    detail = await withAbortTimeout(smitheryTimeoutMs, (signal) =>
      fetchSmitheryServerDetails(qualifiedName, {
        apiBaseUrl: smitheryApiBaseUrl,
        apiKey: smitheryApiKey,
        signal,
      })
    );
  } catch (error) {
    return c.json(
      {
        error: `Failed to resolve Smithery server "${qualifiedName}".`,
        detail: errorMessage(error),
      },
      502
    );
  }

  const deploymentUrl = resolveSmitheryDeploymentUrl(detail);
  if (!deploymentUrl) {
    return c.json(
      {
        error: `Smithery server "${detail.qualifiedName}" has no HTTP deployment URL.`,
      },
      400
    );
  }

  const mcpUrl = buildUrlWithQueryParams(deploymentUrl, query);
  const appId = explicitAppId ?? toSmitheryDownstreamAppId(detail.qualifiedName);
  const existing = downstreamAppRegistry.get(appId);
  if (existing && !overwrite) {
    return c.json(
      {
        error: `Downstream app "${appId}" already exists.`,
        hint: "Set overwrite=true to replace it.",
      },
      409
    );
  }

  const catalogToolNames = Array.isArray(detail.tools)
    ? detail.tools
        .map((tool) => asString(tool.name))
        .filter((name): name is string => Boolean(name))
    : [];
  const allowlist =
    explicitAllowlist.length > 0
      ? explicitAllowlist
      : restrictToCatalogTools && catalogToolNames.length > 0
        ? catalogToolNames
        : undefined;

  const app: DownstreamAppConfig = {
    id: appId,
    name: explicitName ?? detail.displayName ?? detail.qualifiedName,
    description: `[smithery] ${detail.qualifiedName}${detail.description ? ` - ${detail.description}` : ""}`,
    mcpUrl,
    enabled,
    timeoutMs,
    apiKey: explicitApiKey,
    authHeader: explicitAuthHeader ?? "authorization",
    authScheme: explicitAuthScheme === "raw" ? "raw" : "bearer",
    headers: headers,
    toolAllowlist: allowlist,
  };

  downstreamAppRegistry.set(appId, app);
  clearDownstreamToolsCache(appId);
  return c.json({
    ok: true,
    source: "smithery",
    appId,
    app: toPublicDownstreamApp(app),
    server: {
      qualifiedName: detail.qualifiedName,
      displayName: detail.displayName,
      deploymentUrl,
      toolCount: catalogToolNames.length,
    },
    replaced: Boolean(existing),
  });
});

server.app.post("/api/smithery/downstream/unregister", async (c) => {
  const unauthorized = requireApiKeyResponse(c);
  if (unauthorized) {
    return unauthorized;
  }

  const body = await readJsonBody(c);
  const appId = asString(body.appId);
  if (!appId) {
    return c.json(
      {
        error: "appId is required.",
      },
      400
    );
  }

  const existing = downstreamAppRegistry.get(appId);
  if (!existing) {
    return c.json(
      {
        error: `Downstream app "${appId}" was not found.`,
      },
      404
    );
  }
  if (!isSmitheryDownstreamApp(existing)) {
    return c.json(
      {
        error: `Downstream app "${appId}" is not managed by Smithery integration.`,
      },
      400
    );
  }

  downstreamAppRegistry.delete(appId);
  clearDownstreamToolsCache(appId);
  return c.json({
    ok: true,
    source: "smithery",
    appId,
  });
});
}

server.get("/api/marketplace/providers", (c) => {
  const unauthorized = requireApiKeyResponse(c);
  if (unauthorized) {
    return unauthorized;
  }
  if (!mcpMarketplaceEnabled) {
    return c.json(
      {
        error: "Marketplace is disabled in this Maple build.",
        hint: "Use cleared downstream tools through MAPLE_DOWNSTREAM_APPS and MAPLE_MCP_EXECUTION_ORDER.",
      },
      403
    );
  }

  return c.json({
    providers: {
      smithery: {
        enabled: smitheryEnabled,
        apiBaseUrl: smitheryApiBaseUrl,
      },
      mcpso: {
        enabled: mcpSoEnabled,
        baseUrl: mcpSoBaseUrl,
      },
    },
  });
});

server.get("/api/marketplace/search", async (c) => {
  const unauthorized = requireApiKeyResponse(c);
  if (unauthorized) {
    return unauthorized;
  }
  if (!mcpMarketplaceEnabled) {
    return c.json(
      {
        error: "Marketplace is disabled in this Maple build.",
        hint: "Use cleared downstream tools through MAPLE_DOWNSTREAM_APPS and MAPLE_MCP_EXECUTION_ORDER.",
      },
      403
    );
  }

  const provider = parseMarketplaceProvider(c.req.query("provider")) ?? "all";
  const query = asString(c.req.query("q")) ?? asString(c.req.query("query"));
  const limitRaw = asNumber(c.req.query("limit"));
  const limit = limitRaw ? Math.max(1, Math.min(100, Math.trunc(limitRaw))) : 20;

  try {
    const entries = await searchMarketplaceServers({
      provider,
      query,
      limit,
    });
    return c.json({
      provider,
      query: query ?? null,
      count: entries.length,
      entries,
    });
  } catch (error) {
    return c.json(
      {
        error: "Marketplace search failed.",
        detail: errorMessage(error),
      },
      502
    );
  }
});

server.get("/api/marketplace/connected", (c) => {
  const unauthorized = requireApiKeyResponse(c);
  if (unauthorized) {
    return unauthorized;
  }
  if (!mcpMarketplaceEnabled) {
    return c.json(
      {
        error: "Marketplace is disabled in this Maple build.",
        hint: "Use cleared downstream tools through MAPLE_DOWNSTREAM_APPS and MAPLE_MCP_EXECUTION_ORDER.",
      },
      403
    );
  }

  const provider = parseMarketplaceProvider(c.req.query("provider")) ?? "all";
  const apps = listDownstreamApps(downstreamAppRegistry, true)
    .map((entry) => {
      const raw = downstreamAppRegistry.get(entry.id);
      if (!raw) {
        return undefined;
      }
      const detectedProvider = classifyMarketplaceProviderForApp(raw);
      if (!detectedProvider) {
        return undefined;
      }
      return {
        ...entry,
        provider: detectedProvider,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .filter((entry) => provider === "all" || entry.provider === provider);

  return c.json({
    provider,
    count: apps.length,
    apps,
  });
});

server.app.post("/api/marketplace/connect", async (c) => {
  const unauthorized = requireApiKeyResponse(c);
  if (unauthorized) {
    return unauthorized;
  }
  if (!mcpMarketplaceEnabled) {
    return c.json(
      {
        error: "Marketplace is disabled in this Maple build.",
        hint: "Use cleared downstream tools through MAPLE_DOWNSTREAM_APPS and MAPLE_MCP_EXECUTION_ORDER.",
      },
      403
    );
  }

  const body = await readJsonBody(c);
  const provider = parseMarketplaceProvider(body.provider);
  if (provider !== "smithery" && provider !== "mcpso") {
    return c.json(
      {
        error: "provider must be smithery or mcpso.",
      },
      400
    );
  }
  if (provider === "smithery" && !smitheryEnabled) {
    return c.json(
      {
        error: "Smithery integration is disabled.",
        hint: "Set MAPLE_SMITHERY_ENABLED=true.",
      },
      400
    );
  }
  if (provider === "mcpso" && !mcpSoEnabled) {
    return c.json(
      {
        error: "MCP.so integration is disabled.",
        hint: "Set MAPLE_MCPSO_ENABLED=true.",
      },
      400
    );
  }

  const rawId = asString(body.id) ?? asString(body.server) ?? asString(body.slug);
  if (!rawId) {
    return c.json(
      {
        error: "id is required.",
      },
      400
    );
  }

  const timeoutMsRaw = asNumber(body.timeoutMs);
  try {
    const registered = await registerMarketplaceDownstream({
      provider,
      id: normalizeMarketplaceId(provider, rawId),
      overwrite: asBoolean(body.overwrite, false),
      appId: asString(body.appId),
      name: asString(body.name),
      enabled: asBoolean(body.enabled, true),
      timeoutMs: timeoutMsRaw ? Math.max(1_000, Math.min(60_000, Math.trunc(timeoutMsRaw))) : undefined,
      query: asStringRecord(body.query),
      headers: asStringRecord(body.headers),
      apiKey: asString(body.apiKey),
      authHeader: asString(body.authHeader),
      authScheme: asString(body.authScheme)?.toLowerCase() === "raw" ? "raw" : "bearer",
      toolAllowlist: asStringArray(body.toolAllowlist),
      restrictToCatalogTools: asBoolean(body.restrictToCatalogTools, true),
    });

    return c.json({
      ok: true,
      action: "connect",
      provider: registered.provider,
      appId: registered.appId,
      app: toPublicDownstreamApp(registered.app),
      resolved: registered.resolved,
      replaced: registered.replaced,
    });
  } catch (error) {
    const detail = errorMessage(error);
    const status = /already exists/i.test(detail) ? 409 : 400;
    return c.json(
      {
        error: "Marketplace connect failed.",
        detail,
      },
      status
    );
  }
});

server.app.post("/api/marketplace/disconnect", async (c) => {
  const unauthorized = requireApiKeyResponse(c);
  if (unauthorized) {
    return unauthorized;
  }
  if (!mcpMarketplaceEnabled) {
    return c.json(
      {
        error: "Marketplace is disabled in this Maple build.",
        hint: "Use cleared downstream tools through MAPLE_DOWNSTREAM_APPS and MAPLE_MCP_EXECUTION_ORDER.",
      },
      403
    );
  }

  const body = await readJsonBody(c);
  const appId = asString(body.appId);
  if (!appId) {
    return c.json(
      {
        error: "appId is required.",
      },
      400
    );
  }

  const existing = downstreamAppRegistry.get(appId);
  if (!existing) {
    return c.json(
      {
        error: `Downstream app "${appId}" was not found.`,
      },
      404
    );
  }

  const provider = classifyMarketplaceProviderForApp(existing);
  if (!provider) {
    return c.json(
      {
        error: `Downstream app "${appId}" is not marketplace-managed.`,
      },
      400
    );
  }

  downstreamAppRegistry.delete(appId);
  clearDownstreamToolsCache(appId);
  return c.json({
    ok: true,
    action: "disconnect",
    provider,
    appId,
  });
});

server.get("/api/downstream/apps", (c) => {
  const unauthorized = requireApiKeyResponse(c);
  if (unauthorized) {
    return unauthorized;
  }

  const includeDisabled = c.req.query("includeDisabled") === "true";
  const apps = listDownstreamApps(downstreamAppRegistry, includeDisabled);
  return c.json({
    count: apps.length,
    apps,
  });
});

server.get("/api/downstream/tools", async (c) => {
  const unauthorized = requireApiKeyResponse(c);
  if (unauthorized) {
    return unauthorized;
  }

  const appId = asString(c.req.query("appId"));
  if (!appId) {
    return c.json({ error: "appId query parameter is required." }, 400);
  }

  let app: DownstreamAppConfig;
  try {
    app = resolveDownstreamApp(appId);
  } catch (configError) {
    return c.json({ error: errorMessage(configError) }, 404);
  }

  try {
    const refresh = c.req.query("refresh") === "true";
    const listed = await listToolsFromDownstreamCached(app, {
      forceRefresh: refresh,
    });
    return c.json({
      appId: app.id,
      toolCount: listed.tools.length,
      requestId: listed.requestId,
      durationMs: listed.durationMs,
      tools: listed.tools,
    });
  } catch (listError) {
    return c.json(
      {
        error: "Downstream tools/list failed.",
        detail: errorMessage(listError),
      },
      502
    );
  }
});

server.get("/api/marketplace/catalog", async (c) => {
  const unauthorized = requireApiKeyResponse(c);
  if (unauthorized) {
    return unauthorized;
  }

  if (!mcpMarketplaceEnabled) {
    return c.json(
      {
        error: "Marketplace is disabled in this Maple build.",
        hint: "Use cleared downstream tools through MAPLE_DOWNSTREAM_APPS and MAPLE_MCP_EXECUTION_ORDER.",
      },
      403
    );
  }

  try {
    const appIds = listEnabledDownstreamAppIds();
    if (appIds.length === 0) {
      return c.json({
        enabled: true,
        routeLock: mcpRouteLockEnabled,
        appCount: 0,
        toolCount: 0,
        apps: [],
        warnings: [],
      });
    }
    const catalog = await buildMarketplaceCatalogForAppIds(appIds);
    const appMetadata = new Map<string, DownstreamAppConfig>();
    for (const appId of catalog.appIds) {
      try {
        appMetadata.set(appId, resolveDownstreamApp(appId));
      } catch {
        // Ignore unresolved entries here; warnings already capture failures.
      }
    }
    const apps = catalog.appIds.map((appId) => {
      const tools = catalog.tools
        .filter((tool) => tool.appId === appId)
        .sort((a, b) => a.toolName.localeCompare(b.toolName))
        .map((tool) => ({
          toolName: tool.toolName,
          qualifiedName: tool.qualifiedName,
          description: tool.description,
          inputSchema: tool.inputSchema,
        }));
      const app = appMetadata.get(appId);
      return {
        appId,
        appName: app?.name ?? appId,
        toolCount: tools.length,
        tools,
      };
    });

    return c.json({
      enabled: true,
      routeLock: mcpRouteLockEnabled,
      appCount: apps.length,
      toolCount: catalog.tools.length,
      apps,
      warnings: catalog.warnings,
    });
  } catch (catalogError) {
    return c.json(
      {
        error: "Failed to load marketplace catalog.",
        detail: errorMessage(catalogError),
      },
      502
    );
  }
});

server.app.post("/api/downstream/dispatch", async (c) => {
  const unauthorized = requireApiKeyResponse(c);
  if (unauthorized) {
    return unauthorized;
  }

  const body = await readJsonBody(c);
  const appId = asString(body.appId);
  const chainInput = body.chainAppIds ?? body.chainApps ?? body.chain;
  const toolName = asString(body.toolName);
  const sessionId = asString(body.sessionId) ?? "maple-control";
  const traceId = asString(body.traceId);
  const toolArgs =
    body.arguments && typeof body.arguments === "object" && !Array.isArray(body.arguments)
      ? (body.arguments as Record<string, unknown>)
      : {};

  if (!toolName) {
    return c.json(
      {
        error: "toolName is required.",
      },
      400
    );
  }

  let appIds: string[];
  try {
    if (mcpRouteLockEnabled) {
      const overrideAttempted = Boolean(appId) || parseAppIdList(chainInput).length > 0;
      if (overrideAttempted) {
        return c.json(
          {
            error:
              "MCP route-lock is enabled. /api/downstream/dispatch does not accept per-request app/chain routing overrides.",
            hint: "Use configured route only (MAPLE_MCP_EXECUTION_ORDER, MAPLE_MCP_FIREWALL_DEFAULT_APP, MAPLE_MCP_PROXY_DEFAULT_TARGET_URL, or a single enabled downstream app).",
          },
          403
        );
      }
    }
    appIds = resolveDispatchAppIds({
      explicitChain: mcpRouteLockEnabled ? undefined : chainInput,
      fallbackAppId: mcpRouteLockEnabled ? undefined : appId,
      includeDefaultExecutionOrder: true,
    });
  } catch (resolutionError) {
    return c.json(
      {
        error: errorMessage(resolutionError),
      },
      400
    );
  }

  try {
    const chainResult = await dispatchDownstreamChainAndLog({
      appIds,
      toolName,
      toolArgs,
      sessionId,
      traceId,
      origin: "api",
    });
    const result = chainResult.finalResult;

    if (!chainResult.ok) {
      const status = chainResult.blockedByPolicy ? 403 : 502;
      return c.json(
        {
          ok: false,
          error: result.failure ?? "Downstream dispatch failed.",
          appId: result.app.id,
          chainAppIds: chainResult.appIds,
          chainStages: chainResult.stages,
          toolName,
          blocked: chainResult.blockedByPolicy,
          blockedByPolicy: chainResult.blockedByPolicy,
          executeAllowed: false,
          policyWouldBlock: result.preExecutionWouldBlock,
          traceId: result.trace.id,
          sessionId: result.trace.sessionId,
          stepIndex: result.step.index,
          preExecutionStepIndex: result.preExecutionStep.index,
          policy: toPolicySnapshot(result.preExecutionDecision),
          overallRiskScore: result.report.overallRiskScore,
          severity: result.report.severity,
        },
        status
      );
    }

    return c.json({
      ok: true,
      appId: result.app.id,
      chainAppIds: chainResult.appIds,
      chainStages: chainResult.stages,
      blocked: false,
      blockedByPolicy: false,
      executeAllowed: true,
      policyWouldBlock: result.preExecutionWouldBlock,
      toolName,
      traceId: result.trace.id,
      sessionId: result.trace.sessionId,
      stepIndex: result.step.index,
      preExecutionStepIndex: result.preExecutionStep.index,
      policy: toPolicySnapshot(result.preExecutionDecision),
      overallRiskScore: result.report.overallRiskScore,
      severity: result.report.severity,
      dispatch: {
        requestId: result.dispatch?.requestId,
        responseStatus: result.dispatch?.responseStatus,
        durationMs: result.dispatch?.durationMs,
      },
      result: result.dispatch?.result,
      resultPreview: result.dispatch?.textPreview,
    });
  } catch (dispatchError) {
    return c.json(
      {
        error: "Downstream dispatch could not be completed.",
        detail: errorMessage(dispatchError),
      },
      400
    );
  }
});

// ── ChatGPT Actions adapter ──

let gptOpenApiSpecCache: { spec: Record<string, unknown>; expiresAt: number } | null = null;
const GPT_SPEC_TTL_MS = 5 * 60 * 1000;
const GPT_OAUTH_CLIENT_ID = String(process.env.MAPLE_GPT_OAUTH_CLIENT_ID || "maple-gpt-client");
const GPT_OAUTH_CLIENT_SECRET = String(process.env.MAPLE_GPT_OAUTH_CLIENT_SECRET || configuredApiKeys[0] || "maple-secret");

// OAuth2 discovery endpoints (MCP spec / ChatGPT requirement)
server.get("/.well-known/oauth-authorization-server", (c) => {
  const baseUrl = String(process.env.MCP_URL || `http://localhost:${process.env.PORT || 3000}`);
  return c.json({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/gpt/oauth/authorize`,
    token_endpoint: `${baseUrl}/gpt/oauth/token`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"],
    code_challenge_methods_supported: ["S256"],
  });
});

server.get("/.well-known/oauth-protected-resource", (c) => {
  const baseUrl = String(process.env.MCP_URL || `http://localhost:${process.env.PORT || 3000}`);
  return c.json({
    resource: `${baseUrl}/mcp`,
    authorization_servers: [baseUrl],
    bearer_methods_supported: ["header"],
  });
});

// OAuth2 authorize/token endpoints for ChatGPT
server.get("/gpt/oauth/authorize", (c) => {
  const redirectUri = asString(c.req.query("redirect_uri"));
  const state = asString(c.req.query("state")) ?? "";
  if (!redirectUri) {
    return c.json({ error: "redirect_uri is required" }, 400);
  }
  const code = "maple-auth-code-" + Date.now();
  const separator = redirectUri.includes("?") ? "&" : "?";
  return c.redirect(`${redirectUri}${separator}code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`);
});

server.app.post("/gpt/oauth/token", async (c) => {
  const body = await readJsonBody(c);
  const contentType = c.req.header("content-type") ?? "";
  let clientId = asString(body.client_id);
  let clientSecret = asString(body.client_secret);

  if (!clientId && contentType.includes("application/x-www-form-urlencoded")) {
    try {
      const text = await c.req.text();
      const params = new URLSearchParams(text);
      clientId = params.get("client_id") ?? undefined;
      clientSecret = params.get("client_secret") ?? undefined;
    } catch (_e) { /* ignore */ }
  }

  if (clientId && clientId !== GPT_OAUTH_CLIENT_ID) {
    return c.json({ error: "invalid_client" }, 401);
  }
  if (clientSecret && clientSecret !== GPT_OAUTH_CLIENT_SECRET) {
    return c.json({ error: "invalid_client" }, 401);
  }

  const accessToken = configuredApiKeys[0] || "maple-access-token";
  return c.json({
    access_token: accessToken,
    token_type: "bearer",
    expires_in: 86400,
  });
});

server.get("/.well-known/ai-plugin.json", (c) => {
  const baseUrl = String(process.env.MCP_URL || `http://localhost:${process.env.PORT || 3000}`);
  return c.json({
    schema_version: "v1",
    name_for_human: "Maple MCP Tools",
    name_for_model: "maple_mcp_tools",
    description_for_human: "Access curated web, research, and utility tools through Maple's MCP firewall gateway.",
    description_for_model:
      "Maple MCP gateway providing web_search, web_fetch, wikipedia_summary, github_repo_info, weather_forecast, hn_search, arxiv_search, openlibrary_search tools. Each tool is dispatched through Maple's firewall and tracing layer.",
    auth: {
      type: "none",
    },
    api: {
      type: "openapi",
      url: `${baseUrl}/gpt/openapi.json`,
    },
    logo_url: `${baseUrl}/logo.png`,
    contact_email: "support@maple.dev",
    legal_info_url: `${baseUrl}/landing`,
  });
});

server.get("/gpt/openapi.json", async (c) => {
  const baseUrl = String(process.env.MCP_URL || `http://localhost:${process.env.PORT || 3000}`);

  if (gptOpenApiSpecCache && Date.now() < gptOpenApiSpecCache.expiresAt) {
    return c.json(gptOpenApiSpecCache.spec);
  }

  let allTools: Array<{ name: string; description?: string | null; inputSchema?: unknown }> = [];
  try {
    const appIds = resolveDispatchAppIds({ includeDefaultExecutionOrder: true });
    for (const appId of appIds) {
      try {
        const app = resolveDownstreamApp(appId);
        const listed = await listToolsFromDownstreamCached(app, {});
        allTools = allTools.concat(listed.tools);
      } catch (_appErr) {
        /* skip unavailable apps */
      }
    }
  } catch (_err) {
    /* no apps configured */
  }

  const paths: Record<string, unknown> = {};
  for (const tool of allTools) {
    const schema = tool.inputSchema && typeof tool.inputSchema === "object" ? tool.inputSchema : { type: "object", properties: {} };
    paths[`/gpt/tools/${tool.name}`] = {
      post: {
        operationId: tool.name,
        summary: tool.description ?? tool.name,
        requestBody: {
          required: true,
          content: {
            "application/json": { schema },
          },
        },
        responses: {
          "200": {
            description: "Tool result",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean" },
                    result: { type: "string" },
                    data: { type: "object" },
                  },
                },
              },
            },
          },
        },
      },
    };
  }

  const spec = {
    openapi: "3.1.0",
    info: {
      title: "Maple MCP Tools",
      description: "REST adapter for Maple MCP gateway tools. Each endpoint dispatches a tool call through Maple's firewall and tracing layer.",
      version: "1.0.0",
    },
    servers: [{ url: baseUrl }],
    paths,
    components: {},
    security: [],
  };

  gptOpenApiSpecCache = { spec, expiresAt: Date.now() + GPT_SPEC_TTL_MS };
  return c.json(spec);
});

server.app.post("/gpt/tools/:toolName", async (c) => {
  const toolName = c.req.param("toolName");
  if (!toolName) {
    return c.json({ ok: false, error: "Tool name is required." }, 400);
  }

  const body = await readJsonBody(c);
  const toolArgs: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    toolArgs[key] = value;
  }

  let appIds: string[];
  try {
    appIds = resolveDispatchAppIds({ includeDefaultExecutionOrder: true });
  } catch (resolutionError) {
    return c.json({ ok: false, error: errorMessage(resolutionError) }, 400);
  }

  try {
    const chainResult = await dispatchDownstreamChainAndLog({
      appIds,
      toolName,
      toolArgs,
      sessionId: "gpt-actions",
      origin: "api",
    });
    const result = chainResult.finalResult;

    if (!chainResult.ok) {
      return c.json({
        ok: false,
        error: result.failure ?? "Tool dispatch failed.",
      }, chainResult.blockedByPolicy ? 403 : 502);
    }

    const textPreview = result.dispatch?.textPreview ?? "";
    const rawResult = result.dispatch?.result as Record<string, unknown> | undefined;
    const structuredData = (rawResult?.structuredContent as Record<string, unknown> | undefined)?.data ?? null;

    return c.json({
      ok: true,
      result: textPreview,
      ...(structuredData ? { data: structuredData } : {}),
    });
  } catch (dispatchError) {
    return c.json({ ok: false, error: errorMessage(dispatchError) }, 500);
  }
});

server.get("/api/yc/brief", (c) => {
  const unauthorized = requireApiKeyResponse(c);
  if (unauthorized) {
    return unauthorized;
  }

  const rawFocus = c.req.query("focus");
  const focus: YcBriefFocus =
    rawFocus === "moat" || rawFocus === "traction" || rawFocus === "revenue" ? rawFocus : "full";

  const metrics = buildYcMetrics();
  return c.json({
    generatedAt: new Date().toISOString(),
    metrics,
    brief: buildYcAppBrief(metrics, focus),
  });
});

server.get("/api/runtime/status", (c) => {
  const unauthorized = requireApiKeyResponse(c);
  if (unauthorized) {
    return unauthorized;
  }

  return c.json({
    ok: true,
    status: buildRuntimeStatus(),
  });
});

server.get("/api/firewall/state", (c) => {
  const unauthorized = requireApiKeyResponse(c);
  if (unauthorized) {
    return unauthorized;
  }

  const traceId = asString(c.req.query("traceId"));
  const sessionId = asString(c.req.query("sessionId"));
  const context = buildFirewallChatContext({ traceId, sessionId });
  return c.json({
    ok: true,
    traceFound: Boolean(context.trace),
    context,
  });
});

server.app.post("/api/firewall/chat", async (c) => {
  const unauthorized = requireApiKeyResponse(c);
  if (unauthorized) {
    return unauthorized;
  }

  const body = await readJsonBody(c);
  const message = asString(body.message) ?? "Give me a firewall status update.";
  const traceId = asString(body.traceId);
  const sessionId = asString(body.sessionId);
  const includeContext = asBoolean(body.includeContext, false);
  const context = buildFirewallChatContext({ traceId, sessionId });
  const chatResult = await generateFirewallChatReply({
    question: message,
    context,
    messages: [{ role: "user", content: message }],
  });

  return c.json({
    ok: true,
    message,
    reply: chatResult.reply,
    mode: chatResult.mode,
    provider: chatResult.provider,
    attempts: chatResult.attempts,
    traceId: context.trace?.id ?? null,
    generatedAt: new Date().toISOString(),
    ...(includeContext ? { context } : {}),
  });
});

// ── Chat capabilities + streaming bridge ──
server.get("/api/chat/capabilities", async (c) => {
  const providers = firewallChatProviderOrder();
  return c.json({
    aiEnabled: providers.length > 0,
    mode: providers.length > 0 ? "ai-fallback" : "rules",
    primaryProvider: firewallChatPrimaryProvider,
    providers,
    models: {
      openai: providers.includes("openai") ? firewallChatOpenAiModel : null,
      anthropic: providers.includes("anthropic") ? firewallChatAnthropicModel : null,
    },
  });
});

server.app.post("/api/chat/stream", async (c) => {
  const unauthorized = requireApiKeyResponse(c);
  if (unauthorized) {
    return unauthorized;
  }

  const body = await readJsonBody(c);
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const normalizedHistory = normalizeFirewallChatHistory(messages, "Give me a firewall status update.");
  const userTurns = normalizedHistory.filter((turn) => turn.role === "user");
  const message = asString(userTurns[userTurns.length - 1]?.content) ?? "Give me a firewall status update.";
  const traceId = asString(body.traceId);
  const sessionId = asString(body.sessionId);
  const context = buildFirewallChatContext({ traceId, sessionId });
  const chatResult = await generateFirewallChatReply({
    question: message,
    context,
    messages: normalizedHistory,
  });
  const reply = chatResult.reply;

  // Stream the reply as SSE chunks to match frontend expectations
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      // Send reply in chunks to simulate streaming
      const words = reply.split(" ");
      let i = 0;
      const chunkSize = 3;
      function pushChunk() {
        if (i >= words.length) {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
          return;
        }
        const chunk = words.slice(i, i + chunkSize).join(" ") + (i + chunkSize < words.length ? " " : "");
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: chunk })}\n\n`));
        i += chunkSize;
        setTimeout(pushChunk, 30);
      }
      pushChunk();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});

server.app.post("/api/firewall/decision", async (c) => {
  const unauthorized = requireApiKeyResponse(c);
  if (unauthorized) {
    return unauthorized;
  }

  const body = await readJsonBody(c);
  const enforce = asBoolean(body.enforce, true);
  const traceId = asString(body.traceId);
  const sessionId = asString(body.sessionId);

  let trace = traceId ? getTraceForCurrentOwner(traceId) : undefined;
  if (traceId && !trace) {
    return c.json({ error: "Trace not found." }, 404);
  }

  if (!trace && sessionId) {
    trace = getLatestTraceBySessionForCurrentOwner(sessionId);
  }

  const candidateIndex = trace ? trace.steps.length : 0;
  const candidateStep = buildCandidateStep(body, candidateIndex, {
    actor: "agent",
    type: "tool_call",
  });
  const decision = evaluateFirewallStep(candidateStep);

  if (!enforce) {
    return c.json({
      ok: true,
      action: "firewall_decision",
      mode: "preview",
      decision: decision.action,
      executeAllowed: !decision.shouldBlock,
      shouldBlock: decision.shouldBlock,
      severity: decision.severity,
      rule: decision.rule,
      message: decision.message,
      recommendation: decision.recommendation,
      redactedPatterns: decision.redactedPatterns,
      evaluatedAt: decision.evaluatedAt,
      bridgeLocked: bridgeOverrideLockEnabled,
      step: decision.step,
    });
  }

  if (!trace) {
    const requestedSource = asString(body.source);
    const source =
      requestedSource === "openclaw" || requestedSource === "manual"
        ? requestedSource
        : "manual";
    trace = createTraceForCurrentOwner({
      sessionId: sessionId ?? `preflight-${Date.now()}`,
      source,
      status: "active",
      metadata: {
        mode: "pre-execution-gate",
      },
      steps: [],
    });
  }

  const guardedStep: TraceStep = {
    ...decision.step,
    index: trace.steps.length,
    timestamp: new Date().toISOString(),
    guardStatus: decision.shouldBlock ? "block" : "allow",
    metadata: {
      ...(decision.step.metadata ?? {}),
      preExecutionGate: true,
      executeAllowed: !decision.shouldBlock,
      gateDecisionAt: decision.evaluatedAt,
    },
  };

  trace.steps.push(guardedStep);
  if (decision.shouldBlock) {
    trace.status = "quarantined";
  }
  trace.metadata = {
    ...(trace.metadata ?? {}),
    lastPreExecutionDecision: {
      action: decision.action,
      rule: decision.rule,
      severity: decision.severity,
      shouldBlock: decision.shouldBlock,
      evaluatedAt: decision.evaluatedAt,
    },
  };
  upsertTraceForCurrentOwner(trace);
  const report = auditAndPersist(trace);

  return c.json({
    ok: true,
    action: "firewall_decision",
    mode: "enforce",
    traceId: trace.id,
    sessionId: trace.sessionId,
    stepIndex: guardedStep.index,
    decision: decision.action,
    executeAllowed: !decision.shouldBlock,
    shouldBlock: decision.shouldBlock,
    severity: decision.severity,
    rule: decision.rule,
    message: decision.message,
    recommendation: decision.recommendation,
    redactedPatterns: decision.redactedPatterns,
    evaluatedAt: decision.evaluatedAt,
    status: trace.status,
    overallRiskScore: report.overallRiskScore,
    riskSeverity: report.severity,
    bridgeLocked: bridgeOverrideLockEnabled,
  });
});

if (demoRoutesEnabled) {
server.app.get("/api/demo/sessions", async (c) => {
  const unauthorized = requireApiKeyResponse(c);
  if (unauthorized) return unauthorized;
  if (!configuredBridgeUrl || !configuredBridgeToken) {
    return c.json({ sessions: [] });
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
      const res = await fetch(new URL("/sessions", configuredBridgeUrl), {
        headers: { Authorization: `Bearer ${configuredBridgeToken}` },
        signal: controller.signal,
      });
      if (!res.ok) return c.json({ sessions: [] });
      const body = (await res.json()) as { sessions?: unknown };
      const sessions = Array.isArray(body.sessions) ? body.sessions : [];
      return c.json({ sessions });
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return c.json({ sessions: [] });
  }
});

server.app.post("/api/demo/start", async (c) => {
  const unauthorized = requireApiKeyResponse(c);
  if (unauthorized) {
    return unauthorized;
  }

  const body = await readJsonBody(c);
  const sessionId = asString(body.sessionId) ?? `yc-demo-${Date.now()}`;
  const source = "openclaw" as const;
  const bridgeTarget = resolveBridgeTarget(body);
  if (bridgeTarget.overrideRejected) {
    return c.json(bridgeOverrideDeniedBody(), 403);
  }
  const reuseLatest = asBoolean(body.reuseLatest, false);

  let trace = reuseLatest ? getLatestTraceBySessionForCurrentOwner(sessionId) : undefined;
  if (!trace) {
    try {
      trace = await startObservation({
        sessionId,
        source,
        bridgeUrl: bridgeTarget.bridgeUrl,
        token: bridgeTarget.token,
      });
      upsertTraceForCurrentOwner(trace);
    } catch (startError) {
      return c.json(
        {
          error:
            startError instanceof Error
              ? startError.message
              : "Unable to start observation from OpenClaw bridge.",
        },
        502
      );
    }
  }

  const report = auditAndPersist(trace);
  const recommendedBlockStepIndex = recommendedRiskStepIndex(trace);

  return c.json({
    ok: true,
    action: "start",
    traceId: trace.id,
    sessionId: trace.sessionId,
    source: trace.source,
    bridgeLocked: bridgeTarget.overrideLocked,
    stepCount: trace.steps.length,
    overallRiskScore: report.overallRiskScore,
    severity: report.severity,
    recommendedBlockStepIndex,
    trace: toTraceSummary(trace),
  });
});

server.app.post("/api/demo/sync", async (c) => {
  const unauthorized = requireApiKeyResponse(c);
  if (unauthorized) {
    return unauthorized;
  }

  const body = await readJsonBody(c);
  const traceId = asString(body.traceId);
  const sessionId = asString(body.sessionId);
  const explicitTrace = traceId ? getTraceForCurrentOwner(traceId) : undefined;
  const sessionTrace = !explicitTrace && sessionId ? getLatestTraceBySessionForCurrentOwner(sessionId) : undefined;
  const trace = explicitTrace ?? sessionTrace ?? resolveTraceByIdOrLatest(undefined);
  if (!trace) {
    return c.json({ error: "No traces found. Run demo start first." }, 404);
  }

  if (trace.source !== "openclaw") {
    return c.json({
      ok: true,
      action: "sync",
      traceId: trace.id,
      source: trace.source,
      synced: false,
      reason: "Trace source is not openclaw.",
      stepCount: trace.steps.length,
      status: trace.status,
    });
  }

  const ingestMode =
    trace.metadata && typeof trace.metadata.ingestMode === "string"
      ? String(trace.metadata.ingestMode).toLowerCase()
      : undefined;
  if (ingestMode === "push") {
    return c.json({
      ok: true,
      action: "sync",
      traceId: trace.id,
      sessionId: trace.sessionId,
      source: trace.source,
      synced: false,
      reason: "Trace is push-ingested; bridge sync skipped.",
      stepCount: trace.steps.length,
      status: trace.status,
    });
  }

  const metadataBridgeUrl =
    trace.metadata && typeof trace.metadata.bridgeUrl === "string"
      ? String(trace.metadata.bridgeUrl)
      : undefined;
  const bridgeTarget = resolveBridgeTarget(body, {
    defaultBridgeUrl: metadataBridgeUrl,
  });
  if (bridgeTarget.overrideRejected) {
    return c.json(bridgeOverrideDeniedBody(), 403);
  }

  try {
    const latest = await startObservation({
      sessionId: trace.sessionId,
      source: "openclaw",
      bridgeUrl: bridgeTarget.bridgeUrl,
      token: bridgeTarget.token,
    });
    const previousStepCount = trace.steps.length;
    // Preserve push-ingested/manual steps when bridge sync returns no events.
    if (latest.steps.length === 0) {
      const report = auditAndPersist(trace, {
        useCommunityBaseline: asBoolean(body.useCommunityBaseline, true),
        threshold: asNumber(body.threshold),
      });
      return c.json({
        ok: true,
        action: "sync",
        traceId: trace.id,
        sessionId: trace.sessionId,
        source: trace.source,
        synced: true,
        addedSteps: 0,
        stepCount: trace.steps.length,
        overallRiskScore: report.overallRiskScore,
        severity: report.severity,
        status: trace.status,
        bridgeUrl: bridgeTarget.bridgeUrl,
        bridgeLocked: bridgeTarget.overrideLocked,
        note: "Bridge returned no events; preserved existing trace steps.",
      });
    }
    const merged = mergeLiveOpenClawTrace(trace, latest);
    upsertTraceForCurrentOwner(merged);
    const report = auditAndPersist(merged, {
      useCommunityBaseline: asBoolean(body.useCommunityBaseline, true),
      threshold: asNumber(body.threshold),
    });
    const addedSteps = Math.max(0, merged.steps.length - previousStepCount);

    return c.json({
      ok: true,
      action: "sync",
      traceId: merged.id,
      sessionId: merged.sessionId,
      source: merged.source,
      synced: true,
      addedSteps,
      stepCount: merged.steps.length,
      overallRiskScore: report.overallRiskScore,
      severity: report.severity,
      status: merged.status,
      bridgeUrl: bridgeTarget.bridgeUrl,
      bridgeLocked: bridgeTarget.overrideLocked,
    });
  } catch (syncError) {
    return c.json(
      {
        ok: false,
        action: "sync",
        traceId: trace.id,
        error: syncError instanceof Error ? syncError.message : "Unable to sync trace.",
      },
      502
    );
  }
});

server.app.post("/api/demo/audit", async (c) => {
  const unauthorized = requireApiKeyResponse(c);
  if (unauthorized) {
    return unauthorized;
  }

  const body = await readJsonBody(c);
  const traceId = asString(body.traceId);
  const trace = resolveTraceByIdOrLatest(traceId);
  if (!trace) {
    return c.json({ error: "No traces found. Run demo start first." }, 404);
  }

  const report = auditAndPersist(trace, {
    useCommunityBaseline: asBoolean(body.useCommunityBaseline, true),
    threshold: asNumber(body.threshold),
  });

  return c.json({
    ok: true,
    action: "audit",
    traceId: trace.id,
    overallRiskScore: report.overallRiskScore,
    severity: report.severity,
    flagCount: report.flags.length,
    recommendedBlockStepIndex: recommendedRiskStepIndex(trace),
  });
});

server.app.post("/api/demo/ml", async (c) => {
  const unauthorized = requireApiKeyResponse(c);
  if (unauthorized) {
    return unauthorized;
  }

  const body = await readJsonBody(c);
  const traceId = asString(body.traceId);
  const trace = resolveTraceByIdOrLatest(traceId);
  if (!trace) {
    return c.json({ error: "No traces found. Run demo start first." }, 404);
  }

  const useCommunityBaseline = asBoolean(body.useCommunityBaseline, true);
  const threshold = asNumber(body.threshold);
  const topAnomaliesRaw = asNumber(body.topAnomalies);
  const topAnomalies = Number.isFinite(topAnomaliesRaw)
    ? Math.max(1, Math.min(20, Math.trunc(topAnomaliesRaw ?? 5)))
    : 5;

  const report = auditAndPersist(trace, {
    useCommunityBaseline,
    threshold,
  });
  const anomalies = report.flags.filter((flag) => flag.type === "embedding_anomaly").slice(0, topAnomalies);

  return c.json({
    ok: true,
    action: "ml",
    traceId: trace.id,
    overallRiskScore: report.overallRiskScore,
    severity: report.severity,
    anomalyCount: anomalies.length,
    anomalies,
    usedCommunityBaseline: useCommunityBaseline,
    baselinePoolSize: useCommunityBaseline ? sharedTraceStore.getEmbeddingBaselines(250).length : 0,
  });
});

server.app.post("/api/demo/block", async (c) => {
  const unauthorized = requireApiKeyResponse(c);
  if (unauthorized) {
    return unauthorized;
  }

  const body = await readJsonBody(c);
  const traceId = asString(body.traceId);
  const trace = resolveTraceByIdOrLatest(traceId);
  if (!trace) {
    return c.json({ error: "No traces found. Run demo start first." }, 404);
  }
  if (trace.steps.length === 0) {
    return c.json({ error: "Trace has no steps to block." }, 400);
  }

  const requestedIndex = asNumber(body.stepIndex);
  const stepIndex = Number.isFinite(requestedIndex)
    ? clampStepIndex(trace, requestedIndex ?? 0)
    : recommendedRiskStepIndex(trace);
  const reason =
    asString(body.reason) ?? "Blocked by Maple guided demo due to high-risk behavior.";

  const updated = setGuardActionForCurrentOwner(trace.id, stepIndex, "block", reason);
  if (!updated) {
    return c.json({ error: "Unable to apply block action." }, 400);
  }

  const report = auditAndPersist(updated);

  return c.json({
    ok: true,
    action: "block",
    traceId: updated.id,
    stepIndex,
    status: updated.status,
    quarantined: updated.status === "quarantined",
    overallRiskScore: report.overallRiskScore,
    severity: report.severity,
  });
});

server.app.post("/api/demo/guard", async (c) => {
  const unauthorized = requireApiKeyResponse(c);
  if (unauthorized) {
    return unauthorized;
  }

  const body = await readJsonBody(c);
  const traceId = asString(body.traceId);
  const trace = resolveTraceByIdOrLatest(traceId);
  if (!trace) {
    return c.json({ error: "No traces found. Run demo start first." }, 404);
  }
  if (trace.steps.length === 0) {
    return c.json({ error: "Trace has no steps to guard." }, 400);
  }

  const requestedIndex = asNumber(body.stepIndex);
  const stepIndex = Number.isFinite(requestedIndex)
    ? clampStepIndex(trace, requestedIndex ?? 0)
    : recommendedRiskStepIndex(trace);
  const action = body.action;
  if (action !== "allow" && action !== "block" && action !== "pending") {
    return c.json({ error: "action must be one of: allow, block, pending." }, 400);
  }

  const defaultReason =
    action === "block"
      ? "Blocked by Maple node action modal."
      : action === "allow"
        ? "Allowed by Maple node action modal."
        : "Set to pending by Maple node action modal.";
  const reason = asString(body.reason) ?? defaultReason;

  const updated = setGuardActionForCurrentOwner(trace.id, stepIndex, action, reason);
  if (!updated) {
    return c.json({ error: "Unable to apply guard action." }, 400);
  }

  const report = auditAndPersist(updated);

  return c.json({
    ok: true,
    action: "guard",
    traceId: updated.id,
    stepIndex,
    guardAction: action,
    status: updated.status,
    quarantined: updated.status === "quarantined",
    overallRiskScore: report.overallRiskScore,
    severity: report.severity,
  });
});

server.app.post("/api/demo/fork", async (c) => {
  const unauthorized = requireApiKeyResponse(c);
  if (unauthorized) {
    return unauthorized;
  }

  const body = await readJsonBody(c);
  const traceId = asString(body.traceId);
  const trace = resolveTraceByIdOrLatest(traceId);
  if (!trace) {
    return c.json({ error: "No traces found. Run demo start first." }, 404);
  }
  if (trace.steps.length === 0) {
    return c.json({ error: "Trace has no steps to fork." }, 400);
  }

  const requestedForkStep = asNumber(body.forkStepIndex);
  const fallbackForkStep = recommendedRiskStepIndex(trace);
  const forkStepIndex = Number.isFinite(requestedForkStep)
    ? clampStepIndex(trace, requestedForkStep ?? 0)
    : fallbackForkStep;
  const launchIsolatedSession = asBoolean(body.launchIsolatedSession, false);
  if (launchIsolatedSession) {
    const bridgeTarget = resolveBridgeTarget(body);
    if (bridgeTarget.overrideRejected) {
      return c.json(bridgeOverrideDeniedBody(), 403);
    }
  }

  try {
    const edits = defaultForkEdits(body.edits);
    const { forkedTrace, diff } = forkTrace(trace, forkStepIndex, edits);
    upsertTraceForCurrentOwner(forkedTrace);
    const report = auditAndPersist(forkedTrace);

    let runtime:
      | {
          launched: true;
          sessionId: string;
          traceId: string;
          source: string;
          overallRiskScore: number;
          severity: string;
        }
      | {
          launched: false;
          error: string;
        }
      | undefined;

    if (launchIsolatedSession) {
      try {
        const runtimeResult = await launchIsolatedForkSession({
          forkedTrace,
          parentTrace: trace,
          body,
        });
        runtime = {
          launched: true,
          ...runtimeResult,
        };
      } catch (runtimeError) {
        runtime = {
          launched: false,
          error:
            runtimeError instanceof Error
              ? runtimeError.message
              : "Unable to launch isolated OpenClaw fork session.",
        };
      }
    }

    return c.json({
      ok: true,
      action: "fork",
      traceId: trace.id,
      forkedTraceId: forkedTrace.id,
      forkStepIndex,
      changedSteps: diff.changedSteps,
      addedSteps: diff.addedSteps,
      overallRiskScore: report.overallRiskScore,
      severity: report.severity,
      runtime,
    });
  } catch (forkError) {
    return c.json(
      {
        error: forkError instanceof Error ? forkError.message : "Unable to fork trace.",
      },
      400
    );
  }
});

server.app.post("/api/demo/full", async (c) => {
  const unauthorized = requireApiKeyResponse(c);
  if (unauthorized) {
    return unauthorized;
  }

  const body = await readJsonBody(c);
  const sessionId = asString(body.sessionId) ?? `yc-demo-${Date.now()}`;
  const source = "openclaw" as const;
  const bridgeTarget = resolveBridgeTarget(body);
  if (bridgeTarget.overrideRejected) {
    return c.json(bridgeOverrideDeniedBody(), 403);
  }

  let trace: Trace;
  try {
    trace = await startObservation({
      sessionId,
      source,
      bridgeUrl: bridgeTarget.bridgeUrl,
      token: bridgeTarget.token,
    });
  } catch (startError) {
    return c.json(
      {
        error:
          startError instanceof Error
            ? startError.message
            : "Unable to start observation from OpenClaw bridge.",
      },
      502
    );
  }
  upsertTraceForCurrentOwner(trace);

  const startAudit = auditAndPersist(trace, {
    useCommunityBaseline: asBoolean(body.useCommunityBaseline, true),
    threshold: asNumber(body.threshold),
  });

  if (trace.steps.length === 0) {
    return c.json({ error: "Trace has no steps. Demo flow cannot continue." }, 400);
  }

  const blockStepIndex = recommendedRiskStepIndex(trace);
  const blockedTrace = setGuardActionForCurrentOwner(
    trace.id,
    blockStepIndex,
    "block",
    "Blocked by Maple guided demo full flow."
  );
  if (!blockedTrace) {
    return c.json({ error: "Unable to apply block action in full demo flow." }, 400);
  }
  const blockedAudit = auditAndPersist(blockedTrace);

  try {
    const edits = defaultForkEdits(body.edits);
    const { forkedTrace, diff } = forkTrace(blockedTrace, blockStepIndex, edits);
    upsertTraceForCurrentOwner(forkedTrace);
    const forkAudit = auditAndPersist(forkedTrace);

    const taskLabel = asString(body.taskLabel) ?? "safe inbox triage";
    const objective =
      asString(body.objective) ?? "prevent risky autonomous actions before execution";
    const tags = Array.isArray(body.tags)
      ? body.tags.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0)
      : ["security", "guardrails", "openclaw"];

    const sharedTrace = sharedTraceStore.shareTrace(blockedTrace, { taskLabel, objective, tags });
    const suggestions = sharedTraceStore.suggestEvolvedSkills(objective, {
      limit: 3,
      minConfidence: 0.3,
    });
    evolvedSuggestionsServed += suggestions.length;

    const metrics = buildYcMetrics();

    return c.json({
      ok: true,
      action: "full",
      sessionId,
      source: trace.source,
      bridgeLocked: bridgeTarget.overrideLocked,
      traceId: blockedTrace.id,
      forkedTraceId: forkedTrace.id,
      blockStepIndex,
      changedSteps: diff.changedSteps,
      startRiskScore: startAudit.overallRiskScore,
      blockedRiskScore: blockedAudit.overallRiskScore,
      forkRiskScore: forkAudit.overallRiskScore,
      sharedTraceId: sharedTrace.id,
      suggestionCount: suggestions.length,
      ycBrief: buildYcAppBrief(metrics, "full"),
    });
  } catch (forkError) {
    return c.json(
      {
        error: forkError instanceof Error ? forkError.message : "Unable to complete full demo flow.",
      },
      400
    );
  }
});

server.app.post("/api/demo/ingest", async (c) => {
  const unauthorized = requireApiKeyResponse(c);
  if (unauthorized) {
    return unauthorized;
  }

  const body = await readJsonBody(c);
  const traceId = asString(body.traceId);
  const sessionId = asString(body.sessionId);
  const event = body.event && typeof body.event === "object" ? body.event : undefined;

  if (!event) {
    return c.json({ error: "Missing required field: event" }, 400);
  }
  if (!traceId && !sessionId) {
    return c.json({ error: "Either traceId or sessionId must be provided." }, 400);
  }

  let trace = traceId ? getTraceForCurrentOwner(traceId) : undefined;

  if (!trace && sessionId) {
    trace = getLatestTraceBySessionForCurrentOwner(sessionId);
  }

  if (!trace) {
    trace = createTraceForCurrentOwner({
      sessionId: sessionId ?? `manual-${Date.now()}`,
      source: "manual",
      status: "active",
      metadata: { mode: "event-ingest" },
      steps: [],
    });
  }

  const nextIndex = trace.steps.length;
  const step = stepFromBridgeEvent(event as OpenClawRawEvent, nextIndex);
  trace.steps.push(step);
  upsertTraceForCurrentOwner(trace);

  const report = auditAndPersist(trace);

  return c.json({
    ok: true,
    traceId: trace.id,
    sessionId: trace.sessionId,
    appendedStep: step.index,
    overallRiskScore: report.overallRiskScore,
    status: trace.status,
  });
});

server.app.post("/api/demo/share", async (c) => {
  const unauthorized = requireApiKeyResponse(c);
  if (unauthorized) {
    return unauthorized;
  }

  const body = await readJsonBody(c);
  const traceId = asString(body.traceId);
  const trace = resolveTraceByIdOrLatest(traceId);
  if (!trace) {
    return c.json({ error: "No traces found. Run demo start first." }, 404);
  }

  const taskLabel = asString(body.taskLabel) ?? "safe agent workflow";
  const objective =
    asString(body.objective) ?? "prevent risky autonomous actions before execution";
  const tags = Array.isArray(body.tags)
    ? body.tags.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0)
    : [];

  const sharedTrace = sharedTraceStore.shareTrace(trace, { taskLabel, objective, tags });
  const previewQuery = objective ?? taskLabel ?? "agent automation";
  const previewSuggestions = sharedTraceStore.suggestEvolvedSkills(previewQuery, {
    limit: 2,
    minConfidence: 0.2,
  });
  evolvedSuggestionsServed += previewSuggestions.length;

  return c.json({
    ok: true,
    action: "share",
    traceId: trace.id,
    sharedTraceId: sharedTrace.id,
    behaviorSignature: sharedTrace.behaviorSignature,
    sharedAt: sharedTrace.sharedAt,
    objective: sharedTrace.objective,
    taskLabel: sharedTrace.taskLabel,
    communityStats: sharedTraceStore.getStats(),
    previewSuggestions,
  });
});

server.app.post("/api/demo/suggest", async (c) => {
  const unauthorized = requireApiKeyResponse(c);
  if (unauthorized) {
    return unauthorized;
  }

  const body = await readJsonBody(c);
  const query = asString(body.query) ?? "safe inbox triage automation";
  const limitRaw = asNumber(body.limit);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(10, Math.trunc(limitRaw ?? 3))) : 3;
  const minConfidenceRaw = asNumber(body.minConfidence);
  const minConfidence = Number.isFinite(minConfidenceRaw)
    ? Math.max(0, Math.min(1, minConfidenceRaw ?? 0.4))
    : 0.4;

  const suggestions = sharedTraceStore.suggestEvolvedSkills(query, {
    limit,
    minConfidence,
  });
  evolvedSuggestionsServed += suggestions.length;

  return c.json({
    ok: true,
    action: "suggest",
    query,
    count: suggestions.length,
    suggestions,
    communityStats: sharedTraceStore.getStats(),
  });
});

server.app.post("/api/demo/brief", async (c) => {
  const unauthorized = requireApiKeyResponse(c);
  if (unauthorized) {
    return unauthorized;
  }

  const body = await readJsonBody(c);
  const rawFocus = asString(body.focus);
  const focus: YcBriefFocus =
    rawFocus === "moat" || rawFocus === "traction" || rawFocus === "revenue" ? rawFocus : "full";

  const metrics = buildYcMetrics();
  return c.json({
    ok: true,
    action: "brief",
    generatedAt: new Date().toISOString(),
    metrics,
    brief: buildYcAppBrief(metrics, focus),
  });
});
}

server.app.post("/api/traces/clear", (c) => {
  const unauthorized = requireApiKeyResponse(c);
  if (unauthorized) {
    return unauthorized;
  }

  const removed = clearTracesForCurrentOwner();
  mapleLog("warn", "api.traces.clear", {
    removed,
    ownerScopes: currentOwnerKeyFingerprintsForLookup() ?? ["*"],
  });
  return c.json({ ok: true, removed });
});

server.app.post("/api/openclaw/events", async (c) => {
  const unauthorized = requireApiKeyResponse(c, { allowSession: false, requireApiKey: true });
  if (unauthorized) {
    return unauthorized;
  }

  const body = await readJsonBody(c);
  const traceId = asString(body.traceId);
  const sessionId = asString(body.sessionId);
  const sourceHintRaw = asString(body.source);
  const sourceHint: Trace["source"] =
    sourceHintRaw === "manual" || sourceHintRaw === "openclaw"
      ? sourceHintRaw
      : "openclaw";
  const incoming = Array.isArray(body.events)
    ? body.events
    : body.event && typeof body.event === "object"
      ? [body.event]
      : [];
  mapleLog("info", "api.openclaw.events.begin", {
    traceId: traceId ?? null,
    sessionId: sessionId ?? null,
    sourceHint,
    eventCount: incoming.length,
  });

  if (incoming.length === 0) {
    mapleLog("warn", "api.openclaw.events.reject", {
      reason: "no_events",
      traceId: traceId ?? null,
      sessionId: sessionId ?? null,
    });
    return c.json(
      {
        error: "No events provided.",
        hint: "Provide { sessionId, events: [...] } or { traceId, event: {...} }.",
      },
      400
    );
  }

  if (!traceId && !sessionId) {
    mapleLog("warn", "api.openclaw.events.reject", {
      reason: "missing_trace_or_session",
      eventCount: incoming.length,
    });
    return c.json({ error: "traceId or sessionId is required." }, 400);
  }

  const events = incoming.map(asOpenClawRawEvent).filter((event): event is OpenClawRawEvent => Boolean(event));
  if (events.length === 0) {
    mapleLog("warn", "api.openclaw.events.reject", {
      reason: "no_valid_events",
      traceId: traceId ?? null,
      sessionId: sessionId ?? null,
      eventCount: incoming.length,
    });
    return c.json({ error: "No valid event objects provided." }, 400);
  }

  try {
    const result = ingestOpenClawEvents({
      traceId,
      sessionId,
      events,
      sourceHint,
      metadata: {
        ingress: "api_openclaw_events",
      },
    });
    mapleLog("info", "api.openclaw.events.success", {
      traceId: result.trace.id,
      sessionId: result.trace.sessionId,
      source: result.trace.source,
      appendedCount: result.appendedCount,
      skippedDuplicateCount: result.skippedDuplicateCount,
      stepCount: result.trace.steps.length,
      status: result.trace.status,
    });
    return c.json({
      ok: true,
      action: "openclaw_events_ingest",
      traceId: result.trace.id,
      sessionId: result.trace.sessionId,
      source: result.trace.source,
      ingestMode: "push",
      appendedCount: result.appendedCount,
      skippedDuplicateCount: result.skippedDuplicateCount,
      stepCount: result.trace.steps.length,
      overallRiskScore: result.report.overallRiskScore,
      severity: result.report.severity,
      status: result.trace.status,
    });
  } catch (ingestError) {
    mapleLog("error", "api.openclaw.events.error", {
      traceId: traceId ?? null,
      sessionId: sessionId ?? null,
      detail: errorMessage(ingestError),
    });
    return c.json(
      {
        error: ingestError instanceof Error ? ingestError.message : "Unable to ingest OpenClaw events.",
      },
      400
    );
  }
});

server.app.use("/mcp", async (c, next) => {
  const unauthorized = requireApiKeyResponse(c, { allowSession: false, requireApiKey: true });
  if (unauthorized) {
    return unauthorized;
  }
  if (c.req.method === "POST") {
    const proxied = await handleMcpFirewallProxy(c);
    if (proxied) {
      return proxied;
    }
  }
  await next();
});

server.app.use("/sse", async (c, next) => {
  const unauthorized = requireApiKeyResponse(c, { allowSession: false, requireApiKey: true });
  if (unauthorized) {
    return unauthorized;
  }
  await next();
});

server.tool(
  {
    name: "observe_session",
    description:
      "Start observing an agent session, store its execution trace, and render a live timeline widget.",
    schema: observeSessionInputSchema,
    widget: {
      name: "trace-timeline",
      invoking: "Connecting to session...",
      invoked: "Trace timeline ready",
    },
  },
  async ({ sessionId, source, bridgeUrl, token, reuseLatest }) => {
    const bridgeTarget = resolveBridgeTarget({
      bridgeUrl,
      token,
    });
    if (bridgeTarget.overrideRejected) {
      return error(bridgeOverrideDeniedBody().reason);
    }

    let trace: Trace;

    if (reuseLatest) {
      const cached = getLatestTraceBySessionForCurrentOwner(sessionId);
      if (cached) {
        trace = cached;
      } else {
        try {
          trace = await startObservation({
            sessionId,
            source,
            bridgeUrl: bridgeTarget.bridgeUrl,
            token: bridgeTarget.token,
          });
        } catch (observeError) {
          return error(
            observeError instanceof Error
              ? observeError.message
              : "Unable to start observation from OpenClaw bridge."
          );
        }
        upsertTraceForCurrentOwner(trace);
      }
    } else {
      try {
        trace = await startObservation({
          sessionId,
          source,
          bridgeUrl: bridgeTarget.bridgeUrl,
          token: bridgeTarget.token,
        });
      } catch (observeError) {
        return error(
          observeError instanceof Error
            ? observeError.message
            : "Unable to start observation from OpenClaw bridge."
        );
      }
      upsertTraceForCurrentOwner(trace);
    }

    const report = auditAndPersist(trace);
    const timelineProps = toTimelineWidgetProps(trace);

    return widget({
      props: timelineProps,
      output: object({
        traceId: trace.id,
        sessionId: trace.sessionId,
        source: trace.source,
        stepCount: trace.steps.length,
        overallRiskScore: report.overallRiskScore,
        severity: report.severity,
        status: trace.status,
      }),
    });
  }
);

server.tool(
  {
    name: "replay_fork",
    description:
      "Fork a trace at a selected step, apply edits, and replay forward in dry-run mode for safe debugging.",
    schema: replayForkInputSchema,
    widget: {
      name: "replay-simulator",
      invoking: "Forking trace...",
      invoked: "Replay diff ready",
    },
  },
  async ({ traceId, forkStepIndex, edits }) => {
    const original = getTraceForCurrentOwner(traceId);
    if (!original) {
      return error(`Trace ${traceId} not found.`);
    }

    try {
      const { forkedTrace, diff } = forkTrace(original, forkStepIndex, edits);
      upsertTraceForCurrentOwner(forkedTrace);
      auditAndPersist(forkedTrace);

      const replayProps = toReplayWidgetProps(original, forkedTrace, diff, forkStepIndex, edits);

      return widget({
        props: replayProps,
        output: object({
          originalTraceId: original.id,
          forkedTraceId: forkedTrace.id,
          forkStepIndex,
          changedSteps: diff.changedSteps,
          addedSteps: diff.addedSteps,
          status: forkedTrace.status,
        }),
      });
    } catch (forkError) {
      return error(
        forkError instanceof Error ? forkError.message : "Unable to fork trace due to unknown error."
      );
    }
  }
);

server.tool(
  {
    name: "audit_risk",
    description:
      "Audit a trace for anomalies and risky behavior (shell/network/credentials) and return a risk dashboard.",
    schema: auditRiskInputSchema,
    widget: {
      name: "risk-dashboard",
      invoking: "Running risk analysis...",
      invoked: "Risk dashboard ready",
    },
  },
  async ({ traceId, topFlags }) => {
    const trace = getTraceForCurrentOwner(traceId);
    if (!trace) {
      return error(`Trace ${traceId} not found.`);
    }

    const report = auditAndPersist(trace);

    return widget({
      props: toRiskWidgetProps(trace, report, topFlags),
      output: object({
        traceId,
        overallRiskScore: report.overallRiskScore,
        severity: report.severity,
        flagCount: report.flags.length,
        status: trace.status,
      }),
    });
  }
);

server.tool(
  {
    name: "ml_anomaly_report",
    description:
      "Run embedding-based anomaly detection on a trace, with optional community baseline from shared anonymized traces.",
    schema: mlAnomalyReportInputSchema,
  },
  async ({ traceId, useCommunityBaseline, threshold, topAnomalies }) => {
    const trace = getTraceForCurrentOwner(traceId);
    if (!trace) {
      return error(`Trace ${traceId} not found.`);
    }

    const report = auditAndPersist(trace, { useCommunityBaseline, threshold });
    const anomalies = report.flags.filter((flag) => flag.type === "embedding_anomaly").slice(0, topAnomalies);

    return object({
      traceId,
      overallRiskScore: report.overallRiskScore,
      severity: report.severity,
      anomalyCount: anomalies.length,
      anomalies,
      usedCommunityBaseline: useCommunityBaseline,
      baselinePoolSize: useCommunityBaseline ? sharedTraceStore.getEmbeddingBaselines(250).length : 0,
    });
  }
);

server.tool(
  {
    name: "guard_action",
    description:
      "Approve, block, or set pending state for a specific risky step. Blocking quarantines the trace.",
    schema: guardActionInputSchema,
    outputSchema: guardActionOutputSchema,
  },
  async ({ traceId, stepIndex, action, reason }) => {
    const updated = setGuardActionForCurrentOwner(traceId, stepIndex, action, reason);
    if (!updated) {
      return error(
        `Unable to update guard action. Check traceId (${traceId}) and stepIndex (${stepIndex}).`
      );
    }

    auditAndPersist(updated);

    return object({
      traceId,
      stepIndex,
      action,
      status: updated.status,
      quarantined: updated.status === "quarantined",
    });
  }
);

server.tool(
  {
    name: "ingest_session_event",
    description:
      "Ingest one raw event from an external bridge or webhook into an active trace for near-real-time updates.",
    schema: z.object({
      traceId: z.string().optional(),
      sessionId: z.string().optional(),
      event: z.object({}).passthrough(),
    }),
  },
  async ({ traceId, sessionId, event }) => {
    if (!traceId && !sessionId) {
      return error("Either traceId or sessionId must be provided.");
    }

    let trace = traceId ? getTraceForCurrentOwner(traceId) : undefined;

    if (!trace && sessionId) {
      trace = getLatestTraceBySessionForCurrentOwner(sessionId);
    }

    if (!trace) {
      trace = createTraceForCurrentOwner({
        sessionId: sessionId ?? `manual-${Date.now()}`,
        source: "manual",
        status: "active",
        metadata: {
          mode: "event-ingest",
        },
        steps: [],
      });
    }

    const nextIndex = trace.steps.length;
    const step = stepFromBridgeEvent(event as OpenClawRawEvent, nextIndex);
    trace.steps.push(step);
    upsertTraceForCurrentOwner(trace);

    const report = auditAndPersist(trace);

    return object({
      traceId: trace.id,
      sessionId: trace.sessionId,
      appendedStep: step.index,
      overallRiskScore: report.overallRiskScore,
      status: trace.status,
    });
  }
);

server.tool(
  {
    name: "share_trace_anon",
    description:
      "Share an anonymized trace to the community pool to improve evolved-skill recommendations.",
    schema: shareTraceAnonInputSchema,
  },
  async ({ traceId, taskLabel, objective, tags }) => {
    const trace = getTraceForCurrentOwner(traceId);
    if (!trace) {
      return error(`Trace ${traceId} not found.`);
    }

    const sharedTrace = sharedTraceStore.shareTrace(trace, { taskLabel, objective, tags });
    const previewQuery = objective ?? taskLabel ?? "agent automation";
    const previewSuggestions = sharedTraceStore.suggestEvolvedSkills(previewQuery, {
      limit: 2,
      minConfidence: 0.2,
    });
    evolvedSuggestionsServed += previewSuggestions.length;

    return object({
      sharedTraceId: sharedTrace.id,
      behaviorSignature: sharedTrace.behaviorSignature,
      sharedAt: sharedTrace.sharedAt,
      objective: sharedTrace.objective,
      taskLabel: sharedTrace.taskLabel,
      communityStats: sharedTraceStore.getStats(),
      previewSuggestions,
    });
  }
);

server.tool(
  {
    name: "suggest_evolved_skills",
    description:
      "Generate evolved skill suggestions from anonymized shared traces using embedding similarity.",
    schema: suggestEvolvedSkillsInputSchema,
  },
  async ({ query, limit, minConfidence }) => {
    const suggestions = sharedTraceStore.suggestEvolvedSkills(query, {
      limit,
      minConfidence,
    });
    evolvedSuggestionsServed += suggestions.length;

    return object({
      query,
      count: suggestions.length,
      suggestions,
      communityStats: sharedTraceStore.getStats(),
    });
  }
);

server.tool(
  {
    name: "yc_app_brief",
    description:
      "Generate YC-ready positioning with moat, traction, and freemium revenue narrative using live product metrics.",
    schema: ycAppBriefInputSchema,
  },
  async ({ focus }) => {
    const metrics = buildYcMetrics();
    return object({
      generatedAt: new Date().toISOString(),
      metrics,
      brief: buildYcAppBrief(metrics, focus),
    });
  }
);

server.tool(
  {
    name: "list_downstream_apps",
    description:
      "List downstream MCP apps registered behind Maple. Clients should call Maple only and dispatch via this control plane.",
    schema: listDownstreamAppsInputSchema,
  },
  async ({ includeDisabled }) => {
    const apps = listDownstreamApps(downstreamAppRegistry, includeDisabled);
    return object({
      count: apps.length,
      apps,
    });
  }
);

server.tool(
  {
    name: "list_downstream_tools",
    description:
      "List tools exposed by a registered downstream MCP app through Maple proxy routing.",
    schema: listDownstreamToolsInputSchema,
  },
  async ({ appId }) => {
    let app: DownstreamAppConfig;
    try {
      app = resolveDownstreamApp(appId);
    } catch (configError) {
      return error(errorMessage(configError));
    }

    try {
      const listed = await listToolsFromDownstreamCached(app);
      return object({
        appId: app.id,
        requestId: listed.requestId,
        durationMs: listed.durationMs,
        toolCount: listed.tools.length,
        tools: listed.tools,
      });
    } catch (listError) {
      return error(`Downstream tools/list failed: ${errorMessage(listError)}`);
    }
  }
);

server.tool(
  {
    name: "dispatch_downstream_tool",
    description:
      "Dispatch a tool call to one or more downstream MCP apps via Maple in execution order, then normalize, score, and log outputs into Maple traces.",
    schema: dispatchDownstreamToolInputSchema,
  },
  async ({ appId, chainAppIds, toolName, arguments: toolArgs, sessionId, traceId }) => {
    if (mcpRouteLockEnabled) {
      const overrideAttempted = Boolean(asString(appId)) || parseAppIdList(chainAppIds).length > 0;
      if (overrideAttempted) {
        return error(
          "MCP route-lock is enabled. dispatch_downstream_tool rejects appId/chainAppIds overrides; use configured route."
        );
      }
    }

    let appIds: string[];
    try {
      appIds = resolveDispatchAppIds({
        explicitChain: mcpRouteLockEnabled ? undefined : chainAppIds,
        fallbackAppId: mcpRouteLockEnabled ? undefined : appId,
        includeDefaultExecutionOrder: true,
      });
    } catch (resolutionError) {
      return error(errorMessage(resolutionError));
    }

    try {
      const chainResult = await dispatchDownstreamChainAndLog({
        appIds,
        toolName,
        toolArgs,
        sessionId,
        traceId,
        origin: "mcp",
      });
      const result = chainResult.finalResult;

      if (!chainResult.ok) {
        if (chainResult.blockedByPolicy) {
          return error(
            `Policy blocked ${result.app.id}.${toolName} before execution: ${
              result.preExecutionDecision.message
            } trace=${result.trace.id} preExecStep=${result.preExecutionStep.index}`
          );
        }
        return error(
          `${
            result.failure ?? "Downstream dispatch failed."
          } trace=${result.trace.id} step=${result.step.index} preExecStep=${result.preExecutionStep.index}`
        );
      }

      return object({
        appId: result.app.id,
        chainAppIds: chainResult.appIds,
        chainStages: chainResult.stages,
        blocked: false,
        executeAllowed: true,
        blockedByPolicy: false,
        policyWouldBlock: result.preExecutionWouldBlock,
        toolName,
        traceId: result.trace.id,
        sessionId: result.trace.sessionId,
        stepIndex: result.step.index,
        preExecutionStepIndex: result.preExecutionStep.index,
        policy: toPolicySnapshot(result.preExecutionDecision),
        overallRiskScore: result.report.overallRiskScore,
        severity: result.report.severity,
        dispatch: {
          requestId: result.dispatch?.requestId,
          responseStatus: result.dispatch?.responseStatus,
          durationMs: result.dispatch?.durationMs,
        },
        resultPreview: result.dispatch?.textPreview,
        result: result.dispatch?.result,
      });
    } catch (dispatchError) {
      return error(`Downstream dispatch could not be completed: ${errorMessage(dispatchError)}`);
    }
  }
);

server.tool(
  {
    name: "list_traces",
    description: "List recent traces and risk metadata.",
    schema: listTracesInputSchema,
  },
  async ({ limit, sessionId }) => {
    const traces = listTracesForCurrentOwner(limit, sessionId);
    return object({
      count: traces.length,
      traces: traces.map((trace) => toTraceSummary(trace)),
    });
  }
);

server.tool(
  {
    name: "export_trace",
    description: "Export a trace in JSON or Markdown format for sharing and debugging.",
    schema: exportTraceInputSchema,
  },
  async ({ traceId, format }) => {
    const trace = getTraceForCurrentOwner(traceId);
    if (!trace) {
      return error(`Trace ${traceId} not found.`);
    }

    if (format === "markdown") {
      return text(renderTraceMarkdown(trace));
    }

    return object({
      trace,
    });
  }
);

server.listen().then(() => {
  console.log("Maple MCP server running");
  const runtimeStatus = buildRuntimeStatus();
  const activeDownstream = runtimeStatus.activeDownstreamApps;
  console.log(
    `[DOWNSTREAM] configured=${downstreamAppRegistry.size} active=${activeDownstream.length}`
  );
  console.log(
    `[MCP-FIREWALL] strict=${runtimeStatus.strict ? "true" : "false"} routeLock=${
      runtimeStatus.routeLock ? "true" : "false"
    } route=${runtimeStatus.routeSummary} bypassAllowed=${
      runtimeStatus.bypassAllowed ? "true" : "false"
    }`
  );
  if (runtimeStatus.executionOrder.length > 0) {
    console.log(
      `[MCP-FIREWALL] executionOrder=${runtimeStatus.executionOrder.join(" -> ")}`
    );
  }
  if (runtimeStatus.defaultTargetUrl) {
    console.log(`[MCP-FIREWALL] defaultTarget=${runtimeStatus.defaultTargetUrl}`);
  }
  if (mcpProxyAllowPrivateTargets) {
    console.log("[MCP-FIREWALL] private target override enabled (non-production only).");
  }
  if (mcpProxyAllowDynamicTargets) {
    console.log(
      `[MCP-FIREWALL] dynamic targets enabled; allowlist hosts=${mcpProxyAllowedHosts.join(",")}`
    );
  }
  if (mcpMarketplaceEnabled) {
    console.log(
      `[MCP-FIREWALL] marketplace mode enabled (native namespaced tool browse/call). autoConnect=${
        runtimeStatus.marketplaceAutoConnectEnabled ? "true" : "false"
      }`
    );
  }
  console.log(
    `[ROUTES] judgeUI=${judgeUiRoutesEnabled ? "enabled" : "disabled"} demo=${demoRoutesEnabled ? "enabled" : "disabled"} legacySmithery=${legacySmitheryRoutesEnabled ? "enabled" : "disabled"}`
  );
  if (apiKeyAuthEnabled) {
    console.log(`[AUTH] API key auth enabled with ${configuredApiKeys.length} key(s).`);
  } else {
    console.log("[AUTH] API key auth bypass enabled (MAPLE_ALLOW_NO_AUTH=true).");
  }
  if (!configuredBridgeUrl || !configuredBridgeToken) {
    console.log(
      "[OPENCLAW] Bridge credentials are not fully configured. source=openclaw calls will fail; use source=auto/mock unless bridge vars are set."
    );
  }
  console.log(
    `[AUTH] Dashboard session auth enabled. selfSignup=${allowSelfSignup ? "true" : "false"} ttlSeconds=${sessionTtlSeconds}`
  );
  console.log(
    `[AUTH] session owner scope=${sessionOwnerScopeMode} primaryApiKeyFingerprint=${
      primaryConfiguredApiKeyFingerprint ?? "none"
    }`
  );
  if (sessionPollEnabled && configuredBridgeUrl && configuredBridgeToken) {
    setInterval(() => {
      pollForNewSessions().catch(() => {});
    }, sessionPollIntervalMs);
    pollForNewSessions().catch(() => {});
    console.log(
      `[SESSION-POLL] enabled, interval=${sessionPollIntervalMs}ms, bridge=${configuredBridgeUrl}`
    );
  } else {
    console.log("[SESSION-POLL] disabled (no bridge credentials or MAPLE_SESSION_POLL=0)");
  }
});
