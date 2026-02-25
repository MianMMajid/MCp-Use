import { downstreamAppRegistry } from "../config.js";
import { listEnabledDownstreamAppIds, filterAllowedDownstreamTools, } from "./marketplace-catalog.js";
import { normalizeMarketplaceId, } from "./marketplace-provider.js";
import { listToolsFromDownstreamCached, resolveDownstreamApp, } from "./downstream-resolution.js";
import { namespaceMarketplaceToolName } from "./marketplace-tools.js";
import { errorMessage } from "../helpers.js";
export async function findConnectedToolMatches(toolName, appIds) {
    const normalizedTool = toolName.trim();
    if (!normalizedTool) {
        return [];
    }
    const candidates = [...new Set(appIds && appIds.length > 0 ? appIds : listEnabledDownstreamAppIds())];
    const matches = [];
    const results = await Promise.all(candidates.map(async (appId) => {
        try {
            const app = resolveDownstreamApp(appId);
            const listed = await listToolsFromDownstreamCached(app);
            const allowedTools = filterAllowedDownstreamTools(app, listed.tools);
            const exact = allowedTools.find((tool) => tool.name === normalizedTool);
            if (!exact) {
                return undefined;
            }
            return {
                appId: app.id,
                appName: app.name,
                toolName: exact.name,
                qualifiedName: namespaceMarketplaceToolName(app.id, exact.name),
            };
        }
        catch {
            return undefined;
        }
    }));
    for (const result of results) {
        if (!result) {
            continue;
        }
        matches.push({
            ...result,
            source: "connected",
        });
    }
    return matches;
}
export async function autoConnectAndResolveToolMatch(options) {
    const entries = await options.searchMarketplaceServers({
        provider: options.provider,
        query: options.searchQuery,
        limit: options.searchLimit,
    });
    const prioritizedEntries = [...entries].sort((a, b) => {
        const rank = (entry) => {
            if (entry.connectable === true) {
                return 2;
            }
            if (entry.connectable === false) {
                return 0;
            }
            return 1;
        };
        return rank(b) - rank(a);
    });
    const attempted = [];
    const warnings = [];
    for (const entry of prioritizedEntries) {
        const normalizedId = normalizeMarketplaceId(entry.provider, entry.id);
        const appId = entry.appIdSuggestion;
        attempted.push(`${entry.provider}:${entry.id}`);
        if (entry.connectable === false) {
            warnings.push(`${entry.provider}:${entry.id}: skipped because no request/response HTTP MCP endpoint was advertised`);
            continue;
        }
        if (!downstreamAppRegistry.has(appId)) {
            try {
                await options.registerMarketplaceDownstream({
                    provider: entry.provider,
                    id: normalizedId,
                    appId,
                    overwrite: false,
                    restrictToCatalogTools: true,
                    resolvedTitle: entry.title,
                    resolvedDescription: entry.description,
                    resolvedSourceUrl: entry.sourceUrl,
                    resolvedMcpUrl: entry.resolvedMcpUrl,
                });
            }
            catch (connectError) {
                warnings.push(`${entry.provider}:${entry.id}: ${errorMessage(connectError)}`);
                continue;
            }
        }
        const matches = await findConnectedToolMatches(options.toolName, [appId]);
        if (matches.length > 0) {
            return {
                match: {
                    ...matches[0],
                    source: "auto_connected",
                },
                entries: prioritizedEntries,
                attempted,
                warnings,
            };
        }
    }
    return {
        entries: prioritizedEntries,
        attempted,
        warnings,
    };
}
//# sourceMappingURL=marketplace-autoroute.js.map