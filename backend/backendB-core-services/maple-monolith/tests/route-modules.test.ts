import assert from "node:assert/strict";
import { test } from "node:test";
import { Hono } from "hono";
import { registerAuthRoutes } from "../src/server/routes/auth-routes.js";
import { registerDemoRoutes } from "../src/server/routes/demo-routes.js";
import { registerDownstreamRoutes } from "../src/server/routes/downstream-routes.js";
import { registerFirewallChatRoutes } from "../src/server/routes/firewall-chat-routes.js";
import { registerGptActionsRoutes } from "../src/server/routes/gpt-actions-routes.js";
import { registerTraceReadRoutes } from "../src/server/routes/trace-read-routes.js";

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value : undefined;

const asNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const asBoolean = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") {
      return true;
    }
    if (normalized === "false" || normalized === "0") {
      return false;
    }
  }
  return fallback;
};

const readJsonBody = async (c: { req: { json: () => Promise<unknown> } }) => {
  try {
    const body = await c.req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

const requireApiKeyResponse = () => undefined;

test("gpt actions routes expose oauth metadata and tool dispatch", async () => {
  const app = new Hono();

  registerGptActionsRoutes(app, {
    asString,
    configuredApiKeys: ["test-api-key"],
    dispatchDownstreamChainAndLog: async () => ({
      ok: true,
      blockedByPolicy: false,
      finalResult: {
        dispatch: {
          textPreview: "search-result",
          result: { structuredContent: { data: { top: "ok" } } },
        },
      },
    }),
    errorMessage: (error) => (error instanceof Error ? error.message : String(error)),
    listToolsFromDownstreamCached: async () => ({
      tools: [
        {
          name: "web_search",
          description: "Search the web",
          inputSchema: { type: "object", properties: { query: { type: "string" } } },
        },
      ],
    }),
    readJsonBody,
    resolveDispatchAppIds: () => ["toolhub"],
    resolveDownstreamApp: (appId: string) => ({ id: appId } as any),
  });

  const oauthRes = await app.request(
    "http://localhost/.well-known/oauth-authorization-server"
  );
  assert.equal(oauthRes.status, 200);
  const oauthBody = (await oauthRes.json()) as { token_endpoint?: string };
  assert.ok(oauthBody.token_endpoint?.endsWith("/gpt/oauth/token"));

  const openApiRes = await app.request("http://localhost/gpt/openapi.json");
  assert.equal(openApiRes.status, 200);
  const openApiBody = (await openApiRes.json()) as { paths?: Record<string, unknown> };
  assert.ok(openApiBody.paths);
  assert.ok("/gpt/tools/web_search" in openApiBody.paths);

  const toolRes = await app.request("http://localhost/gpt/tools/web_search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: "maple" }),
  });
  assert.equal(toolRes.status, 200);
  const toolBody = (await toolRes.json()) as {
    ok?: boolean;
    result?: string;
    data?: Record<string, unknown>;
  };
  assert.equal(toolBody.ok, true);
  assert.equal(toolBody.result, "search-result");
  assert.equal(toolBody.data?.top, "ok");
});

test("firewall chat routes expose capabilities and preview decision endpoint", async () => {
  const app = new Hono();

  registerFirewallChatRoutes(app, {
    asBoolean,
    asString,
    auditAndPersist: () => ({ overallRiskScore: 7, severity: "low" }),
    bridgeOverrideLockEnabled: false,
    buildCandidateStep: (_value, index, defaults) => ({
      index,
      timestamp: new Date().toISOString(),
      actor: defaults?.actor ?? "agent",
      type: defaults?.type ?? "tool_call",
      riskScore: 0,
      riskFlags: [],
      guardStatus: "pending",
      metadata: {},
    }),
    buildFirewallChatContext: () => ({ trace: null }),
    createTraceForCurrentOwner: (base) => ({
      id: "trace-created",
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...base,
    }),
    evaluateFirewallStep: (step) => ({
      enabled: true,
      defaultAction: "allow",
      action: "allow",
      shouldBlock: false,
      severity: "low",
      rule: "none",
      message: "allowed",
      recommendation: "continue",
      redactedPatterns: [],
      evaluatedAt: new Date().toISOString(),
      step,
    }),
    firewallChatAnthropicModel: "claude-test",
    firewallChatOpenAiModel: "gpt-test",
    firewallChatPrimaryProvider: "openai",
    firewallChatProviderOrder: () => ["openai"],
    generateFirewallChatReply: async () => ({
      reply: "Firewall looks healthy.",
      mode: "ai",
      provider: "openai",
      attempts: [{ provider: "openai", ok: true }],
    }),
    getLatestTraceBySessionForCurrentOwner: () => undefined,
    getTraceForCurrentOwner: () => undefined,
    normalizeFirewallChatHistory: () => [{ role: "user", content: "status?" }],
    readJsonBody,
    requireApiKeyResponse,
    upsertTraceForCurrentOwner: (trace) => trace,
  });

  const capabilitiesRes = await app.request("http://localhost/api/chat/capabilities");
  assert.equal(capabilitiesRes.status, 200);
  const capabilitiesBody = (await capabilitiesRes.json()) as { aiEnabled?: boolean };
  assert.equal(capabilitiesBody.aiEnabled, true);

  const previewRes = await app.request("http://localhost/api/firewall/decision", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enforce: false, toolName: "web_search" }),
  });
  assert.equal(previewRes.status, 200);
  const previewBody = (await previewRes.json()) as {
    mode?: string;
    executeAllowed?: boolean;
    decision?: string;
  };
  assert.equal(previewBody.mode, "preview");
  assert.equal(previewBody.executeAllowed, true);
  assert.equal(previewBody.decision, "allow");
});

