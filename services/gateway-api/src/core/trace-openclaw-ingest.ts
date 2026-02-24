import { asString } from "../helpers.js";
import { mapleLog } from "../logging.js";
import { stepFromBridgeEvent } from "../bridge/openclaw-bridge.js";
import { auditAndPersist } from "./trace-audit.js";
import {
  createTraceForCurrentOwner,
  getLatestTraceBySessionForCurrentOwner,
  getTraceForCurrentOwner,
  upsertTraceForCurrentOwner,
} from "./trace-ownership.js";

import type { OpenClawRawEvent, Trace, TraceStep } from "@maple/types";

export function asOpenClawRawEvent(value: unknown): OpenClawRawEvent | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as OpenClawRawEvent;
}

export function eventIdFromStep(step: TraceStep): string | undefined {
  const maybe = step.metadata?.eventId;
  if (typeof maybe !== "string") {
    return undefined;
  }
  const trimmed = maybe.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export interface OpenClawIngestResult {
  trace: Trace;
  appendedCount: number;
  skippedDuplicateCount: number;
  report: ReturnType<typeof auditAndPersist>;
}

export function ingestOpenClawEvents(options: {
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
