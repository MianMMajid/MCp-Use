import { parseAppIdList, asString, } from "../helpers.js";
import { toPolicySnapshot } from "../trace-helpers.js";
import { resolveDownstreamApp } from "./downstream-resolution.js";
import { dispatchDownstreamAndLogStage } from "./downstream-tool-dispatch-stage.js";
export async function dispatchDownstreamChainAndLog(options) {
    const normalizedAppIds = parseAppIdList(options.appIds);
    if (normalizedAppIds.length === 0) {
        throw new Error("At least one downstream app is required for chain dispatch.");
    }
    normalizedAppIds.forEach((appId) => resolveDownstreamApp(appId));
    const stages = [];
    let activeTraceId = asString(options.traceId);
    let finalResult;
    for (let index = 0; index < normalizedAppIds.length; index += 1) {
        const appId = normalizedAppIds[index];
        const stageResult = await dispatchDownstreamAndLogStage({
            appId,
            toolName: options.toolName,
            toolArgs: options.toolArgs,
            traceId: activeTraceId,
            sessionId: options.sessionId,
            origin: options.origin,
            tenantId: options.tenantId,
            userId: options.userId,
            deviceId: options.deviceId,
        });
        finalResult = stageResult;
        activeTraceId = stageResult.trace.id;
        stages.push({
            index,
            appId,
            ok: stageResult.ok,
            blockedByPolicy: stageResult.blockedByPolicy,
            preExecutionWouldBlock: stageResult.preExecutionWouldBlock,
            traceId: stageResult.trace.id,
            sessionId: stageResult.trace.sessionId,
            stepIndex: stageResult.step.index,
            preExecutionStepIndex: stageResult.preExecutionStep.index,
            policy: toPolicySnapshot(stageResult.preExecutionDecision),
            failure: stageResult.failure,
        });
        if (!stageResult.ok) {
            return {
                ok: false,
                blockedByPolicy: stageResult.blockedByPolicy,
                appIds: normalizedAppIds,
                stages,
                finalResult: stageResult,
                failure: stageResult.failure ??
                    `Downstream chain failed on stage ${index + 1} (${appId}) for tool ${options.toolName}.`,
            };
        }
    }
    if (!finalResult) {
        throw new Error("Downstream chain completed without a final result.");
    }
    return {
        ok: true,
        blockedByPolicy: false,
        appIds: normalizedAppIds,
        stages,
        finalResult,
    };
}
//# sourceMappingURL=downstream-tool-dispatch-log.js.map