test("demo routes support direct suggest endpoint with dedicated module wiring", async () => {
  const app = new Hono();
  let trackedSuggestionCount = 0;

  registerDemoRoutes(app, {
    asBoolean,
    asNumber,
    asString,
    auditAndPersist: () => ({ overallRiskScore: 0, severity: "low", flags: [] }),
    bridgeOverrideDeniedBody: () => ({ reason: "override denied" }),
    buildYcAppBrief: () => "brief",
    buildYcMetrics: () => ({ sessions: 1 }),
    clampStepIndex: () => 0,
    createTraceForCurrentOwner: (base) => ({
      id: "trace-local",
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...base,
    }),
    defaultForkEdits: () => ({}),
    getLatestTraceBySessionForCurrentOwner: () => undefined,
    getTraceForCurrentOwner: () => undefined,
    launchIsolatedForkSession: async () => ({
      sessionId: "session-1",
      traceId: "trace-1",
      source: "openclaw",
      overallRiskScore: 0,
      severity: "low",
    }),
    mergeLiveOpenClawTrace: (existing) => existing,
    readJsonBody,
    recommendedRiskStepIndex: () => 0,
    requireApiKeyResponse,
    resolveBridgeTarget: () => ({
      bridgeUrl: "http://localhost:9999",
      token: "token",
      overrideLocked: false,
    }),
    resolveTraceByIdOrLatest: () => undefined,
    setGuardActionForCurrentOwner: () => undefined,
    sharedTraceStore: {
      getEmbeddingBaselines: () => [],
      getStats: () => ({ sharedTraceCount: 1 }),
      shareTrace: () => ({
        id: "shared-1",
        behaviorSignature: "sig",
        sharedAt: new Date().toISOString(),
        taskLabel: "task",
      }),
      suggestEvolvedSkills: (_query, options) => {
        const limit = Math.max(1, options?.limit ?? 3);
        return Array.from({ length: limit }, (_, index) => ({
          id: `skill-${index + 1}`,
          confidence: 0.8,
        }));
      },
    },
    startObservation: async () => ({
      id: "trace-started",
      sessionId: "session-started",
      source: "openclaw",
      status: "active",
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      steps: [],
      metadata: {},
    }),
    stepFromBridgeEvent: (_event, index) => ({
      index,
      timestamp: new Date().toISOString(),
      actor: "agent",
      type: "tool_call",
      riskScore: 0,
      riskFlags: [],
      guardStatus: "pending",
    }),
    toTraceSummary: () => ({ id: "summary" }),
    trackEvolvedSuggestions: (count) => {
      trackedSuggestionCount += count;
    },
    upsertTraceForCurrentOwner: (trace) => trace,
  });

  const suggestRes = await app.request("http://localhost/api/demo/suggest", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: "triage", limit: 2, minConfidence: 0.2 }),
  });
  assert.equal(suggestRes.status, 200);
  const suggestBody = (await suggestRes.json()) as {
    ok?: boolean;
    action?: string;
    count?: number;
    suggestions?: unknown[];
  };
  assert.equal(suggestBody.ok, true);
  assert.equal(suggestBody.action, "suggest");
  assert.equal(suggestBody.count, 2);
  assert.equal(Array.isArray(suggestBody.suggestions), true);
  assert.equal(suggestBody.suggestions?.length, 2);
  assert.equal(trackedSuggestionCount, 2);
});

