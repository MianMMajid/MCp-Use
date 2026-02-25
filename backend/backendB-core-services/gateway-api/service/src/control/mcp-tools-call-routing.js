import { mcpMarketplaceEnabled, mcpRouteLockEnabled } from "../config.js";
import { asString, jsonRpcErrorPayload, } from "../helpers.js";
import { listEnabledDownstreamAppIds, resolveMarketplaceAppIds } from "./marketplace-catalog.js";
import { isMapleNativeToolName, parseMarketplaceToolName, } from "./marketplace-tools.js";
import { resolveDispatchAppIds } from "./downstream-resolution.js";
import { resolveQualifiedMarketplaceTool, } from "./mcp-tools-call-routing-qualified.js";
import { resolveUnqualifiedMarketplaceTool, } from "./mcp-tools-call-routing-unqualified.js";
export async function resolveMcpToolsCallRouting(options) {
    const { request, toolName, toolArgs } = options;
    if (isMapleNativeToolName(toolName)) {
        return { kind: "native" };
    }
    if (!request.target && request.routeLockTargetOverrideDenied) {
        return { kind: "error", response: request.proxyTargetErrorResponse() };
    }
    const enabledAppIds = mcpMarketplaceEnabled ? listEnabledDownstreamAppIds() : [];
    const singleEnabledAppWhenUnresolved = !request.target && enabledAppIds.length === 1 ? enabledAppIds[0] : undefined;
    const chainHeader = asString(request.c.req.header("x-maple-chain-apps"));
    const chainQuery = asString(request.c.req.query("mapleChain"));
    const qualifiedTool = parseMarketplaceToolName(toolName);
    let normalizedToolName = toolName;
    let explicitAppIds;
    let autoConnectDiagnostics;
    if (qualifiedTool) {
        const allowedMarketplaceAppIds = request.target
            ? resolveMarketplaceAppIds(request.target)
            : enabledAppIds;
        const qualified = resolveQualifiedMarketplaceTool({
            request,
            toolName,
            qualifiedTool,
            mcpRouteLockEnabled,
            allowedMarketplaceAppIds,
        });
        if (qualified.kind === "error") {
            return qualified;
        }
        normalizedToolName = qualified.normalizedToolName;
        explicitAppIds = qualified.explicitAppIds;
    }
    else {
        const unqualified = await resolveUnqualifiedMarketplaceTool({
            request,
            toolArgs,
            normalizedToolName,
            searchMarketplaceServers: options.searchMarketplaceServers,
            registerMarketplaceDownstream: options.registerMarketplaceDownstream,
        });
        if (unqualified.kind === "error") {
            return unqualified;
        }
        normalizedToolName = unqualified.normalizedToolName;
        explicitAppIds = unqualified.explicitAppIds;
        autoConnectDiagnostics = unqualified.autoConnectDiagnostics;
    }
    try {
        const appIds = explicitAppIds ??
            resolveDispatchAppIds({
                explicitChain: chainHeader ?? chainQuery,
                fallbackAppId: request.target?.app.id ?? singleEnabledAppWhenUnresolved,
                includeDefaultExecutionOrder: request.target ? request.target.mode !== "dynamic" : false,
            });
        if (request.target?.mode === "dynamic" && appIds.length > 1) {
            return {
                kind: "error",
                response: request.c.json(jsonRpcErrorPayload(request.id, -32602, "Dynamic target mode does not support multi-app chain execution.", {
                    mode: request.target.mode,
                    appIds,
                }), 400),
            };
        }
        return {
            kind: "resolved",
            appIds,
            normalizedToolName,
            autoConnectDiagnostics,
        };
    }
    catch (dispatchResolutionError) {
        return {
            kind: "error",
            response: request.c.json(jsonRpcErrorPayload(request.id, -32602, "Unable to resolve downstream dispatch route.", {
                detail: dispatchResolutionError instanceof Error
                    ? dispatchResolutionError.message
                    : String(dispatchResolutionError),
            }), 400),
        };
    }
}
//# sourceMappingURL=mcp-tools-call-routing.js.map