export async function loadPersistedSharedTraces(persistence) {
    return (await persistence?.loadSharedTraces?.()) ?? [];
}
export function persistSharedTrace(trace, persistence) {
    try {
        const result = persistence?.saveSharedTrace?.(trace);
        if (result && typeof result.catch === "function") {
            result.catch((error) => console.error("[PERSISTENCE] Failed to save shared trace:", error));
        }
    }
    catch (error) {
        console.error("[PERSISTENCE] Failed to save shared trace:", error);
    }
}
export function removePersistedSharedTrace(traceId, persistence) {
    try {
        const result = persistence?.removeSharedTrace?.(traceId);
        if (result && typeof result.catch === "function") {
            result.catch((error) => console.error("[PERSISTENCE] Failed to remove shared trace:", error));
        }
    }
    catch (error) {
        console.error("[PERSISTENCE] Failed to remove shared trace:", error);
    }
}
//# sourceMappingURL=shared-trace-store-persistence.js.map