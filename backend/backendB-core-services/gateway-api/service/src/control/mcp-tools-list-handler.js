import { mcpMarketplaceEnabled } from "../config.js";
import { errorMessage, jsonRpcErrorPayload } from "../helpers.js";
import { listToolsFromDownstreamCached } from "./downstream-resolution.js";
import { buildMarketplaceCatalog, buildMarketplaceCatalogForAppIds, listEnabledDownstreamAppIds, } from "./marketplace-catalog.js";
import { getMarketplaceControlTools } from "./marketplace-tools.js";
function applyToolAllowlist(app, tools) {
    const allowlist = app.toolAllowlist;
    if (!allowlist || allowlist.length === 0) {
        return tools;
    }
    return tools.filter((tool) => {
        const name = typeof tool.name === "string" ? tool.name : "";
        return Boolean(name && allowlist.includes(name));
    });
}
export async function handleMcpToolsListMethod(options) {
    const controlTools = getMarketplaceControlTools(mcpMarketplaceEnabled).map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        _meta: {
            mapleLocalControlTool: true,
        },
    }));
    try {
        if (!options.target) {
            if (options.routeLockTargetOverrideDenied) {
                return options.proxyTargetErrorResponse();
            }
            if (mcpMarketplaceEnabled) {
                const enabledAppIds = listEnabledDownstreamAppIds();
                if (enabledAppIds.length > 0) {
                    const catalog = await buildMarketplaceCatalogForAppIds(enabledAppIds);
                    const multipleApps = new Set(catalog.appIds).size > 1;
                    const tools = catalog.tools
                        .sort((a, b) => a.qualifiedName.localeCompare(b.qualifiedName))
                        .map((tool) => {
                        const name = multipleApps ? tool.qualifiedName : tool.toolName;
                        const baseDescription = tool.description ?? `Tool from ${tool.appName}`;
                        const description = multipleApps ? `[${tool.appId}] ${baseDescription}` : baseDescription;
                        return {
                            name,
                            ...(description ? { description } : {}),
                            ...(tool.inputSchema !== undefined ? { inputSchema: tool.inputSchema } : {}),
                            ...(tool.annotations ? { annotations: tool.annotations } : {}),
                            _meta: {
                                mapleProxyAppId: tool.appId,
                                mapleProxyToolName: tool.toolName,
                                mapleQualifiedName: tool.qualifiedName,
                            },
                        };
                    });
                    const combinedTools = [...tools, ...controlTools];
                    return options.c.json({
                        jsonrpc: "2.0",
                        id: options.id,
                        result: {
                            tools: combinedTools,
                            mapleMarketplace: {
                                enabled: true,
                                appCount: catalog.appIds.length,
                                warnings: catalog.warnings,
                                controlTools: controlTools.length,
                            },
                        },
                    }, 200);
                }
            }
            if (controlTools.length === 0) {
                return undefined;
            }
            return options.c.json({
                jsonrpc: "2.0",
                id: options.id,
                result: {
                    tools: controlTools,
                    mapleMarketplace: {
                        enabled: mcpMarketplaceEnabled,
                        appCount: 0,
                        warnings: [
                            {
                                appId: "none",
                                message: "No downstream app is connected yet. Auto-connect is enabled; call maple_autoroute_call or call a downstream tool name directly and Maple will attempt to resolve/connect automatically.",
                            },
                        ],
                    },
                },
            }, 200);
        }
        if (mcpMarketplaceEnabled && options.target.mode === "configured") {
            const catalog = await buildMarketplaceCatalog(options.target);
            if (catalog.tools.length === 0 && catalog.warnings.length > 0 && controlTools.length === 0) {
                return options.c.json(jsonRpcErrorPayload(options.id, -32002, "Marketplace tools/list failed.", {
                    warnings: catalog.warnings,
                }), 502);
            }
            const multipleApps = new Set(catalog.appIds).size > 1;
            const tools = catalog.tools
                .sort((a, b) => a.qualifiedName.localeCompare(b.qualifiedName))
                .map((tool) => {
                const name = multipleApps ? tool.qualifiedName : tool.toolName;
                const baseDescription = tool.description ?? `Tool from ${tool.appName}`;
                const description = multipleApps ? `[${tool.appId}] ${baseDescription}` : baseDescription;
                return {
                    name,
                    ...(description ? { description } : {}),
                    ...(tool.inputSchema !== undefined ? { inputSchema: tool.inputSchema } : {}),
                    ...(tool.annotations ? { annotations: tool.annotations } : {}),
                    _meta: {
                        mapleProxyAppId: tool.appId,
                        mapleProxyToolName: tool.toolName,
                        mapleQualifiedName: tool.qualifiedName,
                    },
                };
            });
            const combinedTools = [...tools, ...controlTools];
            return options.c.json({
                jsonrpc: "2.0",
                id: options.id,
                result: {
                    tools: combinedTools,
                    mapleMarketplace: {
                        enabled: true,
                        appCount: catalog.appIds.length,
                        warnings: catalog.warnings,
                        controlTools: controlTools.length,
                    },
                },
            }, 200);
        }
        const listed = await listToolsFromDownstreamCached(options.target.app);
        const toolsRaw = listed.tools.map((tool) => ({
            name: tool.name,
            ...(tool.description ? { description: tool.description } : {}),
            ...(tool.inputSchema !== undefined ? { inputSchema: tool.inputSchema } : {}),
            ...(tool.annotations ? { annotations: tool.annotations } : {}),
        }));
        const tools = [...applyToolAllowlist(options.target.app, toolsRaw), ...controlTools];
        return options.c.json({
            jsonrpc: "2.0",
            id: options.id,
            result: {
                tools,
            },
        }, 200);
    }
    catch (listError) {
        return options.c.json(jsonRpcErrorPayload(options.id, -32002, "Downstream tools/list failed.", {
            detail: errorMessage(listError),
            appId: options.target?.app.id,
        }), 502);
    }
}
//# sourceMappingURL=mcp-tools-list-handler.js.map