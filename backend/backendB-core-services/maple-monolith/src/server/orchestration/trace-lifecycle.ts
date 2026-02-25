import type { OpenClawRawEvent, Trace, TraceStep } from "../../core/types.js";

interface TraceStoreLike {
  createTrace: (
    base: Omit<Trace, "id" | "startedAt" | "updatedAt">,
    ownerKeyFingerprint?: string
  ) => Trace;
  upsertTrace: (trace: Trace, ownerKeyFingerprint?: string) => Trace;
  getTrace: (traceId: string, ownerKeyFingerprint?: string) => Trace | undefined;
  getLatestTraceBySession: (
    sessionId: string,
    ownerKeyFingerprint?: string
  ) => Trace | undefined;
  listTraces: (
    limit: number,
    sessionId?: string,
    ownerKeyFingerprint?: string
  ) => Trace[];
  deleteTrace: (traceId: string, ownerKeyFingerprint?: string) => boolean;
  setGuardAction: (
    traceId: string,
    stepIndex: number,
    action: "allow" | "block" | "pending",
    reason?: string,
    ownerKeyFingerprint?: string
  ) => Trace | undefined;
}

interface AuditSummary {
  overallRiskScore: number;
  severity: string;
}

interface OpenClawIngestResult {
  trace: Trace;
  appendedCount: number;
  skippedDuplicateCount: number;
  report: AuditSummary;
}

interface CreateTraceLifecycleDeps {
  traceStore: TraceStoreLike;
  currentOwnerKeyFingerprint: () => string | undefined;
  currentOwnerKeyFingerprintsForLookup: () => string[] | undefined;
  dedupeBy: <T>(items: T[], key: (item: T) => string) => T[];
  stepFromBridgeEvent: (event: OpenClawRawEvent, index: number) => TraceStep;
  auditAndPersist: (trace: Trace) => AuditSummary;
  mapleLog: (
    level: "debug" | "info" | "warn" | "error",
    event: string,
    payload?: Record<string, unknown>
  ) => void;
}

function asOpenClawRawEvent(value: unknown): OpenClawRawEvent | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as OpenClawRawEvent;
}

