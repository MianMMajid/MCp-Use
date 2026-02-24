import type { Trace } from "@maple/types";

export function pruneTraceStore(options: {
  traces: Map<string, Trace>;
  sessionIndex: Map<string, string[]>;
  maxTraces: number;
  maxTracesPerSession: number;
  ttlMs: number;
  removeTrace: (traceId: string) => void;
}): void {
  const now = Date.now();
  const expired: string[] = [];
  for (const trace of options.traces.values()) {
    const updatedAtMs = Date.parse(trace.updatedAt);
    if (!Number.isFinite(updatedAtMs)) {
      continue;
    }
    if (now - updatedAtMs > options.ttlMs) {
      expired.push(trace.id);
    }
  }
  for (const traceId of expired) {
    options.removeTrace(traceId);
  }

  while (options.traces.size > options.maxTraces) {
    const oldest = [...options.traces.values()].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))[0];
    if (!oldest) {
      break;
    }
    options.removeTrace(oldest.id);
  }

  for (const [sessionId, traceIds] of options.sessionIndex.entries()) {
    if (traceIds.length <= options.maxTracesPerSession) {
      continue;
    }
    const sessionTraces = traceIds
      .map((traceId) => options.traces.get(traceId))
      .filter((trace): trace is Trace => Boolean(trace))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const keep = new Set(sessionTraces.slice(0, options.maxTracesPerSession).map((trace) => trace.id));
    for (const traceId of traceIds) {
      if (!keep.has(traceId)) {
        options.removeTrace(traceId);
      }
    }
    const refreshed = (options.sessionIndex.get(sessionId) ?? []).filter((traceId) =>
      options.traces.has(traceId),
    );
    if (refreshed.length > 0) {
      options.sessionIndex.set(sessionId, refreshed);
    } else {
      options.sessionIndex.delete(sessionId);
    }
  }
}
