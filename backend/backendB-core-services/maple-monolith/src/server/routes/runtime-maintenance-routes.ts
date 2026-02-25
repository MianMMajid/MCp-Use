import type { Hono } from "hono";
import type { OpenClawRawEvent, Trace } from "../../core/types.js";
import type { YcBriefFocus } from "../../strategy/yc-narrative.js";

interface RequireApiKeyContext {
  req: {
    header: (name: string) => string | undefined;
  };
  json: (body: unknown, status?: number) => Response;
}

interface RegisterRuntimeMaintenanceRoutesDeps {
  asString: (value: unknown) => string | undefined;
  asOpenClawRawEvent: (value: unknown) => OpenClawRawEvent | undefined;
  buildRuntimeStatus: () => unknown;
  buildYcAppBrief: (...args: any[]) => unknown;
  buildYcMetrics: () => unknown;
  clearTracesForCurrentOwner: () => number;
  currentOwnerKeyFingerprintsForLookup: () => string[] | undefined;
  errorMessage: (error: unknown) => string;
  ingestOpenClawEvents: (options: {
    traceId?: string;
    sessionId?: string;
    events: OpenClawRawEvent[];
    sourceHint?: Trace["source"];
    metadata?: Record<string, unknown>;
  }) => {
    trace: Trace;
    appendedCount: number;
    skippedDuplicateCount: number;
    report: { overallRiskScore: number; severity: string };
  };
  mapleLog: (
    level: "debug" | "info" | "warn" | "error",
    event: string,
    payload?: Record<string, unknown>
  ) => void;
  readJsonBody: (c: { req: { json: () => Promise<unknown> } }) => Promise<Record<string, unknown>>;
  requireApiKeyResponse: (
    c: RequireApiKeyContext,
    options?: { allowSession?: boolean; requireApiKey?: boolean }
  ) => Response | undefined;
}

export function registerRuntimeMaintenanceRoutes(
  app: Hono,
  deps: RegisterRuntimeMaintenanceRoutesDeps
): void {
  const {
    asString,
    asOpenClawRawEvent,
    buildRuntimeStatus,
    buildYcAppBrief,
    buildYcMetrics,
    clearTracesForCurrentOwner,
    currentOwnerKeyFingerprintsForLookup,
    errorMessage,
    ingestOpenClawEvents,
    mapleLog,
    readJsonBody,
    requireApiKeyResponse,
  } = deps;

  app.get("/api/yc/brief", (c) => {
    const unauthorized = requireApiKeyResponse(c);
    if (unauthorized) {
      return unauthorized;
    }

    const rawFocus = c.req.query("focus");
    const focus: YcBriefFocus =
      rawFocus === "moat" || rawFocus === "traction" || rawFocus === "revenue"
        ? rawFocus
        : "full";

    const metrics = buildYcMetrics();
    return c.json({
      generatedAt: new Date().toISOString(),
      metrics,
      brief: buildYcAppBrief(metrics, focus),
    });
  });

  app.get("/api/runtime/status", (c) => {
    const unauthorized = requireApiKeyResponse(c);
    if (unauthorized) {
      return unauthorized;
    }

    return c.json({
      ok: true,
      status: buildRuntimeStatus(),
    });
  });

  app.post("/api/traces/clear", (c) => {
    const unauthorized = requireApiKeyResponse(c);
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

  app.post("/api/openclaw/events", async (c) => {
    const unauthorized = requireApiKeyResponse(c, {
      allowSession: false,
      requireApiKey: true,
    });
    if (unauthorized) {
      return unauthorized;
    }

    const body = await readJsonBody(c);
    const traceId = asString(body.traceId);
    const sessionId = asString(body.sessionId);
    const sourceHintRaw = asString(body.source);
    const sourceHint: Trace["source"] =
      sourceHintRaw === "manual" || sourceHintRaw === "openclaw"
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
      return c.json(
        {
          error: "No events provided.",
          hint: "Provide { sessionId, events: [...] } or { traceId, event: {...} }.",
        },
        400
      );
    }

    if (!traceId && !sessionId) {
      mapleLog("warn", "api.openclaw.events.reject", {
        reason: "missing_trace_or_session",
        eventCount: incoming.length,
      });
      return c.json({ error: "traceId or sessionId is required." }, 400);
    }

    const events = incoming
      .map(asOpenClawRawEvent)
      .filter((event): event is OpenClawRawEvent => Boolean(event));
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
    } catch (ingestError) {
      mapleLog("error", "api.openclaw.events.error", {
        traceId: traceId ?? null,
        sessionId: sessionId ?? null,
        detail: errorMessage(ingestError),
      });
      return c.json(
        {
          error:
            ingestError instanceof Error
              ? ingestError.message
              : "Unable to ingest OpenClaw events.",
        },
        400
      );
    }
  });
}
