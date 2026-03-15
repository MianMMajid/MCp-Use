import { mapleLog } from "../logging.js";

export async function loadPersistedSharedTraces(persistence) {
    return (await persistence?.loadSharedTraces?.()) ?? [];
}
export function persistSharedTrace(trace, persistence) {
    try {
        const result = persistence?.saveSharedTrace?.(trace);
        if (result && typeof result.catch === "function") {
            result.catch((error) => mapleLog("warn", "shared_trace_persist_failed", { traceId: trace?.id, error: error?.message ?? String(error) }));
        }
    }
    catch (error) {
        mapleLog("warn", "shared_trace_persist_failed", { traceId: trace?.id, error: error?.message ?? String(error) });
    }
}
export function removePersistedSharedTrace(traceId, persistence) {
    try {
        const result = persistence?.removeSharedTrace?.(traceId);
        if (result && typeof result.catch === "function") {
            result.catch((error) => mapleLog("warn", "shared_trace_remove_failed", { traceId, error: error?.message ?? String(error) }));
        }
    }
    catch (error) {
        mapleLog("warn", "shared_trace_remove_failed", { traceId, error: error?.message ?? String(error) });
    }
}
//# sourceMappingURL=shared-trace-store-persistence.js.map
