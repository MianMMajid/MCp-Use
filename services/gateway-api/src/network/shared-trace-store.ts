import { randomUUID } from "node:crypto";
import type {
  CommunityStats,
  EvolvedSkillSuggestion,
  ShareTraceOptions,
  SharedTrace,
  SharedTraceStep,
  Trace,
} from "@maple/types";
import { cosineSimilarity, textToEmbedding } from "../ml/embeddings.js";
import { anonymizeTrace } from "./anonymizer.js";

interface SuggestOptions {
  limit?: number;
  minConfidence?: number;
}

interface SharedTraceStorePersistence {
  loadSharedTraces?: () => SharedTrace[] | Promise<SharedTrace[]>;
  saveSharedTrace?: (trace: SharedTrace) => void | Promise<void>;
  removeSharedTrace?: (traceId: string) => void | Promise<void>;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function scoreSuggestion(trace: SharedTrace, similarity: number, prevalence: number): number {
  const safetyLift = Math.max(0, 100 - trace.riskScore);
  return Math.min(100, Math.round(similarity * 50 + prevalence * 12 + safetyLift * 0.35));
}

function topTools(steps: SharedTraceStep[]): string[] {
  const frequency = new Map<string, number>();
  for (const step of steps) {
    if (!step.toolName) {
      continue;
    }
    frequency.set(step.toolName, (frequency.get(step.toolName) ?? 0) + 1);
  }

  return [...frequency.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name]) => name);
}

function inferGuardrails(trace: SharedTrace): string[] {
  const guards = new Set<string>();
  for (const step of trace.steps) {
    for (const flag of step.flagTypes) {
      if (flag.includes("shell") || flag.includes("execution")) {
        guards.add("Require human approval before shell execution.");
      }
      if (flag.includes("credential") || flag.includes("exfiltration")) {
        guards.add("Mask secrets and block outbound transfer of sensitive files.");
      }
      if (flag.includes("network") || flag.includes("download")) {
        guards.add("Restrict network calls to an explicit domain allowlist.");
      }
      if (flag.includes("anomaly")) {
        guards.add("Trigger automatic replay/fork when embedding anomaly score exceeds threshold.");
      }
    }
  }

  if (guards.size === 0) {
    guards.add("Keep default guard mode: pending approval for privileged actions.");
  }

  return [...guards].slice(0, 4);
}

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
    const limit = options.limit ?? 3;
    const minConfidence = options.minConfidence ?? 0.4;
    const queryEmbedding = textToEmbedding(query);
    const traces = [...this.traces.values()];

    if (traces.length === 0) {
      return [
        {
          id: randomUUID(),
          title: "Bootstrap Guarded Skill",
          description:
            "No community traces yet. Start by sharing successful traces to unlock data-driven skill evolution.",
          confidence: 52,
          adoptionScore: 45,
          suggestedPromptPatch:
            "Always produce a plan, classify risk per action, and request approval before high-privilege tools.",
          guardrails: [
            "Require allowlist for outbound network requests.",
            "Block shell commands containing destructive patterns.",
          ],
          evidenceTraceIds: [],
        },
      ];
    }

    const scored = traces
      .map((trace) => ({
        trace,
        similarity: cosineSimilarity(queryEmbedding, trace.embedding),
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, Math.max(limit * 4, 6));

    const prevalenceBySignature = new Map<string, number>();
    for (const { trace } of scored) {
      prevalenceBySignature.set(
        trace.behaviorSignature,
        (prevalenceBySignature.get(trace.behaviorSignature) ?? 0) + 1
      );
    }

    const suggestions: EvolvedSkillSuggestion[] = [];
    const emittedSignatures = new Set<string>();

    for (const { trace, similarity } of scored) {
      if (similarity < minConfidence) {
        continue;
      }

      if (emittedSignatures.has(trace.behaviorSignature)) {
        continue;
      }

      emittedSignatures.add(trace.behaviorSignature);
      const prevalence = prevalenceBySignature.get(trace.behaviorSignature) ?? 1;
      const tools = topTools(trace.steps);
      const guardrails = inferGuardrails(trace);
      const confidence = Math.min(99, Math.round(similarity * 100));

      suggestions.push({
        id: randomUUID(),
        title: `${trace.taskLabel} - evolved skill`,
        description:
          tools.length > 0
            ? `Optimized workflow based on shared traces using ${tools.join(", ")} with strengthened safety controls.`
            : "Optimized workflow synthesized from similar shared traces.",
        confidence,
        adoptionScore: scoreSuggestion(trace, similarity, prevalence),
        suggestedPromptPatch: [
          "Generate a numbered plan before calling tools.",
          "Annotate each step with expected risk and fallback.",
          guardrails[0],
        ].join(" "),
        guardrails,
        evidenceTraceIds: [trace.id],
      });

      if (suggestions.length >= limit) {
        break;
      }
    }

    return suggestions.slice(0, limit);
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
    const persisted = (await this.persistence?.loadSharedTraces?.()) ?? [];
    for (const trace of persisted) {
      this.traces.set(trace.id, trace);
    }
    this.pruneStore();
  }

  private saveSharedTrace(trace: SharedTrace): void {
    try {
      const result = this.persistence?.saveSharedTrace?.(trace);
      if (result && typeof (result as Promise<void>).catch === "function") {
        (result as Promise<void>).catch((error) =>
          console.error("[PERSISTENCE] Failed to save shared trace:", error)
        );
      }
    } catch (error) {
      console.error("[PERSISTENCE] Failed to save shared trace:", error);
    }
  }

  private removeSharedTrace(traceId: string): void {
    try {
      const result = this.persistence?.removeSharedTrace?.(traceId);
      if (result && typeof (result as Promise<void>).catch === "function") {
        (result as Promise<void>).catch((error) =>
          console.error("[PERSISTENCE] Failed to remove shared trace:", error)
        );
      }
    } catch (error) {
      console.error("[PERSISTENCE] Failed to remove shared trace:", error);
    }
  }
}
