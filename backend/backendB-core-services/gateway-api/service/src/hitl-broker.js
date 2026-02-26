import { getGrpcClients } from "./state.js";
import { mapleLog } from "./logging.js";
const pendingEvents = new Map();
const listeners = new Set();
let started = false;
let stream;
let reconnectTimer = null;
function eventKey(traceId, stepIndex) {
    return `${traceId}:${stepIndex}`;
}
function normalizeEvent(event) {
    return {
        traceId: String(event?.traceId || ""),
        stepIndex: Number(event?.stepIndex || 0),
        requestedAt: String(event?.requestedAt || ""),
        step: event?.step ?? null,
        pendingDecision: event?.pendingDecision ?? null,
    };
}
function clearReconnectTimer() {
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
}
function closeStream() {
    if (!stream) {
        return;
    }
    try {
        if (typeof stream.removeAllListeners === "function") {
            stream.removeAllListeners();
        }
    }
    catch {
        // best effort
    }
    try {
        if (typeof stream.cancel === "function") {
            stream.cancel();
        }
    }
    catch {
        // best effort
    }
    stream = undefined;
}
function scheduleReconnect() {
    clearReconnectTimer();
    reconnectTimer = setTimeout(() => {
        connect();
    }, 1000);
}
function connect() {
    const clients = getGrpcClients();
    if (!clients?.contextWall || typeof clients.contextWall.watchApprovalQueue !== "function") {
        scheduleReconnect();
        return;
    }
    try {
        closeStream();
        stream = clients.contextWall.watchApprovalQueue({ sessionId: "" });
    }
    catch (err) {
        mapleLog("warn", "hitl_broker_stream_start_failed", { error: err.message });
        scheduleReconnect();
        return;
    }
    stream.on("data", (event) => {
        const normalized = normalizeEvent(event);
        if (!normalized.traceId)
            return;
        pendingEvents.set(eventKey(normalized.traceId, normalized.stepIndex), normalized);
        for (const listener of listeners) {
            listener(normalized);
        }
    });
    stream.on("error", (err) => {
        mapleLog("warn", "hitl_broker_stream_error", { error: err.message });
        scheduleReconnect();
    });
    stream.on("end", () => {
        scheduleReconnect();
    });
}
export function startHitlBroker() {
    if (started)
        return;
    started = true;
    connect();
}
export function stopHitlBroker() {
    if (!started)
        return;
    started = false;
    clearReconnectTimer();
    closeStream();
    pendingEvents.clear();
}
export function listBufferedApprovals() {
    return [...pendingEvents.values()].sort((a, b) => {
        if (!a.requestedAt && !b.requestedAt)
            return 0;
        if (!a.requestedAt)
            return 1;
        if (!b.requestedAt)
            return -1;
        return a.requestedAt.localeCompare(b.requestedAt);
    });
}
export function subscribeBufferedApprovals(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
export function resolveBufferedApproval(traceId, stepIndex) {
    pendingEvents.delete(eventKey(traceId, stepIndex));
}
//# sourceMappingURL=hitl-broker.js.map
