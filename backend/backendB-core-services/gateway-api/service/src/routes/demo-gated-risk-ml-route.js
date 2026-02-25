import { database, sharedTraceStore } from "../state.js";
import { requireApiKeyResponse } from "../auth.js";
import { asString, asBoolean, asNumber, readJsonBody, } from "../helpers.js";
import { resolveTraceByIdOrLatest, auditAndPersist, } from "../trace-helpers.js";
export function registerDemoMlRoute(app) {
    app.post("/api/demo/ml", async (c) => {
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
        const useCommunityBaseline = asBoolean(body.useCommunityBaseline, true);
        const threshold = asNumber(body.threshold);
        const topAnomaliesRaw = asNumber(body.topAnomalies);
        const topAnomalies = Number.isFinite(topAnomaliesRaw)
            ? Math.max(1, Math.min(20, Math.trunc(topAnomaliesRaw ?? 5)))
            : 5;
        const report = auditAndPersist(trace, {
            useCommunityBaseline,
            threshold,
        });
        const anomalies = report.flags.filter((flag) => flag.type === "embedding_anomaly").slice(0, topAnomalies);
        return c.json({
            ok: true,
            action: "ml",
            traceId: trace.id,
            overallRiskScore: report.overallRiskScore,
            severity: report.severity,
            anomalyCount: anomalies.length,
            anomalies,
            usedCommunityBaseline: useCommunityBaseline,
            baselinePoolSize: useCommunityBaseline ? sharedTraceStore.getEmbeddingBaselines(250).length : 0,
        });
    });
}
//# sourceMappingURL=demo-gated-risk-ml-route.js.map