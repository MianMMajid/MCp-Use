import type { Trace } from "@maple/types";

export interface TraceStoreOptions {
  maxTraces?: number;
  maxTracesPerSession?: number;
  ttlMs?: number;
  persistence?: TraceStorePersistence;
}

export interface TraceStorePersistence {
  loadTraces?: () => Trace[] | Promise<Trace[]>;
  saveTrace?: (trace: Trace) => void | Promise<void>;
  removeTrace?: (traceId: string) => void | Promise<void>;
}
