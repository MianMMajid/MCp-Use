/**
 * trace-context.js
 *
 * Distributed tracing helpers for propagating trace/span context
 * through the audit pipeline and alert webhook dispatches.
 */
import { randomUUID } from "node:crypto";

/**
 * Create a new span context, optionally linked to a parent trace.
 */
export function createSpanContext(parentTraceId) {
  return {
    traceId: parentTraceId || randomUUID(),
    spanId: randomUUID().slice(0, 16),
    timestamp: Date.now(),
  };
}

/**
 * Build trace headers for outbound HTTP requests (e.g. webhook dispatches).
 */
export function traceHeaders(spanContext) {
  if (!spanContext) return {};
  return {
    "X-Trace-Id": spanContext.traceId ?? "",
    "X-Span-Id": spanContext.spanId ?? "",
  };
}

/**
 * Extract trace context from an incoming request's headers.
 */
export function extractTraceContext(headers) {
  const traceId = headers?.["x-trace-id"] ?? headers?.["x-maple-trace-id"] ?? "";
  const spanId = headers?.["x-span-id"] ?? "";
  return { traceId, spanId };
}
