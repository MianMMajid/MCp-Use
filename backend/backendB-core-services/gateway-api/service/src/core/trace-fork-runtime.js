import { asString, sanitizeSessionId } from "../helpers.js";
import { startObservation } from "../bridge/openclaw-bridge.js";
import { traceStore } from "../state.js";
import { auditAndPersist } from "./trace-audit.js";
import { ForkDispatcher } from "./fork-dispatcher.js";
import { mergeForkExecutionResult } from "./fork-result-merger.js";
import { bridgeOverrideDeniedBody, resolveBridgeTarget } from "./trace-runtime-helpers.js";
import { stepToBridgeEvent } from "./trace-step-utils.js";
export async function writeEventsToBridgeSession(sessionId, events, bridgeUrl, token) {
    const target = new URL(`/sessions/${encodeURIComponent(sessionId)}/events`, bridgeUrl);
    const headers = {
        "content-type": "application/json",
    };
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }
    const resetResponse = await fetch(target, {
        method: "POST",
        headers,
        body: JSON.stringify({ reset: true }),
    });
    if (!resetResponse.ok) {
        throw new Error(`Bridge reset failed (${resetResponse.status}).`);
    }
    const appendResponse = await fetch(target, {
        method: "POST",
        headers,
        body: JSON.stringify({ events }),
    });
    if (!appendResponse.ok) {
        throw new Error(`Bridge append failed (${appendResponse.status}).`);
    }
}
export async function launchIsolatedForkSession(options) {
    const { forkedTrace, parentTrace, body } = options;
    const requestedForkSessionId = asString(body.forkSessionId);
    const generatedForkSessionId = `${parentTrace.sessionId}-fork-${Date.now().toString(36)}`;
    const forkSessionId = sanitizeSessionId(requestedForkSessionId ?? generatedForkSessionId);
    const bridgeTarget = resolveBridgeTarget(body);
    if (bridgeTarget.overrideRejected) {
        throw new Error(bridgeOverrideDeniedBody().reason);
    }
    const { bridgeUrl, token } = bridgeTarget;
    const events = forkedTrace.steps.map((step) => stepToBridgeEvent(step));
    await writeEventsToBridgeSession(forkSessionId, events, bridgeUrl, token);
    const runtimeTrace = await startObservation({
        sessionId: forkSessionId,
        source: "openclaw",
        bridgeUrl,
        token,
    });
    runtimeTrace.metadata = {
        ...(runtimeTrace.metadata ?? {}),
        mode: "openclaw-fork-runtime",
        parentTraceId: parentTrace.id,
        parentSessionId: parentTrace.sessionId,
        forkedTraceId: forkedTrace.id,
    };
    runtimeTrace.ownerKeyFingerprint = parentTrace.ownerKeyFingerprint;
    traceStore.upsertTrace(runtimeTrace, parentTrace.ownerKeyFingerprint);
    const runtimeReport = auditAndPersist(runtimeTrace);
    // ── Isolated fork execution ───────────────────────────────────────────
    const isolationMode = process.env.MAPLE_FORK_ISOLATION_MODE || "";
    let executionStatus;
    let executionResult;
    if (isolationMode === "process" || isolationMode === "k8s") {
        const dispatcher = new ForkDispatcher(isolationMode);
        runtimeTrace.metadata.isolationMode = isolationMode;
        const execPromise = dispatcher.dispatch(forkedTrace, parentTrace, {
            stepTimeoutMs: Number(process.env.MAPLE_FORK_STEP_TIMEOUT_MS) || 30000,
            totalTimeoutMs: Number(process.env.MAPLE_FORK_TOTAL_TIMEOUT_MS) || 120000,
        });
        if (options.waitForExecution) {
            try {
                const result = await execPromise;
                mergeForkExecutionResult(runtimeTrace, result, traceStore, parentTrace.ownerKeyFingerprint);
                executionStatus = result.success ? "completed" : "failed";
                executionResult = result;
            } catch (err) {
                executionStatus = "failed";
                executionResult = { success: false, errorMessage: err.message };
                runtimeTrace.metadata.executionError = err.message;
                traceStore.upsertTrace(runtimeTrace, parentTrace.ownerKeyFingerprint);
            }
        } else {
            execPromise.then((result) => {
                mergeForkExecutionResult(runtimeTrace, result, traceStore, parentTrace.ownerKeyFingerprint);
            }).catch((err) => {
                runtimeTrace.metadata.executionError = err.message;
                traceStore.upsertTrace(runtimeTrace, parentTrace.ownerKeyFingerprint);
            });
            executionStatus = "pending";
        }
        runtimeTrace.metadata.executionStatus = executionStatus;
    }
    return {
        sessionId: forkSessionId,
        traceId: runtimeTrace.id,
        source: runtimeTrace.source,
        overallRiskScore: runtimeReport.overallRiskScore,
        severity: runtimeReport.severity,
        isolationMode: isolationMode || undefined,
        executionStatus,
        executionResult,
    };
}
//# sourceMappingURL=trace-fork-runtime.js.map