import { asObject, asString, ensureToolAllowed, extractTextFromMcpResult, } from "./downstream-proxy-utils.js";
import { mcpJsonRpcRequest, forwardJsonRpcPayloadWithPolicy, } from "./downstream-proxy-contextwall-client.js";
export async function forwardJsonRpcToDownstream(app, payload, requestContextOverrides = {}) {
    const { durationMs, response } = await forwardJsonRpcPayloadWithPolicy({
        app,
        payload,
        requestContextOverrides,
    });
    if (response?.allowed === false) {
        throw new Error(`Policy blocked ${app.id} JSON-RPC forward: ${response.blockedReason || "blocked"}`);
    }
    if (!response?.success) {
        throw new Error(response?.errorMessage || `Failed to forward JSON-RPC to ${app.id}`);
    }
    const raw = response?.responseJson;
    let parsed;
    if (raw) {
        const json = typeof raw === "string" ? raw : Buffer.from(raw).toString("utf-8");
        try {
            parsed = JSON.parse(json);
        }
        catch {
            parsed = undefined;
        }
    }
    const normalizedPayload = parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed
        : {
            jsonrpc: "2.0",
            id: payload.id ?? null,
            error: {
                code: -32603,
                message: `Downstream ${app.id} returned non-JSON-RPC payload.`,
            },
        };
    return {
        durationMs,
        responseStatus: 200,
        payload: normalizedPayload,
    };
}
export async function listToolsFromDownstream(app, requestContextOverrides = {}) {
    const response = await mcpJsonRpcRequest(app, "tools/list", {}, requestContextOverrides);
    const rawResult = asObject(response.result);
    const toolsRaw = Array.isArray(rawResult.tools) ? rawResult.tools : [];
    const tools = [];
    for (const entry of toolsRaw) {
        if (!entry || typeof entry !== "object") {
            continue;
        }
        const tool = entry;
        const name = asString(tool.name);
        if (!name) {
            continue;
        }
        const annotations = tool.annotations && typeof tool.annotations === "object" && !Array.isArray(tool.annotations)
            ? tool.annotations
            : undefined;
        tools.push({
            name,
            description: asString(tool.description),
            inputSchema: tool.inputSchema,
            ...(annotations ? { annotations } : {}),
        });
    }
    return {
        tools,
        requestId: response.requestId,
        durationMs: response.durationMs,
    };
}
export async function dispatchToolToDownstream(app, toolName, toolArgs, requestContextOverrides = {}) {
    ensureToolAllowed(app, toolName);
    const response = await mcpJsonRpcRequest(app, "tools/call", {
        name: toolName,
        arguments: toolArgs,
    }, requestContextOverrides);
    return {
        appId: app.id,
        toolName,
        requestId: response.requestId,
        durationMs: response.durationMs,
        responseStatus: response.responseStatus,
        result: response.result,
        textPreview: extractTextFromMcpResult(response.result),
        cyberReport: response.cyberReport ?? null,
    };
}
//# sourceMappingURL=downstream-proxy-client.js.map
