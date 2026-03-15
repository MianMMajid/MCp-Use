const DEFAULT_MCPSO_BASE_URL = "https://mcp.so";
export function asString(value) {
    if (typeof value !== "string") {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}
export function asNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    return undefined;
}
export function asBoolean(value) {
    return typeof value === "boolean" ? value : undefined;
}
export function asObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return {};
    }
    return value;
}
export function normalizeBaseUrl(raw) {
    const fallback = raw?.trim() ? raw.trim() : DEFAULT_MCPSO_BASE_URL;
    const parsed = new URL(fallback);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        throw new Error(`MCP.so base URL must be http/https: ${fallback}`);
    }
    parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    return parsed.toString();
}
export function normalizeSlug(name, authorName) {
    const n = asString(name);
    const a = asString(authorName);
    if (n && a) {
        return `${n}/${a}`;
    }
    return n ?? "";
}
export function parseSlugInput(input) {
    const value = asString(input);
    if (!value) {
        return {};
    }
    if (value.startsWith("http://") || value.startsWith("https://")) {
        return {
            serverUrl: value,
        };
    }
    const normalized = value.replace(/^\/+/, "").replace(/^server\//, "");
    const parts = normalized.split("/").map((entry) => entry.trim()).filter(Boolean);
    if (parts.length >= 2) {
        return { name: parts[0], authorName: parts[1] };
    }
    if (parts.length === 1) {
        return { name: parts[0] };
    }
    return {};
}
//# sourceMappingURL=mcpso-primitives.js.map