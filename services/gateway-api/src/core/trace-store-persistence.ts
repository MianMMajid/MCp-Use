import type { Trace } from "@maple/types";
import type { TraceStorePersistence } from "./trace-store-types.js";

function isPromiseLike(value: unknown): value is Promise<void> {
  return Boolean(value) && typeof (value as Promise<void>).catch === "function";
}

export function persistTrace(
  persistence: TraceStorePersistence | undefined,
  trace: Trace,
): void {
  try {
    const result = persistence?.saveTrace?.(trace);
    if (isPromiseLike(result)) {
      result.catch((error) =>
        console.error("[PERSISTENCE] Failed to save trace:", error),
      );
    }
  } catch (error) {
    console.error("[PERSISTENCE] Failed to save trace:", error);
  }
}

export function removePersistedTrace(
  persistence: TraceStorePersistence | undefined,
  traceId: string,
): void {
  try {
    const result = persistence?.removeTrace?.(traceId);
    if (isPromiseLike(result)) {
      result.catch((error) =>
        console.error("[PERSISTENCE] Failed to remove trace:", error),
      );
    }
  } catch (error) {
    console.error("[PERSISTENCE] Failed to remove trace:", error);
  }
}

export async function loadPersistedTracesIntoIndex(options: {
  persistence: TraceStorePersistence | undefined;
  traces: Map<string, Trace>;
  sessionIndex: Map<string, string[]>;
}): Promise<void> {
  const persisted = (await options.persistence?.loadTraces?.()) ?? [];
  for (const trace of persisted) {
    options.traces.set(trace.id, trace);
    const bySession = options.sessionIndex.get(trace.sessionId) ?? [];
    if (!bySession.includes(trace.id)) {
      bySession.push(trace.id);
      options.sessionIndex.set(trace.sessionId, bySession);
    }
  }
}
