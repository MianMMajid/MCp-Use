import { database } from "../state.js";
import { requireApiKeyResponse } from "../auth.js";
import { asString, asNumber, readJsonBody, } from "../helpers.js";
import { resolveTraceByIdOrLatest, auditAndPersist, recommendedRiskStepIndex, clampStepIndex, setGuardActionForCurrentOwner, } from "../trace-helpers.js";
export function registerDemoBlockRoute(app) {
    app.post("/api/demo/block", async (c) => {
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
            return c.json({ error: "Trace has no steps to block." }, 400);
        }
        const requestedIndex = asNumber(body.stepIndex);
        const stepIndex = Number.isFinite(requestedIndex)
            ? clampStepIndex(trace, requestedIndex ?? 0)
            : recommendedRiskStepIndex(trace);
        const reason = asString(body.reason) ?? "Blocked by Maple guided demo due to high-risk behavior.";
        const updated = setGuardActionForCurrentOwner(trace.id, stepIndex, "block", reason);
        if (!updated) {
            return c.json({ error: "Unable to apply block action." }, 400);
        }
        const report = auditAndPersist(updated);
        return c.json({
            ok: true,
            action: "block",
            traceId: updated.id,
            stepIndex,
            status: updated.status,
            quarantined: updated.status === "quarantined",
            overallRiskScore: report.overallRiskScore,
            severity: report.severity,
        });
    });
}
//# sourceMappingURL=demo-gated-risk-block-route.js.map