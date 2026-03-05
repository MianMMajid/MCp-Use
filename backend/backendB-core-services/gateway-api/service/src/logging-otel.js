import { redactForLogs } from "./logging-redaction.js";
function normalizeOtelLogsEndpoint(raw) {
    const trimmed = raw.trim();
    if (!trimmed) {
        return "";
    }
    if (trimmed.endsWith("/v1/logs")) {
        return trimmed;
    }
    return `${trimmed.replace(/\/$/, "")}/v1/logs`;
}
const otelLogsEndpoint = normalizeOtelLogsEndpoint(String(process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT || process.env.MAPLE_OTEL_LOGS_ENDPOINT || "").trim());
const otelServiceName = String(process.env.OTEL_SERVICE_NAME || process.env.MAPLE_SERVICE_NAME || "").trim();
const OTEL_SEVERITY_NUMBER = {
    error: 17,
    warn: 13,
    info: 9,
    debug: 5,
    trace: 1,
};
const OTEL_FLUSH_INTERVAL_MS = 2000;
const OTEL_FLUSH_THRESHOLD = 100;
const otelLogBuffer = [];
let otelFlushTimer = null;
function flushOtelLogBuffer() {
    if (otelLogBuffer.length === 0) return;
    const records = otelLogBuffer.splice(0, otelLogBuffer.length);
    const payload = {
        resourceLogs: [
            {
                resource: {
                    attributes: [
                        {
                            key: "service.name",
                            value: { stringValue: otelServiceName },
                        },
                    ],
                },
                scopeLogs: [
                    {
                        scope: { name: "gateway-api" },
                        logRecords: records,
                    },
                ],
            },
        ],
    };
    fetch(otelLogsEndpoint, {
        method: "POST",
        headers: {
            "content-type": "application/json",
        },
        body: JSON.stringify(payload),
    }).catch(() => {
        // fire-and-forget
    });
}
function scheduleOtelFlush() {
    if (otelFlushTimer) return;
    otelFlushTimer = setTimeout(() => {
        otelFlushTimer = null;
        flushOtelLogBuffer();
    }, OTEL_FLUSH_INTERVAL_MS);
    if (otelFlushTimer.unref) otelFlushTimer.unref();
}
export function emitOtelLog(level, envelope) {
    if (!otelLogsEndpoint) {
        return;
    }
    const redacted = redactForLogs(envelope);
    const bodyText = typeof redacted === "string" ? redacted : JSON.stringify(redacted);
    const nowNanos = `${Date.now()}000000`;
    otelLogBuffer.push({
        timeUnixNano: nowNanos,
        severityNumber: OTEL_SEVERITY_NUMBER[level],
        severityText: level.toUpperCase(),
        body: { stringValue: bodyText },
    });
    if (otelLogBuffer.length >= OTEL_FLUSH_THRESHOLD) {
        flushOtelLogBuffer();
    } else {
        scheduleOtelFlush();
    }
}
//# sourceMappingURL=logging-otel.js.map