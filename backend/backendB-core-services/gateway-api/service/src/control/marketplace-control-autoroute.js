import { asBoolean, asNumber, asString } from "../helpers.js";
import { toPolicySnapshot } from "../trace-helpers.js";
import { autoConnectAndResolveToolMatch, findConnectedToolMatches, } from "./marketplace-autoroute.js";
import { localToolResult, namespaceMarketplaceToolName, parseMarketplaceToolName, } from "./marketplace-tools.js";
import { parseMarketplaceProvider } from "./marketplace-provider.js";
export async function executeMarketplaceAutorouteCall(options) {
    const { toolArgs } = options;
    const requestedToolName = asString(toolArgs.toolName);
    if (!requestedToolName) {
        throw new Error("toolName is required.");
    }
    const explicitAppId = asString(toolArgs.appId);
    const parsedQualified = parseMarketplaceToolName(requestedToolName);
    const normalizedToolName = parsedQualified?.toolName ?? requestedToolName;
    const appIdHint = parsedQualified?.appId ?? explicitAppId;
    const downstreamArgs = toolArgs.arguments && typeof toolArgs.arguments === "object" && !Array.isArray(toolArgs.arguments)
        ? toolArgs.arguments
        : {};
    const sessionId = asString(toolArgs.sessionId) ??
        `mcp-autoroute-${(appIdHint ?? normalizedToolName).replace(/[^a-z0-9_-]+/gi, "-").toLowerCase()}`;
    const traceId = asString(toolArgs.traceId);
    const autoConnect = asBoolean(toolArgs.autoConnect, true);
    const provider = parseMarketplaceProvider(toolArgs.provider) ?? "all";
    const searchQuery = asString(toolArgs.searchQuery) ?? normalizedToolName;
    const searchLimitRaw = asNumber(toolArgs.searchLimit);
    const searchLimit = searchLimitRaw
        ? Math.max(1, Math.min(20, Math.trunc(searchLimitRaw)))
        : 8;
    let selectedMatch;
    let autoConnectContext;
    if (appIdHint) {
        const explicitMatches = await findConnectedToolMatches(normalizedToolName, [appIdHint]);
        if (explicitMatches.length === 0) {
            throw new Error(`Tool "${normalizedToolName}" is not available on app "${appIdHint}". Run tools/list and choose an available tool name.`);
        }
        selectedMatch = explicitMatches[0];
    }
    else {
        const connectedMatches = await findConnectedToolMatches(normalizedToolName);
        if (connectedMatches.length === 1) {
            selectedMatch = connectedMatches[0];
        }
        else if (connectedMatches.length > 1) {
            return localToolResult({
                ok: false,
                action: "autoroute_call",
                status: "ambiguous_tool",
                message: `Tool "${normalizedToolName}" exists in multiple apps. Specify appId or use namespaced appId::toolName.`,
                matches: connectedMatches.map((match) => ({
                    appId: match.appId,
                    appName: match.appName,
                    qualifiedName: match.qualifiedName,
                })),
            });
        }
        else if (autoConnect) {
            const autoConnected = await autoConnectAndResolveToolMatch({
                toolName: normalizedToolName,
                provider,
                searchQuery,
                searchLimit,
                searchMarketplaceServers: options.searchMarketplaceServers,
                registerMarketplaceDownstream: options.registerMarketplaceDownstream,
            });
            autoConnectContext = {
                entries: autoConnected.entries,
                attempted: autoConnected.attempted,
                warnings: autoConnected.warnings,
            };
            if (autoConnected.match) {
                selectedMatch = autoConnected.match;
            }
        }
    }
    if (!selectedMatch) {
        return localToolResult({
            ok: false,
            action: "autoroute_call",
            status: "tool_not_resolved",
            message: `Could not resolve tool "${normalizedToolName}" to a connected downstream app.`,
            guidance: [
                "Run maple_marketplace_search to find candidate servers.",
                "Run maple_marketplace_connect to attach one server.",
                "Retry maple_autoroute_call with appId or namespaced appId::toolName.",
            ],
            autoConnect: autoConnectContext ?? null,
        });
    }
    const chainResult = await options.dispatchDownstreamChainAndLog({
        appIds: [selectedMatch.appId],
        toolName: selectedMatch.toolName,
        toolArgs: downstreamArgs,
        sessionId,
        traceId,
        origin: "mcp_proxy",
    });
    if (!chainResult.ok) {
        const failed = chainResult.finalResult;
        return localToolResult({
            ok: false,
            action: "autoroute_call",
            status: chainResult.blockedByPolicy ? "blocked_by_policy" : "dispatch_failed",
            appId: failed.app.id,
            qualifiedToolName: namespaceMarketplaceToolName(failed.app.id, selectedMatch.toolName),
            toolName: selectedMatch.toolName,
            requestedToolName,
            blockedByPolicy: chainResult.blockedByPolicy,
            policyWouldBlock: failed.preExecutionWouldBlock,
            traceId: failed.trace.id,
            sessionId: failed.trace.sessionId,
            stepIndex: failed.step.index,
            preExecutionStepIndex: failed.preExecutionStep.index,
            policy: toPolicySnapshot(failed.preExecutionDecision),
            chainStages: chainResult.stages,
            error: failed.failure ?? "Downstream dispatch failed.",
        });
    }
    const final = chainResult.finalResult;
    return localToolResult({
        ok: true,
        action: "autoroute_call",
        status: "executed",
        source: selectedMatch.source,
        appId: final.app.id,
        appName: selectedMatch.appName,
        qualifiedToolName: namespaceMarketplaceToolName(final.app.id, selectedMatch.toolName),
        toolName: selectedMatch.toolName,
        requestedToolName,
        traceId: final.trace.id,
        sessionId: final.trace.sessionId,
        stepIndex: final.step.index,
        preExecutionStepIndex: final.preExecutionStep.index,
        policyWouldBlock: final.preExecutionWouldBlock,
        policy: toPolicySnapshot(final.preExecutionDecision),
        chainStages: chainResult.stages,
        downstreamResult: final.dispatch?.result ?? null,
    });
}
//# sourceMappingURL=marketplace-control-autoroute.js.map