function eventIdFromStep(step: TraceStep): string | undefined {
  const maybe = step.metadata?.eventId;
  if (typeof maybe !== "string") {
    return undefined;
  }
  const trimmed = maybe.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function createTraceLifecycle(deps: CreateTraceLifecycleDeps) {
  const {
    traceStore,
    currentOwnerKeyFingerprint,
    currentOwnerKeyFingerprintsForLookup,
    dedupeBy,
    stepFromBridgeEvent,
    auditAndPersist,
    mapleLog,
  } = deps;

  function createTraceForCurrentOwner(
    base: Omit<Trace, "id" | "startedAt" | "updatedAt">
  ): Trace {
    return traceStore.createTrace(base, currentOwnerKeyFingerprint());
  }

  function upsertTraceForCurrentOwner(trace: Trace): Trace {
    return traceStore.upsertTrace(
      trace,
      trace.ownerKeyFingerprint ?? currentOwnerKeyFingerprint()
    );
  }

  function getTraceForCurrentOwner(traceId: string): Trace | undefined {
    const ownerScopes = currentOwnerKeyFingerprintsForLookup();
    if (!ownerScopes) {
      return traceStore.getTrace(traceId);
    }
    for (const owner of ownerScopes) {
      const matched = traceStore.getTrace(traceId, owner);
      if (matched) {
        return matched;
      }
    }
    return undefined;
  }

  function getLatestTraceBySessionForCurrentOwner(
    sessionId: string
  ): Trace | undefined {
    const ownerScopes = currentOwnerKeyFingerprintsForLookup();
    if (!ownerScopes) {
      return traceStore.getLatestTraceBySession(sessionId);
    }
    const candidates = ownerScopes
      .map((owner) => traceStore.getLatestTraceBySession(sessionId, owner))
      .filter((trace): trace is Trace => Boolean(trace))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return candidates[0];
  }

  function listTracesForCurrentOwner(limit: number, sessionId?: string): Trace[] {
    const ownerScopes = currentOwnerKeyFingerprintsForLookup();
    if (!ownerScopes) {
      return traceStore.listTraces(limit, sessionId);
    }
    const merged = ownerScopes.flatMap((owner) =>
      traceStore.listTraces(limit, sessionId, owner)
    );
    const deduped = dedupeBy(merged, (trace) => trace.id);
    return deduped
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit);
  }

  function clearTracesForCurrentOwner(): number {
    let removed = 0;
    while (true) {
      const batch = listTracesForCurrentOwner(200);
      if (batch.length === 0) {
        break;
      }
      for (const trace of batch) {
        if (traceStore.deleteTrace(trace.id, trace.ownerKeyFingerprint)) {
          removed += 1;
        }
      }
    }
    return removed;
  }

  function ingestOpenClawEvents(options: {
    traceId?: string;
    sessionId?: string;
    events: OpenClawRawEvent[];
    sourceHint?: Trace["source"];
    metadata?: Record<string, unknown>;
  }): OpenClawIngestResult {
    const { traceId, sessionId, events, sourceHint, metadata } = options;
    mapleLog("debug", "openclaw.ingest.begin", {
      traceId: traceId ?? null,
      sessionId: sessionId ?? null,
      sourceHint: sourceHint ?? null,
      eventCount: events.length,
      ingress: metadata?.ingress,
    });

    let trace = traceId ? getTraceForCurrentOwner(traceId) : undefined;
    if (traceId && !trace) {
      mapleLog("warn", "openclaw.ingest.trace_not_found", {
        traceId,
        sessionId: sessionId ?? null,
        eventCount: events.length,
      });
      throw new Error(`Trace ${traceId} not found.`);
    }

    if (!trace && sessionId) {
      trace = getLatestTraceBySessionForCurrentOwner(sessionId);
    }

    if (!trace) {
      trace = createTraceForCurrentOwner({
        sessionId: sessionId ?? `openclaw-${Date.now()}`,
        source: sourceHint === "manual" ? sourceHint : "openclaw",
        status: "active",
        metadata: {
          mode: "openclaw-push",
          ingestMode: "push",
          ...(metadata ?? {}),
        },
        steps: [],
      });
    }

    const seenEventIds = new Set<string>();
    for (const existingStep of trace.steps) {
      const eventId = eventIdFromStep(existingStep);
      if (eventId) {
        seenEventIds.add(eventId);
      }
    }

    let appendedCount = 0;
    let skippedDuplicateCount = 0;
    for (const event of events) {
      const nextIndex = trace.steps.length;
      const step = stepFromBridgeEvent(event, nextIndex);
      const eventId = eventIdFromStep(step);
      if (eventId && seenEventIds.has(eventId)) {
        skippedDuplicateCount += 1;
        continue;
      }

      trace.steps.push(step);
      appendedCount += 1;
      if (eventId) {
        seenEventIds.add(eventId);
      }
    }

    trace.source = sourceHint === "manual" ? sourceHint : "openclaw";
    trace.metadata = {
      ...(trace.metadata ?? {}),
      mode: trace.source === "openclaw" ? "openclaw-push" : trace.metadata?.mode,
      ingestMode: "push",
      ingestLastAt: new Date().toISOString(),
      ingestLastCount: appendedCount,
      ingestSkippedDuplicates: skippedDuplicateCount,
      ...(metadata ?? {}),
    };

    upsertTraceForCurrentOwner(trace);
    const report = auditAndPersist(trace);
    mapleLog("info", "openclaw.ingest.complete", {
      traceId: trace.id,
      sessionId: trace.sessionId,
      source: trace.source,
      appendedCount,
      skippedDuplicateCount,
      stepCount: trace.steps.length,
      status: trace.status,
      overallRiskScore: report.overallRiskScore,
      severity: report.severity,
      ingress: metadata?.ingress,
    });

    return {
      trace,
      appendedCount,
      skippedDuplicateCount,
      report,
    };
  }

  function setGuardActionForCurrentOwner(
    traceId: string,
    stepIndex: number,
    action: "allow" | "block" | "pending",
    reason?: string
  ): Trace | undefined {
    const preferredOwner = currentOwnerKeyFingerprint();
    if (preferredOwner) {
      const updated = traceStore.setGuardAction(
        traceId,
        stepIndex,
        action,
        reason,
        preferredOwner
      );
      if (updated) {
        return updated;
      }
    }
    const ownerScopes = currentOwnerKeyFingerprintsForLookup();
    if (!ownerScopes) {
      return traceStore.setGuardAction(traceId, stepIndex, action, reason);
    }
    for (const owner of ownerScopes) {
      if (owner === preferredOwner) {
        continue;
      }
      const updated = traceStore.setGuardAction(
        traceId,
        stepIndex,
        action,
        reason,
        owner
      );
      if (updated) {
        return updated;
      }
    }
    return undefined;
  }

  return {
    asOpenClawRawEvent,
    clearTracesForCurrentOwner,
    createTraceForCurrentOwner,
    getLatestTraceBySessionForCurrentOwner,
    getTraceForCurrentOwner,
    ingestOpenClawEvents,
    listTracesForCurrentOwner,
    setGuardActionForCurrentOwner,
    upsertTraceForCurrentOwner,
  };
}
