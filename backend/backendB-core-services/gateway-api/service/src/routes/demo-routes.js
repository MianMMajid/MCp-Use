import { server, database } from "../state.js";
import { requireApiKeyResponse, currentOwnerKeyFingerprintsForLookup, } from "../auth.js";
import { asString, readJsonBody, errorMessage, } from "../helpers.js";
import { mapleLog } from "../logging.js";
import { clearTracesForCurrentOwner, ingestOpenClawEvents, asOpenClawRawEvent, } from "../trace-helpers.js";
import "./demo-gated-routes.js";
import "./demo-community-routes.js";
import "./demo-session-routes.js";
// ── Traces Clear (outside demo gate) ────────────────────────────────────────
server.app.post("/api/traces/clear", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) {
        return unauthorized;
    }
    const removed = clearTracesForCurrentOwner();
    mapleLog("warn", "api.traces.clear", {
        removed,
        ownerScopes: currentOwnerKeyFingerprintsForLookup() ?? ["*"],
    });
    return c.json({ ok: true, removed });
});
// ── OpenClaw Events Ingest ──────────────────────────────────────────────────
server.app.post("/api/openclaw/events", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database, { allowSession: false, requireApiKey: true });
    if (unauthorized) {
        return unauthorized;
    }
    const body = await readJsonBody(c);
    const traceId = asString(body.traceId);
    const sessionId = asString(body.sessionId);
    const sourceHintRaw = asString(body.source);
    const sourceHint = sourceHintRaw === "manual" || sourceHintRaw === "openclaw"
        ? sourceHintRaw
        : "openclaw";
    const incoming = Array.isArray(body.events)
        ? body.events
        : body.event && typeof body.event === "object"
            ? [body.event]
            : [];
    mapleLog("info", "api.openclaw.events.begin", {
        traceId: traceId ?? null,
        sessionId: sessionId ?? null,
        sourceHint,
        eventCount: incoming.length,
    });
    if (incoming.length === 0) {
        mapleLog("warn", "api.openclaw.events.reject", {
            reason: "no_events",
            traceId: traceId ?? null,
            sessionId: sessionId ?? null,
        });
        return c.json({
            error: "No events provided.",
            hint: "Provide { sessionId, events: [...] } or { traceId, event: {...} }.",
        }, 400);
    }
    if (!traceId && !sessionId) {
        mapleLog("warn", "api.openclaw.events.reject", {
            reason: "missing_trace_or_session",
            eventCount: incoming.length,
        });
        return c.json({ error: "traceId or sessionId is required." }, 400);
    }
    const events = incoming.map(asOpenClawRawEvent).filter((event) => Boolean(event));
    if (events.length === 0) {
        mapleLog("warn", "api.openclaw.events.reject", {
            reason: "no_valid_events",
            traceId: traceId ?? null,
            sessionId: sessionId ?? null,
            eventCount: incoming.length,
        });
        return c.json({ error: "No valid event objects provided." }, 400);
    }
    try {
        const result = ingestOpenClawEvents({
            traceId,
            sessionId,
            events,
            sourceHint,
            metadata: {
                ingress: "api_openclaw_events",
            },
        });
        mapleLog("info", "api.openclaw.events.success", {
            traceId: result.trace.id,
            sessionId: result.trace.sessionId,
            source: result.trace.source,
            appendedCount: result.appendedCount,
            skippedDuplicateCount: result.skippedDuplicateCount,
            stepCount: result.trace.steps.length,
            status: result.trace.status,
        });
        return c.json({
            ok: true,
            action: "openclaw_events_ingest",
            traceId: result.trace.id,
            sessionId: result.trace.sessionId,
            source: result.trace.source,
            ingestMode: "push",
            appendedCount: result.appendedCount,
            skippedDuplicateCount: result.skippedDuplicateCount,
            stepCount: result.trace.steps.length,
            overallRiskScore: result.report.overallRiskScore,
            severity: result.report.severity,
            status: result.trace.status,
        });
    }
    catch (ingestError) {
        mapleLog("error", "api.openclaw.events.error", {
            traceId: traceId ?? null,
            sessionId: sessionId ?? null,
            detail: errorMessage(ingestError),
        });
        return c.json({
            error: ingestError instanceof Error ? ingestError.message : "Unable to ingest OpenClaw events.",
        }, 400);
    }
});
//# sourceMappingURL=demo-routes.js.map