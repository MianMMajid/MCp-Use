import { dispatchDownstreamChainAndLog, resolveDispatchAppIds, } from "../firewall-proxy.js";
// zod v3/v4 compatibility shim — mcp-use internally expects zod v4 types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const zodCompat = (schema) => schema;
export async function dispatchWidgetTool(options) {
    const appIds = resolveDispatchAppIds({ includeDefaultExecutionOrder: true });
    const chainResult = await dispatchDownstreamChainAndLog({
        appIds,
        toolName: options.toolName,
        toolArgs: options.toolArgs,
        sessionId: "chatgpt",
        origin: "mcp",
    });
    if (!chainResult.ok) {
        return {
            ok: false,
            message: chainResult.failure ?? options.failureMessage,
        };
    }
    const raw = chainResult.finalResult.dispatch?.result;
    const rawRecord = raw && typeof raw === "object" && !Array.isArray(raw)
        ? raw
        : undefined;
    return {
        ok: true,
        chainResult,
        raw: rawRecord,
    };
}
//# sourceMappingURL=mcp-tools-widget-common.js.map