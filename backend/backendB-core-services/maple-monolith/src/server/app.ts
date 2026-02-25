import { MCPServer } from "mcp-use/server";
import { compress } from "hono/compress";
import { startObservation, stepFromBridgeEvent } from "../bridge/openclaw-bridge.js";
import {
  toTraceSummary,
} from "../core/presenters.js";
import { applyAuditToTrace, analyzeTraceRisks } from "../core/risk-engine.js";
import { TraceStore } from "../core/trace-store.js";
import type { Trace } from "../core/types.js";
import { SharedTraceStore } from "../network/shared-trace-store.js";
import { buildYcAppBrief, type YcBriefFocus } from "../strategy/yc-narrative.js";
import { MapleSqliteDatabase } from "../persistence/sqlite-db.js";
import {
  loadApiKeysFromEnv,
} from "../security/api-key.js";
import { createDownstreamOrchestration } from "./orchestration/downstream-orchestration.js";
import { createAuthRuntime } from "./orchestration/auth-runtime.js";
import { createFirewallChatContextEngine } from "./orchestration/firewall-chat-context.js";
import { createFirewallChatAiRuntime } from "./orchestration/firewall-chat-ai.js";
import { createFirewallChatOrchestration } from "./orchestration/firewall-chat-orchestration.js";
import { createBridgeForkOrchestration } from "./orchestration/bridge-fork-orchestration.js";
import { createHttpLoggingRuntime } from "./orchestration/http-logging.js";
import { createMcpFirewallProxyHandler } from "./orchestration/mcp-firewall-proxy.js";
import { createMarketplaceOrchestration } from "./orchestration/marketplace-orchestration.js";
import { createRuntimeConfig } from "./orchestration/runtime-config.js";
import {
  compactUnknown,
  extractFirstUrl,
  extractLikelyCommand,
  inferStepTypeFromDownstream,
  summarizeJsonRpcPayload,
  toInvocationSummary,
  toPolicySnapshot,
  truncateText,
} from "./orchestration/downstream-payload-utils.js";
import {
  formatRuleLabel,
  stepCommandOrUrl,
  stepFirewallRule,
  stepGuardReason,
  toFirewallActionSummary,
} from "./orchestration/firewall-step-formatting.js";
import { logServerStartup } from "./orchestration/startup-logging.js";
import { renderTraceMarkdown } from "./orchestration/trace-markdown.js";
import { createTraceLifecycle } from "./orchestration/trace-lifecycle.js";
import {
  createDefaultForkEdits,
  createTraceSelectionHelpers,
  mergeLiveOpenClawTrace,
} from "./orchestration/trace-helpers.js";
import {
  asBoolean,
  asNumber,
  asObject,
  asString,
  asStringArray,
  asStringRecord,
  dedupeBy,
  errorMessage,
  jsonRpcErrorPayload,
  parseAppIdList,
  readJsonBody,
  toFiniteNumber,
} from "./orchestration/value-utils.js";
import { registerAuthRoutes } from "./routes/auth-routes.js";
import {
  registerDownstreamRoutes,
  resolveMcpProxyTarget,
} from "./routes/downstream-routes.js";
import { registerDemoRoutes } from "./routes/demo-routes.js";
import { registerFirewallChatRoutes } from "./routes/firewall-chat-routes.js";
import { registerGptActionsRoutes } from "./routes/gpt-actions-routes.js";
import { registerMarketplaceRoutes } from "./routes/marketplace-routes.js";
import { registerJudgeUiRoutes } from "./routes/judge-ui-routes.js";
import { registerMcpTransportRoutes } from "./routes/mcp-transport-routes.js";
import { registerRuntimeMaintenanceRoutes } from "./routes/runtime-maintenance-routes.js";
import { registerSmitheryLegacyRoutes } from "./routes/smithery-routes.js";
import { registerTraceReadRoutes } from "./routes/trace-read-routes.js";
import { registerCommunityTools } from "./tools/community-tools.js";
import { registerDownstreamControlTools } from "./tools/downstream-control-tools.js";
import { registerObservationTools } from "./tools/observation-tools.js";
import { registerTraceReadTools } from "./tools/trace-read-tools.js";
import { registerTraceRiskTools } from "./tools/trace-risk-tools.js";
import { registerWidgetDownstreamTools } from "./tools/widget-downstream-tools.js";
import {
  enforceTraceFirewall,
  evaluateFirewallStep,
} from "../security/firewall-policy.js";
import {
  dispatchToolToDownstream,
  forwardJsonRpcToDownstream,
  listDownstreamApps,
  listToolsFromDownstream,
  loadDownstreamAppsFromEnv,
  type DownstreamAppConfig,
  type DownstreamAppInfo,
} from "../control/downstream-proxy.js";
import {
  fetchSmitheryServerDetails,
  listSmitheryServers,
  resolveSmitheryDeploymentUrl,
  toSmitheryDownstreamAppId,
} from "../integrations/smithery.js";

