/**
 * fork-result-merger.js
 *
 * Pure function that merges fork execution results back into a forked trace,
 * updating each step with real outputs, guard status, and risk data.
 */
import { auditAndPersist } from "./trace-audit.js";

/**
 * Merge execution results from an isolated fork back into the forked trace.
 *
 * @param {object} forkedTrace       – The trace object to update
 * @param {object} executionResult   – ForkExecutionResult from fork-executor
 * @param {object} traceStore        – Trace store instance with upsertTrace()
 * @param {string} ownerFingerprint  – Owner key fingerprint for trace ownership
 */
export function mergeForkExecutionResult(forkedTrace, executionResult, traceStore, ownerFingerprint) {
    if (!forkedTrace || !executionResult) return;

    const { executedSteps = [], totalDurationMs, success } = executionResult;

    // Determine the starting index within the trace for the replayed steps.
    // forkedFromStep marks where the fork diverged; replayed steps start there.
    const forkOffset = forkedTrace.forkedFromStep ?? 0;

    for (const stepResult of executedSteps) {
        const traceIndex = forkOffset + stepResult.index;
        const step = forkedTrace.steps?.[traceIndex];
        if (!step) continue;

        // Update step output with real execution data
        if (stepResult.output != null) {
            step.output = stepResult.output;
        }
        if (stepResult.toolOutput != null && step.toolCall) {
            step.toolCall.output = stepResult.toolOutput;
        }

        // Update guard/risk data
        step.guardStatus = stepResult.guardStatus ?? step.guardStatus;
        step.riskScore = stepResult.riskScore ?? step.riskScore;
        if (Array.isArray(stepResult.riskFlags) && stepResult.riskFlags.length > 0) {
            step.riskFlags = stepResult.riskFlags;
        }

        // Execution metadata per step
        step.executionMetadata = {
            executedAt: new Date().toISOString(),
            durationMs: stepResult.durationMs,
            isolationMode: forkedTrace.metadata?.isolationMode || "process",
            success: stepResult.success,
            error: stepResult.error || null,
        };
    }

    // If any step was blocked, quarantine the trace
    const hasBlocked = executedSteps.some((s) => s.guardStatus === "blocked");
    if (hasBlocked) {
        forkedTrace.status = "quarantined";
    }

    // Trace-level execution metadata
    forkedTrace.metadata = {
        ...(forkedTrace.metadata || {}),
        forkExecutionCompleted: true,
        forkExecutionSuccess: success,
        forkTotalDurationMs: totalDurationMs,
        forkExecutedStepCount: executedSteps.length,
    };

    // Persist and audit
    traceStore.upsertTrace(forkedTrace, ownerFingerprint);
    auditAndPersist(forkedTrace);
}
//# sourceMappingURL=fork-result-merger.js.map
