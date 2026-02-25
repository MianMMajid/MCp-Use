import type { Hono } from "hono";
import type {
  DownstreamAppConfig,
  DownstreamAppInfo,
  DownstreamToolInfo,
} from "../../control/downstream-proxy.js";
import type { Trace, TraceStep } from "../../core/types.js";
import type { FirewallStepDecision } from "../../security/firewall-policy.js";

interface RequireApiKeyContext {
  req: {
    header: (name: string) => string | undefined;
  };
  json: (body: unknown, status?: number) => Response;
}

interface ProxyRouteContext {
  req: {
    header: (name: string) => string | undefined;
    query: (name: string) => string | undefined;
  };
}

interface DispatchFinalResult {
  app: DownstreamAppConfig;
  dispatch?: {
    requestId?: string;
    responseStatus?: number;
    durationMs?: number;
    result?: unknown;
    textPreview?: string;
  };
  failure?: string;
  preExecutionWouldBlock: boolean;
  preExecutionDecision: FirewallStepDecision;
  preExecutionStep: TraceStep;
  report: {
    overallRiskScore: number;
    severity: string;
  };
  step: TraceStep;
  trace: Trace;
}

interface DispatchChainResult {
  ok: boolean;
  blockedByPolicy: boolean;
  appIds: string[];
  stages: unknown;
  finalResult: DispatchFinalResult;
}

interface DownstreamToolsListResult {
  tools: DownstreamToolInfo[];
  requestId?: string;
  durationMs?: number;
}

export interface McpProxyTargetResolution {
  app: DownstreamAppConfig;
  mode: "configured" | "dynamic";
}

export interface McpProxyTargetResolverDeps {
  asString: (value: unknown) => string | undefined;
  mcpExecutionOrderAppIds: string[];
  mcpFirewallDefaultAppId?: string;
  mcpProxyAllowDynamicTargets: boolean;
  mcpRouteLockEnabled: boolean;
  resolveAutoConfiguredAppId: () => string | undefined;
  resolveDefaultTargetApp: () => DownstreamAppConfig | undefined;
  resolveDownstreamApp: (appId: string) => DownstreamAppConfig;
  toDynamicDownstreamAppConfig: (rawUrl: string) => DownstreamAppConfig;
}

export function collectMcpRouteOverrideFields(
  c: ProxyRouteContext,
  deps: Pick<McpProxyTargetResolverDeps, "asString">
): string[] {
  const overrides: string[] = [];
  if (deps.asString(c.req.header("x-maple-downstream-app"))) {
    overrides.push("x-maple-downstream-app");
  }
  if (deps.asString(c.req.header("x-maple-chain-apps"))) {
    overrides.push("x-maple-chain-apps");
  }
  if (deps.asString(c.req.header("x-maple-downstream-url"))) {
    overrides.push("x-maple-downstream-url");
  }
  if (deps.asString(c.req.query("mapleApp"))) {
    overrides.push("mapleApp");
  }
  if (deps.asString(c.req.query("mapleChain"))) {
    overrides.push("mapleChain");
  }
  if (deps.asString(c.req.query("mapleTargetUrl"))) {
    overrides.push("mapleTargetUrl");
  }
  return overrides;
}

