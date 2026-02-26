import { sharedTraceStore } from "../state.js";
export function getCommunityBaselines(enabled = true) {
    if (!enabled) {
        return [];
    }
    return sharedTraceStore.getEmbeddingBaselines(250);
}
//# sourceMappingURL=trace-audit-baselines.js.map