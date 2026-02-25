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
  asBoolean: (value: unknown, fallback: boolean) => boolean;
  asNumber: (value: unknown) => number | undefined;
  asObject: (value: unknown) => Record<string, unknown>;
  asString: (value: unknown) => string | undefined;
  autoConnectAndResolveToolMatch: (options: {
    toolName: string;
    provider: "smithery" | "mcpso" | "all";
    searchQuery: string;
    searchLimit: number;
  }) => Promise<{
    match?: { appId: string; toolName: string };
    attempted: string[];
    warnings: string[];
  }>;
  buildMarketplaceCatalog: (target: McpProxyTargetResolution) => Promise<{
    appIds: string[];
    tools: Array<{
      appId: string;
      appName: string;
      toolName: string;
      qualifiedName: string;
      description?: string;
      inputSchema?: unknown;
      annotations?: unknown;
    }>;
    warnings: Array<{ appId: string; message: string }>;
  }>;
  buildMarketplaceCatalogForAppIds: (appIds: string[]) => Promise<{
    appIds: string[];
    tools: Array<{
      appId: string;
      appName: string;
      toolName: string;
      qualifiedName: string;
      description?: string;
      inputSchema?: unknown;
      annotations?: unknown;
    }>;
    warnings: Array<{ appId: string; message: string }>;
  }>;
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
  executeMarketplaceControlTool: (
    toolName: string,
    toolArgs: Record<string, unknown>
  ) => Promise<unknown>;
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
  getMarketplaceControlTools: () => Array<{ name: string; description: string; inputSchema: unknown }>;
  isMapleNativeToolName: (toolName: string) => boolean;
  isMarketplaceControlToolName: (toolName: string) => boolean;
  jsonRpcErrorPayload: (
    id: unknown,
    code: number,
    message: string,
    data?: Record<string, unknown>
  ) => Record<string, unknown>;
  listEnabledDownstreamAppIds: () => string[];
  listToolsFromDownstreamCached: (app: any) => Promise<{ tools: any[] }>;
  mcpExecutionOrderAppIds: string[];
  mcpFirewallDefaultAppId?: string;
  mcpMarketplaceAutoConnectEnabled: boolean;
  mcpMarketplaceEnabled: boolean;
  mcpProxyAllowDynamicTargets: boolean;
  mcpRouteLockEnabled: boolean;
  parseMarketplaceProvider: (value: unknown) => "smithery" | "mcpso" | "all" | undefined;
  parseMarketplaceToolName: (value: string) => { appId: string; toolName: string } | undefined;
  resolveAutoConfiguredAppId: () => string | undefined;
  resolveDefaultTargetApp: () => any;
  resolveDispatchAppIds: (options: {
    explicitChain?: unknown;
    fallbackAppId?: string;
    includeDefaultExecutionOrder?: boolean;
  }) => string[];
  resolveDownstreamApp: (appId: string) => any;
  resolveMarketplaceAppIds: (target: McpProxyTargetResolution) => string[];
  resolveMcpProxyTarget: (
    c: { req: { header: (name: string) => string | undefined; query: (name: string) => string | undefined } },
    deps: McpProxyTargetResolverDeps
  ) => McpProxyTargetResolution | undefined;
  toDynamicDownstreamAppConfig: (rawUrl: string) => any;
  toPolicySnapshot: (decision: any) => unknown;
}

export function createMcpFirewallProxyHandler(deps: CreateMcpFirewallProxyHandlerDeps): {
  handleMcpFirewallProxy: (c: ProxyRequestContext) => Promise<Response | undefined>;
} {
  const {
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
  } = deps;

  const handleMcpFirewallProxy = async (c: ProxyRequestContext): Promise<Response | undefined> => {
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
                  const description = multipleApps
                    ? `[${tool.appId}] ${baseDescription}`
                    : baseDescription;
                  return {
                    name,
                    ...(description ? { description } : {}),
                    ...(tool.inputSchema !== undefined ? { inputSchema: tool.inputSchema } : {}),
                    ...(tool.annotations ? { annotations: tool.annotations } : {}),
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
            return undefined;
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
                ...(tool.annotations ? { annotations: tool.annotations } : {}),
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
          ...(tool.annotations ? { annotations: tool.annotations } : {}),
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