export function resolveMcpProxyTarget(
  c: ProxyRouteContext,
  deps: McpProxyTargetResolverDeps
): McpProxyTargetResolution | undefined {
  const bypassProxy =
    c.req.header("x-maple-proxy-bypass") === "1" || c.req.query("mapleProxy") === "off";
  if (bypassProxy) {
    throw new Error("MCP proxy bypass is disabled by policy.");
  }

  if (deps.mcpRouteLockEnabled) {
    const overrides = collectMcpRouteOverrideFields(c, {
      asString: deps.asString,
    });
    if (overrides.length > 0) {
      throw new Error(
        `MCP route-lock is enabled. Per-request route overrides are denied: ${overrides.join(", ")}.`
      );
    }
  }

  const dynamicUrl =
    deps.asString(c.req.header("x-maple-downstream-url")) ??
    deps.asString(c.req.query("mapleTargetUrl"));
  if (dynamicUrl) {
    if (!deps.mcpProxyAllowDynamicTargets) {
      throw new Error(
        "Dynamic MCP targets are disabled. Configure MAPLE_MCP_PROXY_ALLOW_DYNAMIC_TARGETS=true."
      );
    }
    return {
      app: deps.toDynamicDownstreamAppConfig(dynamicUrl),
      mode: "dynamic",
    };
  }

  const autoDefaultAppId = deps.resolveAutoConfiguredAppId();
  const executionOrderDefaultAppId =
    deps.mcpExecutionOrderAppIds.length > 0 ? deps.mcpExecutionOrderAppIds[0] : undefined;

  const appId =
    deps.asString(c.req.header("x-maple-downstream-app")) ??
    deps.asString(c.req.query("mapleApp")) ??
    deps.mcpFirewallDefaultAppId ??
    executionOrderDefaultAppId ??
    autoDefaultAppId;
  if (appId) {
    return {
      app: deps.resolveDownstreamApp(appId),
      mode: "configured",
    };
  }

  const defaultTargetApp = deps.resolveDefaultTargetApp();
  if (defaultTargetApp) {
    return {
      app: defaultTargetApp,
      mode: "dynamic",
    };
  }

  const routeResolutionHint = deps.mcpRouteLockEnabled
    ? "Set MAPLE_MCP_EXECUTION_ORDER, MAPLE_MCP_FIREWALL_DEFAULT_APP, MAPLE_MCP_PROXY_DEFAULT_TARGET_URL, or keep exactly one downstream app enabled."
    : "Set MAPLE_MCP_FIREWALL_DEFAULT_APP, MAPLE_MCP_EXECUTION_ORDER, MAPLE_MCP_PROXY_DEFAULT_TARGET_URL, send x-maple-downstream-app, or enable dynamic targets.";
  throw new Error(
    `No downstream target resolved for strict MCP firewall mode. ${routeResolutionHint}`
  );
}

interface RegisterDownstreamRoutesDeps {
  asString: (value: unknown) => string | undefined;
  dispatchDownstreamChainAndLog: (options: {
    appIds: string[];
    toolName: string;
    toolArgs: Record<string, unknown>;
    sessionId: string;
    traceId?: string;
    origin: "api" | "mcp";
  }) => Promise<DispatchChainResult>;
  downstreamAppRegistry: Map<string, DownstreamAppConfig>;
  errorMessage: (error: unknown) => string;
  listDownstreamApps: (
    appRegistry: Map<string, DownstreamAppConfig>,
    includeDisabled?: boolean
  ) => DownstreamAppInfo[];
  listToolsFromDownstreamCached: (
    app: DownstreamAppConfig,
    options?: { forceRefresh?: boolean }
  ) => Promise<DownstreamToolsListResult>;
  mcpRouteLockEnabled: boolean;
  parseAppIdList: (value: unknown) => string[];
  readJsonBody: (c: { req: { json: () => Promise<unknown> } }) => Promise<Record<string, unknown>>;
  requireApiKeyResponse: (c: RequireApiKeyContext) => Response | undefined;
  resolveDispatchAppIds: (options: {
    explicitChain?: unknown;
    fallbackAppId?: string;
    includeDefaultExecutionOrder?: boolean;
  }) => string[];
  resolveDownstreamApp: (appId: string) => DownstreamAppConfig;
  toPolicySnapshot: (decision: FirewallStepDecision) => unknown;
}

export function registerDownstreamRoutes(
  app: Hono,
  deps: RegisterDownstreamRoutesDeps
): void {
  const {
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
  } = deps;

  app.get("/api/downstream/apps", (c) => {
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

  app.get("/api/downstream/tools", async (c) => {
    const unauthorized = requireApiKeyResponse(c);
    if (unauthorized) {
      return unauthorized;
    }

    const appId = asString(c.req.query("appId"));
    if (!appId) {
      return c.json({ error: "appId query parameter is required." }, 400);
    }

    let targetApp: DownstreamAppConfig;
    try {
      targetApp = resolveDownstreamApp(appId);
    } catch (configError) {
      return c.json({ error: errorMessage(configError) }, 404);
    }

    try {
      const refresh = c.req.query("refresh") === "true";
      const listed = await listToolsFromDownstreamCached(targetApp, {
        forceRefresh: refresh,
      });
      return c.json({
        appId: targetApp.id,
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

  app.post("/api/downstream/dispatch", async (c) => {
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
}
