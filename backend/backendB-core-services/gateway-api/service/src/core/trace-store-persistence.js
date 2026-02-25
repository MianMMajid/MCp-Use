function isPromiseLike(value) {
    return Boolean(value) && typeof value.catch === "function";
}
export function persistTrace(persistence, trace) {
    try {
        const result = persistence?.saveTrace?.(trace);
        if (isPromiseLike(result)) {
            result.catch((error) => console.error("[PERSISTENCE] Failed to save trace:", error));
        }
    }
    catch (error) {
        console.error("[PERSISTENCE] Failed to save trace:", error);
    }
}
export function removePersistedTrace(persistence, traceId) {
    try {
        const result = persistence?.removeTrace?.(traceId);
        if (isPromiseLike(result)) {
            result.catch((error) => console.error("[PERSISTENCE] Failed to remove trace:", error));
        }
    }
    catch (error) {
        console.error("[PERSISTENCE] Failed to remove trace:", error);
    }
}
export async function loadPersistedTracesIntoIndex(options) {
    const persisted = (await options.persistence?.loadTraces?.()) ?? [];
    for (const trace of persisted) {
        options.traces.set(trace.id, trace);
        const bySession = options.sessionIndex.get(trace.sessionId) ?? [];
        if (!bySession.includes(trace.id)) {
            bySession.push(trace.id);
            options.sessionIndex.set(trace.sessionId, bySession);
        }
    }
}
//# sourceMappingURL=trace-store-persistence.js.map