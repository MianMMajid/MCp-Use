import type { Hono } from "hono";
import type { SharedTrace, Trace } from "../../core/types.js";

interface RegisterTraceReadRoutesDeps {
  buildYcMetrics: () => unknown;
  getTraceForCurrentOwner: (traceId: string) => Trace | undefined;
  listTracesForCurrentOwner: (limit: number, sessionId?: string) => Trace[];
  requireApiKeyResponse: (c: {
    req: {
      header: (name: string) => string | undefined;
    };
    json: (body: unknown, status?: number) => Response;
  }) => Response | undefined;
  sharedTraceStore: {
    getStats: () => unknown;
    listSharedTraces: (limit: number) => SharedTrace[];
  };
  toTraceSummary: (trace: Trace) => unknown;
}

export function registerTraceReadRoutes(app: Hono, deps: RegisterTraceReadRoutesDeps): void {
  const {
    buildYcMetrics,
    getTraceForCurrentOwner,
    listTracesForCurrentOwner,
    requireApiKeyResponse,
    sharedTraceStore,
    toTraceSummary,
  } = deps;

  app.get("/api/traces", (c) => {
    const unauthorized = requireApiKeyResponse(c);
    if (unauthorized) {
      return unauthorized;
    }

    const traces = listTracesForCurrentOwner(100).map((trace) => toTraceSummary(trace));
    return c.json({ traces, count: traces.length });
  });

  app.get("/api/trace", (c) => {
    const unauthorized = requireApiKeyResponse(c);
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

  app.get("/api/traces/:traceId", (c) => {
    const unauthorized = requireApiKeyResponse(c);
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

  app.get("/api/community/stats", (c) => {
    const unauthorized = requireApiKeyResponse(c);
    if (unauthorized) {
      return unauthorized;
    }

    return c.json({
      stats: sharedTraceStore.getStats(),
      ycMetrics: buildYcMetrics(),
    });
  });

  app.get("/api/community/traces", (c) => {
    const unauthorized = requireApiKeyResponse(c);
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
