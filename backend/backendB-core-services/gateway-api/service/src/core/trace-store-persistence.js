import { mapleLog } from "../logging.js";
function isPromiseLike(value) {
    return Boolean(value) && typeof value.catch === "function";
}
export function persistTrace(persistence, trace) {
    try {
        const result = persistence?.saveTrace?.(trace);
        if (isPromiseLike(result)) {
            result.catch((error) => mapleLog("error", "trace_persistence_failed", { error }));
        }
    }
    catch (error) {
        mapleLog("error", "trace_persistence_failed", { error });
    }
}
export function removePersistedTrace(persistence, traceId) {
    try {
        const result = persistence?.removeTrace?.(traceId);
        if (isPromiseLike(result)) {
            result.catch((error) => mapleLog("error", "trace_persistence_failed", { error }));
        }
    }
    catch (error) {
        mapleLog("error", "trace_persistence_failed", { error });
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