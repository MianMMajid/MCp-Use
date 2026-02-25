import { asString, asObject, errorMessage, jsonRpcErrorPayload } from "../helpers.js";
import { toPolicySnapshot } from "../trace-helpers.js";
import { resolveMcpProxyTarget } from "./mcp-target-resolution.js";
import { handleMcpToolsCallMethod } from "./mcp-tools-call-handler.js";
import { handleMcpToolsListMethod } from "./mcp-tools-list-handler.js";
import { dispatchDownstreamChainAndLog, forwardJsonRpcAndLog } from "./downstream-dispatch-log.js";

export async function handleMcpFirewallProxy(c) {
  const body = c.req.raw
    ? await c.req.raw
        .clone()
        .json()
        .catch(() => ({}))
    : await c.req.json().catch(() => ({}));
  const rpc = asObject(body);
  const id = "id" in rpc ? rpc.id : null;
  const method = asString(rpc.method);
  if (!method) {
    return c.json(
      jsonRpcErrorPayload(id, -32600, "Invalid JSON-RPC request: missing method."),
      400
    );
  }

  let target;
  let targetResolutionError;
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

  if (method === "tools/list") {
    return handleMcpToolsListMethod({
      c,
      id,
      target,
      routeLockTargetOverrideDenied,
      proxyTargetErrorResponse,
    });
  }

  if (method === "tools/call") {
    return handleMcpToolsCallMethod({
      c,
      id,
      rpcParams: rpc.params,
      target,
      routeLockTargetOverrideDenied,
      proxyTargetErrorResponse,
      dispatchDownstreamChainAndLog,
    });
  }

  // For non-tool methods (initialize, notifications/*, resources/*, prompts/*, etc.),
  // fall through to the native MCP handler instead of proxying downstream.
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
    const detail = errorMessage(forwardError);
    const authorityUnavailable = detail.includes("Context-wall policy authority is unavailable.");
    return c.json(
      jsonRpcErrorPayload(id, -32603, "Downstream MCP proxy forward failed.", {
        detail,
        appId: target.app.id,
        mode: target.mode,
        authority: "context-wall",
        authorityUnavailable,
      }),
      authorityUnavailable ? 503 : 502
    );
  }
}
