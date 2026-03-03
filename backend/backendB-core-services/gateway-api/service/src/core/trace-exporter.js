/**
 * trace-exporter.js
 *
 * OTLP/HTTP trace exporter that batches and sends spans to an
 * external collector (Jaeger, Grafana Tempo, etc.).
 * Reads configuration from environment variables.
 */
import { mapleLog } from "../logging.js";

let _buffer = [];
let _flushTimer = null;
let _flushing = false;

// Test-only helper to force deterministic state across test files/processes.
export function __resetTraceExporterForTests() {
  if (_flushTimer) {
    clearInterval(_flushTimer);
    _flushTimer = null;
  }
  _buffer = [];
  _flushing = false;
}

function requireTraceEnv(key) {
  const val = process.env[key]?.trim();
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}

function getConfig() {
  return {
    endpoint: requireTraceEnv("MAPLE_OTLP_ENDPOINT"),
    batchSize: (() => { const v = Number(requireTraceEnv("MAPLE_OTLP_BATCH_SIZE")); if (!Number.isFinite(v) || v < 1) throw new Error("Invalid MAPLE_OTLP_BATCH_SIZE"); return v; })(),
    flushIntervalMs: (() => { const v = Number(requireTraceEnv("MAPLE_OTLP_FLUSH_INTERVAL_MS")); if (!Number.isFinite(v) || v < 1000) throw new Error("Invalid MAPLE_OTLP_FLUSH_INTERVAL_MS"); return v; })(),
    timeoutMs: (() => { const v = Number(requireTraceEnv("MAPLE_OTLP_TIMEOUT_MS")); if (!Number.isFinite(v) || v < 1000) throw new Error("Invalid MAPLE_OTLP_TIMEOUT_MS"); return v; })(),
    serviceName: requireTraceEnv("MAPLE_OTLP_SERVICE_NAME"),
    headers: parseHeaders(process.env.MAPLE_OTLP_HEADERS),
  };
}

function parseHeaders(raw) {
  if (!raw) return {};
  const headers = {};
  for (const pair of String(raw).split(",")) {
    const [key, ...rest] = pair.split("=");
    if (key?.trim()) {
      headers[key.trim()] = rest.join("=").trim();
    }
  }
  return headers;
}

/**
 * Record a span for later export.
 * @param {object} span - { traceId, spanId, operationName, startTime, endTime, attributes, status }
 */
export function recordSpan(span) {
  const config = getConfig();
  if (!config.endpoint) return; // OTLP disabled

  _buffer.push({
    traceId: span.traceId ?? "",
    spanId: span.spanId ?? "",
    operationName: span.operationName ?? "",
    startTimeUnixNano: (span.startTime ?? Date.now()) * 1_000_000,
    endTimeUnixNano: (span.endTime ?? Date.now()) * 1_000_000,
    attributes: span.attributes ?? {},
    status: span.status ?? { code: 0 },
  });

  if (_buffer.length >= config.batchSize) {
    flushSpans().catch(() => {});
  }
}

/**
 * Flush buffered spans to the OTLP endpoint.
 */
export async function flushSpans() {
  if (_flushing || _buffer.length === 0) return { sent: 0 };
  _flushing = true;

  const config = getConfig();
  if (!config.endpoint) {
    _buffer = [];
    _flushing = false;
    return { sent: 0, reason: "disabled" };
  }

  const batch = _buffer.splice(0, config.batchSize);

  try {
    const otlpPayload = buildOtlpPayload(batch, config.serviceName);
    const url = config.endpoint.endsWith("/v1/traces")
      ? config.endpoint
      : `${config.endpoint}/v1/traces`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...config.headers,
        },
        body: JSON.stringify(otlpPayload),
        signal: controller.signal,
      });

      if (!response.ok) {
        mapleLog("warn", "trace_exporter.flush_failed", {
          status: response.status,
          statusText: response.statusText,
        });
        // Put spans back for retry
        _buffer.unshift(...batch);
      }

      return { sent: batch.length };
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    mapleLog("warn", "trace_exporter.flush_error", {
      error: err instanceof Error ? err.message : String(err),
      batchSize: batch.length,
    });
    // Put spans back for retry (up to max buffer)
    if (_buffer.length < config.batchSize * 10) {
      _buffer.unshift(...batch);
    }
    return { sent: 0, error: err instanceof Error ? err.message : String(err) };
  } finally {
    _flushing = false;
  }
}

export function buildOtlpPayload(spans, serviceName) {
  return {
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: serviceName } },
          ],
        },
        scopeSpans: [
          {
            scope: { name: "maple-gateway" },
            spans: spans.map((s) => ({
              traceId: s.traceId,
              spanId: s.spanId,
              name: s.operationName,
              startTimeUnixNano: String(s.startTimeUnixNano),
              endTimeUnixNano: String(s.endTimeUnixNano),
              attributes: Object.entries(s.attributes).map(([key, value]) => ({
                key,
                value: { stringValue: String(value) },
              })),
              status: s.status,
            })),
          },
        ],
      },
    ],
  };
}

/**
 * Start the periodic flush worker.
 */
export function startTraceExporter() {
  const config = getConfig();
  if (!config.endpoint) {
    mapleLog("info", "trace_exporter.disabled", { reason: "no_endpoint" });
    return;
  }
  if (_flushTimer) return;

  _flushTimer = setInterval(() => {
    flushSpans().catch((err) => {
      mapleLog("warn", "trace_exporter.periodic_flush_error", {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }, config.flushIntervalMs);

  if (_flushTimer.unref) {
    _flushTimer.unref();
  }

  mapleLog("info", "trace_exporter.started", {
    endpoint: config.endpoint,
    flushIntervalMs: config.flushIntervalMs,
    batchSize: config.batchSize,
  });
}

/**
 * Stop the trace exporter and flush remaining spans.
 */
export async function stopTraceExporter() {
  if (_flushTimer) {
    clearInterval(_flushTimer);
    _flushTimer = null;
  }
  await flushSpans();
}
