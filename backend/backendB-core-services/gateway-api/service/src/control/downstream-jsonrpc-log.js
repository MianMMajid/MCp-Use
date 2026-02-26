import { errorMessage } from "../helpers.js";
import { auditAndPersist, evaluateFirewallStepViaGrpc, upsertTraceForCurrentOwner, } from "../trace-helpers.js";
import { forwardJsonRpcToDownstream } from "./downstream-proxy.js";
import { resolveDownstreamApp } from "./downstream-resolution.js";
import { resolveProxyTrace } from "./downstream-dispatch-log-trace.js";
import { createJsonRpcPreExecutionCandidateStep, createJsonRpcPreExecutionLoggedStep, createJsonRpcPostExecutionCandidateStep, setJsonRpcTraceDispatchMetadata, } from "./downstream-jsonrpc-log-steps.js";
export async function forwardJsonRpcAndLog(options) {
    const app = resolveDownstreamApp(options.appId);
    const trace = resolveProxyTrace({
        traceId: options.traceId,
        sessionId: options.sessionId,
        appId: app.id,
    });
    const preExecutionCandidateStep = createJsonRpcPreExecutionCandidateStep({
        traceStepIndex: trace.steps.length,
        app,
        rpcMethod: options.rpcMethod,
        rpcPayload: options.rpcPayload,
        origin: options.origin,
    });
    const preExecutionDecision = await evaluateFirewallStepViaGrpc(preExecutionCandidateStep);
    const preExecutionWouldBlock = preExecutionDecision.shouldBlock;
    const preExecutionStep = createJsonRpcPreExecutionLoggedStep({
        traceStepIndex: trace.steps.length,
        app,
        rpcMethod: options.rpcMethod,
        origin: options.origin,
        preExecutionWouldBlock,
        decision: preExecutionDecision,
        candidateStep: preExecutionCandidateStep,
    });
    trace.steps.push(preExecutionStep);
    setJsonRpcTraceDispatchMetadata({
        trace,
        app,
        rpcMethod: options.rpcMethod,
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
            failure: `Policy blocked before downstream JSON-RPC execution: ${preExecutionDecision.message}`,
        };
    }
    const appendLoggedStep = async (payload) => {
        const candidateStep = createJsonRpcPostExecutionCandidateStep({
            traceStepIndex: trace.steps.length,
            app,
            rpcMethod: options.rpcMethod,
            rpcPayload: options.rpcPayload,
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
        setJsonRpcTraceDispatchMetadata({
            trace,
            app,
            rpcMethod: options.rpcMethod,
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
        const forwarded = await forwardJsonRpcToDownstream(app, options.rpcPayload, {
            sessionId: trace.sessionId,
            traceId: trace.id,
        });
        const { loggedStep, report } = await appendLoggedStep({
            output: forwarded.payload,
            responseStatus: forwarded.responseStatus,
            durationMs: forwarded.durationMs,
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
            forward: forwarded,
        };
    }
    catch (forwardError) {
        const failure = `Downstream JSON-RPC forward failed: ${errorMessage(forwardError)}`;
        const { loggedStep, report } = await appendLoggedStep({
            output: { error: failure },
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
//# sourceMappingURL=downstream-jsonrpc-log.js.map