export const server = new MCPServer({
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
const isProductionRuntime = process.env.NODE_ENV === "production";

// CORS for ChatGPT Apps domains
const CHATGPT_ALLOWED_ORIGINS = new Set([
  "https://chatgpt.com",
  "https://chat.openai.com",
  "https://platform.openai.com",
]);

server.app.use("*", async (c, next) => {
  const origin = c.req.header("origin");
  if (origin && CHATGPT_ALLOWED_ORIGINS.has(origin)) {
    c.header("Access-Control-Allow-Origin", origin);
    c.header("Access-Control-Allow-Credentials", "true");
    c.header("Access-Control-Allow-Headers", "Authorization, Content-Type, x-api-key, Accept, mcp-protocol-version, mcp-session-id");
    c.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    c.header("Access-Control-Expose-Headers", "mcp-session-id");
    c.header("Access-Control-Max-Age", "86400");
    if (c.req.method === "OPTIONS") {
      return c.body(null, 204);
    }
  }
  await next();
});

const httpLoggingRuntime = createHttpLoggingRuntime();
const mapleLog = httpLoggingRuntime.mapleLog;
httpLoggingRuntime.attachRequestLoggingMiddleware(server.app);

// Skip compression in production — Cloudflare/Manufact proxy handles it.
if (!isProductionRuntime) {
  server.app.use("*", async (c, next) => {
    if (c.req.path.startsWith("/sse")) {
      await next();
      return;
    }
    await responseCompression(c, next);
  });
}

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
const runtimeConfig = createRuntimeConfig({
  configuredApiKeys,
  downstreamAppRegistry,
});
const {
  allowNoAuth,
  allowSelfSignup,
  apiKeyAuthEnabled,
  bridgeOverrideLockEnabled,
  configuredBridgeToken,
  configuredBridgeUrl,
  demoRoutesEnabled,
  downstreamToolsCacheTtlMs,
  firewallChatAiEnabled,
  firewallChatAnthropicApiKey,
  firewallChatAnthropicModel,
  firewallChatOpenAiApiKey,
  firewallChatOpenAiModel,
  firewallChatPrimaryProvider,
  firewallChatTimeoutMs,
  judgeUiRoutesEnabled,
  legacySmitheryRoutesEnabled,
  mapleDefaultTargetAppId: MAPLE_DEFAULT_TARGET_APP_ID,
  mcpExecutionOrderAppIds,
  mcpFirewallDefaultAppId,
  mcpMarketplaceAutoConnectEnabled,
  mcpMarketplaceEnabled,
  mcpProxyAllowDynamicTargets,
  mcpProxyAllowPrivateTargets,
  mcpProxyAllowedHosts,
  mcpProxyDefaultTargetUrl,
  mcpRouteLockEnabled,
  mcpSoBaseUrl,
  mcpSoEnabled,
  mcpSoTimeoutMs,
  normalizeDynamicMcpUrl,
  primaryConfiguredApiKeyFingerprint,
  sessionCookieName,
  sessionOwnerScopeMode,
  sessionPollEnabled,
  sessionPollIntervalMs,
  sessionTtlSeconds,
  smitheryApiBaseUrl,
  smitheryApiKey,
  smitheryEnabled,
  smitheryTimeoutMs,
} = runtimeConfig;

type DownstreamToolsListResult = Awaited<ReturnType<typeof listToolsFromDownstream>>;
const downstreamToolsCache = new Map<
  string,
  {
    expiresAt: number;
    value: DownstreamToolsListResult;
  }
>();
const downstreamToolsInFlight = new Map<string, Promise<DownstreamToolsListResult>>();
const authRuntime = createAuthRuntime({
  allowNoAuth,
  configuredApiKeys,
  database,
  dedupeBy,
  primaryConfiguredApiKeyFingerprint,
  sessionCookieName,
  sessionOwnerScopeMode,
});
const {
  bootstrapAuthUsers,
  buildSessionCookie,
  clearSessionCookieHeader,
  currentOwnerKeyFingerprint,
  currentOwnerKeyFingerprintsForLookup,
  findRequestSession,
  isApiKeyPresent,
  requireApiKeyResponse,
  resolveSessionOwnerFingerprint,
  sessionCookieValue,
  toPublicUser,
  unauthorizedBody,
  verifyIncomingApiKey,
} = authRuntime;

bootstrapAuthUsers();

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

const traceLifecycle = createTraceLifecycle({
  auditAndPersist,
  currentOwnerKeyFingerprint,
  currentOwnerKeyFingerprintsForLookup,
  dedupeBy,
  mapleLog,
  stepFromBridgeEvent,
  traceStore,
});

const asOpenClawRawEvent = traceLifecycle.asOpenClawRawEvent;
const clearTracesForCurrentOwner = traceLifecycle.clearTracesForCurrentOwner;
const createTraceForCurrentOwner = traceLifecycle.createTraceForCurrentOwner;
const getLatestTraceBySessionForCurrentOwner =
  traceLifecycle.getLatestTraceBySessionForCurrentOwner;
const getTraceForCurrentOwner = traceLifecycle.getTraceForCurrentOwner;
const ingestOpenClawEvents = traceLifecycle.ingestOpenClawEvents;
const listTracesForCurrentOwner = traceLifecycle.listTracesForCurrentOwner;
const setGuardActionForCurrentOwner = traceLifecycle.setGuardActionForCurrentOwner;
const upsertTraceForCurrentOwner = traceLifecycle.upsertTraceForCurrentOwner;

const downstreamOrchestration = createDownstreamOrchestration({
  asString,
  auditAndPersist,
  compactUnknown,
  dispatchToolToDownstream,
  errorMessage,
  evaluateFirewallStep,
  extractFirstUrl,
  extractLikelyCommand,
  forwardJsonRpcToDownstream,
  inferStepTypeFromDownstream,
  parseAppIdList,
  resolveDownstreamApp,
  resolveProxyTrace,
  summarizeJsonRpcPayload,
  toInvocationSummary,
  toPolicySnapshot,
  truncateText,
  upsertTraceForCurrentOwner,
});

const dispatchDownstreamChainAndLog = downstreamOrchestration.dispatchDownstreamChainAndLog;
const forwardJsonRpcAndLog = downstreamOrchestration.forwardJsonRpcAndLog;

const marketplaceOrchestration = createMarketplaceOrchestration({
  asBoolean,
  asNumber,
  asString,
  asStringArray,
  asStringRecord,
  buildRuntimeStatus,
  buildUrlWithQueryParams,
  clearDownstreamToolsCache,
  dedupeBy,
  dispatchDownstreamChainAndLog,
  downstreamAppRegistry,
  errorMessage,
  isMcpSoDownstreamApp,
  isSmitheryDownstreamApp,
  listDownstreamApps,
  listToolsFromDownstreamCached,
  mcpExecutionOrderAppIds,
  mcpFirewallDefaultAppId,
  mcpMarketplaceEnabled,
  mcpRouteLockEnabled,
  mcpSoBaseUrl,
  mcpSoEnabled,
  mcpSoTimeoutMs,
  normalizeDynamicMcpUrl,
  resolveAutoConfiguredAppId,
  resolveDownstreamApp,
  smitheryApiBaseUrl,
  smitheryApiKey,
  smitheryEnabled,
  smitheryTimeoutMs,
  toPolicySnapshot,
  toPublicDownstreamApp,
  withAbortTimeout,
});

const autoConnectAndResolveToolMatch =
  marketplaceOrchestration.autoConnectAndResolveToolMatch;
const buildMarketplaceCatalog = marketplaceOrchestration.buildMarketplaceCatalog;
const buildMarketplaceCatalogForAppIds =
  marketplaceOrchestration.buildMarketplaceCatalogForAppIds;
const classifyMarketplaceProviderForApp =
  marketplaceOrchestration.classifyMarketplaceProviderForApp;
const executeMarketplaceControlTool =
  marketplaceOrchestration.executeMarketplaceControlTool;
const getMarketplaceControlTools = marketplaceOrchestration.getMarketplaceControlTools;
const isMapleNativeToolName = marketplaceOrchestration.isMapleNativeToolName;
const isMarketplaceControlToolName =
  marketplaceOrchestration.isMarketplaceControlToolName;
const listEnabledDownstreamAppIds =
  marketplaceOrchestration.listEnabledDownstreamAppIds;
const normalizeMarketplaceId = marketplaceOrchestration.normalizeMarketplaceId;
const parseMarketplaceProvider =
  marketplaceOrchestration.parseMarketplaceProvider;
const parseMarketplaceToolName = marketplaceOrchestration.parseMarketplaceToolName;
const registerMarketplaceDownstream =
  marketplaceOrchestration.registerMarketplaceDownstream;
const resolveMarketplaceAppIds = marketplaceOrchestration.resolveMarketplaceAppIds;
const searchMarketplaceServers = marketplaceOrchestration.searchMarketplaceServers;

const mcpFirewallProxyHandler = createMcpFirewallProxyHandler({
  applyToolAllowlist,
  asBoolean,
  asNumber,
  asObject,
  asString,
  autoConnectAndResolveToolMatch,
  buildMarketplaceCatalog,
  buildMarketplaceCatalogForAppIds,
  dispatchDownstreamChainAndLog,
  errorMessage,
  executeMarketplaceControlTool,
  forwardJsonRpcAndLog,
  getMarketplaceControlTools,
  isMapleNativeToolName,
  isMarketplaceControlToolName,
  jsonRpcErrorPayload,
  listEnabledDownstreamAppIds,
  listToolsFromDownstreamCached,
  mcpExecutionOrderAppIds,
  mcpFirewallDefaultAppId,
  mcpMarketplaceAutoConnectEnabled,
  mcpMarketplaceEnabled,
  mcpProxyAllowDynamicTargets,
  mcpRouteLockEnabled,
  parseMarketplaceProvider,
  parseMarketplaceToolName,
  resolveAutoConfiguredAppId,
  resolveDefaultTargetApp,
  resolveDispatchAppIds,
  resolveDownstreamApp,
  resolveMarketplaceAppIds,
  resolveMcpProxyTarget,
  toDynamicDownstreamAppConfig,
  toPolicySnapshot,
});

const handleMcpFirewallProxy = mcpFirewallProxyHandler.handleMcpFirewallProxy;

const firewallChatContextEngine = createFirewallChatContextEngine({
  formatRuleLabel,
  getLatestTraceBySessionForCurrentOwner,
  getTraceForCurrentOwner,
  listTracesForCurrentOwner,
  stepCommandOrUrl,
  stepFirewallRule,
  stepGuardReason,
  toFirewallActionSummary,
  toFiniteNumber,
  truncateText,
});

const answerFirewallChatQuestion = firewallChatContextEngine.answerFirewallChatQuestion;
const buildFirewallChatContext = firewallChatContextEngine.buildFirewallChatContext;

const firewallChatAiRuntime = createFirewallChatAiRuntime({
  asString,
  firewallChatAnthropicApiKey,
  firewallChatAnthropicModel,
  firewallChatOpenAiApiKey,
  firewallChatOpenAiModel,
  firewallChatPrimaryProvider,
  firewallChatTimeoutMs,
  truncateText,
  withAbortTimeout,
});

const callAnthropicFirewallChat = firewallChatAiRuntime.callAnthropicFirewallChat;
const callOpenAiFirewallChat = firewallChatAiRuntime.callOpenAiFirewallChat;
const firewallChatProviderOrder = firewallChatAiRuntime.firewallChatProviderOrder;
const isNetworkActionQuery = firewallChatAiRuntime.isNetworkActionQuery;
const normalizeFirewallChatHistory = firewallChatAiRuntime.normalizeFirewallChatHistory;

const firewallChatOrchestration = createFirewallChatOrchestration({
  answerFirewallChatQuestion,
  callAnthropicFirewallChat,
  callOpenAiFirewallChat,
  errorMessage,
  firewallChatAiEnabled,
  firewallChatProviderOrder,
  isNetworkActionQuery,
  mapleLog,
  normalizeFirewallChatHistory,
});

const generateFirewallChatReply = firewallChatOrchestration.generateFirewallChatReply;

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

const { resolveTraceByIdOrLatest, clampStepIndex, recommendedRiskStepIndex } =
  createTraceSelectionHelpers({
    getTraceForCurrentOwner,
    listTracesForCurrentOwner,
  });

const defaultForkEdits = createDefaultForkEdits({
  asObject,
  asString,
});

const bridgeForkOrchestration = createBridgeForkOrchestration({
  asString,
  auditAndPersist,
  bridgeOverrideLockEnabled,
  configuredBridgeToken,
  configuredBridgeUrl,
  startObservation,
  traceStore,
});

const bridgeOverrideDeniedBody = bridgeForkOrchestration.bridgeOverrideDeniedBody;
const buildCandidateStep = bridgeForkOrchestration.buildCandidateStep;
const launchIsolatedForkSession = bridgeForkOrchestration.launchIsolatedForkSession;
const resolveBridgeTarget = bridgeForkOrchestration.resolveBridgeTarget;

registerJudgeUiRoutes(server, {
  enabled: judgeUiRoutesEnabled,
  findRequestSession,
});

server.get("/health", (c) =>
  c.json({
    ok: true,
    name: "maple",
    version: "1.0.2",
    timestamp: new Date().toISOString(),
  })
);

registerAuthRoutes(server.app, {
  allowSelfSignup,
  asString,
  buildSessionCookie,
  clearSessionCookieHeader,
  database,
  findRequestSession,
  isApiKeyPresent,
  readJsonBody,
  resolveSessionOwnerFingerprint,
  sessionCookieValue,
  sessionTtlSeconds,
  toPublicUser,
  unauthorizedBody,
  verifyIncomingApiKey,
});

registerTraceReadRoutes(server.app, {
  buildYcMetrics,
  getTraceForCurrentOwner,
  listTracesForCurrentOwner,
  requireApiKeyResponse,
  sharedTraceStore,
  toTraceSummary,
});

registerFirewallChatRoutes(server.app, {
  asBoolean,
  asString,
  auditAndPersist,
  bridgeOverrideLockEnabled,
  buildCandidateStep,
  buildFirewallChatContext,
  createTraceForCurrentOwner,
  evaluateFirewallStep,
  firewallChatAnthropicModel,
  firewallChatOpenAiModel,
  firewallChatPrimaryProvider,
  firewallChatProviderOrder,
  generateFirewallChatReply,
  getLatestTraceBySessionForCurrentOwner,
  getTraceForCurrentOwner,
  normalizeFirewallChatHistory,
  readJsonBody,
  requireApiKeyResponse,
  upsertTraceForCurrentOwner,
});

if (demoRoutesEnabled) {
  registerDemoRoutes(server.app, {
    asBoolean,
    asNumber,
    asString,
    auditAndPersist,
    bridgeOverrideDeniedBody,
    buildYcAppBrief,
    buildYcMetrics,
    clampStepIndex,
    createTraceForCurrentOwner,
    defaultForkEdits,
    getLatestTraceBySessionForCurrentOwner,
    getTraceForCurrentOwner,
    launchIsolatedForkSession,
    mergeLiveOpenClawTrace,
    readJsonBody,
    recommendedRiskStepIndex,
    requireApiKeyResponse,
    resolveBridgeTarget,
    resolveTraceByIdOrLatest,
    setGuardActionForCurrentOwner,
    sharedTraceStore,
    startObservation,
    stepFromBridgeEvent,
    toTraceSummary,
    trackEvolvedSuggestions: (count) => {
      evolvedSuggestionsServed += count;
    },
    upsertTraceForCurrentOwner,
  });
}

if (legacySmitheryRoutesEnabled) {
  registerSmitheryLegacyRoutes(server.app, {
    asBoolean,
    asNumber,
    asString,
    asStringArray,
    asStringRecord,
    buildUrlWithQueryParams,
    clearDownstreamToolsCache,
    downstreamAppRegistry,
    errorMessage,
    fetchSmitheryServerDetails,
    isSmitheryDownstreamApp,
    listDownstreamApps,
    listSmitheryServers,
    readJsonBody,
    requireApiKeyResponse,
    resolveSmitheryDeploymentUrl,
    smitheryApiBaseUrl,
    smitheryApiKey,
    smitheryEnabled,
    smitheryTimeoutMs,
    toPublicDownstreamApp,
    toSmitheryDownstreamAppId,
    withAbortTimeout,
  });
}

registerMarketplaceRoutes(server.app, {
  asBoolean,
  asNumber,
  asString,
  asStringArray,
  asStringRecord,
  buildMarketplaceCatalogForAppIds,
  classifyMarketplaceProviderForApp,
  clearDownstreamToolsCache,
  downstreamAppRegistry,
  errorMessage,
  listDownstreamApps,
  listEnabledDownstreamAppIds,
  mcpMarketplaceEnabled,
  mcpRouteLockEnabled,
  mcpSoBaseUrl,
  mcpSoEnabled,
  normalizeMarketplaceId,
  parseMarketplaceProvider,
  readJsonBody,
  registerMarketplaceDownstream,
  requireApiKeyResponse,
  resolveDownstreamApp,
  searchMarketplaceServers,
  smitheryApiBaseUrl,
  smitheryEnabled,
  toPublicDownstreamApp,
});

registerDownstreamRoutes(server.app, {
  asString,
  dispatchDownstreamChainAndLog,
  downstreamAppRegistry,
  errorMessage,
  listDownstreamApps,
  listToolsFromDownstreamCached,
  mcpRouteLockEnabled,
  parseAppIdList,
  readJsonBody,
  requireApiKeyResponse,
  resolveDispatchAppIds,
  resolveDownstreamApp,
  toPolicySnapshot,
});

registerGptActionsRoutes(server.app, {
  asString,
  configuredApiKeys,
  dispatchDownstreamChainAndLog,
  errorMessage,
  listToolsFromDownstreamCached,
  readJsonBody,
  resolveDispatchAppIds,
  resolveDownstreamApp,
});

registerRuntimeMaintenanceRoutes(server.app, {
  asString,
  asOpenClawRawEvent,
  buildRuntimeStatus,
  buildYcAppBrief,
  buildYcMetrics,
  clearTracesForCurrentOwner,
  currentOwnerKeyFingerprintsForLookup,
  errorMessage,
  ingestOpenClawEvents,
  mapleLog,
  readJsonBody,
  requireApiKeyResponse,
});

registerMcpTransportRoutes(server.app, {
  allowNoAuth,
  handleMcpFirewallProxy,
  requireApiKeyResponse,
});

registerObservationTools(server, {
  auditAndPersist,
  bridgeOverrideDeniedBody,
  createTraceForCurrentOwner,
  getLatestTraceBySessionForCurrentOwner,
  getTraceForCurrentOwner,
  resolveBridgeTarget,
  startObservation,
  stepFromBridgeEvent,
  upsertTraceForCurrentOwner,
});

registerTraceRiskTools(server, {
  auditAndPersist,
  getTraceForCurrentOwner,
  setGuardActionForCurrentOwner,
  sharedTraceStore,
  upsertTraceForCurrentOwner,
});

registerCommunityTools(server, {
  buildYcAppBrief,
  buildYcMetrics,
  getTraceForCurrentOwner,
  sharedTraceStore,
  trackEvolvedSuggestions: (count) => {
    evolvedSuggestionsServed += count;
  },
});

registerDownstreamControlTools(server, {
  asString,
  dispatchDownstreamChainAndLog,
  errorMessage,
  listDownstreamAppsFromRegistry: (includeDisabled = false) =>
    listDownstreamApps(downstreamAppRegistry, includeDisabled),
  listToolsFromDownstreamCached,
  mcpRouteLockEnabled,
  parseAppIdList,
  resolveDispatchAppIds,
  resolveDownstreamApp,
  toPolicySnapshot,
});

registerWidgetDownstreamTools(server, {
  dispatchDownstreamChainAndLog,
  resolveDispatchAppIds,
});

registerTraceReadTools(server, {
  getTraceForCurrentOwner,
  listTracesForCurrentOwner,
  renderTraceMarkdown,
  toTraceSummary,
});

const disableAutostart =
  String(process.env.MAPLE_DISABLE_AUTOSTART ?? "0").trim().toLowerCase() === "true" ||
  String(process.env.MAPLE_DISABLE_AUTOSTART ?? "0").trim() === "1";

if (!disableAutostart) {
  server.listen().then(() => {
    logServerStartup({
      allowSelfSignup,
      apiKeyAuthEnabled,
      buildRuntimeStatus,
      configuredApiKeyCount: configuredApiKeys.length,
      configuredBridgeToken,
      configuredBridgeUrl,
      demoRoutesEnabled,
      downstreamConfiguredCount: downstreamAppRegistry.size,
      judgeUiRoutesEnabled,
      legacySmitheryRoutesEnabled,
      mcpMarketplaceEnabled,
      mcpProxyAllowedHosts,
      mcpProxyAllowDynamicTargets,
      mcpProxyAllowPrivateTargets,
      primaryConfiguredApiKeyFingerprint,
      sessionOwnerScopeMode,
      sessionTtlSeconds,
      sessionPolling: {
        enabled: sessionPollEnabled,
        intervalMs: sessionPollIntervalMs,
        bridgeUrl: configuredBridgeUrl,
        bridgeToken: configuredBridgeToken,
        pollForNewSessions,
      },
    });
  });
}
