import { isIP } from "node:net";
export function isPrivateOrLocalHost(hostname) {
    const lower = hostname.trim().toLowerCase();
    if (!lower) {
        return true;
    }
    if (lower === "localhost" || lower.endsWith(".local")) {
        return true;
    }
    const family = isIP(lower);
    if (family === 4) {
        const parts = lower.split(".").map((part) => Number(part));
        if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
            return true;
        }
        const [a, b] = parts;
        if (a === 10 || a === 127 || a === 0) {
            return true;
        }
        if (a === 169 && b === 254) {
            return true;
        }
        if (a === 172 && b >= 16 && b <= 31) {
            return true;
        }
        if (a === 192 && b === 168) {
            return true;
        }
        if (a >= 224) {
            return true;
        }
    }
    if (family === 6) {
        if (lower === "::1" || lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) {
            return true;
        }
    }
    return false;
}
export function extractFirstUrl(value) {
    const match = value.match(/https?:\/\/[^\s)]+/i);
    return match ? match[0] : undefined;
}
export function buildUrlWithQueryParams(baseUrl, params) {
    const parsed = new URL(baseUrl);
    for (const [key, value] of Object.entries(params)) {
        const normalizedKey = key.trim();
        const normalizedValue = value.trim();
        if (!normalizedKey || !normalizedValue) {
            continue;
        }
        parsed.searchParams.set(normalizedKey, normalizedValue);
    }
    return parsed.toString();
}
//# sourceMappingURL=helpers-network.js.map