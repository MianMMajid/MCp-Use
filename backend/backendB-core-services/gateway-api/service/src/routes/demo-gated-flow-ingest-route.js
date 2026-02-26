import { database } from "../state.js";
import { requireApiKeyResponse } from "../auth.js";
import { asString, readJsonBody, } from "../helpers.js";
import { getTraceForCurrentOwner, getLatestTraceBySessionForCurrentOwner, createTraceForCurrentOwner, upsertTraceForCurrentOwner, auditAndPersist, } from "../trace-helpers.js";
import { stepFromBridgeEvent } from "../bridge/openclaw-bridge.js";
export function registerDemoIngestRoute(app) {
    app.post("/api/demo/ingest", async (c) => {
        const unauthorized = await requireApiKeyResponse(c, database);
        if (unauthorized) {
            return unauthorized;
        }
        const body = await readJsonBody(c);
        const traceId = asString(body.traceId);
        const sessionId = asString(body.sessionId);
        const event = body.event && typeof body.event === "object" ? body.event : undefined;
        if (!event) {
            return c.json({ error: "Missing required field: event" }, 400);
        }
        if (!traceId && !sessionId) {
            return c.json({ error: "Either traceId or sessionId must be provided." }, 400);
        }
        let trace = traceId ? getTraceForCurrentOwner(traceId) : undefined;
        if (!trace && sessionId) {
            trace = getLatestTraceBySessionForCurrentOwner(sessionId);
        }
        if (!trace) {
            trace = createTraceForCurrentOwner({
                sessionId: sessionId ?? `manual-${Date.now()}`,
                source: "manual",
                status: "active",
                metadata: { mode: "event-ingest" },
                steps: [],
            });
        }
        const nextIndex = trace.steps.length;
        const step = stepFromBridgeEvent(event, nextIndex);
        trace.steps.push(step);
        upsertTraceForCurrentOwner(trace);
        const report = auditAndPersist(trace);
        return c.json({
            ok: true,
            traceId: trace.id,
            sessionId: trace.sessionId,
            appendedStep: step.index,
            overallRiskScore: report.overallRiskScore,
            status: trace.status,
        });
    });
}
//# sourceMappingURL=demo-gated-flow-ingest-route.js.map