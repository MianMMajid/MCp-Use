import { anonymizeTrace } from "./anonymizer.js";
import { parsePositiveInt, } from "./shared-trace-store-config.js";
import { loadPersistedSharedTraces, persistSharedTrace, removePersistedSharedTrace, } from "./shared-trace-store-persistence.js";
import { suggestEvolvedSkillsFromSharedTraces, } from "./shared-trace-store-suggestions.js";
export class SharedTraceStore {
    traces = new Map();
    maxSharedTraces;
    persistence;
    constructor(maxSharedTraces = parsePositiveInt(process.env.MAPLE_MAX_SHARED_TRACES, 4000), persistence) {
        this.maxSharedTraces = maxSharedTraces;
        this.persistence = persistence;
    }
    async init() {
        await this.loadPersistedSharedTraces();
    }
    shareTrace(trace, options = {}) {
        const sharedTrace = anonymizeTrace(trace, options);
        this.traces.set(sharedTrace.id, sharedTrace);
        this.saveSharedTrace(sharedTrace);
        this.pruneStore();
        return sharedTrace;
    }
    listSharedTraces(limit = 20) {
        return [...this.traces.values()]
            .sort((a, b) => b.sharedAt.localeCompare(a.sharedAt))
            .slice(0, limit);
    }
    getEmbeddingBaselines(limit = 200) {
        return this.listSharedTraces(limit).map((trace) => trace.embedding);
    }
    getStats() {
        const traces = [...this.traces.values()];
        const uniqueSignatures = new Set(traces.map((trace) => trace.behaviorSignature));
        return {
            sharedTraces: traces.length,
            uniqueSignatures: uniqueSignatures.size,
            quarantinedSharedTraces: traces.filter((trace) => trace.quarantined).length,
            highRiskSharedTraces: traces.filter((trace) => trace.riskScore >= 60).length,
        };
    }
    suggestEvolvedSkills(query, options = {}) {
        return suggestEvolvedSkillsFromSharedTraces([...this.traces.values()], query, options);
    }
    pruneStore() {
        while (this.traces.size > this.maxSharedTraces) {
            const oldest = [...this.traces.values()].sort((a, b) => a.sharedAt.localeCompare(b.sharedAt))[0];
            if (!oldest) {
                break;
            }
            this.traces.delete(oldest.id);
            this.removeSharedTrace(oldest.id);
        }
    }
    async loadPersistedSharedTraces() {
        const persisted = await loadPersistedSharedTraces(this.persistence);
        for (const trace of persisted) {
            this.traces.set(trace.id, trace);
        }
        this.pruneStore();
    }
    saveSharedTrace(trace) {
        persistSharedTrace(trace, this.persistence);
    }
    removeSharedTrace(traceId) {
        removePersistedSharedTrace(traceId, this.persistence);
    }
}
//# sourceMappingURL=shared-trace-store.js.map