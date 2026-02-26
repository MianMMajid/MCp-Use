import { mapleLogBodyMaxChars } from "./logging-config.js";
function isSensitiveKeyName(key) {
    const lower = key.toLowerCase();
    return (lower.includes("password") ||
        lower.includes("secret") ||
        lower.includes("token") ||
        lower.includes("api_key") ||
        lower === "apikey" ||
        lower.includes("authorization") ||
        lower.includes("cookie"));
}
export function redactForLogs(value, depth = 0) {
    if (depth > 5) {
        return "[truncated-depth]";
    }
    if (value === null || value === undefined) {
        return value;
    }
    if (typeof value === "string") {
        if (value.length <= mapleLogBodyMaxChars) {
            return value;
        }
        return `${value.slice(0, mapleLogBodyMaxChars)}...<truncated>`;
    }
    if (typeof value === "number" || typeof value === "boolean") {
        return value;
    }
    if (Array.isArray(value)) {
        if (value.length > 100) {
            const sliced = value.slice(0, 100).map((entry) => redactForLogs(entry, depth + 1));
            sliced.push(`...<truncated ${value.length - 100} items>`);
            return sliced;
        }
        return value.map((entry) => redactForLogs(entry, depth + 1));
    }
    if (typeof value === "object") {
        const record = value;
        const out = {};
        for (const [key, entry] of Object.entries(record)) {
            if (isSensitiveKeyName(key)) {
                out[key] = "[redacted]";
                continue;
            }
            out[key] = redactForLogs(entry, depth + 1);
        }
        return out;
    }
    return String(value);
}
export function stringifyLogPayload(payload) {
    try {
        const redacted = redactForLogs(payload);
        return JSON.stringify(redacted);
    }
    catch {
        return '{"serialization":"failed"}';
    }
}
//# sourceMappingURL=logging-redaction.js.map