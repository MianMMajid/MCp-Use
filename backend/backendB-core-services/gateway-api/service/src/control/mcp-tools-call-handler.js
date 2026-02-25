import { asObject, asString, errorMessage, jsonRpcErrorPayload } from "../helpers.js";
import { toPolicySnapshot } from "../trace-helpers.js";
import { resolveMcpToolsCallRouting } from "./mcp-tools-call-routing.js";

export async function handleMcpToolsCallMethod(options) {
  const params = asObject(options.rpcParams);
  const toolName = asString(params.name);
  if (!toolName) {
    return options.c.json(
      jsonRpcErrorPayload(options.id, -32602, "Invalid tools/call params: missing tool name."),
      400
    );
  }

  const rawToolArgs =
    params.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments)
      ? params.arguments
      : {};
  const sanitizedToolArgs = { ...rawToolArgs };

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
    `mcp-proxy-${options.target?.app.id ?? routing.appIds[0] ?? "downstream"}`;
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
        jsonRpcErrorPayload(
          options.id,
          blockedCode,
          result.failure ?? "Downstream tools/call failed.",
          {
            blocked: chainResult.blockedByPolicy,
            executeAllowed: false,
            policyWouldBlock: result.preExecutionWouldBlock,
            appId: result.app.id,
            chainAppIds: chainResult.appIds,
            chainStages: chainResult.stages,
            toolName: routing.normalizedToolName,
            requestedToolName: toolName,
            traceId: result.trace.id,
            sessionId: result.trace.sessionId,
            stepIndex: result.step.index,
            preExecutionStepIndex: result.preExecutionStep.index,
            policy: toPolicySnapshot(result.preExecutionDecision),
          }
        ),
        blockedStatus
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
      200
    );
  } catch (dispatchError) {
    return options.c.json(
      jsonRpcErrorPayload(options.id, -32603, "Downstream dispatch could not be completed.", {
        detail: errorMessage(dispatchError),
        appId: options.target?.app.id,
        toolName: routing.normalizedToolName,
        requestedToolName: toolName,
      }),
      502
    );
  }
}