test("auth routes expose unauthenticated me response without session/api key", async () => {
  const app = new Hono();

  registerAuthRoutes(app, {
    allowSelfSignup: true,
    asString,
    buildSessionCookie: () => "session=cookie",
    clearSessionCookieHeader: () => "session=; Max-Age=0",
    database: {
      countUsers: () => 0,
      findUserByUsername: () => undefined,
      findUserByEmail: () => undefined,
      createUser: () => {
        throw new Error("not used in this test");
      },
      createSession: () => {
        throw new Error("not used in this test");
      },
      getSession: () => undefined,
      deleteSession: () => undefined,
    } as any,
    findRequestSession: () => undefined,
    isApiKeyPresent: () => false,
    readJsonBody,
    resolveSessionOwnerFingerprint: (userId) => `session:${userId}`,
    sessionCookieValue: () => undefined,
    sessionTtlSeconds: 3600,
    toPublicUser: (user) => ({ id: user.id, username: user.username, email: user.email }),
    unauthorizedBody: (reason) => ({ error: reason }),
    verifyIncomingApiKey: () => ({ ok: false, reason: "missing_key" }),
  });

  const response = await app.request("http://localhost/api/auth/me");
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    authenticated?: boolean;
    method?: string | null;
  };
  assert.equal(body.authenticated, false);
  assert.equal(body.method, null);
});

test("downstream routes expose registered app list", async () => {
  const app = new Hono();
  const appRegistry = new Map([
    [
      "toolhub",
      {
        id: "toolhub",
        name: "Toolhub",
        description: "Local tools",
        mcpUrl: "http://toolhub.local/mcp",
        enabled: true,
      },
    ],
  ]);

  registerDownstreamRoutes(app, {
    asString,
    dispatchDownstreamChainAndLog: async () =>
      ({
        ok: true,
        blockedByPolicy: false,
        appIds: ["toolhub"],
        stages: [],
        finalResult: {
          app: appRegistry.get("toolhub"),
          preExecutionWouldBlock: false,
          preExecutionDecision: {
            enabled: true,
            defaultAction: "allow",
            action: "allow",
            shouldBlock: false,
            severity: "low",
            rule: "none",
            message: "allowed",
            recommendation: "continue",
            redactedPatterns: [],
            evaluatedAt: new Date().toISOString(),
            step: {
              index: 0,
              timestamp: new Date().toISOString(),
              actor: "agent",
              type: "tool_call",
              riskScore: 0,
              riskFlags: [],
              guardStatus: "allow",
            },
          },
          preExecutionStep: {
            index: 0,
            timestamp: new Date().toISOString(),
            actor: "agent",
            type: "tool_call",
            riskScore: 0,
            riskFlags: [],
            guardStatus: "allow",
          },
          report: { overallRiskScore: 0, severity: "low" },
          step: {
            index: 1,
            timestamp: new Date().toISOString(),
            actor: "tool",
            type: "network",
            riskScore: 0,
            riskFlags: [],
            guardStatus: "allow",
          },
          trace: {
            id: "trace-1",
            sessionId: "s1",
            source: "manual",
            status: "active",
            startedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            steps: [],
            metadata: {},
          },
        },
      }) as any,
    downstreamAppRegistry: appRegistry as any,
    errorMessage: (error) => (error instanceof Error ? error.message : String(error)),
    listDownstreamApps: (registry) =>
      Array.from(registry.values()).map((entry) => ({
        id: entry.id,
        name: entry.name,
        description: entry.description,
        mcpUrl: entry.mcpUrl,
        enabled: entry.enabled,
      })) as any,
    listToolsFromDownstreamCached: async () => ({ tools: [] }),
    mcpRouteLockEnabled: true,
    parseAppIdList: (value) =>
      Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : [],
    readJsonBody,
    requireApiKeyResponse,
    resolveDispatchAppIds: () => ["toolhub"],
    resolveDownstreamApp: (appId) => appRegistry.get(appId) as any,
    toPolicySnapshot: () => ({ action: "allow" }),
  });

  const response = await app.request("http://localhost/api/downstream/apps");
  assert.equal(response.status, 200);
  const body = (await response.json()) as { count?: number; apps?: unknown[] };
  assert.equal(body.count, 1);
  assert.equal(Array.isArray(body.apps), true);
});

test("trace-read routes expose trace summaries", async () => {
  const app = new Hono();

  registerTraceReadRoutes(app, {
    buildYcMetrics: () => ({ traces: 1 }),
    getTraceForCurrentOwner: () => undefined,
    listTracesForCurrentOwner: () => [
      {
        id: "trace-1",
        sessionId: "session-1",
        source: "manual",
        status: "active",
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: {},
        steps: [],
      },
    ] as any,
    requireApiKeyResponse,
    sharedTraceStore: {
      getStats: () => ({ shared: 0 }),
      listSharedTraces: () => [],
    },
    toTraceSummary: (trace) => ({ id: trace.id, sessionId: trace.sessionId }),
  });

  const response = await app.request("http://localhost/api/traces");
  assert.equal(response.status, 200);
  const body = (await response.json()) as { count?: number; traces?: unknown[] };
  assert.equal(body.count, 1);
  assert.equal(Array.isArray(body.traces), true);
});
