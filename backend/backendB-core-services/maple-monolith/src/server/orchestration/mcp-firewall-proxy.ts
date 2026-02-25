import type { McpProxyTargetResolution, McpProxyTargetResolverDeps } from "../routes/downstream-routes.js";

interface ProxyRequestContext {
  req: {
    header: (name: string) => string | undefined;
    query: (name: string) => string | undefined;
    json: () => Promise<unknown>;
    raw?: Request;
  };
  json: (body: unknown, status?: number) => Response;
}

interface CreateMcpFirewallProxyHandlerDeps {
  applyToolAllowlist: (app: any, tools: Array<Record<string, unknown>>) => Array<Record<string, unknown>>;
  asObject: (value: unknown) => Record<string, unknown>;
  asString: (value: unknown) => string | undefined;
  dispatchDownstreamChainAndLog: (options: {
    appIds: string[];
    toolName: string;
    toolArgs: Record<string, unknown>;
    sessionId: string;
    traceId?: string;
    origin: "mcp_proxy";
  }) => Promise<{
    ok: boolean;
    blockedByPolicy: boolean;
    appIds: string[];
    stages: unknown;
    finalResult: {
      app: { id: string };
      dispatch?: { result?: unknown };
      failure?: string;
      preExecutionWouldBlock: boolean;
      preExecutionDecision: any;
      preExecutionStep: { index: number };
      report: { overallRiskScore: number; severity: string };
      step: { index: number };
      trace: { id: string; sessionId: string };
    };
  }>;
  errorMessage: (error: unknown) => string;
  forwardJsonRpcAndLog: (options: {
    appId: string;
    rpcMethod: string;
    rpcPayload: Record<string, unknown>;
    sessionId?: string;
    traceId?: string;
    origin: "mcp_proxy";
  }) => Promise<{
    ok: boolean;
    blockedByPolicy: boolean;
    preExecutionWouldBlock: boolean;
    preExecutionDecision: unknown;
    preExecutionStep: { index: number };
    app: { id: string };
    trace: { id: string; sessionId: string };
    step: { index: number };
    failure?: string;
    forward?: { payload?: unknown; responseStatus?: number };
  }>;
  jsonRpcErrorPayload: (
    id: unknown,
    code: number,
    message: string,
    data?: Record<string, unknown>
  ) => Record<string, unknown>;
  listToolsFromDownstreamCached: (app: any) => Promise<{ tools: any[] }>;
  mcpExecutionOrderAppIds: string[];
  mcpFirewallDefaultAppId?: string;
  mcpProxyAllowDynamicTargets: boolean;
  mcpRouteLockEnabled: boolean;
  resolveAutoConfiguredAppId: () => string | undefined;
  resolveDefaultTargetApp: () => any;
  resolveDispatchAppIds: (options: {
    explicitChain?: unknown;
    fallbackAppId?: string;
    includeDefaultExecutionOrder?: boolean;
  }) => string[];
  resolveDownstreamApp: (appId: string) => any;
  resolveMcpProxyTarget: (
    c: { req: { header: (name: string) => string | undefined; query: (name: string) => string | undefined } },
    deps: McpProxyTargetResolverDeps
  ) => McpProxyTargetResolution | undefined;
  toDynamicDownstreamAppConfig: (rawUrl: string) => any;
  toPolicySnapshot: (decision: any) => unknown;
}

const LOCAL_TOOL_NAMES = new Set([
  "observe_session",
  "ingest_session_event",
  "guard_action",
  "audit_risk",
  "ml_anomaly_report",
  "replay_fork",
  "share_trace_anon",
  "suggest_evolved_skills",
  "yc_app_brief",
  "list_traces",
  "export_trace",
  "list_downstream_apps",
  "list_downstream_tools",
  "dispatch_downstream_tool",
]);

function isLocalToolName(toolName: string): boolean {
  if (LOCAL_TOOL_NAMES.has(toolName)) {
    return true;
  }
  return toolName.startsWith("widget_");
}

