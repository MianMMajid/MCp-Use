import { mcpRouteLockEnabled } from "../config.js";
import { asString, jsonRpcErrorPayload } from "../helpers.js";
import { resolveDispatchAppIds, resolveDownstreamApp } from "./downstream-resolution.js";

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

function isLocalToolName(toolName) {
  if (LOCAL_TOOL_NAMES.has(toolName)) {
    return true;
  }
  return toolName.startsWith("widget_");
}

function parseQualifiedToolName(rawToolName) {
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

export async function resolveMcpToolsCallRouting(options) {
  const { request, toolName } = options;

  if (isLocalToolName(toolName)) {
    return { kind: "native" };
  }

  if (!request.target && request.routeLockTargetOverrideDenied) {
    return { kind: "error", response: request.proxyTargetErrorResponse() };
  }

  const chainHeader = asString(request.c.req.header("x-maple-chain-apps"));
  const chainQuery = asString(request.c.req.query("mapleChain"));
  const qualifiedTool = parseQualifiedToolName(toolName);

  let normalizedToolName = toolName;
  let explicitAppIds;

  if (qualifiedTool) {
    normalizedToolName = qualifiedTool.toolName;
    try {
      resolveDownstreamApp(qualifiedTool.appId);
    } catch (resolutionError) {
      return {
        kind: "error",
        response: request.c.json(
          jsonRpcErrorPayload(request.id, -32602, "Invalid tools/call params: unknown app.", {
            detail:
              resolutionError instanceof Error
                ? resolutionError.message
                : String(resolutionError),
            requestedAppId: qualifiedTool.appId,
          }),
          400
        ),
      };
    }

    if (request.target?.mode === "dynamic" && request.target.app.id !== qualifiedTool.appId) {
      return {
        kind: "error",
        response: request.c.json(
          jsonRpcErrorPayload(
            request.id,
            -32602,
            "Dynamic target mode does not allow qualified appId overrides.",
            {
              mode: request.target.mode,
              requestedAppId: qualifiedTool.appId,
              resolvedAppId: request.target.app.id,
            }
          ),
          400
        ),
      };
    }

    if (
      mcpRouteLockEnabled &&
      request.target?.mode === "configured" &&
      request.target.app.id !== qualifiedTool.appId
    ) {
      return {
        kind: "error",
        response: request.c.json(
          jsonRpcErrorPayload(
            request.id,
            -32003,
            `Tool "${toolName}" targets app "${qualifiedTool.appId}" which is outside route lock.`,
            {
              requestedAppId: qualifiedTool.appId,
              allowedAppId: request.target.app.id,
            }
          ),
          403
        ),
      };
    }

    explicitAppIds = [qualifiedTool.appId];
  }

  try {
    const appIds =
      explicitAppIds ??
      resolveDispatchAppIds({
        explicitChain: chainHeader ?? chainQuery,
        fallbackAppId: request.target?.app.id,
        includeDefaultExecutionOrder: request.target ? request.target.mode !== "dynamic" : true,
      });

    if (request.target?.mode === "dynamic" && appIds.length > 1) {
      return {
        kind: "error",
        response: request.c.json(
          jsonRpcErrorPayload(
            request.id,
            -32602,
            "Dynamic target mode does not support multi-app chain execution.",
            {
              mode: request.target.mode,
              appIds,
            }
          ),
          400
        ),
      };
    }

    return {
      kind: "resolved",
      appIds,
      normalizedToolName,
    };
  } catch (dispatchResolutionError) {
    return {
      kind: "error",
      response: request.c.json(
        jsonRpcErrorPayload(request.id, -32602, "Unable to resolve downstream dispatch route.", {
          detail:
            dispatchResolutionError instanceof Error
              ? dispatchResolutionError.message
              : String(dispatchResolutionError),
        }),
        400
      ),
    };
  }
}
