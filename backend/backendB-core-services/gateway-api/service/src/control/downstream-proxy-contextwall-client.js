import { randomUUID } from "node:crypto";
import { asObject, asString } from "./downstream-proxy-utils.js";
import { buildGatewayRequestContext, getContextWallClient, grpcUnary, } from "./downstream-proxy-contextwall-grpc.js";
import { normalizeToolsListFromPayload, parseForwardPayload, parseJsonFromUnknown, } from "./downstream-proxy-contextwall-parsers.js";
function buildJsonRpcPayload(requestId, method, params) {
    return {
        jsonrpc: "2.0",
        id: requestId,
        method,
        params,
    };
}
function assertForwardAllowed(response, operation) {
    if (response?.allowed === false) {
        throw new Error(`Policy blocked ${operation}: ${response.blockedReason || "blocked"}`);
    }
    if (!response?.success) {
        throw new Error(response?.errorMessage || `${operation} failed`);
    }
}
export async function mcpJsonRpcRequest(app, method, params, requestContextOverrides = {}) {
    const requestId = randomUUID();
    const startedAt = Date.now();
    const gatewayRequestContext = buildGatewayRequestContext(requestContextOverrides);
    if (method === "tools/list") {
        const response = await grpcUnary(getContextWallClient(), "forwardJsonRpcWithPolicy", {
            context: gatewayRequestContext,
            appId: app.id,
            targetUrl: app.mcpUrl,
            payloadJson: Buffer.from(JSON.stringify(buildJsonRpcPayload(requestId, method, params))),
        });
        assertForwardAllowed(response, `${app.id}.tools/list`);
        const forwardPayload = parseForwardPayload(response?.responseJson);
        const normalizedTools = normalizeToolsListFromPayload(forwardPayload);
        return {
            requestId,
            durationMs: Date.now() - startedAt,
            responseStatus: 200,
            result: { tools: normalizedTools },
        };
    }
    if (method === "tools/call") {
        const toolName = asString(params.name);
        if (!toolName) {
            throw new Error("Downstream tools/call is missing tool name.");
        }
        const toolArgs = asObject(params.arguments);
        const response = await grpcUnary(getContextWallClient(), "executeToolWithPolicy", {
            context: gatewayRequestContext,
            appId: app.id,
            targetUrl: app.mcpUrl,
            toolName,
            argumentsJson: Buffer.from(JSON.stringify(toolArgs)),
            sessionId: gatewayRequestContext.sessionId,
            traceId: gatewayRequestContext.traceId,
        });
        assertForwardAllowed(response, `${app.id}.${toolName}`);
        return {
            requestId,
            durationMs: Date.now() - startedAt,
            responseStatus: 200,
            result: parseJsonFromUnknown(response?.resultJson) ?? {},
        };
    }
    const response = await grpcUnary(getContextWallClient(), "forwardJsonRpcWithPolicy", {
        context: gatewayRequestContext,
        appId: app.id,
        targetUrl: app.mcpUrl,
        payloadJson: Buffer.from(JSON.stringify(buildJsonRpcPayload(requestId, method, params))),
    });
    assertForwardAllowed(response, `${app.id}.${method}`);
    const forwardPayload = parseForwardPayload(response?.responseJson);
    return {
        requestId,
        durationMs: Date.now() - startedAt,
        responseStatus: 200,
        result: "result" in forwardPayload ? forwardPayload.result : forwardPayload,
    };
}
export async function forwardJsonRpcPayloadWithPolicy(options) {
    const startedAt = Date.now();
    const gatewayRequestContext = buildGatewayRequestContext(options.requestContextOverrides);
    const response = await grpcUnary(getContextWallClient(), "forwardJsonRpcWithPolicy", {
        context: gatewayRequestContext,
        appId: options.app.id,
        targetUrl: options.app.mcpUrl,
        payloadJson: Buffer.from(JSON.stringify(options.payload)),
    });
    return {
        durationMs: Date.now() - startedAt,
        response,
    };
}
//# sourceMappingURL=downstream-proxy-contextwall-client.js.map