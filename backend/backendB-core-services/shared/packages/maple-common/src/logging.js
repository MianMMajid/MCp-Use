import { AsyncLocalStorage } from "node:async_hooks";
const MAPLE_LOG_LEVEL_ORDER = {
    error: 0, warn: 1, info: 2, debug: 3, trace: 4,
};
const mapleLogLevelRaw = String(process.env.MAPLE_LOG_LEVEL ?? "info").trim().toLowerCase();
export const mapleLogLevel = mapleLogLevelRaw === "error" || mapleLogLevelRaw === "warn" || mapleLogLevelRaw === "info" ||
    mapleLogLevelRaw === "debug" || mapleLogLevelRaw === "trace"
    ? mapleLogLevelRaw : "info";
export const mapleLogIncludeBodies = String(process.env.MAPLE_LOG_INCLUDE_BODIES ?? "0").trim().toLowerCase() === "true" ||
    String(process.env.MAPLE_LOG_INCLUDE_BODIES ?? "0").trim().toLowerCase() === "1";
export const mapleLogRequestsEnabled = String(process.env.MAPLE_LOG_REQUESTS ?? "1").trim().toLowerCase() !== "false" &&
    String(process.env.MAPLE_LOG_REQUESTS ?? "1").trim().toLowerCase() !== "0";
const mapleLogBodyMaxCharsRaw = Number.parseInt(String(process.env.MAPLE_LOG_BODY_MAX_CHARS ?? "4000"), 10);
export const mapleLogBodyMaxChars = Number.isFinite(mapleLogBodyMaxCharsRaw)
    ? Math.max(256, Math.min(40_000, mapleLogBodyMaxCharsRaw)) : 4000;
export const requestContextStorage = new AsyncLocalStorage();
function normalizeOtelLogsEndpoint(raw) {
    const trimmed = raw.trim();
    if (!trimmed)
        return "";
    if (trimmed.endsWith("/v1/logs"))
        return trimmed;
    return `${trimmed.replace(/\/$/, "")}/v1/logs`;
}
const otelLogsEndpoint = normalizeOtelLogsEndpoint(String(process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT ?? process.env.MAPLE_OTEL_LOGS_ENDPOINT ?? "").trim());
const otelServiceName = String(process.env.OTEL_SERVICE_NAME ?? process.env.MAPLE_SERVICE_NAME ?? "maple-service").trim();
const OTEL_SEVERITY_NUMBER = {
    error: 17,
    warn: 13,
    info: 9,
    debug: 5,
    trace: 1,
};
export function shouldLogLevel(level) {
    return MAPLE_LOG_LEVEL_ORDER[level] <= MAPLE_LOG_LEVEL_ORDER[mapleLogLevel];
}
export function currentRequestContext() {
    return requestContextStorage.getStore();
}
function isSensitiveKeyName(key) {
    const lower = key.toLowerCase();
    return lower.includes("password") || lower.includes("secret") || lower.includes("token") ||
        lower.includes("api_key") || lower === "apikey" || lower.includes("authorization") || lower.includes("cookie");
}
export function redactForLogs(value, depth = 0) {
    if (depth > 5)
        return "[truncated-depth]";
    if (value === null || value === undefined)
        return value;
    if (typeof value === "string") {
        return value.length <= mapleLogBodyMaxChars ? value : `${value.slice(0, mapleLogBodyMaxChars)}...<truncated>`;
    }
    if (typeof value === "number" || typeof value === "boolean")
        return value;
    if (Array.isArray(value)) {
        if (value.length > 100) {
            const sliced = value.slice(0, 100).map((e) => redactForLogs(e, depth + 1));
            sliced.push(`...<truncated ${value.length - 100} items>`);
            return sliced;
        }
        return value.map((e) => redactForLogs(e, depth + 1));
    }
    if (typeof value === "object") {
        const record = value;
        const out = {};
        for (const [key, entry] of Object.entries(record)) {
            out[key] = isSensitiveKeyName(key) ? "[redacted]" : redactForLogs(entry, depth + 1);
        }
        return out;
    }
    return String(value);
}
function stringifyLogPayload(payload) {
    try {
        return JSON.stringify(redactForLogs(payload));
    }
    catch {
        return '{"serialization":"failed"}';
    }
}
function emitOtelLog(level, envelope) {
    if (!otelLogsEndpoint)
        return;
    const redacted = redactForLogs(envelope);
    const bodyText = typeof redacted === "string" ? redacted : JSON.stringify(redacted);
    const nowNanos = `${Date.now()}000000`;
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
                        scope: { name: "maple-common" },
                        logRecords: [
                            {
                                timeUnixNano: nowNanos,
                                severityNumber: OTEL_SEVERITY_NUMBER[level],
                                severityText: level.toUpperCase(),
                                body: { stringValue: bodyText },
                            },
                        ],
                    },
                ],
            },
        ],
    };
    fetch(otelLogsEndpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
    }).catch(() => {
        // fire-and-forget
    });
}
export function mapleLog(level, event, payload) {
    if (!shouldLogLevel(level))
        return;
    const now = new Date().toISOString();
    const context = currentRequestContext();
    const envelope = {
        ts: now, level, event,
        ...(context ? { requestId: context.requestId, requestPath: context.path, requestMethod: context.method } : {}),
        ...(payload ?? {}),
    };
    const line = `[MAPLE] ${stringifyLogPayload(envelope)}`;
    emitOtelLog(level, envelope);
    if (level === "error") {
        console.error(line);
        return;
    }
    if (level === "warn") {
        console.warn(line);
        return;
    }
    console.log(line);
}
//# sourceMappingURL=logging.js.map