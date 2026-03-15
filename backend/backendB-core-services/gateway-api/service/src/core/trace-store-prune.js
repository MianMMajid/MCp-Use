export function pruneTraceStore(options) {
    const now = Date.now();
    const expired = [];
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
    if (options.traces.size > options.maxTraces) {
        const sorted = [...options.traces.values()]
            .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
        const removeCount = sorted.length - options.maxTraces;
        for (let i = 0; i < removeCount; i++) {
            options.removeTrace(sorted[i].id);
        }
    }
    for (const [sessionId, traceIds] of options.sessionIndex.entries()) {
        if (traceIds.length <= options.maxTracesPerSession) {
            continue;
        }
        const sessionTraces = traceIds
            .map((traceId) => options.traces.get(traceId))
            .filter((trace) => Boolean(trace))
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        const keep = new Set(sessionTraces.slice(0, options.maxTracesPerSession).map((trace) => trace.id));
        for (const traceId of traceIds) {
            if (!keep.has(traceId)) {
                options.removeTrace(traceId);
            }
        }
        const refreshed = (options.sessionIndex.get(sessionId) ?? []).filter((traceId) => options.traces.has(traceId));
        if (refreshed.length > 0) {
            options.sessionIndex.set(sessionId, refreshed);
        }
        else {
            options.sessionIndex.delete(sessionId);
        }
    }
}
//# sourceMappingURL=trace-store-prune.js.map