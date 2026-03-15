import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { loadGrpcTlsConfig, loadServiceClientSecurePooled, mapleLog } from "@maple/common";
import { config } from "./config.js";
const PROTO_ROOT = resolve(import.meta.dirname, "../../../../proto");
const PROTO_PATH = resolve(PROTO_ROOT, "maple/tools/v1/tool_runner.proto");
const grpcTlsConfig = loadGrpcTlsConfig();
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: false,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
    includeDirs: [PROTO_ROOT],
});
const proto = grpc.loadPackageDefinition(packageDefinition);
const toolRunnerProto = proto.maple.tools.v1;
function loadServiceClientPooled(protoFile, servicePath, address) {
    return loadServiceClientSecurePooled(protoFile, servicePath, address, PROTO_ROOT, grpcTlsConfig);
}
const DEFAULT_DEADLINE_MS = 5000;
function grpcUnary(client, method, request, { deadlineMs = DEFAULT_DEADLINE_MS } = {}) {
    const deadline = new Date(Date.now() + deadlineMs);
    return new Promise((resolvePromise, rejectPromise) => {
        client[method](request, { deadline }, (err, response) => {
            if (err)
                rejectPromise(err);
            else
                resolvePromise(response);
        });
    });
}
const cyberProxyPool = loadServiceClientPooled("maple/cyber/v1/cyber_proxy.proto", "maple.cyber.v1.CyberProxyService", config.cyberProxyAddress);
const auditWriterPool = loadServiceClientPooled("maple/audit/v1/audit_writer.proto", "maple.audit.v1.AuditWriterService", config.auditWriterAddress);
function getCyberProxy() {
    return cyberProxyPool.getClient();
}
function getAuditWriter() {
    return auditWriterPool.getClient();
}
export function closeToolRunnerClients() {
    cyberProxyPool?.close();
    auditWriterPool?.close();
}
function emitAuditEvent(opts) {
    try {
        grpcUnary(getAuditWriter(), "appendEvent", {
            event: {
                eventId: randomUUID(),
                eventType: opts.eventType,
                timestamp: new Date().toISOString(),
                sourceService: "tool-runner",
                context: { traceId: opts.traceId ?? "" },
                payloadJson: Buffer.from(JSON.stringify(opts.payload ?? {})),
                severity: opts.severity ?? "RISK_SEVERITY_LOW",
                summary: opts.summary,
            },
        }).catch((err) => {
            mapleLog("warn", "tool_runner_audit_emit_failed", { error: err.message });
        });
    }
    catch {
        // fire-and-forget
    }
}
function inferToolNameFromJsonRpcPayload(payload) {
    const method = String(payload.method || "").trim();
    if (method === "tools/call") {
        const params = payload.params && typeof payload.params === "object" && !Array.isArray(payload.params)
            ? payload.params
            : {};
        const toolName = String(params.name || "").trim();
        if (toolName) {
            return toolName;
        }
    }
    if (method) {
        return `jsonrpc.${method}`;
    }
    return "jsonrpc.forward";
}
function toCyberReport(response, statusCode) {
    const threatsFound = Array.isArray(response?.threatsFound)
        ? response.threatsFound.map((threat) => String(threat))
        : [];
    return {
        urlReputation: statusCode >= 400 ? "blocked" : "ok",
        sanitized: Boolean(response?.sanitized),
        malware: Boolean(response?.malwareDetected) || threatsFound.length > 0,
        quarantined: Boolean(response?.quarantined),
        threatsFound,
        quarantineReason: String(response?.quarantineReason || response?.policyReason || ""),
        resolvedIp: String(response?.resolvedIp || ""),
    };
}
export function createToolRunnerService() {
    const server = new grpc.Server();
    const serviceImpl = {
        async ExecuteJsonRpc(call, callback) {
            const startedAt = Date.now();
            try {
                const appId = String(call.request.appId || "");
                const targetUrl = String(call.request.targetUrl || "").trim();
                const timeoutMs = Number(call.request.timeoutMs || 0) > 0
                    ? Number(call.request.timeoutMs)
                    : 30_000;
                const credentialId = String(call.request.credentialId || "").trim();
                const credentialToken = String(call.request.credentialToken || "").trim();
                const credentialScopes = Array.isArray(call.request.credentialScopes)
                    ? call.request.credentialScopes.map((scope) => String(scope)).filter((scope) => scope.length > 0)
                    : [];
                if (!targetUrl) {
                    callback({ code: grpc.status.INVALID_ARGUMENT, message: "targetUrl is required" });
                    return;
                }
                const payloadRaw = call.request.payloadJson;
                let payloadJson = "{}";
                if (payloadRaw) {
                    payloadJson = typeof payloadRaw === "string"
                        ? payloadRaw
                        : Buffer.isBuffer(payloadRaw)
                            ? payloadRaw.toString("utf-8")
                            : String(payloadRaw);
                }
                let payload = {};
                // Validate payload shape once here so downstream services can trust it.
                try {
                    const parsed = JSON.parse(payloadJson);
                    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                        payload = parsed;
                    }
                }
                catch {
                    callback({ code: grpc.status.INVALID_ARGUMENT, message: "payloadJson must be valid JSON" });
                    return;
                }
                const toolName = inferToolNameFromJsonRpcPayload(payload);
                const outboundHeaders = {
                    "content-type": "application/json",
                    accept: "application/json",
                };
                if (credentialId) {
                    outboundHeaders["x-maple-credential-id"] = credentialId;
                }
                if (credentialToken) {
                    outboundHeaders["x-maple-credential-token"] = credentialToken;
                }
                if (credentialScopes.length > 0) {
                    outboundHeaders["x-maple-credential-scopes"] = credentialScopes.join(",");
                }
                // Use the request's timeoutMs for the gRPC deadline so it doesn't
                // expire before the upstream call completes (+ 5s grace for overhead).
                const grpcDeadline = timeoutMs + 5000;
                const response = await grpcUnary(getCyberProxy(), "proxyHttpRequest", {
                    context: call.request.context ?? {},
                    method: "POST",
                    url: targetUrl,
                    headers: outboundHeaders,
                    body: Buffer.from(payloadJson),
                    toolName,
                    appId,
                    timeoutMs,
                }, { deadlineMs: grpcDeadline });
                const statusCode = Number(response?.statusCode ?? 502);
                const responseJson = response?.body
                    ? (Buffer.isBuffer(response.body) ? response.body : Buffer.from(response.body))
                    : Buffer.from("{}");
                const cyberReport = toCyberReport(response, statusCode);
                if (statusCode >= 400) {
                    const errorMessage = `tool-runner cyber-proxy returned HTTP ${statusCode}`;
                    emitAuditEvent({
                        eventType: "AUDIT_EVENT_TYPE_TOOL_FAILED",
                        summary: errorMessage,
                        severity: statusCode === 403 ? "RISK_SEVERITY_HIGH" : "RISK_SEVERITY_MEDIUM",
                        traceId: call.request.context?.traceId,
                        payload: { appId, targetUrl, statusCode, credentialId, toolName },
                    });
                    callback(null, {
                        success: false,
                        responseJson,
                        errorMessage,
                        durationMs: Date.now() - startedAt,
                        statusCode,
                        cyberReport,
                    });
                    return;
                }
                emitAuditEvent({
                    eventType: "AUDIT_EVENT_TYPE_TOOL_COMPLETED",
                    summary: `tool-runner executed JSON-RPC for ${appId || "dynamic-target"}`,
                    traceId: call.request.context?.traceId,
                    payload: {
                        appId,
                        targetUrl,
                        statusCode,
                        durationMs: Date.now() - startedAt,
                        credentialId,
                        credentialScopes,
                        toolName,
                    },
                });
                callback(null, {
                    success: true,
                    responseJson,
                    errorMessage: "",
                    durationMs: Date.now() - startedAt,
                    statusCode,
                    cyberReport,
                });
            }
            catch (err) {
                mapleLog("error", "tool_runner_execute_jsonrpc_failed", { error: err.message });
                emitAuditEvent({
                    eventType: "AUDIT_EVENT_TYPE_TOOL_FAILED",
                    summary: "tool-runner execution failed",
                    severity: "RISK_SEVERITY_MEDIUM",
                    traceId: call.request?.context?.traceId,
                    payload: { error: err.message },
                });
                callback({ code: grpc.status.INTERNAL, message: err.message });
            }
        },
    };
    server.addService(toolRunnerProto.ToolRunnerService.service, serviceImpl);
    return server;
}
//# sourceMappingURL=service.js.map