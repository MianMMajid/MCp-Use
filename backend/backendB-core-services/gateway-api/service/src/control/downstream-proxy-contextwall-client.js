import { randomUUID } from "node:crypto";
import { asObject, asString } from "./downstream-proxy-utils.js";
import { buildGatewayRequestContext, getContextWallClient, grpcUnary, } from "./downstream-proxy-contextwall-grpc.js";
import { normalizeToolsListFromPayload, parseForwardPayload, parseMediatedToolResult, } from "./downstream-proxy-contextwall-parsers.js";
import { recordServiceCall } from "../core/service-utilization.js";
import { currentRequestContext } from "../logging.js";
// Deadline tiers — must exceed downstream timeouts to avoid premature gateway cancellation.
// Tool execution: context-wall → mcp-proxy (30s) → cyber-proxy (15s) → downstream
const DEADLINE_TOOL_EXEC_MS = 35000;
// JSON-RPC forwarding: same chain as tool execution
const DEADLINE_FORWARD_MS = 35000;
// Metadata calls (tools/list, policy queries): fast path
const DEADLINE_FAST_MS = 10000;
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

function buildMediatedToolError(response, operation, parsedToolResult = {}) {
    const errorText = response?.allowed === false
        ? `Policy blocked ${operation}: ${response?.blockedReason || "blocked"}`
        : response?.errorMessage || `${operation} failed`;
    const error = new Error(errorText);
    error.blockedByPolicy = response?.allowed === false;
    error.cyberReport = parsedToolResult.cyberReport ?? null;
    error.toolResult = parsedToolResult.result ?? {};
    return error;
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
        }, { deadlineMs: DEADLINE_FAST_MS });
        assertForwardAllowed(response, `${app.id}.tools/list`);
        const forwardPayload = parseForwardPayload(response?.responseJson);
        const normalizedTools = normalizeToolsListFromPayload(forwardPayload);
        const ctx = currentRequestContext();
        recordServiceCall({
            caller: "gateway-api",
            service: "mcp-proxy",
            operation: "tools/list (mediated)",
            status: "ok",
            latencyMs: Date.now() - startedAt,
            routeId: ctx ? `${ctx.method} ${ctx.path}` : "",
            traceId: ctx?.traceId ?? gatewayRequestContext.traceId,
            tenantId: ctx?.tenantId ?? gatewayRequestContext.tenantId,
        });
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
        const ctx = currentRequestContext();
        const routeId = ctx ? `${ctx.method} ${ctx.path}` : "";
        const traceId = ctx?.traceId ?? gatewayRequestContext.traceId;
        const tenantId = ctx?.tenantId ?? gatewayRequestContext.tenantId;
        const recordMediatedToolCall = (status) => {
            const latencyMs = Date.now() - startedAt;
            for (const service of ["mcp-proxy", "cyber-proxy"]) {
                recordServiceCall({
                    caller: "gateway-api",
                    service,
                    operation: `tools/call ${toolName} (mediated)`,
                    status,
                    latencyMs,
                    routeId,
                    traceId,
                    tenantId,
                });
            }
        };
        try {
            const response = await grpcUnary(getContextWallClient(), "executeToolWithPolicy", {
                context: gatewayRequestContext,
                appId: app.id,
                targetUrl: app.mcpUrl,
                toolName,
                argumentsJson: Buffer.from(JSON.stringify(toolArgs)),
                sessionId: gatewayRequestContext.sessionId,
                traceId: gatewayRequestContext.traceId,
            }, { deadlineMs: DEADLINE_TOOL_EXEC_MS });
            const parsedToolResult = parseMediatedToolResult(response?.resultJson);
            if (response?.allowed === false || !response?.success) {
                recordMediatedToolCall("error");
                throw buildMediatedToolError(response, `${app.id}.${toolName}`, parsedToolResult);
            }
            recordMediatedToolCall("ok");
            return {
                requestId,
                durationMs: Date.now() - startedAt,
                responseStatus: 200,
                result: parsedToolResult.result ?? {},
                cyberReport: parsedToolResult.cyberReport ?? null,
            };
        }
        catch (error) {
            if (!error?.cyberReport) {
                recordMediatedToolCall("error");
            }
            throw error;
        }
    }
    const response = await grpcUnary(getContextWallClient(), "forwardJsonRpcWithPolicy", {
        context: gatewayRequestContext,
        appId: app.id,
        targetUrl: app.mcpUrl,
        payloadJson: Buffer.from(JSON.stringify(buildJsonRpcPayload(requestId, method, params))),
    }, { deadlineMs: DEADLINE_FORWARD_MS });
    assertForwardAllowed(response, `${app.id}.${method}`);
    const forwardPayload = parseForwardPayload(response?.responseJson);
    const ctx = currentRequestContext();
    recordServiceCall({
        caller: "gateway-api",
        service: "mcp-proxy",
        operation: `${method} (mediated)`,
        status: "ok",
        latencyMs: Date.now() - startedAt,
        routeId: ctx ? `${ctx.method} ${ctx.path}` : "",
        traceId: ctx?.traceId ?? gatewayRequestContext.traceId,
        tenantId: ctx?.tenantId ?? gatewayRequestContext.tenantId,
    });
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
    }, { deadlineMs: DEADLINE_FORWARD_MS });
    return {
        durationMs: Date.now() - startedAt,
        response,
    };
}
//# sourceMappingURL=downstream-proxy-contextwall-client.js.map
