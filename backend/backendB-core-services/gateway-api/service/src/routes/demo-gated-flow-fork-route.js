import { database } from "../state.js";
import { requireApiKeyResponse } from "../auth.js";
import { asString, asBoolean, asNumber, readJsonBody, } from "../helpers.js";
import { resolveTraceByIdOrLatest, recommendedRiskStepIndex, clampStepIndex, resolveBridgeTarget, bridgeOverrideDeniedBody, defaultForkEdits, upsertTraceForCurrentOwner, auditAndPersist, launchIsolatedForkSession, } from "../trace-helpers.js";
import { forkTrace } from "../core/forking.js";
export function registerDemoForkRoute(app) {
    app.post("/api/demo/fork", async (c) => {
        const unauthorized = await requireApiKeyResponse(c, database);
        if (unauthorized) {
            return unauthorized;
        }
        const body = await readJsonBody(c);
        const traceId = asString(body.traceId);
        const trace = resolveTraceByIdOrLatest(traceId);
        if (!trace) {
            return c.json({ error: "No traces found. Run demo start first." }, 404);
        }
        if (trace.steps.length === 0) {
            return c.json({ error: "Trace has no steps to fork." }, 400);
        }
        const requestedForkStep = asNumber(body.forkStepIndex);
        const fallbackForkStep = recommendedRiskStepIndex(trace);
        const forkStepIndex = Number.isFinite(requestedForkStep)
            ? clampStepIndex(trace, requestedForkStep ?? 0)
            : fallbackForkStep;
        const launchIsolatedSession = asBoolean(body.launchIsolatedSession, false);
        if (launchIsolatedSession) {
            const bridgeTarget = resolveBridgeTarget(body);
            if (bridgeTarget.overrideRejected) {
                return c.json(bridgeOverrideDeniedBody(), 403);
            }
        }
        try {
            const edits = defaultForkEdits(body.edits);
            const { forkedTrace, diff } = forkTrace(trace, forkStepIndex, edits);
            upsertTraceForCurrentOwner(forkedTrace);
            const report = auditAndPersist(forkedTrace);
            let runtime;
            if (launchIsolatedSession) {
                try {
                    const runtimeResult = await launchIsolatedForkSession({
                        forkedTrace,
                        parentTrace: trace,
                        body,
                    });
                    runtime = {
                        launched: true,
                        ...runtimeResult,
                    };
                }
                catch (runtimeError) {
                    runtime = {
                        launched: false,
                        error: runtimeError instanceof Error
                            ? runtimeError.message
                            : "Unable to launch isolated OpenClaw fork session.",
                    };
                }
            }
            return c.json({
                ok: true,
                action: "fork",
                traceId: trace.id,
                forkedTraceId: forkedTrace.id,
                forkStepIndex,
                changedSteps: diff.changedSteps,
                addedSteps: diff.addedSteps,
                overallRiskScore: report.overallRiskScore,
                severity: report.severity,
                runtime,
            });
        }
        catch (forkError) {
            return c.json({
                error: forkError instanceof Error ? forkError.message : "Unable to fork trace.",
            }, 400);
        }
    });
}
//# sourceMappingURL=demo-gated-flow-fork-route.js.map