import { database, sharedTraceStore } from "../state.js";
import { requireApiKeyResponse } from "../auth.js";
import { listTracesForCurrentOwner, getTraceForCurrentOwner, buildYcMetrics, } from "../trace-helpers.js";
import { toTraceSummary } from "../core/presenters.js";
export function registerTraceRoutes(app) {
    // ── Trace Routes ───────────────────────────────────────────────────────────
    app.get("/api/traces", async (c) => {
        const unauthorized = await requireApiKeyResponse(c, database);
        if (unauthorized) {
            return unauthorized;
        }
        const traces = listTracesForCurrentOwner(100).map((trace) => toTraceSummary(trace));
        return c.json({ traces, count: traces.length });
    });
    app.get("/api/trace", async (c) => {
        const unauthorized = await requireApiKeyResponse(c, database);
        if (unauthorized) {
            return unauthorized;
        }
        const traceId = c.req.query("traceId");
        if (!traceId) {
            return c.json({ error: "traceId query parameter is required" }, 400);
        }
        const trace = getTraceForCurrentOwner(traceId);
        if (!trace) {
            return c.json({ error: "Trace not found" }, 404);
        }
        return c.json(trace);
    });
    app.get("/api/traces/:traceId", async (c) => {
        const unauthorized = await requireApiKeyResponse(c, database);
        if (unauthorized) {
            return unauthorized;
        }
        const traceId = c.req.param("traceId");
        const trace = getTraceForCurrentOwner(traceId);
        if (!trace) {
            return c.json({ error: "Trace not found" }, 404);
        }
        return c.json(trace);
    });
    // ── Community Routes ───────────────────────────────────────────────────────
    app.get("/api/community/stats", async (c) => {
        const unauthorized = await requireApiKeyResponse(c, database);
        if (unauthorized) {
            return unauthorized;
        }
        return c.json({
            stats: sharedTraceStore.getStats(),
            ycMetrics: buildYcMetrics(),
        });
    });
    app.get("/api/community/traces", async (c) => {
        const unauthorized = await requireApiKeyResponse(c, database);
        if (unauthorized) {
            return unauthorized;
        }
        const sharedTraces = sharedTraceStore.listSharedTraces(50).map((trace) => ({
            id: trace.id,
            taskLabel: trace.taskLabel,
            objective: trace.objective,
            sharedAt: trace.sharedAt,
            behaviorSignature: trace.behaviorSignature,
            riskScore: trace.riskScore,
            riskSeverity: trace.riskSeverity,
            stepCount: trace.stepCount,
            tags: trace.tags,
        }));
        return c.json({
            count: sharedTraces.length,
            traces: sharedTraces,
        });
    });
}
//# sourceMappingURL=trace-routes.js.map