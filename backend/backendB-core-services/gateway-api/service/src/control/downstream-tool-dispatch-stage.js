import { errorMessage } from "../helpers.js";
import { auditAndPersist, evaluateFirewallStepViaGrpc, toInvocationSummary, upsertTraceForCurrentOwner, } from "../trace-helpers.js";
import { dispatchToolToDownstream } from "./downstream-proxy.js";
import { resolveDownstreamApp } from "./downstream-resolution.js";
import { resolveProxyTrace } from "./downstream-dispatch-log-trace.js";
import { createPostExecutionCandidateStep, createPreExecutionCandidateStep, createPreExecutionLoggedStep, setTraceDispatchMetadata, } from "./downstream-tool-dispatch-steps.js";
export async function dispatchDownstreamAndLogStage(options) {
    const app = resolveDownstreamApp(options.appId);
    const trace = resolveProxyTrace({
        traceId: options.traceId,
        sessionId: options.sessionId,
        appId: app.id,
    });
    const invocationSummary = toInvocationSummary(options.toolName, options.toolArgs);
    const preExecutionCandidateStep = createPreExecutionCandidateStep({
        traceStepIndex: trace.steps.length,
        app,
        toolName: options.toolName,
        toolArgs: options.toolArgs,
        invocationSummary,
        origin: options.origin,
    });
    const preExecutionDecision = await evaluateFirewallStepViaGrpc(preExecutionCandidateStep);
    const preExecutionWouldBlock = preExecutionDecision.shouldBlock;
    const preExecutionStep = createPreExecutionLoggedStep({
        traceStepIndex: trace.steps.length,
        app,
        toolName: options.toolName,
        origin: options.origin,
        decision: preExecutionDecision,
        preExecutionWouldBlock,
        candidateStep: preExecutionCandidateStep,
    });
    trace.steps.push(preExecutionStep);
    setTraceDispatchMetadata({
        trace,
        app,
        toolName: options.toolName,
        preExecutionWouldBlock,
    });
    if (preExecutionWouldBlock) {
        trace.status = "quarantined";
        upsertTraceForCurrentOwner(trace);
        const report = auditAndPersist(trace);
        return {
            ok: false,
            blockedByPolicy: true,
            preExecutionWouldBlock,
            trace,
            step: preExecutionStep,
            preExecutionStep,
            preExecutionDecision,
            report,
            app,
            failure: `Policy blocked before downstream execution: ${preExecutionDecision.message}`,
        };
    }
    const appendLoggedStep = async (payload) => {
        const candidateStep = createPostExecutionCandidateStep({
            traceStepIndex: trace.steps.length,
            app,
            toolName: options.toolName,
            toolArgs: options.toolArgs,
            origin: options.origin,
            preExecutionStepIndex: preExecutionStep.index,
            preExecutionDecision,
            payload,
        });
        const decision = await evaluateFirewallStepViaGrpc(candidateStep);
        const loggedStep = {
            ...(decision.step ?? candidateStep),
            index: trace.steps.length,
            timestamp: new Date().toISOString(),
            guardStatus: decision.shouldBlock ? "block" : "allow",
        };
        trace.steps.push(loggedStep);
        setTraceDispatchMetadata({
            trace,
            app,
            toolName: options.toolName,
            preExecutionWouldBlock,
        });
        if (decision.shouldBlock) {
            trace.status = "quarantined";
        }
        upsertTraceForCurrentOwner(trace);
        const report = auditAndPersist(trace);
        return { loggedStep, report };
    };
    try {
        const dispatch = await dispatchToolToDownstream(app, options.toolName, options.toolArgs, {
            sessionId: trace.sessionId,
            traceId: trace.id,
        });
        const { loggedStep, report } = await appendLoggedStep({
            output: dispatch.textPreview,
            toolOutput: dispatch.result,
            requestId: dispatch.requestId,
            responseStatus: dispatch.responseStatus,
            durationMs: dispatch.durationMs,
            failed: false,
            stage: "post_execution",
        });
        return {
            ok: true,
            blockedByPolicy: false,
            preExecutionWouldBlock,
            trace,
            step: loggedStep,
            preExecutionStep,
            preExecutionDecision,
            report,
            app,
            dispatch,
        };
    }
    catch (dispatchError) {
        const failure = `Downstream dispatch failed: ${errorMessage(dispatchError)}`;
        const { loggedStep, report } = await appendLoggedStep({
            output: failure,
            toolOutput: { error: failure },
            failed: true,
            stage: "dispatch_error",
        });
        return {
            ok: false,
            blockedByPolicy: false,
            preExecutionWouldBlock,
            trace,
            step: loggedStep,
            preExecutionStep,
            preExecutionDecision,
            report,
            app,
            failure,
        };
    }
}
//# sourceMappingURL=downstream-tool-dispatch-stage.js.map