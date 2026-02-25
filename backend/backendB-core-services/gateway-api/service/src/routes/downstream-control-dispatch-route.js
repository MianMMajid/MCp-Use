import { database } from "../state.js";
import { mcpRouteLockEnabled } from "../config.js";
import { requireApiKeyResponse } from "../auth.js";
import { asString, readJsonBody, errorMessage, parseAppIdList, } from "../helpers.js";
import { resolveDispatchAppIds, dispatchDownstreamChainAndLog, } from "../firewall-proxy.js";
import { toPolicySnapshot } from "../trace-helpers.js";
export function registerDownstreamDispatchRoute(app) {
    app.post("/api/downstream/dispatch", async (c) => {
        const unauthorized = await requireApiKeyResponse(c, database);
        if (unauthorized) {
            return unauthorized;
        }
        const body = await readJsonBody(c);
        const appId = asString(body.appId);
        const chainInput = body.chainAppIds ?? body.chainApps ?? body.chain;
        const toolName = asString(body.toolName);
        const sessionId = asString(body.sessionId) ?? "maple-control";
        const traceId = asString(body.traceId);
        const toolArgs = body.arguments && typeof body.arguments === "object" && !Array.isArray(body.arguments)
            ? body.arguments
            : {};
        if (!toolName) {
            return c.json({
                error: "toolName is required.",
            }, 400);
        }
        let appIds;
        try {
            if (mcpRouteLockEnabled) {
                const overrideAttempted = Boolean(appId) || parseAppIdList(chainInput).length > 0;
                if (overrideAttempted) {
                    return c.json({
                        error: "MCP route-lock is enabled. /api/downstream/dispatch does not accept per-request app/chain routing overrides.",
                        hint: "Use configured route only (MAPLE_MCP_EXECUTION_ORDER, MAPLE_MCP_FIREWALL_DEFAULT_APP, MAPLE_MCP_PROXY_DEFAULT_TARGET_URL, or a single enabled downstream app).",
                    }, 403);
                }
            }
            appIds = resolveDispatchAppIds({
                explicitChain: mcpRouteLockEnabled ? undefined : chainInput,
                fallbackAppId: mcpRouteLockEnabled ? undefined : appId,
                includeDefaultExecutionOrder: true,
            });
        }
        catch (resolutionError) {
            return c.json({
                error: errorMessage(resolutionError),
            }, 400);
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
                return c.json({
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
                }, status);
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
        }
        catch (dispatchError) {
            return c.json({
                error: "Downstream dispatch could not be completed.",
                detail: errorMessage(dispatchError),
            }, 400);
        }
    });
}
//# sourceMappingURL=downstream-control-dispatch-route.js.map