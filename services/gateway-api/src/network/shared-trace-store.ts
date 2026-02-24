import type {
  CommunityStats,
  EvolvedSkillSuggestion,
  ShareTraceOptions,
  SharedTrace,
  Trace,
} from "@maple/types";
import { anonymizeTrace } from "./anonymizer.js";
import {
  parsePositiveInt,
} from "./shared-trace-store-config.js";
import {
  loadPersistedSharedTraces,
  persistSharedTrace,
  removePersistedSharedTrace,
  type SharedTraceStorePersistence,
} from "./shared-trace-store-persistence.js";
import {
  suggestEvolvedSkillsFromSharedTraces,
  type SuggestOptions,
} from "./shared-trace-store-suggestions.js";

export class SharedTraceStore {
  private traces = new Map<string, SharedTrace>();
  private maxSharedTraces: number;
  private persistence?: SharedTraceStorePersistence;

  constructor(
    maxSharedTraces = parsePositiveInt(process.env.MAPLE_MAX_SHARED_TRACES, 4000),
    persistence?: SharedTraceStorePersistence
  ) {
    this.maxSharedTraces = maxSharedTraces;
    this.persistence = persistence;
  }

  async init(): Promise<void> {
    await this.loadPersistedSharedTraces();
  }

  shareTrace(trace: Trace, options: ShareTraceOptions = {}): SharedTrace {
    const sharedTrace = anonymizeTrace(trace, options);
    this.traces.set(sharedTrace.id, sharedTrace);
    this.saveSharedTrace(sharedTrace);
    this.pruneStore();
    return sharedTrace;
  }

  listSharedTraces(limit = 20): SharedTrace[] {
    return [...this.traces.values()]
      .sort((a, b) => b.sharedAt.localeCompare(a.sharedAt))
      .slice(0, limit);
  }

  getEmbeddingBaselines(limit = 200): number[][] {
    return this.listSharedTraces(limit).map((trace) => trace.embedding);
  }

  getStats(): CommunityStats {
    const traces = [...this.traces.values()];
    const uniqueSignatures = new Set(traces.map((trace) => trace.behaviorSignature));

    return {
      sharedTraces: traces.length,
      uniqueSignatures: uniqueSignatures.size,
      quarantinedSharedTraces: traces.filter((trace) => trace.quarantined).length,
      highRiskSharedTraces: traces.filter((trace) => trace.riskScore >= 60).length,
    };
  }

  suggestEvolvedSkills(query: string, options: SuggestOptions = {}): EvolvedSkillSuggestion[] {
    return suggestEvolvedSkillsFromSharedTraces(
      [...this.traces.values()],
      query,
      options,
    );
  }

  private pruneStore(): void {
    while (this.traces.size > this.maxSharedTraces) {
      const oldest = [...this.traces.values()].sort((a, b) => a.sharedAt.localeCompare(b.sharedAt))[0];
      if (!oldest) {
        break;
      }
      this.traces.delete(oldest.id);
      this.removeSharedTrace(oldest.id);
    }
  }

  private async loadPersistedSharedTraces(): Promise<void> {
    const persisted = await loadPersistedSharedTraces(this.persistence);
    for (const trace of persisted) {
      this.traces.set(trace.id, trace);
    }
    this.pruneStore();
  }

  private saveSharedTrace(trace: SharedTrace): void {
    persistSharedTrace(trace, this.persistence);
  }

  private removeSharedTrace(traceId: string): void {
    removePersistedSharedTrace(traceId, this.persistence);
  }
}
