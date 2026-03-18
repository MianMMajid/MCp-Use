import { database } from "../state.js";
import { requireApiKeyResponse } from "../auth.js";
import { mapleLog, redactForLogs } from "../logging.js";
import { apiErrorResponse } from "../api-error.js";
import { evaluateGatewayRuntimeDependencies } from "../core/runtime-dependencies.js";

// In-memory ring buffer for recent log entries
const LOG_BUFFER_MAX = 200;
const recentLogs = [];

/**
 * Capture a log entry into the ring buffer. This can be called from a global
 * log hook to populate the /api/runtime/logs endpoint.
 */
export function captureLogEntry(entry) {
  recentLogs.push({
    timestamp: entry.timestamp ?? new Date().toISOString(),
    level: entry.level ?? "info",
    event: entry.event ?? "",
    payload: entry.payload ?? {},
  });
  if (recentLogs.length > LOG_BUFFER_MAX) {
    recentLogs.shift();
  }
}

/**
 * Measure event loop lag using a timer-based approach.
 * Returns a promise that resolves with the lag in milliseconds.
 */
function measureEventLoopLag() {
  return new Promise((resolve) => {
    const start = process.hrtime.bigint();
    setImmediate(() => {
      const end = process.hrtime.bigint();
      const lagNs = Number(end - start);
      resolve(lagNs / 1_000_000); // convert to ms
    });
  });
}

/**
 * M3-10..12: Runtime diagnostics routes.
 *
 * GET /api/runtime/dependencies — runtime dependency health
 * GET /api/runtime/diag         — process diagnostics (memory, uptime, event loop lag)
 * GET /api/runtime/logs         — recent logs with PII redaction
 */
export function registerRuntimeDiagnosticsRoutes(app) {
  // GET /api/runtime/dependencies
  app.get("/api/runtime/dependencies", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    try {
      const report = await evaluateGatewayRuntimeDependencies();
      return c.json({ ok: true, ...report });
    } catch (err) {
      mapleLog("warn", "runtime_dependencies_failed", { error: err.message });
      return apiErrorResponse(
        c,
        500,
        "INTERNAL",
        "Failed to evaluate runtime dependencies.",
        err.message
      );
    }
  });

  // GET /api/runtime/diag
  app.get("/api/runtime/diag", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    try {
      const memory = process.memoryUsage();
      const uptime = process.uptime();
      const eventLoopLagMs = await measureEventLoopLag();

      return c.json({
        ok: true,
        memory: {
          rss: memory.rss,
          heapTotal: memory.heapTotal,
          heapUsed: memory.heapUsed,
          external: memory.external,
          arrayBuffers: memory.arrayBuffers,
        },
        uptimeSeconds: uptime,
        eventLoopLagMs,
        nodeVersion: process.version,
        platform: process.platform,
        pid: process.pid,
      });
    } catch (err) {
      mapleLog("warn", "runtime_diag_failed", { error: err.message });
      return apiErrorResponse(c, 500, "INTERNAL", "Failed to collect diagnostics.", err.message);
    }
  });

  // GET /api/runtime/logs
  app.get("/api/runtime/logs", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const limitRaw = Number.parseInt(c.req.query("limit") ?? "50", 10);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, LOG_BUFFER_MAX)) : 50;
    const level = (c.req.query("level") ?? "").trim().toLowerCase();

    let entries = recentLogs.slice(-limit);

    if (level) {
      entries = entries.filter((entry) => entry.level === level);
    }

    // Apply PII redaction to all log payloads
    const redacted = entries.map((entry) => ({
      timestamp: entry.timestamp,
      level: entry.level,
      event: entry.event,
      payload: redactForLogs(entry.payload),
    }));

    return c.json({
      ok: true,
      count: redacted.length,
      logs: redacted,
    });
  });
}
