import { isIP } from "node:net";
export function asString(value) {
    if (typeof value !== "string")
        return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}
export function envValue(value) {
    const normalized = asString(value);
    if (!normalized)
        return undefined;
    if (normalized.length >= 2) {
        const first = normalized[0];
        const last = normalized[normalized.length - 1];
        if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
            const unwrapped = normalized.slice(1, -1).trim();
            return unwrapped.length > 0 ? unwrapped : undefined;
        }
    }
    return normalized;
}
export function parseAppIdList(value) {
    const rawEntries = [];
    if (typeof value === "string") {
        rawEntries.push(...value.split(","));
    }
    else if (Array.isArray(value)) {
        for (const entry of value) {
            if (typeof entry === "string")
                rawEntries.push(entry);
        }
    }
    const unique = new Set();
    for (const entry of rawEntries) {
        const normalized = entry.trim();
        if (normalized.length > 0)
            unique.add(normalized);
    }
    return [...unique];
}
export function asNumber(value) {
    if (typeof value === "number" && Number.isFinite(value))
        return value;
    if (typeof value === "string") {
        const parsed = Number(value);
        if (Number.isFinite(parsed))
            return parsed;
    }
    return undefined;
}
export function asBoolean(value, fallback) {
    return typeof value === "boolean" ? value : fallback;
}
export function asObject(value) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        return value;
    }
    return {};
}
export function asStringArray(value) {
    if (!Array.isArray(value))
        return [];
    return value
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter((entry) => entry.length > 0);
}
export function asStringRecord(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return {};
    const record = {};
    for (const [key, raw] of Object.entries(value)) {
        if (typeof raw !== "string")
            continue;
        const normalizedKey = key.trim();
        const normalizedValue = raw.trim();
        if (!normalizedKey || !normalizedValue)
            continue;
        record[normalizedKey] = normalizedValue;
    }
    return record;
}
export function dedupeBy(items, key) {
    const seen = new Set();
    const out = [];
    for (const item of items) {
        const normalized = key(item);
        if (!normalized || seen.has(normalized))
            continue;
        seen.add(normalized);
        out.push(item);
    }
    return out;
}
export function errorMessage(error) {
    return error instanceof Error ? error.message : String(error ?? "Unknown error");
}
export function jsonRpcErrorPayload(id, code, message, data) {
    return {
        jsonrpc: "2.0",
        id: id ?? null,
        error: { code, message, ...(data ? { data } : {}) },
    };
}
export function isPrivateOrLocalHost(hostname) {
    const lower = hostname.trim().toLowerCase();
    if (!lower)
        return true;
    if (lower === "localhost" || lower.endsWith(".local"))
        return true;
    const family = isIP(lower);
    if (family === 4) {
        const parts = lower.split(".").map((part) => Number(part));
        if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255))
            return true;
        const [a, b] = parts;
        if (a === 10 || a === 127 || a === 0)
            return true;
        if (a === 169 && b === 254)
            return true;
        if (a === 172 && b >= 16 && b <= 31)
            return true;
        if (a === 192 && b === 168)
            return true;
        if (a >= 224)
            return true;
    }
    if (family === 6) {
        if (lower === "::1" || lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd"))
            return true;
    }
    return false;
}
export function truncateText(value, maxLength = 2400) {
    if (value.length <= maxLength)
        return value;
    return `${value.slice(0, maxLength - 3)}...`;
}
export function compactUnknown(value, maxChars = 24_000) {
    try {
        const json = JSON.stringify(value);
        if (!json)
            return value;
        if (json.length <= maxChars)
            return value;
        return {
            truncated: true,
            preview: `${json.slice(0, maxChars - 3)}...`,
            originalBytes: Buffer.byteLength(json, "utf8"),
        };
    }
    catch {
        const fallback = String(value ?? "");
        return { truncated: true, preview: truncateText(fallback, Math.min(maxChars, 3000)) };
    }
}
export function summarizeJsonRpcPayload(payload, maxLength = 2400) {
    try {
        const json = JSON.stringify(payload);
        if (!json)
            return "";
        return truncateText(json, maxLength);
    }
    catch {
        return truncateText(String(payload ?? ""), maxLength);
    }
}
export function extractFirstUrl(value) {
    const match = value.match(/https?:\/\/[^\s)]+/i);
    return match ? match[0] : undefined;
}
export function extractLikelyCommand(value) {
    const trimmed = value.trim();
    if (!trimmed)
        return undefined;
    const fenced = trimmed.match(/```(?:bash|sh|zsh|shell)?\n([\s\S]*?)```/i);
    if (fenced && fenced[1]) {
        const line = fenced[1].split(/\r?\n/).map((e) => e.trim()).find((e) => e.length > 0);
        if (line)
            return line;
    }
    return trimmed
        .split(/\r?\n/)
        .map((e) => e.trim())
        .find((e) => /^(curl|wget|bash|zsh|sh|python|node|npm|pnpm|yarn|pip|git|rm|chmod|scp|ssh)\b/i.test(e));
}
export function toFiniteNumber(value, fallback = 0) {
    const parsed = asNumber(value);
    return Number.isFinite(parsed) ? Number(parsed) : fallback;
}
export function sanitizeSessionId(value) {
    const normalized = value.replace(/[^a-zA-Z0-9._:-]/g, "-").replace(/-+/g, "-").slice(0, 96);
    return normalized.length > 0 ? normalized : `fork-${Date.now().toString(36)}`;
}
export function unauthorizedBody(reason) {
    return {
        error: "Unauthorized",
        reason,
        hint: "Provide x-api-key / Authorization bearer token or sign in via /landing.",
    };
}
export async function readJsonBody(c) {
    try {
        return asObject(await c.req.json());
    }
    catch {
        return {};
    }
}
export async function withAbortTimeout(timeoutMs, run) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await run(controller.signal);
    }
    finally {
        clearTimeout(timeout);
    }
}
export function buildUrlWithQueryParams(baseUrl, params) {
    const parsed = new URL(baseUrl);
    for (const [key, value] of Object.entries(params)) {
        const normalizedKey = key.trim();
        const normalizedValue = value.trim();
        if (!normalizedKey || !normalizedValue)
            continue;
        parsed.searchParams.set(normalizedKey, normalizedValue);
    }
    return parsed.toString();
}
//# sourceMappingURL=helpers.js.map