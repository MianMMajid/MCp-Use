import { appendFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { mapleLog } from "../logging.js";

const HISTOGRAM_BUCKETS_MS = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
const DEFAULT_ZERO_USE_WINDOW_DAYS = 14;
const MAX_IN_MEMORY_EVENTS = 5000;

const serviceCallCounters = new Map();
const serviceDurationSummaries = new Map();
const serviceLastSeenMs = new Map();
const serviceEvents = [];

let evidenceFilePrepared = false;
const evidenceBuffer = [];
const EVIDENCE_FLUSH_INTERVAL_MS = 2000;
const EVIDENCE_FLUSH_THRESHOLD = 50;
let evidenceFlushTimer = null;

function nowIso() {
  return new Date().toISOString();
}

function nowMs() {
  return Date.now();
}

function asBoolean(value, fallback = false) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return fallback;
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function sanitizeLabel(value, fallback = "unknown") {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : fallback;
}

function serviceEventFilePath() {
  const raw =
    process.env.MAPLE_SERVICE_UTILIZATION_EVIDENCE_FILE ??
    "artifacts/service-audit/service-utilization-events.ndjson";
  return resolve(process.cwd(), String(raw));
}

async function ensureEvidenceFileReady() {
  if (evidenceFilePrepared) return;
  const filePath = serviceEventFilePath();
  await mkdir(dirname(filePath), { recursive: true });
  evidenceFilePrepared = true;
}

async function flushEvidenceBuffer() {
  if (evidenceBuffer.length === 0) return;
  const batch = evidenceBuffer.splice(0, evidenceBuffer.length);
  try {
    await ensureEvidenceFileReady();
    const lines = batch.map((e) => JSON.stringify(e)).join("\n") + "\n";
    await appendFile(serviceEventFilePath(), lines);
  } catch {
    // best effort
  }
}

function scheduleEvidenceFlush() {
  if (evidenceFlushTimer) return;
  evidenceFlushTimer = setTimeout(() => {
    evidenceFlushTimer = null;
    flushEvidenceBuffer();
  }, EVIDENCE_FLUSH_INTERVAL_MS);
  if (evidenceFlushTimer.unref) evidenceFlushTimer.unref();
}

function addToHistogram(summary, latencyMs) {
  summary.count += 1;
  summary.sumMs += latencyMs;
  summary.maxMs = Math.max(summary.maxMs, latencyMs);
  summary.minMs = Math.min(summary.minMs, latencyMs);
  for (const bucket of HISTOGRAM_BUCKETS_MS) {
    if (latencyMs <= bucket) {
      summary.buckets.set(bucket, (summary.buckets.get(bucket) ?? 0) + 1);
    }
  }
  summary.buckets.set(Infinity, (summary.buckets.get(Infinity) ?? 0) + 1);
}

function incrementCounterKey(caller, callee, operation, result) {
  const key = `${caller}|${callee}|${operation}|${result}`;
  const current = serviceCallCounters.get(key);
  if (!current) {
    serviceCallCounters.set(key, {
      caller,
      callee,
      operation,
      result,
      count: 1,
    });
    return;
  }
  current.count += 1;
}

function updateDurationSummary(caller, callee, operation, latencyMs) {
  const key = `${caller}|${callee}|${operation}`;
  let summary = serviceDurationSummaries.get(key);
  if (!summary) {
    summary = {
      caller,
      callee,
      operation,
      count: 0,
      sumMs: 0,
      minMs: Number.POSITIVE_INFINITY,
      maxMs: 0,
      buckets: new Map(),
    };
    serviceDurationSummaries.set(key, summary);
  }
  addToHistogram(summary, latencyMs);
}

function maybeWriteEvidenceEvent(event) {
  if (!asBoolean(process.env.MAPLE_SERVICE_UTILIZATION_EVIDENCE_ENABLED, true)) {
    return;
  }
  evidenceBuffer.push(event);
  if (evidenceBuffer.length >= EVIDENCE_FLUSH_THRESHOLD) {
    flushEvidenceBuffer();
  } else {
    scheduleEvidenceFlush();
  }
}

export function recordServiceCall(input) {
  const timestamp = input.timestamp ?? nowIso();
  const caller = sanitizeLabel(input.caller, "gateway-api");
  const service = sanitizeLabel(input.service ?? input.callee);
  const operation = sanitizeLabel(input.operation, "unknown_operation");
  const status = sanitizeLabel(input.status ?? input.result, "ok");
  const result = status === "ok" || status === "success" ? "ok" : "error";
  const latencyMs = Math.max(0, Number(input.latencyMs ?? 0));
  const routeId = String(input.routeId ?? "").trim();
  const traceId = String(input.traceId ?? "").trim();
  const tenantId = String(input.tenantId ?? "").trim();

  incrementCounterKey(caller, service, operation, result);
  updateDurationSummary(caller, service, operation, latencyMs);
  serviceLastSeenMs.set(service, nowMs());

  const event = {
    eventType: "service_utilization_evidence",
    timestamp,
    routeId,
    service,
    operation,
    traceId,
    tenantId,
    status: result,
    latencyMs,
    caller,
  };
  serviceEvents.push(event);
  if (serviceEvents.length > MAX_IN_MEMORY_EVENTS) {
    serviceEvents.splice(0, serviceEvents.length - MAX_IN_MEMORY_EVENTS);
  }

  mapleLog("info", "service_utilization_evidence", event);
  maybeWriteEvidenceEvent(event);
}

function csvToList(rawValue, fallback = []) {
  const text = String(rawValue ?? "").trim();
  if (!text) return [...fallback];
  return text
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function defaultRetainedServices() {
  return [
    "gateway-api",
    "context-wall",
    "mcp-proxy",
    "cyber-proxy",
    "audit-writer",
  ];
}

function zeroUseWindowMs() {
  const daysRaw = Number.parseInt(
    String(process.env.MAPLE_SERVICE_UTILIZATION_ZERO_USE_WINDOW_DAYS ?? DEFAULT_ZERO_USE_WINDOW_DAYS),
    10,
  );
  const days = Number.isFinite(daysRaw) && daysRaw > 0 ? daysRaw : DEFAULT_ZERO_USE_WINDOW_DAYS;
  return days * 24 * 60 * 60 * 1000;
}

export function getServiceUtilizationSnapshot(options = {}) {
  const retainedServices = csvToList(
    options.retainedServices ?? process.env.MAPLE_RETAINED_SERVICES,
    defaultRetainedServices(),
  );
  const retainedSet = new Set(retainedServices);
  const callsByService = {};
  const counters = [];
  for (const counter of serviceCallCounters.values()) {
    counters.push(counter);
    const current = callsByService[counter.callee] ?? { total: 0, ok: 0, error: 0 };
    current.total += counter.count;
    if (counter.result === "ok") current.ok += counter.count;
    if (counter.result === "error") current.error += counter.count;
    callsByService[counter.callee] = current;
  }

  const durations = [];
  for (const summary of serviceDurationSummaries.values()) {
    durations.push({
      caller: summary.caller,
      callee: summary.callee,
      operation: summary.operation,
      count: summary.count,
      avgMs: summary.count > 0 ? summary.sumMs / summary.count : 0,
      minMs: summary.count > 0 ? summary.minMs : 0,
      maxMs: summary.maxMs,
      buckets: Object.fromEntries(
        [...summary.buckets.entries()].map(([bucket, value]) => [
          Number.isFinite(bucket) ? String(bucket) : "+Inf",
          value,
        ]),
      ),
    });
  }

  const windowMs = zeroUseWindowMs();
  const now = nowMs();
  const zeroUse = {};
  for (const service of retainedSet) {
    const lastSeen = serviceLastSeenMs.get(service) ?? 0;
    zeroUse[service] = now - lastSeen >= windowMs ? 1 : 0;
  }

  return {
    generatedAt: nowIso(),
    windowMs,
    retainedServices: [...retainedSet],
    callsByService,
    counters,
    durations,
    zeroUse,
    events: [...serviceEvents],
  };
}

export function buildServiceUtilizationPrometheusLines() {
  const snapshot = getServiceUtilizationSnapshot();
  const lines = [];
  lines.push("# HELP maple_service_calls_total Service-to-service call counter");
  lines.push("# TYPE maple_service_calls_total counter");
  for (const counter of snapshot.counters) {
    lines.push(
      `maple_service_calls_total{caller="${counter.caller}",callee="${counter.callee}",operation="${counter.operation}",result="${counter.result}"} ${counter.count}`,
    );
  }

  lines.push("# HELP maple_service_call_duration_ms Service call duration histogram in milliseconds");
  lines.push("# TYPE maple_service_call_duration_ms histogram");
  for (const duration of snapshot.durations) {
    const buckets = duration.buckets ?? {};
    const orderedLabels = [...HISTOGRAM_BUCKETS_MS.map((value) => String(value)), "+Inf"];
    for (const label of orderedLabels) {
      const count = Number(buckets[label] ?? 0);
      lines.push(
        `maple_service_call_duration_ms_bucket{caller="${duration.caller}",callee="${duration.callee}",operation="${duration.operation}",le="${label}"} ${count}`,
      );
    }
    const sumMs = Number(duration.avgMs ?? 0) * Number(duration.count ?? 0);
    lines.push(
      `maple_service_call_duration_ms_sum{caller="${duration.caller}",callee="${duration.callee}",operation="${duration.operation}"} ${sumMs}`,
    );
    lines.push(
      `maple_service_call_duration_ms_count{caller="${duration.caller}",callee="${duration.callee}",operation="${duration.operation}"} ${duration.count}`,
    );
  }

  const windowLabel = `${Math.round(snapshot.windowMs / (24 * 60 * 60 * 1000))}d`;
  lines.push("# HELP maple_service_zero_use_window Service has zero observed usage in configured window");
  lines.push("# TYPE maple_service_zero_use_window gauge");
  for (const [service, value] of Object.entries(snapshot.zeroUse)) {
    lines.push(`maple_service_zero_use_window{service="${service}",window="${windowLabel}"} ${value}`);
  }

  return lines;
}
