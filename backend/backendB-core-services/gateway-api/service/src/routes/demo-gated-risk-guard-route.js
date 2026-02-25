import { database } from "../state.js";
import { requireApiKeyResponse } from "../auth.js";
import { asString, asNumber, readJsonBody, } from "../helpers.js";
import { resolveTraceByIdOrLatest, auditAndPersist, recommendedRiskStepIndex, clampStepIndex, setGuardActionForCurrentOwner, } from "../trace-helpers.js";
export function registerDemoGuardRoute(app) {
    app.post("/api/demo/guard", async (c) => {
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
            return c.json({ error: "Trace has no steps to guard." }, 400);
        }
        const requestedIndex = asNumber(body.stepIndex);
        const stepIndex = Number.isFinite(requestedIndex)
            ? clampStepIndex(trace, requestedIndex ?? 0)
            : recommendedRiskStepIndex(trace);
        const action = body.action;
        if (action !== "allow" && action !== "block" && action !== "pending") {
            return c.json({ error: "action must be one of: allow, block, pending." }, 400);
        }
        const defaultReason = action === "block"
            ? "Blocked by Maple node action modal."
            : action === "allow"
                ? "Allowed by Maple node action modal."
                : "Set to pending by Maple node action modal.";
        const reason = asString(body.reason) ?? defaultReason;
        const updated = setGuardActionForCurrentOwner(trace.id, stepIndex, action, reason);
        if (!updated) {
            return c.json({ error: "Unable to apply guard action." }, 400);
        }
        const report = auditAndPersist(updated);
        return c.json({
            ok: true,
            action: "guard",
            traceId: updated.id,
            stepIndex,
            guardAction: action,
            status: updated.status,
            quarantined: updated.status === "quarantined",
            overallRiskScore: report.overallRiskScore,
            severity: report.severity,
        });
    });
}
//# sourceMappingURL=demo-gated-risk-guard-route.js.map