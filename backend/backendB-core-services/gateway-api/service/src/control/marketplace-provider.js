import { asString } from "../helpers.js";
export function parseMarketplaceProvider(value) {
    const normalized = asString(value)?.toLowerCase();
    if (!normalized) {
        return undefined;
    }
    if (normalized === "all") {
        return "all";
    }
    if (normalized === "smithery" || normalized === "mcpso") {
        return normalized;
    }
    return undefined;
}
export function parseMcpSoSlug(value) {
    const normalized = value.trim();
    if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
        return {
            serverUrl: normalized,
        };
    }
    return {
        slug: normalized.replace(/^\/+/, "").replace(/^server\//, ""),
    };
}
export function normalizeMarketplaceId(provider, rawId) {
    const trimmed = rawId.trim();
    if (provider === "smithery") {
        return trimmed;
    }
    const mcpSoParsed = parseMcpSoSlug(trimmed);
    if (mcpSoParsed.serverUrl) {
        try {
            const parsed = new URL(mcpSoParsed.serverUrl);
            if (parsed.pathname.startsWith("/server/")) {
                return parsed.pathname.replace(/^\/server\//, "").replace(/\/+$/, "");
            }
        }
        catch {
            return trimmed;
        }
    }
    return mcpSoParsed.slug ?? trimmed;
}
export function isSmitheryDownstreamApp(app) {
    return app.id.startsWith("smithery-") || app.description?.startsWith("[smithery] ") === true;
}
export function isMcpSoDownstreamApp(app) {
    return app.id.startsWith("mcpso-") || app.description?.startsWith("[mcpso] ") === true;
}
export function classifyMarketplaceProviderForApp(app) {
    if (isSmitheryDownstreamApp(app)) {
        return "smithery";
    }
    if (isMcpSoDownstreamApp(app)) {
        return "mcpso";
    }
    return undefined;
}
//# sourceMappingURL=marketplace-provider.js.map