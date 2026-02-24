import type { FirewallStepDecision } from "@maple/security";

import {
  asObject,
  asString,
  errorMessage,
  jsonRpcErrorPayload,
} from "../helpers.js";
import { toPolicySnapshot } from "../trace-helpers.js";
import { maybeHandleMarketplaceControlTool } from "./mcp-tools-call-control.js";
import { resolveMcpToolsCallRouting } from "./mcp-tools-call-routing.js";
import type { McpToolsCallOptions } from "./mcp-tools-call-types.js";

export async function handleMcpToolsCallMethod(options: McpToolsCallOptions): Promise<Response | undefined> {
  const params = asObject(options.rpcParams);
  const toolName = asString(params.name);
  if (!toolName) {
    return options.c.json(
      jsonRpcErrorPayload(options.id, -32602, "Invalid tools/call params: missing tool name."),
      400,
    );
  }

  const rawToolArgs =
    params.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments)
      ? (params.arguments as Record<string, unknown>)
      : {};
  const sanitizedToolArgs: Record<string, unknown> = { ...rawToolArgs };
  delete sanitizedToolArgs._mapleAutoConnect;
  delete sanitizedToolArgs._mapleProvider;
  delete sanitizedToolArgs._mapleSearchQuery;
  delete sanitizedToolArgs._mapleSearchLimit;

  const controlResponse = await maybeHandleMarketplaceControlTool({
    toolName,
    toolArgs: sanitizedToolArgs,
    request: {
      c: options.c,
      id: options.id,
      searchMarketplaceServers: options.searchMarketplaceServers,
      registerMarketplaceDownstream: options.registerMarketplaceDownstream,
      dispatchDownstreamChainAndLog: options.dispatchDownstreamChainAndLog,
    },
  });
  if (controlResponse) {
    return controlResponse;
  }

  const routing = await resolveMcpToolsCallRouting({
    request: {
      c: options.c,
      id: options.id,
      target: options.target,
      routeLockTargetOverrideDenied: options.routeLockTargetOverrideDenied,
      proxyTargetErrorResponse: options.proxyTargetErrorResponse,
    },
    toolName,
    toolArgs: rawToolArgs,
    searchMarketplaceServers: options.searchMarketplaceServers,
    registerMarketplaceDownstream: options.registerMarketplaceDownstream,
  });

  if (routing.kind === "native") {
    return undefined;
  }
  if (routing.kind === "error") {
    return routing.response;
  }

  const sessionId =
    asString(options.c.req.header("x-maple-session-id")) ??
    asString(options.c.req.header("mcp-session-id")) ??
    `mcp-proxy-${options.target?.app.id ?? routing.appIds[0] ?? "marketplace"}`;
  const traceId = asString(options.c.req.header("x-maple-trace-id"));

  try {
    const chainResult = await options.dispatchDownstreamChainAndLog({
      appIds: routing.appIds,
      toolName: routing.normalizedToolName,
      toolArgs: sanitizedToolArgs,
      sessionId,
      traceId,
      origin: "mcp_proxy",
    });

    if (!chainResult.ok) {
      const result = chainResult.finalResult;
      const blockedStatus = chainResult.blockedByPolicy ? 403 : 502;
      const blockedCode = chainResult.blockedByPolicy ? -32003 : -32002;
      return options.c.json(
        jsonRpcErrorPayload(options.id, blockedCode, result.failure ?? "Downstream tools/call failed.", {
          blocked: chainResult.blockedByPolicy,
          executeAllowed: false,
          policyWouldBlock: result.preExecutionWouldBlock,
          appId: result.app.id,
          chainAppIds: chainResult.appIds,
          chainStages: chainResult.stages,
          autoConnect: routing.autoConnectDiagnostics ?? null,
          toolName: routing.normalizedToolName,
          requestedToolName: toolName,
          traceId: result.trace.id,
          sessionId: result.trace.sessionId,
          stepIndex: result.step.index,
          preExecutionStepIndex: result.preExecutionStep.index,
          policy: toPolicySnapshot(result.preExecutionDecision as FirewallStepDecision),
        }),
        blockedStatus,
      );
    }

    const final = chainResult.finalResult;

    return options.c.json(
      {
        jsonrpc: "2.0",
        id: options.id,
        result: final.dispatch?.result ?? {
          content: [
            {
              type: "text",
              text: "",
            },
          ],
        },
      },
      200,
    );
  } catch (dispatchError) {
    return options.c.json(
      jsonRpcErrorPayload(options.id, -32603, "Downstream dispatch could not be completed.", {
        detail: errorMessage(dispatchError),
        appId: options.target?.app.id,
        autoConnect: routing.autoConnectDiagnostics ?? null,
        toolName: routing.normalizedToolName,
        requestedToolName: toolName,
      }),
      502,
    );
  }
}
