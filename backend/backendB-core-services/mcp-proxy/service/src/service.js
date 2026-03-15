/**
 * MCP Proxy Service
 *
 * This service acts as the tool execution layer for Maple's microservice
 * architecture. mcp-proxy directly executes tool calls against downstream MCP
 * servers with two security enforcement layers:
 *
 * 1. **Retired credential minting**: A short-lived scoped credential is minted
 *    locally (secrets-broker has been retired; context-wall scoped credential
 *    delegation is the replacement).
 *
 * 2. **cyber-proxy**: mcp-proxy routes all outbound tool execution traffic
 *    directly through cyber-proxy for SSRF guards, domain allowlists/blocklists,
 *    and content scanning. The former tool-runner service has been merged into
 *    mcp-proxy.
 */
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { dirname, resolve } from "node:path";
import { loadGrpcTlsConfig, loadServiceClientSecurePooled, createGrpcServer, CircuitBreaker, mapleLog } from "@maple/common";
import { randomUUID, createHmac } from "node:crypto";
import { config } from "./config.js";
function jsonBuf(value) {
    return Buffer.from(JSON.stringify(value));
}
// ── Lightweight audit event emitter ──────────────────────────────────────────
function emitAuditEvent(opts) {
    try {
        auditWriterBreaker.execute(() => grpcUnary(getAuditWriter(), "appendEvent", {
            event: {
                eventId: randomUUID(),
                eventType: opts.eventType,
                timestamp: new Date().toISOString(),
                sourceService: "mcp-proxy",
                context: { traceId: opts.traceId ?? "" },
                payloadJson: jsonBuf(opts.payload ?? {}),
                severity: "RISK_SEVERITY_LOW",
                summary: opts.summary,
            },
        })).catch(() => {});
    }
    catch {
        // Audit emission is fire-and-forget
    }
}
// ── gRPC clients for cyber-proxy and audit-writer ────────────────────────────
const PROTO_ROOT = resolve(import.meta.dirname, "../../../../proto");
const grpcTlsConfig = loadGrpcTlsConfig();
function loadServiceClientPooled(protoFile, servicePath, address) {
    return loadServiceClientSecurePooled(protoFile, servicePath, address, PROTO_ROOT, grpcTlsConfig);
}
const DEFAULT_DEADLINE_MS = 5000;
function grpcUnary(client, method, request, { deadlineMs = DEFAULT_DEADLINE_MS } = {}) {
    const deadline = new Date(Date.now() + deadlineMs);
    return new Promise((resolve, reject) => {
        client[method](request, { deadline }, (err, response) => {
            if (err)
                reject(err);
            else
                resolve(response);
        });
    });
}
const cyberProxyPool = loadServiceClientPooled("maple/cyber/v1/cyber_proxy.proto", "maple.cyber.v1.CyberProxyService", config.cyberProxyAddress);
const auditWriterPool = loadServiceClientPooled("maple/audit/v1/audit_writer.proto", "maple.audit.v1.AuditWriterService", config.auditWriterAddress);
const cyberProxyBreaker = new CircuitBreaker("mcp-proxy->cyber-proxy", { failureThreshold: 5, resetTimeoutMs: 30000 });
const auditWriterBreaker = new CircuitBreaker("mcp-proxy->audit-writer", { failureThreshold: 5, resetTimeoutMs: 30000 });
function getCyberProxy() {
    return cyberProxyPool.getClient();
}
function getAuditWriter() {
    return auditWriterPool.getClient();
}
export function closeMcpProxyClients() {
    cyberProxyPool?.close();
    auditWriterPool?.close();
}
class CredentialMintError extends Error {
    constructor(message) {
        super(message);
        this.name = "CredentialMintError";
    }
}
// Fix 9: HMAC-signed credentials instead of plaintext retired tokens
// Fail-closed: refuse to start with an insecure default signing key.
const CREDENTIAL_SIGNING_KEY = process.env.MAPLE_CREDENTIAL_SIGNING_KEY;
if (!CREDENTIAL_SIGNING_KEY || CREDENTIAL_SIGNING_KEY === "maple-credential-key") {
    throw new Error(
        "MAPLE_CREDENTIAL_SIGNING_KEY is required and must not be the insecure default. " +
        "Generate a strong secret: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
}

function createSignedCredential(toolName, appId, scopes) {
    const credentialId = `cred-${randomUUID()}`;
    const payload = `${credentialId}:${appId}:${toolName}:${Date.now()}`;
    const signature = createHmac("sha256", CREDENTIAL_SIGNING_KEY)
        .update(payload).digest("hex").slice(0, 32);
    const token = `${payload}:${signature}`;
    mapleLog("info", "credential_mint_signed", {
        appId,
        toolName,
        credentialId,
        replacement: "context-wall scoped credential delegation",
    });
    return { credentialId, token, scopes };
}

// Finding 5: Verification function for signed credentials — cyber-proxy
// should call this to validate tokens before trusting scope claims.
export function verifySignedCredential(token) {
    if (!token || typeof token !== "string") return { valid: false, reason: "missing_token" };
    const parts = token.split(":");
    if (parts.length < 5) return { valid: false, reason: "malformed_token" };
    const signature = parts[parts.length - 1];
    const payload = parts.slice(0, -1).join(":");
    const expectedSig = createHmac("sha256", CREDENTIAL_SIGNING_KEY)
        .update(payload).digest("hex").slice(0, 32);
    if (signature !== expectedSig) return { valid: false, reason: "invalid_signature" };
    // Parse credential fields
    const [credentialId, appId, toolName, timestampStr] = parts;
    const timestamp = Number(timestampStr);
    // Reject credentials older than 1 hour
    if (Date.now() - timestamp > 3600_000) return { valid: false, reason: "expired" };
    return { valid: true, credentialId, appId, toolName, timestamp };
}
function scopeToCredentialScopes(scope) {
    const scopes = ["execute"];
    if (scope?.allowedDomains && Array.isArray(scope.allowedDomains) && scope.allowedDomains.length > 0) {
        for (const domain of scope.allowedDomains) {
            scopes.push(`domain:${domain}`);
        }
    }
    if (scope?.maxBytes && Number(scope.maxBytes) > 0) {
        scopes.push(`max_bytes:${Math.trunc(Number(scope.maxBytes))}`);
    }
    if (scope?.allowFileDownload === false) {
        scopes.push("download:blocked");
    }
    return [...new Set(scopes)];
}
async function mintCredentialForToolWithScopes(toolName, appId, scopes) {
    // secrets-broker has been retired; use HMAC-signed credentials.
    // Replacement: context-wall scoped credential delegation.
    return createSignedCredential(toolName, appId, scopes);
}
let jobDispatcher = null;
function setJobDispatcher(dispatcher) {
    jobDispatcher = dispatcher;
}
// ── Helpers ported from tool-runner (now inlined) ────────────────────────────
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
    // Derive malware strictly from the explicit malwareDetected field set by cyber-proxy.
    // Do NOT promote non-malware content threats (e.g., indirect injection tags) to malware.
    return {
        urlReputation: statusCode >= 400 ? "blocked" : "ok",
        sanitized: Boolean(response?.sanitized),
        malware: Boolean(response?.malwareDetected),
        quarantined: Boolean(response?.quarantined),
        threatsFound,
        contentBlocked: threatsFound.length > 0 && !Boolean(response?.malwareDetected),
        quarantineReason: String(response?.quarantineReason || response?.policyReason || ""),
        resolvedIp: String(response?.resolvedIp || ""),
    };
}
function normalizeCyberReport(raw, statusCode) {
    const threatsFound = Array.isArray(raw?.threatsFound)
        ? raw.threatsFound.map((threat) => String(threat))
        : [];
    return {
        urlReputation: String(raw?.urlReputation || (statusCode >= 400 ? "blocked" : "ok")),
        sanitized: Boolean(raw?.sanitized),
        malware: Boolean(raw?.malware),
        quarantined: Boolean(raw?.quarantined),
        threatsFound,
        contentBlocked: threatsFound.length > 0 && !Boolean(raw?.malware),
        quarantineReason: String(raw?.quarantineReason || ""),
        resolvedIp: String(raw?.resolvedIp || ""),
    };
}
async function dispatchViaToolRunner(appId, url, body, timeoutMs, traceId, credential) {
    // Job mode: dispatch as isolated K8s Job (preserved — does not use gRPC client)
    if (config.toolRunnerMode === "job" && jobDispatcher) {
        try {
            const result = await jobDispatcher.dispatch({
                appId,
                targetUrl: url,
                payloadJson: JSON.stringify(body),
                timeoutMs,
                traceId,
                credentialId: credential?.credentialId ?? "",
                credentialToken: credential?.token ?? "",
                credentialScopes: credential?.scopes ?? [],
            });
            let payload = {};
            try {
                payload = JSON.parse(result.responseJson);
            }
            catch {
                payload = {};
            }
            return {
                success: Boolean(result.success),
                payload,
                statusCode: Number(result.statusCode ?? 0),
                errorMessage: String(result.errorMessage || ""),
                cyberReport: normalizeCyberReport(result.cyberReport, Number(result.statusCode ?? 0)),
            };
        }
        catch (err) {
            mapleLog("warn", "k8s_job_dispatch_failed", { appId, url, error: err.message });
            throw err;
        }
    }
    // Service mode: call cyber-proxy directly (tool-runner merged into mcp-proxy)
    try {
        const payloadJson = JSON.stringify(body);
        const toolName = inferToolNameFromJsonRpcPayload(body);
        const outboundHeaders = {
            "content-type": "application/json",
            accept: "application/json",
        };
        if (credential?.credentialId) {
            outboundHeaders["x-maple-credential-id"] = credential.credentialId;
        }
        if (credential?.token) {
            outboundHeaders["x-maple-credential-token"] = credential.token;
        }
        if (credential?.scopes && credential.scopes.length > 0) {
            outboundHeaders["x-maple-credential-scopes"] = credential.scopes.join(",");
        }
        const response = await cyberProxyBreaker.execute(() => grpcUnary(getCyberProxy(), "proxyHttpRequest", {
            context: {
                traceId: traceId || "",
                sourceService: "mcp-proxy",
            },
            method: "POST",
            url,
            headers: outboundHeaders,
            body: Buffer.from(payloadJson),
            toolName,
            appId,
            timeoutMs,
        }));
        const statusCode = Number(response?.statusCode ?? 502);
        const responseBody = response?.body
            ? (Buffer.isBuffer(response.body) ? response.body.toString("utf-8") : Buffer.from(response.body).toString("utf-8"))
            : "{}";
        let payload = {};
        try {
            payload = JSON.parse(responseBody);
        }
        catch {
            payload = {};
        }
        const cyberReport = toCyberReport(response, statusCode);
        if (statusCode >= 400) {
            const errorMessage = `cyber-proxy returned HTTP ${statusCode}`;
            emitAuditEvent({
                eventType: "AUDIT_EVENT_TYPE_TOOL_FAILED",
                summary: errorMessage,
                traceId,
                payload: { appId, targetUrl: url, statusCode, toolName },
            });
            return {
                success: false,
                payload,
                statusCode,
                errorMessage,
                cyberReport,
            };
        }
        emitAuditEvent({
            eventType: "AUDIT_EVENT_TYPE_TOOL_COMPLETED",
            summary: `mcp-proxy executed JSON-RPC for ${appId || "dynamic-target"}`,
            traceId,
            payload: { appId, targetUrl: url, statusCode, toolName },
        });
        return {
            success: true,
            payload,
            statusCode,
            errorMessage: "",
            cyberReport,
        };
    }
    catch (err) {
        mapleLog("warn", "cyber_proxy_dispatch_failed", { appId, url, error: err.message });
        throw err;
    }
}
function resolveTargetUrl(registry, appId, targetUrl) {
    const app = registry.get(appId);
    const explicitTargetUrl = String(targetUrl || "").trim();
    if (explicitTargetUrl.length > 0) {
        return {
            url: explicitTargetUrl,
            appEnabled: app ? app.enabled : true,
        };
    }
    if (!app) {
        throw new Error(`App ${appId} not found`);
    }
    return {
        url: app.url,
        appEnabled: app.enabled,
    };
}
function parseToolInputSchema(raw) {
    if (!raw)
        return undefined;
    if (typeof raw === "object" && !Array.isArray(raw)) {
        return raw;
    }
    try {
        const json = typeof raw === "string"
            ? raw
            : Buffer.isBuffer(raw)
                ? raw.toString("utf-8")
                : String(raw);
        const parsed = JSON.parse(json);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed;
        }
    }
    catch {
        // ignore parse errors
    }
    return undefined;
}
function parseDiscoveredTools(response, appId) {
    if (!response || typeof response !== "object" || Array.isArray(response)) {
        return [];
    }
    const rpc = response;
    const result = rpc.result;
    if (!result || typeof result !== "object" || Array.isArray(result)) {
        return [];
    }
    const rawTools = result.tools;
    if (!Array.isArray(rawTools)) {
        return [];
    }
    return rawTools
        .filter((tool) => tool && typeof tool === "object" && !Array.isArray(tool))
        .map((tool) => {
        const value = tool;
        return {
            name: String(value.name || "").trim(),
            description: String(value.description || "").trim(),
            inputSchema: parseToolInputSchema(value.inputSchema ?? value.input_schema ?? value.schema ?? value.inputSchemaJson),
            appId,
        };
    })
        .filter((tool) => tool.name.length > 0);
}
async function discoverToolsForApp(registry, appId, traceId) {
    const app = registry.get(appId);
    if (!app || !app.enabled) {
        return [];
    }
    try {
        const response = await dispatchViaToolRunner(appId, app.url, {
            jsonrpc: "2.0",
            id: `tools-discovery-${appId}-${Date.now()}`,
            method: "tools/list",
            params: {},
        }, Math.min(config.toolExecutionTimeoutMs, 10_000), traceId, null);
        if (!response.success) {
            mapleLog("warn", "downstream_tools_discovery_transport_failed", {
                appId,
                statusCode: response.statusCode,
                error: response.errorMessage,
            });
            return [];
        }
        const discovered = parseDiscoveredTools(response.payload, appId);
        if (discovered.length > 0) {
            registry.setToolsForApp(appId, discovered.map((tool) => ({
                name: tool.name,
                description: tool.description,
                inputSchema: tool.inputSchema,
            })));
            mapleLog("info", "downstream_tools_discovered", { appId, count: discovered.length });
            emitAuditEvent({
                eventType: "AUDIT_EVENT_TYPE_POLICY_EVALUATED",
                summary: `Discovered ${discovered.length} tools for ${appId}`,
                traceId,
                payload: { appId, count: discovered.length },
            });
        }
        return discovered;
    }
    catch (err) {
        mapleLog("warn", "downstream_tools_discovery_failed", { appId, error: err.message });
        return [];
    }
}
const PROTO_PATH = resolve(import.meta.dirname, "../../../../proto/maple/proxy/v1/mcp_proxy.proto");
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: false, longs: String, enums: String, defaults: true, oneofs: true,
    includeDirs: [PROTO_ROOT, resolve(PROTO_ROOT, "maple"), dirname(PROTO_PATH)],
});
const proto = grpc.loadPackageDefinition(packageDefinition);
const proxyProto = proto.maple.proxy.v1;
export function createMcpProxyService(registry, dispatcher) {
    if (dispatcher)
        setJobDispatcher(dispatcher);
    const server = createGrpcServer();
    const serviceImpl = {
        async ExecuteTool(call, callback) {
            try {
                const { appId, toolName, argumentsJson, sessionId, traceId, targetUrl } = call.request;
                const toolCallId = String(call.request.toolCallId || traceId || `tool-call-${appId}-${Date.now()}`);
                const target = resolveTargetUrl(registry, appId, targetUrl);
                if (!target.appEnabled) {
                    callback({ code: grpc.status.FAILED_PRECONDITION, message: `App ${appId} is disabled` });
                    return;
                }
                const start = Date.now();
                mapleLog("info", "tool_execute", { appId, toolName, sessionId, traceId });
                // Mint a short-lived scoped credential before execution (fail-closed).
                const requestedScope = call.request.scope;
                let mintedCredential;
                try {
                    mintedCredential = await mintCredentialForToolWithScopes(toolName, appId, scopeToCredentialScopes(requestedScope));
                }
                catch (err) {
                    emitAuditEvent({
                        eventType: "AUDIT_EVENT_TYPE_TOOL_FAILED",
                        summary: `Credential mint failed for ${appId}.${toolName}`,
                        traceId,
                        payload: { appId, toolName, error: err.message },
                    });
                    callback({
                        code: grpc.status.FAILED_PRECONDITION,
                        message: err.message,
                    });
                    return;
                }
                // Parse the arguments from the gRPC request
                let toolArgs = {};
                if (argumentsJson) {
                    try {
                        const raw = typeof argumentsJson === "string"
                            ? argumentsJson
                            : Buffer.isBuffer(argumentsJson)
                                ? argumentsJson.toString("utf-8")
                                : String(argumentsJson);
                        toolArgs = JSON.parse(raw);
                    }
                    catch {
                        callback({ code: grpc.status.INVALID_ARGUMENT, message: "Invalid argumentsJson: not valid JSON" });
                        return;
                    }
                }
                // Build MCP JSON-RPC tools/call request
                const jsonRpcRequest = {
                    jsonrpc: "2.0",
                    id: toolCallId,
                    method: "tools/call",
                    params: {
                        name: toolName,
                        arguments: toolArgs,
                    },
                };
                // Validate scope if present
                if (requestedScope) {
                    const scope = requestedScope;
                    if (scope.allowedDomains && scope.allowedDomains.length > 0) {
                        try {
                            const targetHost = new URL(target.url).hostname;
                            const domainAllowed = scope.allowedDomains.some((d) => targetHost === d || targetHost.endsWith(`.${d}`));
                            if (!domainAllowed) {
                                callback({ code: grpc.status.PERMISSION_DENIED, message: `Target domain ${targetHost} is not in allowed scope: ${scope.allowedDomains.join(", ")}` });
                                return;
                            }
                        }
                        catch {
                            // URL parse failure — allow through to cyber-proxy for enforcement
                        }
                    }
                }
                // Route all tool execution through cyber-proxy.
                let dispatched;
                try {
                    dispatched = await dispatchViaToolRunner(appId, target.url, jsonRpcRequest, config.toolExecutionTimeoutMs, traceId, mintedCredential);
                    mapleLog("debug", "tool_execute_via_cyber_proxy", { appId, toolName, targetUrl: target.url });
                }
                catch (proxyErr) {
                    mapleLog("error", "tool_execute_cyber_proxy_unavailable", { appId, toolName, targetUrl: target.url, error: proxyErr.message });
                    callback({ code: grpc.status.UNAVAILABLE, message: `Cyber-proxy unreachable: ${proxyErr.message}` });
                    return;
                }
                const durationMs = Date.now() - start;
                const rpcResponse = dispatched.payload;
                if (!dispatched.success) {
                    const toolStatus = dispatched.statusCode === 403 ? "blocked" : "error";
                    const errorMessage = dispatched.errorMessage || `Cyber-proxy returned HTTP ${dispatched.statusCode}`;
                    callback(null, {
                        success: false,
                        resultJson: jsonBuf(rpcResponse?.error ?? rpcResponse ?? { error: errorMessage }),
                        errorMessage,
                        durationMs,
                        appId,
                        toolName,
                        toolCallId,
                        status: toolStatus,
                        cyberReport: dispatched.cyberReport,
                    });
                    return;
                }
                // Check for JSON-RPC error in the response
                if (rpcResponse?.error) {
                    mapleLog("warn", "tool_execute_rpc_error", { appId, toolName, error: rpcResponse.error });
                    emitAuditEvent({
                        eventType: "AUDIT_EVENT_TYPE_TOOL_FAILED",
                        summary: `Tool ${toolName} on ${appId} failed`,
                        traceId,
                        payload: { appId, toolName, durationMs, error: rpcResponse.error },
                    });
                    callback(null, {
                        success: false,
                        resultJson: jsonBuf(rpcResponse.error),
                        errorMessage: typeof rpcResponse.error === "string" ? rpcResponse.error : "Tool execution returned JSON-RPC error",
                        durationMs,
                        appId,
                        toolName,
                        toolCallId,
                        status: "error",
                        cyberReport: dispatched.cyberReport,
                    });
                    return;
                }
                emitAuditEvent({
                    eventType: "AUDIT_EVENT_TYPE_TOOL_COMPLETED",
                    summary: `Tool ${toolName} on ${appId} completed in ${durationMs}ms`,
                    traceId,
                    payload: { appId, toolName, durationMs },
                });
                callback(null, {
                    success: true,
                    resultJson: jsonBuf(rpcResponse?.result ?? {}),
                    errorMessage: "",
                    durationMs,
                    appId,
                    toolName,
                    toolCallId,
                    status: "ok",
                    cyberReport: dispatched.cyberReport,
                });
            }
            catch (err) {
                mapleLog("error", "tool_execute_failed", { error: err.message });
                callback({ code: grpc.status.INTERNAL, message: err.message });
            }
        },
        async ExecuteToolChain(call, callback) {
            try {
                const { appIds, toolName, argumentsJson, traceId } = call.request;
                mapleLog("info", "tool_chain_execute", { appIds, toolName, traceId });
                // Parse shared arguments
                let toolArgs = {};
                if (argumentsJson) {
                    try {
                        const raw = typeof argumentsJson === "string"
                            ? argumentsJson
                            : Buffer.isBuffer(argumentsJson)
                                ? argumentsJson.toString("utf-8")
                                : String(argumentsJson);
                        toolArgs = JSON.parse(raw);
                    }
                    catch {
                        callback({ code: grpc.status.INVALID_ARGUMENT, message: "Invalid argumentsJson: not valid JSON" });
                        return;
                    }
                }
                const results = [];
                let chainSuccess = true;
                // Dispatch sequentially through each app in the chain
                for (const appId of appIds || []) {
                    const app = registry.get(appId);
                    if (!app) {
                        results.push({
                            success: false,
                            resultJson: jsonBuf({ error: `App ${appId} not found` }),
                            durationMs: 0,
                            appId,
                            toolName,
                            toolCallId: "",
                            errorMessage: `App ${appId} not found`,
                            status: "error",
                        });
                        chainSuccess = false;
                        continue;
                    }
                    if (!app.enabled) {
                        results.push({
                            success: false,
                            resultJson: jsonBuf({ error: `App ${appId} is disabled` }),
                            durationMs: 0,
                            appId,
                            toolName,
                            toolCallId: "",
                            errorMessage: `App ${appId} is disabled`,
                            status: "blocked",
                        });
                        chainSuccess = false;
                        continue;
                    }
                    const start = Date.now();
                    try {
                        let mintedCredential;
                        try {
                            mintedCredential = await mintCredentialForToolWithScopes(toolName, appId, ["execute", "chain"]);
                        }
                        catch (err) {
                            results.push({
                                success: false,
                                resultJson: jsonBuf({ error: err.message }),
                                durationMs: Date.now() - start,
                                appId,
                                toolName,
                                toolCallId: "",
                                errorMessage: err.message,
                                status: "error",
                            });
                            chainSuccess = false;
                            continue;
                        }
                        const toolCallId = `chain-${traceId || "trace"}-${appId}-${Date.now()}`;
                        const jsonRpcRequest = {
                            jsonrpc: "2.0",
                            id: toolCallId,
                            method: "tools/call",
                            params: {
                                name: toolName,
                                arguments: toolArgs,
                            },
                        };
                        const response = await dispatchViaToolRunner(appId, app.url, jsonRpcRequest, config.toolExecutionTimeoutMs, traceId, mintedCredential);
                        const durationMs = Date.now() - start;
                        const rpcResponse = response.payload;
                        if (!response.success) {
                            const status = response.statusCode === 403 ? "blocked" : "error";
                            results.push({
                                success: false,
                                resultJson: jsonBuf(rpcResponse?.error ?? rpcResponse ?? { error: response.errorMessage }),
                                durationMs,
                                appId,
                                toolName,
                                toolCallId,
                                errorMessage: response.errorMessage || `Cyber-proxy returned HTTP ${response.statusCode}`,
                                status,
                                cyberReport: response.cyberReport,
                            });
                            chainSuccess = false;
                        }
                        else if (rpcResponse?.error) {
                            results.push({
                                success: false,
                                resultJson: jsonBuf(rpcResponse.error),
                                durationMs,
                                appId,
                                toolName,
                                toolCallId,
                                errorMessage: typeof rpcResponse.error === "string" ? rpcResponse.error : "Tool execution returned JSON-RPC error",
                                status: "error",
                                cyberReport: response.cyberReport,
                            });
                            chainSuccess = false;
                        }
                        else {
                            results.push({
                                success: true,
                                resultJson: jsonBuf(rpcResponse?.result ?? {}),
                                durationMs,
                                appId,
                                toolName,
                                toolCallId,
                                errorMessage: "",
                                status: "ok",
                                cyberReport: response.cyberReport,
                            });
                        }
                    }
                    catch (err) {
                        const durationMs = Date.now() - start;
                        mapleLog("error", "tool_chain_step_failed", { appId, toolName, error: err.message });
                        results.push({
                            success: false,
                            resultJson: jsonBuf({ error: err.message }),
                            durationMs,
                            appId,
                            toolName,
                            toolCallId: "",
                            errorMessage: err.message,
                            status: "error",
                        });
                        chainSuccess = false;
                    }
                }
                emitAuditEvent({
                    eventType: chainSuccess ? "AUDIT_EVENT_TYPE_TOOL_COMPLETED" : "AUDIT_EVENT_TYPE_TOOL_FAILED",
                    summary: `Tool chain ${toolName} ${chainSuccess ? "completed" : "failed"}`,
                    traceId,
                    payload: {
                        toolName,
                        appCount: Array.isArray(appIds) ? appIds.length : 0,
                        successCount: results.filter((result) => result.success).length,
                        failureCount: results.filter((result) => !result.success).length,
                    },
                });
                callback(null, { success: chainSuccess, results });
            }
            catch (err) {
                mapleLog("error", "tool_chain_execute_failed", { error: err.message });
                callback({ code: grpc.status.INTERNAL, message: err.message });
            }
        },
        async ListTools(call, callback) {
            try {
                const appId = String(call.request.appId || "").trim();
                let tools = appId
                    ? registry.getToolsForApp(appId).map((tool) => ({ ...tool, appId }))
                    : registry.getAllTools();
                if (appId && tools.length === 0) {
                    tools = await discoverToolsForApp(registry, appId, call.request?.context?.traceId);
                }
                if (!appId) {
                    const appsMissingTools = registry.list(false).filter((app) => app.tools.length === 0);
                    await Promise.all(
                        appsMissingTools.map((app) => discoverToolsForApp(registry, app.appId, call.request?.context?.traceId))
                    );
                    tools = registry.getAllTools();
                }
                callback(null, {
                    tools: tools.map((tool) => ({
                        name: tool.name,
                        description: tool.description,
                        appId: tool.appId,
                        inputSchemaJson: jsonBuf(tool.inputSchema && typeof tool.inputSchema === "object" && !Array.isArray(tool.inputSchema)
                            ? tool.inputSchema
                            : {}),
                    })),
                });
            }
            catch (err) {
                callback({ code: grpc.status.INTERNAL, message: err.message });
            }
        },
        ListDownstreamApps(call, callback) {
            try {
                const apps = registry.list(call.request.includeDisabled);
                callback(null, {
                    apps: apps.map((a) => ({
                        appId: a.appId, name: a.name, url: a.url, transport: a.transport,
                        enabled: a.enabled,
                        status: a.status,
                        tools: a.tools.map((tool) => ({
                            name: tool.name,
                            description: tool.description,
                            inputSchemaJson: jsonBuf(tool.inputSchema && typeof tool.inputSchema === "object" && !Array.isArray(tool.inputSchema)
                                ? tool.inputSchema
                                : {}),
                            appId: a.appId,
                        })),
                    })),
                });
            }
            catch (err) {
                callback({ code: grpc.status.INTERNAL, message: err.message });
            }
        },
        async ForwardJsonRpc(call, callback) {
            try {
                const { appId, payloadJson, targetUrl } = call.request;
                const target = resolveTargetUrl(registry, appId, targetUrl);
                mapleLog("debug", "jsonrpc_forward", { appId, targetUrl: target.url });
                if (!target.appEnabled) {
                    callback({ code: grpc.status.FAILED_PRECONDITION, message: `App ${appId} is disabled` });
                    return;
                }
                // Parse the incoming JSON-RPC payload
                let payload;
                try {
                    const raw = typeof payloadJson === "string"
                        ? payloadJson
                        : Buffer.isBuffer(payloadJson)
                            ? payloadJson.toString("utf-8")
                            : String(payloadJson);
                    payload = JSON.parse(raw);
                }
                catch {
                    callback({ code: grpc.status.INVALID_ARGUMENT, message: "Invalid payloadJson: not valid JSON" });
                    return;
                }
                let mintedCredential;
                try {
                    mintedCredential = await mintCredentialForToolWithScopes("jsonrpc.forward", appId, ["execute", "forward_jsonrpc"]);
                }
                catch (err) {
                    callback({
                        code: grpc.status.FAILED_PRECONDITION,
                        message: err.message,
                    });
                    return;
                }
                const response = await dispatchViaToolRunner(appId, target.url, payload, config.toolExecutionTimeoutMs, call.request.context?.traceId, mintedCredential);
                const responsePayload = response.payload;
                const responseBody = responsePayload ?? { jsonrpc: "2.0", id: null, result: null };
                emitAuditEvent({
                    eventType: response.success ? "AUDIT_EVENT_TYPE_POLICY_EVALUATED" : "AUDIT_EVENT_TYPE_TOOL_FAILED",
                    summary: `ForwardJsonRpc ${response.success ? "completed" : "failed"} for ${appId}`,
                    traceId: call.request.context?.traceId,
                    payload: {
                        appId,
                        targetUrl: target.url,
                        success: response.success,
                        statusCode: response.statusCode,
                        errorMessage: response.errorMessage,
                        cyberReport: response.cyberReport,
                    },
                });
                callback(null, {
                    responseJson: jsonBuf(responseBody),
                    success: Boolean(response.success),
                    errorMessage: response.success ? "" : (response.errorMessage || `Cyber-proxy returned HTTP ${response.statusCode}`),
                });
            }
            catch (err) {
                mapleLog("error", "jsonrpc_forward_failed", { error: err.message });
                emitAuditEvent({
                    eventType: "AUDIT_EVENT_TYPE_TOOL_FAILED",
                    summary: `ForwardJsonRpc failed for ${call.request?.appId || "unknown-app"}`,
                    traceId: call.request?.context?.traceId,
                    payload: { appId: call.request?.appId || "", error: err.message },
                });
                callback({ code: grpc.status.INTERNAL, message: err.message });
            }
        },
        PingDownstream(call, callback) {
            try {
                const app = registry.get(call.request.appId);
                callback(null, { reachable: !!app && app.enabled, latencyMs: 0, status: app?.status || "unknown" });
            }
            catch (err) {
                callback({ code: grpc.status.INTERNAL, message: err.message });
            }
        },
    };
    server.addService(proxyProto.McpProxyService.service, serviceImpl);
    return server;
}
//# sourceMappingURL=service.js.map
