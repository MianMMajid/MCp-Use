import { randomUUID } from "node:crypto";
import type { GuardAction, Trace, TraceStep } from "@maple/types";
import { parsePositiveInt, parsePositiveMs } from "./trace-store-config.js";
import {
  loadPersistedTracesIntoIndex,
  persistTrace,
  removePersistedTrace,
} from "./trace-store-persistence.js";
import { pruneTraceStore } from "./trace-store-prune.js";
import type {
  TraceStoreOptions,
  TraceStorePersistence,
} from "./trace-store-types.js";

export type {
  TraceStoreOptions,
  TraceStorePersistence,
} from "./trace-store-types.js";

export class TraceStore {
  private traces = new Map<string, Trace>();
  private sessionIndex = new Map<string, string[]>();
  private maxTraces: number;
  private maxTracesPerSession: number;
  private ttlMs: number;
  private persistence?: TraceStorePersistence;

  constructor(options: TraceStoreOptions = {}, env: NodeJS.ProcessEnv = process.env) {
    this.maxTraces = options.maxTraces ?? parsePositiveInt(env.MAPLE_MAX_TRACES, 2000);
    this.maxTracesPerSession =
      options.maxTracesPerSession ?? parsePositiveInt(env.MAPLE_MAX_TRACES_PER_SESSION, 250);
    this.ttlMs = options.ttlMs ?? parsePositiveMs(env.MAPLE_TRACE_TTL_MS, 1000 * 60 * 60 * 24);
    this.persistence = options.persistence;
  }

  async init(): Promise<void> {
    await loadPersistedTracesIntoIndex({
      persistence: this.persistence,
      traces: this.traces,
      sessionIndex: this.sessionIndex,
    });
    this.pruneStore();
  }

  createTrace(base: Omit<Trace, "id" | "startedAt" | "updatedAt">, ownerKeyFingerprint?: string): Trace {
    const now = new Date().toISOString();
    const trace: Trace = {
      ...base,
      id: randomUUID(),
      ownerKeyFingerprint: ownerKeyFingerprint ?? base.ownerKeyFingerprint,
      startedAt: now,
      updatedAt: now,
    };

    this.upsertTrace(trace, ownerKeyFingerprint);
    return trace;
  }

  upsertTrace(trace: Trace, ownerKeyFingerprint?: string): Trace {
    if (ownerKeyFingerprint) {
      if (trace.ownerKeyFingerprint && trace.ownerKeyFingerprint !== ownerKeyFingerprint) {
        throw new Error("Trace ownership mismatch.");
      }
      trace.ownerKeyFingerprint = ownerKeyFingerprint;
    }

    trace.updatedAt = new Date().toISOString();
    this.traces.set(trace.id, trace);

    const bySession = this.sessionIndex.get(trace.sessionId) ?? [];
    if (!bySession.includes(trace.id)) {
      bySession.push(trace.id);
      this.sessionIndex.set(trace.sessionId, bySession);
    }

    persistTrace(this.persistence, trace);

    this.pruneStore();
    return trace;
  }

  getTrace(traceId: string, ownerKeyFingerprint?: string): Trace | undefined {
    const trace = this.traces.get(traceId);
    if (!trace) {
      return undefined;
    }
    if (!this.matchesOwner(trace, ownerKeyFingerprint)) {
      return undefined;
    }
    return trace;
  }

  getLatestTraceBySession(sessionId: string, ownerKeyFingerprint?: string): Trace | undefined {
    const traceIds = this.sessionIndex.get(sessionId);
    if (!traceIds || traceIds.length === 0) {
      return undefined;
    }

    return traceIds
      .map((traceId) => this.traces.get(traceId))
      .filter((trace): trace is Trace => {
        if (!trace) {
          return false;
        }
        return this.matchesOwner(trace, ownerKeyFingerprint);
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  }

  listTraces(limit = 20, sessionId?: string, ownerKeyFingerprint?: string): Trace[] {
    const pool = sessionId
      ? (this.sessionIndex.get(sessionId) ?? [])
          .map((traceId) => this.traces.get(traceId))
          .filter((trace): trace is Trace => {
            if (!trace) {
              return false;
            }
            return this.matchesOwner(trace, ownerKeyFingerprint);
          })
      : [...this.traces.values()];

    return pool
      .filter((trace) => this.matchesOwner(trace, ownerKeyFingerprint))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit);
  }

  listSessionIds(ownerKeyFingerprint?: string): string[] {
    if (!ownerKeyFingerprint) {
      return [...this.sessionIndex.keys()];
    }
    return [...this.sessionIndex.entries()]
      .filter(([, traceIds]) =>
        traceIds.some((id) => {
          const t = this.traces.get(id);
          return t && this.matchesOwner(t, ownerKeyFingerprint);
        }),
      )
      .map(([sessionId]) => sessionId);
  }

  appendSteps(traceId: string, steps: TraceStep[], ownerKeyFingerprint?: string): Trace | undefined {
    const trace = this.getTrace(traceId, ownerKeyFingerprint);
    if (!trace) {
      return undefined;
    }

    const nextIndexStart = trace.steps.length;
    const normalized = steps.map((step, offset) => ({
      ...step,
      index: nextIndexStart + offset,
    }));

    trace.steps.push(...normalized);
    return this.upsertTrace(trace, ownerKeyFingerprint);
  }

  setGuardAction(
    traceId: string,
    stepIndex: number,
    action: GuardAction,
    reason?: string,
    ownerKeyFingerprint?: string,
  ): Trace | undefined {
    const trace = this.getTrace(traceId, ownerKeyFingerprint);
    if (!trace) {
      return undefined;
    }

    const step = trace.steps[stepIndex];
    if (!step) {
      return undefined;
    }

    step.guardStatus = action;
    step.metadata = {
      ...(step.metadata ?? {}),
      guardReason: reason,
      guardUpdatedAt: new Date().toISOString(),
    };

    if (action === "block") {
      trace.status = "quarantined";
    } else if (action === "allow") {
      const hasBlockedStep = trace.steps.some((candidate) => candidate.guardStatus === "block");
      if (!hasBlockedStep) {
        trace.status = "active";
      }
    }

    return this.upsertTrace(trace, ownerKeyFingerprint);
  }

  deleteTrace(traceId: string, ownerKeyFingerprint?: string): boolean {
    const trace = this.getTrace(traceId, ownerKeyFingerprint);
    if (!trace) {
      return false;
    }
    this.removeTrace(trace.id);
    return true;
  }

  private matchesOwner(trace: Trace, ownerKeyFingerprint?: string): boolean {
    if (!ownerKeyFingerprint) {
      return true;
    }
    return trace.ownerKeyFingerprint === ownerKeyFingerprint;
  }

  private pruneStore(): void {
    pruneTraceStore({
      traces: this.traces,
      sessionIndex: this.sessionIndex,
      maxTraces: this.maxTraces,
      maxTracesPerSession: this.maxTracesPerSession,
      ttlMs: this.ttlMs,
      removeTrace: (traceId: string) => this.removeTrace(traceId),
    });
  }

  private removeTrace(traceId: string): void {
    const trace = this.traces.get(traceId);
    if (!trace) {
      return;
    }
    this.traces.delete(traceId);
    const bySession = this.sessionIndex.get(trace.sessionId) ?? [];
    const next = bySession.filter((id) => id !== traceId);
    if (next.length > 0) {
      this.sessionIndex.set(trace.sessionId, next);
    } else {
      this.sessionIndex.delete(trace.sessionId);
    }
    removePersistedTrace(this.persistence, traceId);
  }
}
