import { getGrpcClients } from "./state.js";
import { mapleLog } from "./logging.js";

interface ApprovalEvent {
  traceId: string;
  stepIndex: number;
  requestedAt: string;
  step: unknown;
  pendingDecision: unknown;
}

type ApprovalListener = (event: ApprovalEvent) => void;

const pendingEvents = new Map<string, ApprovalEvent>();
const listeners = new Set<ApprovalListener>();
let started = false;
let stream: any;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function eventKey(traceId: string, stepIndex: number): string {
  return `${traceId}:${stepIndex}`;
}

function normalizeEvent(event: any): ApprovalEvent {
  return {
    traceId: String(event?.traceId || ""),
    stepIndex: Number(event?.stepIndex || 0),
    requestedAt: String(event?.requestedAt || ""),
    step: event?.step ?? null,
    pendingDecision: event?.pendingDecision ?? null,
  };
}

function clearReconnectTimer(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect(): void {
  clearReconnectTimer();
  reconnectTimer = setTimeout(() => {
    connect();
  }, 1000);
}

function connect(): void {
  const clients = getGrpcClients();
  if (!clients?.contextWall || typeof clients.contextWall.watchApprovalQueue !== "function") {
    scheduleReconnect();
    return;
  }
  try {
    stream = clients.contextWall.watchApprovalQueue({ sessionId: "" });
  } catch (err: any) {
    mapleLog("warn", "hitl_broker_stream_start_failed", { error: err.message });
    scheduleReconnect();
    return;
  }

  stream.on("data", (event: any) => {
    const normalized = normalizeEvent(event);
    if (!normalized.traceId) return;
    pendingEvents.set(eventKey(normalized.traceId, normalized.stepIndex), normalized);
    for (const listener of listeners) {
      listener(normalized);
    }
  });
  stream.on("error", (err: any) => {
    mapleLog("warn", "hitl_broker_stream_error", { error: err.message });
    scheduleReconnect();
  });
  stream.on("end", () => {
    scheduleReconnect();
  });
}

export function startHitlBroker(): void {
  if (started) return;
  started = true;
  connect();
}

export function listBufferedApprovals(): ApprovalEvent[] {
  return [...pendingEvents.values()].sort((a, b) => {
    if (!a.requestedAt && !b.requestedAt) return 0;
    if (!a.requestedAt) return 1;
    if (!b.requestedAt) return -1;
    return a.requestedAt.localeCompare(b.requestedAt);
  });
}

export function subscribeBufferedApprovals(listener: ApprovalListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resolveBufferedApproval(traceId: string, stepIndex: number): void {
  pendingEvents.delete(eventKey(traceId, stepIndex));
}
