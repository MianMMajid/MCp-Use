import { evolvedSuggestionsServed } from "../config.js";
import { sharedTraceStore } from "../state.js";
import { listTracesForCurrentOwner } from "./trace-ownership.js";
export function buildYcMetrics() {
    const traces = listTracesForCurrentOwner(1000);
    const community = sharedTraceStore.getStats();
    return {
        totalObservedTraces: traces.length,
        openclawTraces: traces.filter((trace) => trace.source === "openclaw").length,
        sharedTraces: community.sharedTraces,
        uniqueSignatures: community.uniqueSignatures,
        highRiskDetections: traces.filter((trace) => Number(trace.metadata?.overallRiskScore ?? 0) >= 60)
            .length,
        evolvedSuggestionsServed,
    };
}
//# sourceMappingURL=trace-metrics.js.map