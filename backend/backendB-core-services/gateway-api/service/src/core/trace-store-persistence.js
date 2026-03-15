import { mapleLog } from "../logging.js";
function isPromiseLike(value) {
    return Boolean(value) && typeof value.catch === "function";
}
// Fix 10: Retry with backpressure + propagate errors to callers
export async function persistTrace(persistence, trace) {
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            await persistence?.saveTrace?.(trace);
            return;
        } catch (error) {
            mapleLog("warn", "trace_persistence_retry", { attempt, error: error?.message });
            if (attempt < 2) await new Promise(r => setTimeout(r, 100));
        }
    }
    mapleLog("error", "trace_persistence_exhausted", { traceId: trace?.id });
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
        // Rebuild ownerIndex so owner-scoped lookups work after restart.
        if (trace.ownerKeyFingerprint && options.ownerIndex) {
            let owned = options.ownerIndex.get(trace.ownerKeyFingerprint);
            if (!owned) {
                owned = new Set();
                options.ownerIndex.set(trace.ownerKeyFingerprint, owned);
            }
            owned.add(trace.id);
        }
    }
}
//# sourceMappingURL=trace-store-persistence.js.map