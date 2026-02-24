import { currentOwnerKeyFingerprint, currentOwnerKeyFingerprintsForLookup } from "../auth.js";
import { dedupeBy } from "../helpers.js";
import { traceStore } from "../state.js";

import type { Trace, TraceStep } from "@maple/types";

export function createTraceForCurrentOwner(base: Omit<Trace, "id" | "startedAt" | "updatedAt">): Trace {
  return traceStore.createTrace(base, currentOwnerKeyFingerprint());
}

export function upsertTraceForCurrentOwner(trace: Trace): Trace {
  return traceStore.upsertTrace(trace, trace.ownerKeyFingerprint ?? currentOwnerKeyFingerprint());
}

export function getTraceForCurrentOwner(traceId: string): Trace | undefined {
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

export function getLatestTraceBySessionForCurrentOwner(sessionId: string): Trace | undefined {
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

export function listTracesForCurrentOwner(limit: number, sessionId?: string): Trace[] {
  const ownerScopes = currentOwnerKeyFingerprintsForLookup();
  if (!ownerScopes) {
    return traceStore.listTraces(limit, sessionId);
  }
  const merged = ownerScopes.flatMap((owner) => traceStore.listTraces(limit, sessionId, owner));
  const deduped = dedupeBy(merged, (trace) => trace.id);
  return deduped
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit);
}

export function deleteTraceForCurrentOwner(traceId: string): boolean {
  const trace = getTraceForCurrentOwner(traceId);
  if (!trace) {
    return false;
  }
  return traceStore.deleteTrace(trace.id, trace.ownerKeyFingerprint);
}

export function clearTracesForCurrentOwner(): number {
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

export function setGuardActionForCurrentOwner(
  traceId: string,
  stepIndex: number,
  action: TraceStep["guardStatus"],
  reason?: string,
): Trace | undefined {
  const preferredOwner = currentOwnerKeyFingerprint();
  const ownerScopes = currentOwnerKeyFingerprintsForLookup();
  if (!ownerScopes) {
    return traceStore.setGuardAction(traceId, stepIndex, action, reason);
  }
  if (preferredOwner && ownerScopes.includes(preferredOwner)) {
    const updated = traceStore.setGuardAction(traceId, stepIndex, action, reason, preferredOwner);
    if (updated) {
      return updated;
    }
  }
  for (const owner of ownerScopes) {
    if (owner === preferredOwner) {
      continue;
    }
    const updated = traceStore.setGuardAction(traceId, stepIndex, action, reason, owner);
    if (updated) {
      return updated;
    }
  }
  return undefined;
}

export function resolveTraceByIdOrLatest(traceId?: string): Trace | undefined {
  if (traceId) {
    return getTraceForCurrentOwner(traceId);
  }
  return listTracesForCurrentOwner(1)[0];
}
