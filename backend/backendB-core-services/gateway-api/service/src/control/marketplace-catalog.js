import { downstreamAppRegistry, mcpExecutionOrderAppIds, mcpFirewallDefaultAppId, mcpRouteLockEnabled, } from "../config.js";
import { errorMessage } from "../helpers.js";
import { listToolsFromDownstreamCached, resolveAutoConfiguredAppId, resolveDownstreamApp, } from "./downstream-resolution.js";
function namespaceMarketplaceToolName(appId, toolName) {
    return `${appId}::${toolName}`;
}
export function filterAllowedDownstreamTools(app, tools) {
    const allowlist = app.toolAllowlist;
    if (!allowlist || allowlist.length === 0) {
        return tools;
    }
    return tools.filter((tool) => allowlist.includes(tool.name));
}
export function resolveMarketplaceAppIds(target) {
    if (target.mode === "dynamic") {
        return [target.app.id];
    }
    if (mcpExecutionOrderAppIds.length > 0) {
        return [...new Set(mcpExecutionOrderAppIds)];
    }
    if (mcpFirewallDefaultAppId) {
        return [mcpFirewallDefaultAppId];
    }
    const auto = resolveAutoConfiguredAppId();
    if (auto) {
        return [auto];
    }
    if (!mcpRouteLockEnabled) {
        const enabled = [...downstreamAppRegistry.values()]
            .filter((app) => app.enabled)
            .map((app) => app.id);
        if (enabled.length > 0) {
            return enabled;
        }
    }
    return [target.app.id];
}
export async function buildMarketplaceCatalog(target) {
    const appIds = resolveMarketplaceAppIds(target);
    return buildMarketplaceCatalogForAppIds(appIds);
}
export function listEnabledDownstreamAppIds() {
    return [...downstreamAppRegistry.values()]
        .filter((app) => app.enabled)
        .map((app) => app.id);
}
export async function buildMarketplaceCatalogForAppIds(appIds) {
    const uniqueAppIds = [...new Set(appIds)];
    const warnings = [];
    const tools = [];
    const results = await Promise.all(uniqueAppIds.map(async (appId) => {
        try {
            const app = resolveDownstreamApp(appId);
            const listed = await listToolsFromDownstreamCached(app);
            return {
                appId,
                app,
                tools: filterAllowedDownstreamTools(app, listed.tools),
                error: undefined,
            };
        }
        catch (error) {
            return {
                appId,
                app: undefined,
                tools: [],
                error: errorMessage(error),
            };
        }
    }));
    for (const result of results) {
        if (!result.app) {
            warnings.push({
                appId: result.appId,
                message: result.error ?? "Unknown marketplace listing error.",
            });
            continue;
        }
        for (const tool of result.tools) {
            tools.push({
                appId: result.app.id,
                appName: result.app.name,
                toolName: tool.name,
                qualifiedName: namespaceMarketplaceToolName(result.app.id, tool.name),
                description: tool.description,
                inputSchema: tool.inputSchema,
                ...(tool.annotations ? { annotations: tool.annotations } : {}),
            });
        }
    }
    return {
        appIds: uniqueAppIds,
        tools,
        warnings,
    };
}
//# sourceMappingURL=marketplace-catalog.js.map