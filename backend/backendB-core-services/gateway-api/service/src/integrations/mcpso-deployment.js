import { createHash } from "node:crypto";
import { asObject, asString, } from "./mcpso-primitives.js";
export function normalizeMcpSoUrlCandidate(raw) {
    const trimmed = asString(raw ?? undefined);
    if (!trimmed) {
        return undefined;
    }
    try {
        const parsed = new URL(trimmed);
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
            return undefined;
        }
        return parsed.toString();
    }
    catch {
        return undefined;
    }
}
function looksLikeSseEndpoint(url) {
    try {
        const parsed = new URL(url);
        if (/(^|\/)sse(\/|$)/i.test(parsed.pathname)) {
            return true;
        }
        const transport = parsed.searchParams.get("transport");
        if (transport && transport.trim().toLowerCase() === "sse") {
            return true;
        }
        return false;
    }
    catch {
        return /(^|\/)sse(\/|$)/i.test(url);
    }
}
export function toMcpSoDownstreamAppId(slug) {
    const normalized = slug
        .toLowerCase()
        .replace(/^https?:\/\/mcp\.so\/server\//, "")
        .replace(/^\/+/, "")
        .replace(/\/+$/, "");
    const compact = normalized
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+/, "")
        .replace(/-+$/, "");
    const digest = createHash("sha1").update(normalized || slug).digest("hex").slice(0, 8);
    const base = compact.length > 0 ? compact.slice(0, 42) : "server";
    return `mcpso-${base}-${digest}`;
}
export function resolveMcpSoDeploymentUrl(server) {
    const candidates = [];
    const explicitSse = normalizeMcpSoUrlCandidate(server.sse_url);
    if (explicitSse) {
        candidates.push(explicitSse);
    }
    const config = asString(server.server_config);
    if (config) {
        try {
            const parsed = JSON.parse(config);
            const mcpServers = asObject(parsed.mcpServers);
            for (const value of Object.values(mcpServers)) {
                const item = asObject(value);
                const directUrl = asString(item.url);
                if (directUrl) {
                    candidates.push(directUrl);
                }
                const args = Array.isArray(item.args) ? item.args : [];
                for (const arg of args) {
                    const entry = asString(arg);
                    if (!entry) {
                        continue;
                    }
                    const urlMatch = entry.match(/https?:\/\/[^\s"'`]+/i);
                    if (urlMatch?.[0]) {
                        candidates.push(urlMatch[0]);
                    }
                }
            }
        }
        catch {
            const urlMatch = config.match(/https?:\/\/[^\s"'`]+/i);
            if (urlMatch?.[0]) {
                candidates.push(urlMatch[0]);
            }
        }
    }
    const command = asString(server.server_command);
    if (command) {
        const urlMatch = command.match(/https?:\/\/[^\s"'`]+/i);
        if (urlMatch?.[0]) {
            candidates.push(urlMatch[0]);
        }
    }
    const homepage = asString(server.url);
    if (homepage && /(\/mcp|\/sse)\b/i.test(homepage)) {
        candidates.push(homepage);
    }
    const seen = new Set();
    for (const candidate of candidates) {
        const normalized = normalizeMcpSoUrlCandidate(candidate);
        if (!normalized || seen.has(normalized)) {
            continue;
        }
        seen.add(normalized);
        if (!looksLikeSseEndpoint(normalized)) {
            return normalized;
        }
    }
    return undefined;
}
//# sourceMappingURL=mcpso-deployment.js.map