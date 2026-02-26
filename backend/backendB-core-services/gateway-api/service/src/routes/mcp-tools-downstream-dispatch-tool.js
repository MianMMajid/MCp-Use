import { error, object } from "mcp-use/server";
import { server } from "../state.js";
import { mcpRouteLockEnabled, } from "../config.js";
import { asString, errorMessage, parseAppIdList, } from "../helpers.js";
import { toPolicySnapshot } from "../trace-helpers.js";
import { dispatchDownstreamChainAndLog, resolveDispatchAppIds, } from "../firewall-proxy.js";
import { dispatchDownstreamToolInputSchema } from "../core/tool-schemas.js";
import { zodCompat } from "./mcp-tools-downstream-common.js";
export function registerDispatchDownstreamTool() {
    server.tool({
        name: "dispatch_downstream_tool",
        description: "Dispatch a tool call to one or more downstream MCP apps via Maple in execution order, then normalize, score, and log outputs into Maple traces.",
        schema: zodCompat(dispatchDownstreamToolInputSchema),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    }, async ({ appId, chainAppIds, toolName, arguments: toolArgs, sessionId, traceId }) => {
        if (mcpRouteLockEnabled) {
            const overrideAttempted = Boolean(asString(appId)) || parseAppIdList(chainAppIds).length > 0;
            if (overrideAttempted) {
                return error("MCP route-lock is enabled. dispatch_downstream_tool rejects appId/chainAppIds overrides; use configured route.");
            }
        }
        let appIds;
        try {
            appIds = resolveDispatchAppIds({
                explicitChain: mcpRouteLockEnabled ? undefined : chainAppIds,
                fallbackAppId: mcpRouteLockEnabled ? undefined : appId,
                includeDefaultExecutionOrder: true,
            });
        }
        catch (resolutionError) {
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
                    return error(`Policy blocked ${result.app.id}.${toolName} before execution: ${result.preExecutionDecision.message} trace=${result.trace.id} preExecStep=${result.preExecutionStep.index}`);
                }
                return error(`${result.failure ?? "Downstream dispatch failed."} trace=${result.trace.id} step=${result.step.index} preExecStep=${result.preExecutionStep.index}`);
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
        }
        catch (dispatchError) {
            return error(`Downstream dispatch could not be completed: ${errorMessage(dispatchError)}`);
        }
    });
}
//# sourceMappingURL=mcp-tools-downstream-dispatch-tool.js.map