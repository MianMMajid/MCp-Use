import type { SharedTrace } from "@maple/types";

export interface SharedTraceStorePersistence {
  loadSharedTraces?: () => SharedTrace[] | Promise<SharedTrace[]>;
  saveSharedTrace?: (trace: SharedTrace) => void | Promise<void>;
  removeSharedTrace?: (traceId: string) => void | Promise<void>;
}

export async function loadPersistedSharedTraces(
  persistence?: SharedTraceStorePersistence,
): Promise<SharedTrace[]> {
  return (await persistence?.loadSharedTraces?.()) ?? [];
}

export function persistSharedTrace(
  trace: SharedTrace,
  persistence?: SharedTraceStorePersistence,
): void {
  try {
    const result = persistence?.saveSharedTrace?.(trace);
    if (result && typeof (result as Promise<void>).catch === "function") {
      (result as Promise<void>).catch((error) =>
        console.error("[PERSISTENCE] Failed to save shared trace:", error),
      );
    }
  } catch (error) {
    console.error("[PERSISTENCE] Failed to save shared trace:", error);
  }
}

export function removePersistedSharedTrace(
  traceId: string,
  persistence?: SharedTraceStorePersistence,
): void {
  try {
    const result = persistence?.removeSharedTrace?.(traceId);
    if (result && typeof (result as Promise<void>).catch === "function") {
      (result as Promise<void>).catch((error) =>
        console.error("[PERSISTENCE] Failed to remove shared trace:", error),
      );
    }
  } catch (error) {
    console.error("[PERSISTENCE] Failed to remove shared trace:", error);
  }
}
