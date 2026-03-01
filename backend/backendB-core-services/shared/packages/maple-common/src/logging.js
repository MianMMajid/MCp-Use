import { AsyncLocalStorage } from "node:async_hooks";
const MAPLE_LOG_LEVEL_ORDER = {
    error: 0, warn: 1, info: 2, debug: 3, trace: 4,
};
if (!process.env.MAPLE_LOG_LEVEL) {
    throw new Error("Missing required environment variable: MAPLE_LOG_LEVEL");
}
const mapleLogLevelRaw = process.env.MAPLE_LOG_LEVEL.trim().toLowerCase();
if (!(mapleLogLevelRaw in MAPLE_LOG_LEVEL_ORDER)) {
    throw new Error(`Invalid MAPLE_LOG_LEVEL: "${mapleLogLevelRaw}" (must be error/warn/info/debug/trace)`);
}
export const mapleLogLevel = mapleLogLevelRaw;
if (!process.env.MAPLE_LOG_INCLUDE_BODIES) {
    throw new Error("Missing required environment variable: MAPLE_LOG_INCLUDE_BODIES");
}
export const mapleLogIncludeBodies = process.env.MAPLE_LOG_INCLUDE_BODIES.trim().toLowerCase() === "true" ||
    process.env.MAPLE_LOG_INCLUDE_BODIES.trim().toLowerCase() === "1";
if (!process.env.MAPLE_LOG_REQUESTS) {
    throw new Error("Missing required environment variable: MAPLE_LOG_REQUESTS");
}
export const mapleLogRequestsEnabled = process.env.MAPLE_LOG_REQUESTS.trim().toLowerCase() !== "false" &&
    process.env.MAPLE_LOG_REQUESTS.trim().toLowerCase() !== "0";
if (!process.env.MAPLE_LOG_BODY_MAX_CHARS) {
    throw new Error("Missing required environment variable: MAPLE_LOG_BODY_MAX_CHARS");
}
const mapleLogBodyMaxCharsRaw = Number.parseInt(process.env.MAPLE_LOG_BODY_MAX_CHARS.trim(), 10);
if (!Number.isFinite(mapleLogBodyMaxCharsRaw) || mapleLogBodyMaxCharsRaw < 256 || mapleLogBodyMaxCharsRaw > 40000) {
    throw new Error(`Invalid MAPLE_LOG_BODY_MAX_CHARS: must be 256-40000`);
}
export const mapleLogBodyMaxChars = mapleLogBodyMaxCharsRaw;
export const requestContextStorage = new AsyncLocalStorage();
function normalizeOtelLogsEndpoint(raw) {
    const trimmed = raw.trim();
    if (!trimmed)
        return "";
    if (trimmed.endsWith("/v1/logs"))
        return trimmed;
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