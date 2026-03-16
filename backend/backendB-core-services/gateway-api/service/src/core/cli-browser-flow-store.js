import { randomUUID } from "node:crypto";

const FLOW_TTL_MS = 10 * 60 * 1000;
const MAX_FLOWS = 512;
const flows = new Map();

function pruneExpiredFlows(now = Date.now()) {
  for (const [flowId, flow] of flows.entries()) {
    if (!flow || flow.expiresAt <= now || flow.status === "expired") {
      flows.delete(flowId);
    }
  }
  while (flows.size > MAX_FLOWS) {
    const oldest = flows.keys().next();
    if (oldest.done) {
      break;
    }
    flows.delete(oldest.value);
  }
}

export function createCliBrowserFlow(kind, payload = {}, ttlMs = FLOW_TTL_MS) {
  pruneExpiredFlows();
  const now = Date.now();
  const flowId = randomUUID();
  const flow = {
    flowId,
    kind,
    status: "pending",
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlMs).toISOString(),
    payload: payload && typeof payload === "object" ? { ...payload } : {},
    result: null,
    error: "",
  };
  flows.set(flowId, flow);
  return flow;
}

export function getCliBrowserFlow(flowId) {
  pruneExpiredFlows();
  const flow = flows.get(String(flowId || "").trim());
  if (!flow) {
    return null;
  }
  if (Date.parse(flow.expiresAt) <= Date.now()) {
    flow.status = "expired";
    flow.updatedAt = new Date().toISOString();
    flow.error = flow.error || "Flow expired.";
    return flow;
  }
  return flow;
}

export function completeCliBrowserFlow(flowId, result = {}) {
  const flow = getCliBrowserFlow(flowId);
  if (!flow) {
    return null;
  }
  flow.status = "completed";
  flow.updatedAt = new Date().toISOString();
  flow.result = result && typeof result === "object" ? { ...result } : { value: result };
  flow.error = "";
  return flow;
}

export function failCliBrowserFlow(flowId, error) {
  const flow = getCliBrowserFlow(flowId);
  if (!flow) {
    return null;
  }
  flow.status = "failed";
  flow.updatedAt = new Date().toISOString();
  flow.error = String(error || "Flow failed.");
  return flow;
}

export function serializeCliBrowserFlow(flow) {
  if (!flow) {
    return null;
  }
  return {
    ok: flow.status === "completed",
    flowId: flow.flowId,
    kind: flow.kind,
    status: flow.status,
    createdAt: flow.createdAt,
    updatedAt: flow.updatedAt,
    expiresAt: flow.expiresAt,
    error: flow.error || undefined,
    ...(flow.result && typeof flow.result === "object" ? flow.result : {}),
  };
}