function parseQualifiedToolName(
  rawToolName: string
): { appId: string; toolName: string } | undefined {
  const normalized = String(rawToolName ?? "").trim();
  if (!normalized.includes("::")) {
    return undefined;
  }
  const separator = normalized.indexOf("::");
  const appId = normalized.slice(0, separator).trim();
  const toolName = normalized.slice(separator + 2).trim();
  if (!appId || !toolName) {
    return undefined;
  }
  return { appId, toolName };
}

export function createMcpFirewallProxyHandler(deps: CreateMcpFirewallProxyHandlerDeps): {
  handleMcpFirewallProxy: (c: ProxyRequestContext) => Promise<Response | undefined>;
} {
  const {
    applyToolAllowlist,
    asObject,
    asString,
    dispatchDownstreamChainAndLog,
    errorMessage,
    forwardJsonRpcAndLog,
    jsonRpcErrorPayload,
    listToolsFromDownstreamCached,
    mcpExecutionOrderAppIds,
    mcpFirewallDefaultAppId,
    mcpProxyAllowDynamicTargets,
    mcpRouteLockEnabled,
    resolveAutoConfiguredAppId,
    resolveDefaultTargetApp,
    resolveDispatchAppIds,
    resolveDownstreamApp,
    resolveMcpProxyTarget,
    toDynamicDownstreamAppConfig,
    toPolicySnapshot,
  } = deps;

  const handleMcpFirewallProxy = async (
    c: ProxyRequestContext
  ): Promise<Response | undefined> => {
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
      target = resolveMcpProxyTarget(c, {
        asString,
        mcpExecutionOrderAppIds,
        mcpFirewallDefaultAppId,
        mcpProxyAllowDynamicTargets,
        mcpRouteLockEnabled,
        resolveAutoConfiguredAppId,
        resolveDefaultTargetApp,
        resolveDownstreamApp,
        toDynamicDownstreamAppConfig,
      });
    } catch (resolutionError) {
      targetResolutionError = resolutionError;
    }

    const proxyTargetErrorResponse = () => {
      const detail = errorMessage(targetResolutionError ?? "No MCP proxy target resolved.");
      const isBypassDenied = detail.includes("bypass is disabled");
      const isRouteLockDenied = detail.includes("route-lock is enabled");
      const isStrictUnresolved = detail.includes("strict MCP firewall mode");
      const status = isBypassDenied || isRouteLockDenied ? 403 : isStrictUnresolved ? 503 : 400;
      const code =
        isBypassDenied || isRouteLockDenied ? -32003 : isStrictUnresolved ? -32004 : -32600;
      return c.json(
        jsonRpcErrorPayload(id, code, "Proxy target rejected.", {
          detail,
        }),
        status
      );
    };

    const targetResolutionDetail = errorMessage(targetResolutionError ?? "");
    const routeLockTargetOverrideDenied = targetResolutionDetail.includes("route-lock is enabled");

    if (method === "tools/list") {
      try {
        if (!target && routeLockTargetOverrideDenied) {
          return proxyTargetErrorResponse();
        }

        const explicitChain = asString(c.req.header("x-maple-chain-apps")) ?? asString(c.req.query("mapleChain"));
        const appIds = target
          ? [target.app.id]
          : resolveDispatchAppIds({
              explicitChain,
              includeDefaultExecutionOrder: true,
            });

        if (target?.mode === "dynamic" && appIds.length > 1) {
          return c.json(
            jsonRpcErrorPayload(
              id,
              -32602,
              "Dynamic target mode does not support multi-app tools/list.",
              {
                mode: target.mode,
                appIds,
              }
            ),
            400
          );
        }

        const multipleApps = appIds.length > 1;
        const tools: Array<Record<string, unknown>> = [];

        for (const appId of appIds) {
          const app =
            target?.mode === "dynamic" && target.app.id === appId
              ? target.app
              : resolveDownstreamApp(appId);
          const listed = await listToolsFromDownstreamCached(app);
          const normalized = applyToolAllowlist(
            app,
            listed.tools.map((tool) => ({
              name: tool.name,
              ...(tool.description ? { description: tool.description } : {}),
              ...(tool.inputSchema !== undefined ? { inputSchema: tool.inputSchema } : {}),
              ...(tool.annotations ? { annotations: tool.annotations } : {}),
            }))
          );

          for (const tool of normalized) {
            const toolName = asString(tool.name) ?? "";
            if (!toolName) {
              continue;
            }
            const qualifiedName = `${app.id}::${toolName}`;
            tools.push({
              name: multipleApps ? qualifiedName : toolName,
              ...(tool.description
                ? {
                    description: multipleApps
                      ? `[${app.id}] ${String(tool.description)}`
                      : String(tool.description),
                  }
                : {}),
              ...(tool.inputSchema !== undefined ? { inputSchema: tool.inputSchema } : {}),
              ...(tool.annotations ? { annotations: tool.annotations } : {}),
              _meta: {
                mapleProxyAppId: app.id,
                mapleProxyToolName: toolName,
                mapleQualifiedName: qualifiedName,
              },
            });
          }
        }

        return c.json(
          {
            jsonrpc: "2.0",
            id,
            result: {
              tools,
              appIds,
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

      if (isLocalToolName(toolName)) {
        return undefined;
      }

      if (!target && routeLockTargetOverrideDenied) {
        return proxyTargetErrorResponse();
      }

      const chainHeader = asString(c.req.header("x-maple-chain-apps"));
      const chainQuery = asString(c.req.query("mapleChain"));
      const qualifiedTool = parseQualifiedToolName(toolName);
      let normalizedToolName = toolName;
      let explicitAppIds: string[] | undefined;

      if (qualifiedTool) {
        normalizedToolName = qualifiedTool.toolName;

        try {
          resolveDownstreamApp(qualifiedTool.appId);
        } catch (resolutionError) {
          return c.json(
            jsonRpcErrorPayload(id, -32602, "Invalid tools/call params: unknown app.", {
              detail: errorMessage(resolutionError),
              requestedAppId: qualifiedTool.appId,
            }),
            400
          );
        }

        if (target?.mode === "dynamic" && target.app.id !== qualifiedTool.appId) {
          return c.json(
            jsonRpcErrorPayload(
              id,
              -32602,
              "Dynamic target mode does not allow qualified appId overrides.",
              {
                mode: target.mode,
                requestedAppId: qualifiedTool.appId,
                resolvedAppId: target.app.id,
              }
            ),
            400
          );
        }

        if (
          mcpRouteLockEnabled &&
          target?.mode === "configured" &&
          target.app.id !== qualifiedTool.appId
        ) {
          return c.json(
            jsonRpcErrorPayload(
              id,
              -32003,
              `Tool "${toolName}" targets app "${qualifiedTool.appId}" which is outside route lock.`,
              {
                requestedAppId: qualifiedTool.appId,
                allowedAppId: target.app.id,
              }
            ),
            403
          );
        }

        explicitAppIds = [qualifiedTool.appId];
      }

      const rawToolArgs =
        params.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments)
          ? (params.arguments as Record<string, unknown>)
          : {};
      const toolArgs: Record<string, unknown> = { ...rawToolArgs };

      const sessionId =
        asString(c.req.header("x-maple-session-id")) ??
        asString(c.req.header("mcp-session-id")) ??
        `mcp-proxy-${target?.app.id ?? explicitAppIds?.[0] ?? "downstream"}`;
      const traceId = asString(c.req.header("x-maple-trace-id"));

      try {
        const appIds =
          explicitAppIds ??
          resolveDispatchAppIds({
            explicitChain: chainHeader ?? chainQuery,
            fallbackAppId: target?.app.id,
            includeDefaultExecutionOrder: target ? target.mode !== "dynamic" : true,
          });

        if (target?.mode === "dynamic" && appIds.length > 1) {
          return c.json(
            jsonRpcErrorPayload(
              id,
              -32602,
              "Dynamic target mode does not support multi-app chain execution.",
              {
                mode: target.mode,
                appIds,
              }
            ),
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
            toolName: normalizedToolName,
            requestedToolName: toolName,
          }),
          502
        );
      }
    }

    if (method !== "tools/list" && method !== "tools/call") {
      return undefined;
    }

    if (!target) {
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
          jsonRpcErrorPayload(
            id,
            blockedCode,
            forwarded.failure ?? "Downstream MCP proxy forward failed.",
            {
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
            }
          ),
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
  };

  return {
    handleMcpFirewallProxy,
  };
}
