import { createHash } from "node:crypto";
const DEFAULT_SMITHERY_API_BASE_URL = "https://api.smithery.ai";
export function asObject(value) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        return value;
    }
    return {};
}
export function asString(value) {
    if (typeof value !== "string") {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}
export function asBoolean(value) {
    return typeof value === "boolean" ? value : undefined;
}
export function asNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    return undefined;
}
export function normalizeApiBaseUrl(raw) {
    const fallback = raw?.trim() ? raw.trim() : DEFAULT_SMITHERY_API_BASE_URL;
    const parsed = new URL(fallback);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        throw new Error(`Smithery API base URL must be http/https: ${fallback}`);
    }
    const path = parsed.pathname.replace(/\/+$/, "");
    parsed.pathname = path.length > 0 ? path : "/";
    return parsed.toString();
}
export function buildRequestHeaders(apiKey) {
    const headers = {
        accept: "application/json",
    };
    const token = asString(apiKey);
    if (token) {
        headers.authorization = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
    }
    return headers;
}
function normalizeQualifiedNameCandidate(raw) {
    const trimmed = raw.trim();
    if (!trimmed) {
        return trimmed;
    }
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
        try {
            const parsed = new URL(trimmed);
            const marker = "/servers/";
            const index = parsed.pathname.indexOf(marker);
            if (index >= 0) {
                const extracted = decodeURIComponent(parsed.pathname.slice(index + marker.length));
                return extracted.trim();
            }
        }
        catch {
            return trimmed;
        }
    }
    return decodeURIComponent(trimmed);
}
export function candidateQualifiedNames(rawQualifiedName) {
    const normalized = normalizeQualifiedNameCandidate(rawQualifiedName);
    if (!normalized) {
        return [];
    }
    const candidates = new Set([normalized]);
    if (!normalized.startsWith("@")) {
        candidates.add(`@${normalized}`);
    }
    if (normalized.startsWith("@")) {
        candidates.add(normalized.slice(1));
    }
    return [...candidates].filter((entry) => entry.trim().length > 0);
}
export function toSmitheryDownstreamAppId(qualifiedName) {
    const normalized = normalizeQualifiedNameCandidate(qualifiedName).toLowerCase().replace(/^@/, "");
    const slug = normalized
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+/, "")
        .replace(/-+$/, "");
    const digest = createHash("sha1").update(normalized || qualifiedName).digest("hex").slice(0, 8);
    const base = slug.length > 0 ? slug.slice(0, 42) : "server";
    return `smithery-${base}-${digest}`;
}
export function resolveSmitheryDeploymentUrl(server) {
    const candidates = [
        ...(Array.isArray(server.connections) ? server.connections : []),
    ];
    for (const connection of candidates) {
        if (!connection || typeof connection !== "object") {
            continue;
        }
        const type = asString(connection.type)?.toLowerCase();
        const url = asString(connection.deploymentUrl);
        if (type === "http" && url) {
            return url;
        }
    }
    return asString(server.deploymentUrl);
}
//# sourceMappingURL=smithery-utils.js.map