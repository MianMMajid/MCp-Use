import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { loadGrpcTlsConfig, loadServiceClientSecurePooled, createGrpcServer, CircuitBreaker, mapleLog } from "@maple/common";
import { enforceTraceFirewall, evaluateFirewallStep, detectPromptInjection, scanForPII, redactPII } from "@maple/security";
import { analyzeTraceRisks, applyAuditToTrace } from "@maple/risk-engine";
import { generateOpenAI } from "./providers/openai.js";
import { generateAnthropic } from "./providers/anthropic.js";
import { config } from "./config.js";
const PROTO_ROOT = resolve(import.meta.dirname, "../../../../proto");
const PROTO_PATH = resolve(PROTO_ROOT, "maple/context/v1/context_wall.proto");
const grpcTlsConfig = loadGrpcTlsConfig();
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: false,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
    includeDirs: [PROTO_ROOT, resolve(PROTO_ROOT, "maple"), dirname(PROTO_PATH)],
});
const proto = grpc.loadPackageDefinition(packageDefinition);
const contextProto = proto.maple.context.v1;
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
const mcpProxyPool = loadServiceClientPooled("maple/proxy/v1/mcp_proxy.proto", "maple.proxy.v1.McpProxyService", config.mcpProxyAddress);
const auditWriterPool = loadServiceClientPooled("maple/audit/v1/audit_writer.proto", "maple.audit.v1.AuditWriterService", config.auditWriterAddress);
const mcpProxyBreaker = new CircuitBreaker("context-wall->mcp-proxy", { failureThreshold: 5, resetTimeoutMs: 30000 });
const auditWriterBreaker = new CircuitBreaker("context-wall->audit-writer", { failureThreshold: 5, resetTimeoutMs: 30000 });
function getMcpProxy() {
    return mcpProxyPool.getClient();
}
function getAuditWriter() {
    return auditWriterPool.getClient();
}
function getPreferredProvider() {
    const raw = String(process.env.MAPLE_FIREWALL_CHAT_PRIMARY || "openai").trim().toLowerCase();
    return raw === "anthropic" ? "anthropic" : "openai";
}
function providerModelName(provider) {
    return provider === "anthropic"
        ? String(process.env.MAPLE_FIREWALL_CHAT_ANTHROPIC_MODEL || "claude-sonnet-4-6")
        : String(process.env.MAPLE_FIREWALL_CHAT_OPENAI_MODEL || "gpt-4o-mini");
}
function providerApiKey(provider) {
    return provider === "anthropic"
        ? String(process.env.ANTHROPIC_API_KEY || "").trim()
        : String(process.env.OPENAI_API_KEY || "").trim();
}
function protoRoleToChatRole(role) {
    const normalized = String(role || "").trim();
    if (normalized === "CHAT_ROLE_SYSTEM")
        return "system";
    if (normalized === "CHAT_ROLE_ASSISTANT")
        return "assistant";
    if (normalized === "CHAT_ROLE_TOOL")
        return "tool";
    return "user";
}
function toModelTools(protoTools) {
    return (Array.isArray(protoTools) ? protoTools : [])
        .map((tool) => {
        const name = String(tool?.name || "").trim();
        if (!name)
            return null;
        const description = String(tool?.description || "");
        const parameters = parseJsonValue(tool?.parametersJson, { type: "object", properties: {} });
        return {
            type: "function",
            function: {
                name,
                description,
                parameters: parameters && typeof parameters === "object" && !Array.isArray(parameters)
                    ? parameters
                    : { type: "object", properties: {} },
            },
        };
    })
        .filter(Boolean);
}
function toProviderMessages(messages) {
    return (Array.isArray(messages) ? messages : []).map((message) => {
        const payload = {
            role: protoRoleToChatRole(message?.role),
            content: String(message?.content || ""),
        };
        if (message?.name)
            payload.name = String(message.name);
        if (message?.toolCallId)
            payload.tool_call_id = String(message.toolCallId);
        return payload;
    });
}
async function generateViaLocalProviders(request) {
    const providerOrder = (() => {
        const primary = getPreferredProvider();
        return primary === "anthropic" ? ["anthropic", "openai"] : ["openai", "anthropic"];
    })();
    const messages = toProviderMessages(request.messages);
    const tools = toModelTools(request.tools);
    let lastError;
    for (const provider of providerOrder) {
        const apiKey = providerApiKey(provider);
        if (!apiKey)
            continue;
        const model = request.model || providerModelName(provider);
        const commonOptions = {
            model,
            messages,
            tools: tools.length > 0 ? tools : undefined,
            maxTokens: request.maxTokens || undefined,
            temperature: request.temperature || undefined,
            timeoutMs: Number(process.env.MAPLE_FIREWALL_CHAT_TIMEOUT_MS || 15000),
        };
        try {
            const result = provider === "anthropic"
                ? await generateAnthropic(apiKey, commonOptions)
                : await generateOpenAI(apiKey, commonOptions);
            const toolCalls = (result.toolCalls ?? []).map((toolCall) => ({
                id: toolCall.id || randomUUID(),
                name: toolCall.function?.name || "",
                argumentsJson: Buffer.from(String(toolCall.function?.arguments || "{}")),
            }));
            return {
                message: {
                    role: "CHAT_ROLE_ASSISTANT",
                    content: result.content || "",
                },
                toolCalls,
                model: result.model || model,
            };
        }
        catch (err) {
            lastError = err;
            mapleLog("warn", "context_wall.local_model_provider_failed", {
                provider,
                model,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }
    const reason = lastError instanceof Error ? lastError.message : "No model providers available.";
    throw new Error(`Local provider routing failed: ${reason}`);
}
async function generateChatModelResponse(request) {
    // model-router has been retired; always use local provider routing.
    return generateViaLocalProviders(request);
}
export function closeContextWallClients() {
    mcpProxyPool?.close();
    auditWriterPool?.close();
}
function emitAuditEvent(opts) {
    try {
        auditWriterBreaker.execute(() => grpcUnary(getAuditWriter(), "appendEvent", {
            event: {
                eventId: randomUUID(),
                eventType: opts.eventType,
                timestamp: new Date().toISOString(),
                sourceService: "context-wall",
                context: { traceId: opts.traceId ?? "" },
                payloadJson: Buffer.from(JSON.stringify(opts.payload ?? {})),
                severity: opts.severity ?? "RISK_SEVERITY_LOW",
                summary: opts.summary,
            },
        })).catch(() => {});
    }
    catch {
        // fire-and-forget
    }
}
function toProtoPolicyDecision(decision) {
    const protoAction = decision.shouldBlock
        ? "FIREWALL_ACTION_DENY"
        : decision.action === "log_only"
            ? "FIREWALL_ACTION_LOG_ONLY"
            : "FIREWALL_ACTION_ALLOW";
    return {
        action: protoAction,
        ruleName: decision.rule || "",
        severity: `RISK_SEVERITY_${decision.severity.toUpperCase()}`,
        message: decision.message,
        recommendation: decision.recommendation,
        redactedPatterns: decision.redactedPatterns ?? [],
        evaluatedAt: decision.evaluatedAt,
    };
}
function toProtoPolicyRule(rule) {
    const action = rule?.action === "deny"
        ? "FIREWALL_ACTION_DENY"
        : rule?.action === "log_only"
            ? "FIREWALL_ACTION_LOG_ONLY"
            : "FIREWALL_ACTION_ALLOW";
    const severity = `RISK_SEVERITY_${String(rule?.severity || "LOW").toUpperCase()}`;
    const match = rule?.match && typeof rule.match === "object" ? rule.match : {};
    return {
        name: String(rule?.name || ""),
        action,
        severity,
        message: String(rule?.message || ""),
        recommendation: String(rule?.recommendation || ""),
        stepTypes: Array.isArray(match.stepTypes)
            ? match.stepTypes.map((value) => String(value))
            : [],
        toolGlob: String(match.toolGlob || ""),
        anyValueRegex: match.anyValueRegex && typeof match.anyValueRegex === "object" && "source" in match.anyValueRegex
            ? String(match.anyValueRegex.source)
            : "",
        secrets: Boolean(match.secrets),
        payloadBytesExceeds: Number(match.payloadBytesExceeds || 0),
    };
}
function parseJsonBytes(rawValue, fallback) {
    const rawText = bytesToUtf8String(rawValue, "").trim();
    if (!rawText) {
        return fallback;
    }
    try {
        return JSON.parse(rawText);
    }
    catch {
        return fallback;
    }
}
function traceFromProto(protoTrace) {
    return {
        id: protoTrace.id || "",
        sessionId: protoTrace.sessionId || "",
        source: protoTrace.source || "manual",
        status: protoTrace.status === "TRACE_STATUS_ACTIVE" ? "active" : protoTrace.status === "TRACE_STATUS_COMPLETED" ? "completed" : protoTrace.status === "TRACE_STATUS_QUARANTINED" ? "quarantined" : "active",
        startedAt: protoTrace.startedAt || new Date().toISOString(),
        updatedAt: protoTrace.updatedAt || new Date().toISOString(),
        ownerKeyFingerprint: protoTrace.ownerKeyFingerprint,
        parentTraceId: protoTrace.parentTraceId,
        tags: protoTrace.tags || [],
        metadata: parseJsonBytes(protoTrace.metadataJson, {}),
        steps: (protoTrace.steps || []).map((s) => ({
            index: s.index || 0,
            timestamp: s.timestamp || new Date().toISOString(),
            actor: s.actor === "STEP_ACTOR_AGENT" ? "agent" : s.actor === "STEP_ACTOR_TOOL" ? "tool" : s.actor === "STEP_ACTOR_SYSTEM" ? "system" : s.actor === "STEP_ACTOR_USER" ? "user" : "agent",
            type: s.type === "STEP_TYPE_TOOL_CALL" ? "tool_call" : s.type === "STEP_TYPE_SHELL" ? "shell" : s.type === "STEP_TYPE_BROWSER" ? "browser" : s.type === "STEP_TYPE_NETWORK" ? "network" : s.type === "STEP_TYPE_EMAIL" ? "email" : s.type === "STEP_TYPE_SYSTEM" ? "system" : "prompt",
            prompt: s.prompt,
            output: s.output,
            command: s.command,
            externalUrl: s.externalUrl,
            toolCall: s.toolCall ? { name: s.toolCall.name, input: parseJsonBytes(s.toolCall.inputJson, undefined), output: parseJsonBytes(s.toolCall.outputJson, undefined) } : undefined,
            metadata: parseJsonBytes(s.metadataJson, undefined),
            riskScore: s.riskScore || 0,
            riskFlags: (s.riskFlags || []).map((f) => ({ id: f.id, type: f.type, severity: f.severity?.toLowerCase()?.replace("risk_severity_", "") || "low", stepIndex: f.stepIndex, message: f.message, recommendation: f.recommendation, evidence: f.evidence })),
            guardStatus: s.guardStatus === "GUARD_ACTION_ALLOW" ? "allow" : s.guardStatus === "GUARD_ACTION_BLOCK" ? "block" : "pending",
        })),
    };
}
function stepFromProto(protoStep) {
    return {
        index: protoStep.index || 0,
        timestamp: protoStep.timestamp || new Date().toISOString(),
        actor: protoStep.actor === "STEP_ACTOR_AGENT" ? "agent" : protoStep.actor === "STEP_ACTOR_TOOL" ? "tool" : protoStep.actor === "STEP_ACTOR_SYSTEM" ? "system" : protoStep.actor === "STEP_ACTOR_USER" ? "user" : "agent",
        type: protoStep.type === "STEP_TYPE_TOOL_CALL" ? "tool_call" : protoStep.type === "STEP_TYPE_SHELL" ? "shell" : "prompt",
        prompt: protoStep.prompt,
        output: protoStep.output,
        command: protoStep.command,
        externalUrl: protoStep.externalUrl,
        toolCall: protoStep.toolCall ? { name: protoStep.toolCall.name } : undefined,
        metadata: parseJsonBytes(protoStep.metadataJson, undefined),
        riskScore: protoStep.riskScore || 0,
        riskFlags: protoStep.riskFlags || [],
        guardStatus: protoStep.guardStatus === "GUARD_ACTION_ALLOW" ? "allow" : protoStep.guardStatus === "GUARD_ACTION_BLOCK" ? "block" : "pending",
    };
}
function toProtoStep(step) {
    const actor = String(step?.actor || "agent");
    const type = String(step?.type || "prompt");
    const guardStatus = String(step?.guardStatus || "pending");
    return {
        index: Number(step?.index || 0),
        timestamp: String(step?.timestamp || new Date().toISOString()),
        actor: actor === "tool"
            ? "STEP_ACTOR_TOOL"
            : actor === "system"
                ? "STEP_ACTOR_SYSTEM"
                : actor === "user"
                    ? "STEP_ACTOR_USER"
                    : "STEP_ACTOR_AGENT",
        type: type === "tool_call"
            ? "STEP_TYPE_TOOL_CALL"
            : type === "shell"
                ? "STEP_TYPE_SHELL"
                : type === "browser"
                    ? "STEP_TYPE_BROWSER"
                    : type === "network"
                        ? "STEP_TYPE_NETWORK"
                        : type === "email"
                            ? "STEP_TYPE_EMAIL"
                            : type === "system"
                                ? "STEP_TYPE_SYSTEM"
                                : "STEP_TYPE_PROMPT",
        prompt: String(step?.prompt || ""),
        output: String(step?.output || ""),
        command: String(step?.command || ""),
        externalUrl: String(step?.externalUrl || ""),
        toolCall: step?.toolCall?.name ? { name: String(step.toolCall.name) } : undefined,
        riskScore: Number(step?.riskScore || 0),
        riskFlags: [],
        guardStatus: guardStatus === "allow"
            ? "GUARD_ACTION_ALLOW"
            : guardStatus === "block"
                ? "GUARD_ACTION_BLOCK"
                : "GUARD_ACTION_PENDING",
    };
}
function toModelRole(role) {
    const normalized = String(role || "user").trim().toLowerCase();
    if (normalized === "system")
        return "CHAT_ROLE_SYSTEM";
    if (normalized === "assistant")
        return "CHAT_ROLE_ASSISTANT";
    if (normalized === "tool")
        return "CHAT_ROLE_TOOL";
    return "CHAT_ROLE_USER";
}
function bytesToUtf8String(raw, fallback = "{}") {
    if (typeof raw === "string")
        return raw;
    if (Buffer.isBuffer(raw))
        return raw.toString("utf-8");
    if (raw === null || raw === undefined)
        return fallback;
    return String(raw);
}
function parseJsonObject(raw, fallback) {
    try {
        const parsed = JSON.parse(bytesToUtf8String(raw));
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return { ok: false };
        }
        return { ok: true, value: parsed };
    }
    catch {
        return { ok: false };
    }
}
function parseJsonValue(raw, fallback) {
    try {
        return JSON.parse(bytesToUtf8String(raw));
    }
    catch {
        return fallback;
    }
}
function deriveScopeFromArguments(args) {
    const candidateUrl = typeof args.url === "string" ? args.url
        : typeof args.targetUrl === "string" ? args.targetUrl
            : typeof args.endpoint === "string" ? args.endpoint
                : undefined;
    if (!candidateUrl)
        return undefined;
    try {
        const hostname = new URL(candidateUrl).hostname;
        if (!hostname)
            return undefined;
        return {
            allowedDomains: [hostname],
            maxBytes: 500_000,
            allowFileDownload: false,
        };
    }
    catch {
        return undefined;
    }
}
function normalizeRequestContext(raw) {
    return {
        requestId: String(raw?.requestId || ""),
        sessionId: String(raw?.sessionId || ""),
        traceId: String(raw?.traceId || ""),
        userId: String(raw?.userId || ""),
        keyFingerprint: String(raw?.keyFingerprint || ""),
        sourceService: String(raw?.sourceService || ""),
        tenantId: String(raw?.tenantId || ""),
        deviceId: String(raw?.deviceId || ""),
    };
}
function withContextMetadata(step, context) {
    return {
        ...step,
        metadata: {
            ...(step.metadata && typeof step.metadata === "object" ? step.metadata : {}),
            requestId: context.requestId,
            sessionId: context.sessionId,
            traceId: context.traceId,
            tenantId: context.tenantId,
            userId: context.userId,
            deviceId: context.deviceId,
            keyFingerprint: context.keyFingerprint,
            sourceService: context.sourceService || "context-wall",
        },
    };
}
function stepSessionId(step) {
    return step?.metadata && typeof step.metadata === "object"
        ? String(step.metadata.sessionId || "")
        : "";
}
const ORCHESTRATION_TOOLS_CACHE_TTL_MS = 30_000;
let orchestrationToolsCache = null;
function normalizeToolSchemaBytes(raw) {
    if (!raw) {
        return Buffer.from("{}");
    }
    try {
        const json = typeof raw === "string" ? raw : Buffer.from(raw).toString("utf-8");
        const parsed = JSON.parse(json);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return Buffer.from("{}");
        }
        return Buffer.from(JSON.stringify(parsed));
    }
    catch {
        return Buffer.from("{}");
    }
}
async function loadOrchestrationToolsFromMcpProxy() {
    if (orchestrationToolsCache && orchestrationToolsCache.expiresAt > Date.now()) {
        return orchestrationToolsCache.tools;
    }
    const response = await mcpProxyBreaker.execute(() => grpcUnary(getMcpProxy(), "listTools", { appId: "" }));
    const rawTools = Array.isArray(response?.tools) ? response.tools : [];
    const seenNames = new Set();
    const tools = [];
    for (const rawTool of rawTools) {
        const name = String(rawTool?.name || "").trim();
        const appId = String(rawTool?.appId || "").trim();
        if (!name || !appId || seenNames.has(name)) {
            continue;
        }
        seenNames.add(name);
        tools.push({
            name,
            description: String(rawTool?.description || ""),
            inputSchemaJson: normalizeToolSchemaBytes(rawTool?.inputSchemaJson),
            appId,
        });
    }
    orchestrationToolsCache = {
        expiresAt: Date.now() + ORCHESTRATION_TOOLS_CACHE_TTL_MS,
        tools,
    };
    return tools;
}
export function createContextWallService(approvalQueue, policyStore) {
    const getExternalRules = () => policyStore?.getExternalRules();
    const server = createGrpcServer();
    const executeToolWithPolicyInternal = async (request) => {
        const normalizedContext = normalizeRequestContext(request.context);
        const appId = String(request.appId || "");
        const targetUrl = String(request.targetUrl || "");
        const toolName = String(request.toolName || "");
        const traceId = String(request.traceId || normalizedContext.traceId || "unknown");
        const sessionId = String(request.sessionId || normalizedContext.sessionId || "");
        const requestedStepIndex = Number(request.stepIndex);
        const approvalStepIndex = Number.isFinite(requestedStepIndex)
            ? Math.max(0, Math.trunc(requestedStepIndex))
            : Math.trunc(Date.now() % 2_147_483_647);
        const parsedArgsResult = parseJsonObject(request.argumentsJson, {});
        if (!parsedArgsResult.ok) {
            throw new Error("argumentsJson must be valid JSON");
        }
        const parsedArgs = parsedArgsResult.value;
        const toolCallId = String(request.toolCallId ||
            `${traceId || "trace"}.${approvalStepIndex}.${appId}.${toolName}`);
        const candidateStep = withContextMetadata({
            index: approvalStepIndex,
            timestamp: new Date().toISOString(),
            actor: "agent",
            type: "tool_call",
            toolCall: { name: `${appId}.${toolName}`, input: parsedArgs },
            output: JSON.stringify(parsedArgs),
            metadata: {
                targetUrl,
                appId,
            },
            riskScore: 0,
            riskFlags: [],
            guardStatus: "pending",
        }, normalizedContext);
        const decision = evaluateFirewallStep(candidateStep, getExternalRules());
        let effectiveDecision = decision;
        if (decision.shouldBlock) {
            approvalQueue.enqueue(traceId, approvalStepIndex, candidateStep);
            emitAuditEvent({
                eventType: "AUDIT_EVENT_TYPE_HITL_REQUESTED",
                summary: `HITL requested for ${appId}.${toolName}`,
                severity: `RISK_SEVERITY_${decision.severity.toUpperCase()}`,
                traceId,
                payload: {
                    appId,
                    toolName,
                    targetUrl,
                    reason: decision.message,
                    sessionId,
                    stepIndex: approvalStepIndex,
                },
            });
            const approval = await approvalQueue.waitForResolution(traceId, approvalStepIndex, config.hitlApprovalTimeoutMs);
            if (!approval) {
                emitAuditEvent({
                    eventType: "AUDIT_EVENT_TYPE_HITL_TIMEOUT",
                    summary: `HITL timed out for ${appId}.${toolName}`,
                    severity: "RISK_SEVERITY_HIGH",
                    traceId,
                    payload: {
                        appId,
                        toolName,
                        targetUrl,
                        reason: decision.message,
                        sessionId,
                        stepIndex: approvalStepIndex,
                        timeoutMs: config.hitlApprovalTimeoutMs,
                    },
                });
                return {
                    allowed: false,
                    blockedReason: `Approval timed out for ${appId}.${toolName}.`,
                    decision: toProtoPolicyDecision(decision),
                    success: false,
                    resultJson: Buffer.from(JSON.stringify({ error: `Approval timed out for ${appId}.${toolName}.` })),
                    errorMessage: `Approval timed out for ${appId}.${toolName}.`,
                    durationMs: 0,
                    appId,
                    toolName,
                };
            }
            if (approval.action !== "allow") {
                const denyReason = approval.reason || decision.message || "Rejected by approver";
                emitAuditEvent({
                    eventType: "AUDIT_EVENT_TYPE_HITL_REJECTED",
                    summary: `HITL rejected ${appId}.${toolName}`,
                    severity: "RISK_SEVERITY_HIGH",
                    traceId,
                    payload: {
                        appId,
                        toolName,
                        targetUrl,
                        reason: denyReason,
                        approverId: approval.approverId,
                        sessionId,
                        stepIndex: approvalStepIndex,
                    },
                });
                return {
                    allowed: false,
                    blockedReason: denyReason,
                    decision: toProtoPolicyDecision(decision),
                    success: false,
                    resultJson: Buffer.from(JSON.stringify({ error: denyReason })),
                    errorMessage: denyReason,
                    durationMs: 0,
                    appId,
                    toolName,
                };
            }
            effectiveDecision = {
                ...decision,
                action: "allow",
                shouldBlock: false,
                message: approval.reason || `Approved by ${approval.approverId || "human reviewer"}`,
            };
            emitAuditEvent({
                eventType: "AUDIT_EVENT_TYPE_HITL_APPROVED",
                summary: `HITL approved ${appId}.${toolName}`,
                traceId,
                payload: {
                    appId,
                    toolName,
                    targetUrl,
                    approverId: approval.approverId,
                    reason: approval.reason,
                    sessionId,
                    stepIndex: approvalStepIndex,
                },
            });
        }
        const requestedScope = request.scope;
        const derivedScope = deriveScopeFromArguments(parsedArgs);
        const mergedScope = requestedScope ?? derivedScope;
        const response = await mcpProxyBreaker.execute(() => grpcUnary(getMcpProxy(), "executeTool", {
            context: normalizedContext,
            appId,
            toolName,
            argumentsJson: Buffer.from(JSON.stringify(parsedArgs)),
            sessionId: request.sessionId || "",
            traceId: request.traceId || "",
            targetUrl,
            toolCallId,
            scope: mergedScope ? {
                allowedDomains: mergedScope.allowedDomains ?? [],
                maxBytes: mergedScope.maxBytes ?? 0,
                allowFileDownload: Boolean(mergedScope.allowFileDownload),
            } : undefined,
        }));
        emitAuditEvent({
            eventType: response?.success ? "AUDIT_EVENT_TYPE_TOOL_COMPLETED" : "AUDIT_EVENT_TYPE_TOOL_FAILED",
            summary: `Tool ${appId}.${toolName} executed via context-wall`,
            traceId: request.traceId || request.context?.traceId,
            payload: {
                appId,
                toolName,
                targetUrl,
                success: Boolean(response?.success),
                durationMs: response?.durationMs ?? 0,
            },
        });
        return {
            allowed: true,
            blockedReason: "",
            decision: toProtoPolicyDecision(effectiveDecision),
            success: Boolean(response?.success),
            resultJson: response?.resultJson ?? Buffer.from("{}"),
            errorMessage: response?.errorMessage ?? "",
            durationMs: response?.durationMs ?? 0,
            appId: response?.appId ?? appId,
            toolName: response?.toolName ?? toolName,
        };
    };
    const serviceImpl = {
        EvaluateStep(call, callback) {
            try {
                const context = normalizeRequestContext(call.request.context);
                const step = withContextMetadata(stepFromProto(call.request.step), context);
                const decision = evaluateFirewallStep(step, getExternalRules());
                mapleLog("debug", "context_wall_evaluate_step", { stepIndex: step.index, action: decision.action });
                if (decision.action === "deny") {
                    approvalQueue.enqueue(context.traceId || "unknown", step.index, step);
                }
                callback(null, {
                    decision: toProtoPolicyDecision(decision),
                    processedStep: call.request.step,
                });
            }
            catch (err) {
                mapleLog("error", "context_wall_evaluate_step_failed", { error: err.message });
                callback({ code: grpc.status.INTERNAL, message: err.message });
            }
        },
        EvaluateTrace(call, callback) {
            try {
                const trace = traceFromProto(call.request.trace);
                const summary = enforceTraceFirewall(trace, getExternalRules());
                mapleLog("debug", "context_wall_evaluate_trace", { traceId: trace.id, blocked: summary.blockedSteps });
                callback(null, {
                    summary: {
                        enabled: summary.enabled,
                        blockedSteps: summary.blockedSteps,
                        redactedSteps: summary.redactedSteps,
                        ruleHits: summary.ruleHits,
                        defaultAction: `FIREWALL_ACTION_${summary.defaultAction.toUpperCase()}`,
                        enforcedAt: summary.enforcedAt,
                    },
                    processedTrace: call.request.trace,
                });
            }
            catch (err) {
                callback({ code: grpc.status.INTERNAL, message: err.message });
            }
        },
        GetPolicyDecision(call, callback) {
            try {
                const context = normalizeRequestContext(call.request.context);
                const action = String(call.request.action || "").trim().toLowerCase();
                const toolName = String(call.request.toolName || "").trim();
                const tenantId = String(call.request.tenantId || context.tenantId || "").trim();
                const userId = String(call.request.userId || context.userId || "").trim();
                const deviceId = String(call.request.deviceId || context.deviceId || "").trim();
                const syntheticStep = withContextMetadata({
                    index: 0,
                    timestamp: new Date().toISOString(),
                    actor: "agent",
                    type: action === "tool_call"
                        ? "tool_call"
                        : action === "network"
                            ? "network"
                            : action === "shell"
                                ? "shell"
                                : "prompt",
                    toolCall: toolName ? { name: toolName } : undefined,
                    metadata: { tenantId, userId, deviceId },
                    riskScore: 0,
                    riskFlags: [],
                    guardStatus: "pending",
                }, {
                    ...context,
                    tenantId,
                    userId,
                    deviceId,
                });
                const decision = evaluateFirewallStep(syntheticStep, getExternalRules());
                mapleLog("debug", "context_wall_get_policy_decision", {
                    tenantId,
                    userId,
                    deviceId,
                    action: decision.action,
                    rule: decision.rule,
                });
                callback(null, { decision: toProtoPolicyDecision(decision) });
            }
            catch (err) {
                mapleLog("error", "context_wall_get_policy_decision_failed", { error: err.message });
                callback({ code: grpc.status.INTERNAL, message: err.message });
            }
        },
        ListPolicyRules(call, callback) {
            try {
                const rules = policyStore?.getExternalRules() ?? [];
                emitAuditEvent({
                    eventType: "AUDIT_EVENT_TYPE_POLICY_EVALUATED",
                    summary: `Listed ${rules.length} external policy rules`,
                    traceId: "",
                    payload: { ruleCount: rules.length },
                });
                callback(null, {
                    rules: rules.map((rule) => toProtoPolicyRule(rule)),
                    ruleCount: rules.length,
                });
            }
            catch (err) {
                mapleLog("error", "context_wall_list_policy_rules_failed", { error: err.message });
                callback({ code: grpc.status.INTERNAL, message: err.message });
            }
        },
        SubmitApproval(call, callback) {
            try {
                const { traceId, stepIndex, action, reason, approverId } = call.request;
                const guardAction = action === "GUARD_ACTION_ALLOW" ? "allow" : action === "GUARD_ACTION_BLOCK" ? "block" : "pending";
                const result = approvalQueue.resolve(traceId, stepIndex, guardAction, reason || "", approverId || "");
                if (result) {
                    emitAuditEvent({
                        eventType: guardAction === "allow" ? "AUDIT_EVENT_TYPE_HITL_APPROVED" : "AUDIT_EVENT_TYPE_HITL_REJECTED",
                        summary: `HITL decision recorded for ${traceId}:${stepIndex}`,
                        traceId,
                        payload: {
                            stepIndex,
                            action: guardAction,
                            reason: reason || "",
                            approverId: approverId || "",
                        },
                    });
                }
                callback(null, {
                    accepted: result !== null,
                    traceId,
                    stepIndex,
                    resultingAction: action,
                });
            }
            catch (err) {
                callback({ code: grpc.status.INTERNAL, message: err.message });
            }
        },
        WatchApprovalQueue(call) {
            const requestedSessionId = String(call.request?.sessionId || "");
            const unwatch = approvalQueue.watch((event) => {
                if (requestedSessionId && stepSessionId(event.step) !== requestedSessionId) {
                    return;
                }
                const decision = evaluateFirewallStep(event.step, getExternalRules());
                try {
                    call.write({
                        traceId: event.traceId,
                        stepIndex: event.stepIndex,
                        step: toProtoStep(event.step),
                        pendingDecision: toProtoPolicyDecision(decision),
                        requestedAt: event.requestedAt,
                    });
                } catch {
                    unwatch();
                }
            });
            call.on("cancelled", unwatch);
            call.on("close", unwatch);
            call.on("error", unwatch);
        },
        ListPendingApprovals(call, callback) {
            try {
                const requestedSessionId = String(call.request?.sessionId || "");
                const pending = approvalQueue.getPending();
                callback(null, {
                    approvals: pending
                        .filter((event) => !requestedSessionId || stepSessionId(event.step) === requestedSessionId)
                        .map((event) => ({
                        traceId: event.traceId,
                        stepIndex: event.stepIndex,
                        step: toProtoStep(event.step),
                        pendingDecision: toProtoPolicyDecision(evaluateFirewallStep(event.step, getExternalRules())),
                        requestedAt: event.requestedAt,
                    })),
                });
            }
            catch (err) {
                callback({ code: grpc.status.INTERNAL, message: err.message });
            }
        },
        AuditTrace(call, callback) {
            try {
                const trace = traceFromProto(call.request.trace);
                const report = analyzeTraceRisks(trace.steps, {
                    embeddingThreshold: call.request.embeddingThreshold || 0.58,
                });
                const auditedTrace = applyAuditToTrace(trace, report);
                mapleLog("debug", "context_wall_audit_trace", { traceId: trace.id, score: report.overallRiskScore });
                callback(null, {
                    report: {
                        overallRiskScore: report.overallRiskScore,
                        severity: `RISK_SEVERITY_${report.severity.toUpperCase()}`,
                        summary: report.summary,
                        recommendations: report.recommendations,
                        flags: report.flags.map((f) => ({
                            id: f.id, type: f.type,
                            severity: `RISK_SEVERITY_${f.severity.toUpperCase()}`,
                            stepIndex: f.stepIndex, message: f.message,
                            recommendation: f.recommendation, evidence: f.evidence,
                        })),
                        breakdown: report.breakdown,
                    },
                    auditedTrace: call.request.trace,
                });
            }
            catch (err) {
                callback({ code: grpc.status.INTERNAL, message: err.message });
            }
        },
        SanitizePrompt(call, callback) {
            try {
                const prompt = call.request.prompt || "";
                const context = normalizeRequestContext(call.request.context);
                // Run prompt injection detection
                const injectionResult = detectPromptInjection(prompt);
                if (injectionResult.isInjection && injectionResult.confidence >= 0.7) {
                    emitAuditEvent({
                        eventType: "AUDIT_EVENT_TYPE_POLICY_DENIED",
                        summary: `Prompt injection blocked (confidence ${(injectionResult.confidence * 100).toFixed(0)}%)`,
                        severity: "RISK_SEVERITY_CRITICAL",
                        payload: { patterns: injectionResult.matches.map(m => m.pattern), confidence: injectionResult.confidence },
                    });
                    callback(null, {
                        sanitizedPrompt: "",
                        redactedPatterns: injectionResult.matches.map(m => m.pattern),
                        hadSecrets: false,
                        blocked: true,
                        blockedReason: `Prompt injection detected (confidence ${(injectionResult.confidence * 100).toFixed(0)}%)`,
                        injectionPatterns: injectionResult.matches.map(m => m.pattern),
                    });
                    return;
                }
                const syntheticStep = withContextMetadata({
                    index: 0,
                    timestamp: new Date().toISOString(),
                    actor: "agent",
                    type: "prompt",
                    prompt,
                    riskScore: 0,
                    riskFlags: [],
                    guardStatus: "pending",
                }, context);
                const decision = evaluateFirewallStep(syntheticStep, getExternalRules());
                let sanitizedPrompt = decision.step?.prompt ?? prompt;
                const allRedactedPatterns = [...(decision.redactedPatterns ?? [])];
                // Run PII scan on the sanitized prompt text
                const piiFindings = scanForPII(sanitizedPrompt);
                if (piiFindings.length > 0) {
                    sanitizedPrompt = redactPII(sanitizedPrompt, piiFindings);
                    for (const f of piiFindings) {
                        allRedactedPatterns.push(`pii:${f.pattern}`);
                    }
                }
                mapleLog("debug", "context_wall_sanitize_prompt", { hadSecrets: allRedactedPatterns.length > 0, piiFindings: piiFindings.length });
                callback(null, {
                    sanitizedPrompt,
                    redactedPatterns: allRedactedPatterns,
                    hadSecrets: allRedactedPatterns.length > 0,
                    blocked: false,
                    blockedReason: "",
                    injectionPatterns: injectionResult.matches.map(m => m.pattern),
                });
            }
            catch (err) {
                mapleLog("error", "context_wall_sanitize_prompt_failed", { error: err.message });
                callback({ code: grpc.status.INTERNAL, message: err.message });
            }
        },
        GetAllowedTools(call, callback) {
            try {
                const context = normalizeRequestContext(call.request.context);
                const toolNames = call.request.toolNames || [];
                const allowed = [];
                const denied = [];
                for (const toolName of toolNames) {
                    const syntheticStep = withContextMetadata({
                        index: 0,
                        timestamp: new Date().toISOString(),
                        actor: "tool",
                        type: "tool_call",
                        toolCall: { name: toolName },
                        riskScore: 0,
                        riskFlags: [],
                        guardStatus: "pending",
                    }, context);
                    const decision = evaluateFirewallStep(syntheticStep, getExternalRules());
                    if (decision.shouldBlock) {
                        denied.push(toolName);
                    }
                    else {
                        allowed.push(toolName);
                    }
                }
                mapleLog("debug", "context_wall_get_allowed_tools", { total: toolNames.length, allowed: allowed.length, denied: denied.length });
                callback(null, { allowedTools: allowed, deniedTools: denied });
            }
            catch (err) {
                mapleLog("error", "context_wall_get_allowed_tools_failed", { error: err.message });
                callback({ code: grpc.status.INTERNAL, message: err.message });
            }
        },
        async OrchestrateChat(call, callback) {
            try {
                const requestContext = normalizeRequestContext(call.request.context);
                const turns = Array.isArray(call.request.messages) ? call.request.messages : [];
                const latestUserTurnIndex = turns.map((t) => String(t.role || "").toLowerCase()).lastIndexOf("user");
                const latestPrompt = latestUserTurnIndex >= 0
                    ? String(turns[latestUserTurnIndex]?.content ?? "")
                    : String(turns[turns.length - 1]?.content ?? "");
                const candidateStep = withContextMetadata({
                    index: 0,
                    timestamp: new Date().toISOString(),
                    actor: "agent",
                    type: "prompt",
                    prompt: latestPrompt,
                    riskScore: 0,
                    riskFlags: [],
                    guardStatus: "pending",
                }, requestContext);
                const decision = evaluateFirewallStep(candidateStep, getExternalRules());
                if (decision.shouldBlock) {
                    emitAuditEvent({
                        eventType: "AUDIT_EVENT_TYPE_POLICY_DENIED",
                        summary: `Blocked chat prompt: ${decision.message}`,
                        severity: `RISK_SEVERITY_${decision.severity.toUpperCase()}`,
                        traceId: requestContext.traceId,
                        payload: { action: decision.action, rule: decision.rule },
                    });
                    callback(null, {
                        allowed: false,
                        blockedReason: decision.message,
                        reply: "",
                        model: "",
                        redactedPatterns: decision.redactedPatterns ?? [],
                    });
                    return;
                }
                const requestTools = Array.isArray(call.request.tools) ? call.request.tools : [];
                let rawTools = requestTools;
                let toolDiscoveryError = "";
                if (rawTools.length === 0) {
                    try {
                        rawTools = await loadOrchestrationToolsFromMcpProxy();
                    }
                    catch (err) {
                        mapleLog("warn", "context_wall_load_orchestration_tools_failed", { error: err.message });
                        toolDiscoveryError = err.message || "tool discovery failed";
                    }
                }
                if (toolDiscoveryError) {
                    emitAuditEvent({
                        eventType: "AUDIT_EVENT_TYPE_TOOL_FAILED",
                        summary: "Chat orchestration aborted: tool discovery unavailable",
                        severity: "RISK_SEVERITY_HIGH",
                        traceId: requestContext.traceId,
                        payload: {
                            reason: toolDiscoveryError,
                        },
                    });
                    callback(null, {
                        allowed: false,
                        blockedReason: "Tool discovery unavailable; refusing orchestration without policy-plane tool schemas.",
                        reply: "",
                        model: "",
                        redactedPatterns: decision.redactedPatterns ?? [],
                    });
                    return;
                }
                const modelTools = rawTools
                    .map((tool) => ({
                    name: String(tool.name || ""),
                    description: String(tool.description || ""),
                    parametersJson: Buffer.from(bytesToUtf8String(tool.inputSchemaJson, "{}")),
                }))
                    .filter((tool) => tool.name.length > 0);
                const toolByName = new Map();
                for (const tool of rawTools) {
                    const name = String(tool?.name || "");
                    if (name.length > 0)
                        toolByName.set(name, tool);
                }
                const initialModelMessages = turns.map((t, idx) => {
                    const content = idx === latestUserTurnIndex
                        ? (decision.step?.prompt ?? String(t.content ?? ""))
                        : String(t.content ?? "");
                    return {
                        role: toModelRole(String(t.role ?? "user")),
                        content,
                    };
                });
                let modelMessages = initialModelMessages;
                let reply = "";
                let model = "";
                let toolCallCount = 0;
                const maxToolRounds = 4;
                for (let round = 0; round <= maxToolRounds; round += 1) {
                    const response = await generateChatModelResponse({
                        context: requestContext,
                        messages: modelMessages,
                        tools: modelTools,
                        model: call.request.model || "",
                        temperature: call.request.temperature || 0,
                        maxTokens: call.request.maxTokens || 0,
                        systemPrompt: call.request.systemPrompt || "",
                    });
                    reply = response?.message?.content ?? "";
                    model = response?.model ?? model;
                    const toolCalls = Array.isArray(response?.toolCalls) ? response.toolCalls : [];
                    if (toolCalls.length === 0) {
                        break;
                    }
                    toolCallCount += toolCalls.length;
                    modelMessages = [
                        ...modelMessages,
                        {
                            role: "CHAT_ROLE_ASSISTANT",
                            content: reply,
                        },
                    ];
                    for (const toolCall of toolCalls) {
                        const toolName = String(toolCall?.name || "");
                        const toolId = String(toolCall?.id || randomUUID());
                        const argsResult = parseJsonObject(toolCall?.argumentsJson, {});
                        const appId = String(toolByName.get(toolName)?.appId || "");
                        if (!appId) {
                            const toolError = { error: `Tool ${toolName} is not mapped to an app_id.` };
                            modelMessages.push({
                                role: "CHAT_ROLE_TOOL",
                                name: toolName,
                                toolCallId: toolId,
                                content: JSON.stringify(toolError),
                            });
                            emitAuditEvent({
                                eventType: "AUDIT_EVENT_TYPE_POLICY_DENIED",
                                summary: `Tool ${toolName} missing app mapping`,
                                severity: "RISK_SEVERITY_MEDIUM",
                                traceId: requestContext.traceId,
                                payload: { toolName, toolCallId: toolId },
                            });
                            continue;
                        }
                        const executeResult = await executeToolWithPolicyInternal({
                            context: requestContext,
                            appId,
                            targetUrl: "",
                            toolName,
                            toolCallId: toolId,
                            argumentsJson: toolCall?.argumentsJson ?? Buffer.from("{}"),
                            sessionId: requestContext.sessionId,
                            traceId: requestContext.traceId,
                            scope: argsResult.ok ? deriveScopeFromArguments(argsResult.value) : undefined,
                        });
                        let toolPayload = {};
                        if (!executeResult.allowed) {
                            toolPayload = { error: executeResult.blockedReason || "Tool blocked by policy." };
                        }
                        else if (!executeResult.success) {
                            toolPayload = { error: executeResult.errorMessage || "Tool execution failed." };
                        }
                        else {
                            toolPayload = parseJsonValue(executeResult.resultJson, {});
                        }
                        modelMessages.push({
                            role: "CHAT_ROLE_TOOL",
                            name: toolName,
                            toolCallId: toolId,
                            content: JSON.stringify(toolPayload),
                        });
                    }
                }
                emitAuditEvent({
                    eventType: "AUDIT_EVENT_TYPE_POLICY_EVALUATED",
                    summary: `Chat orchestrated via context-wall (${reply.length} chars).`,
                    traceId: requestContext.traceId,
                    payload: {
                        promptRedactions: decision.redactedPatterns ?? [],
                        model,
                        toolCalls: toolCallCount,
                    },
                });
                callback(null, {
                    allowed: true,
                    blockedReason: "",
                    reply,
                    model,
                    redactedPatterns: decision.redactedPatterns ?? [],
                });
            }
            catch (err) {
                mapleLog("error", "context_wall_orchestrate_chat_failed", { error: err.message });
                callback({ code: grpc.status.INTERNAL, message: err.message });
            }
        },
        async ExecuteToolWithPolicy(call, callback) {
            try {
                const parsedArgs = parseJsonObject(call.request.argumentsJson, {});
                if (!parsedArgs.ok) {
                    callback({ code: grpc.status.INVALID_ARGUMENT, message: "argumentsJson must be valid JSON" });
                    return;
                }
                const response = await executeToolWithPolicyInternal({
                    context: normalizeRequestContext(call.request.context),
                    appId: call.request.appId || "",
                    targetUrl: call.request.targetUrl || "",
                    toolName: call.request.toolName || "",
                    argumentsJson: call.request.argumentsJson,
                    sessionId: call.request.sessionId || "",
                    traceId: call.request.traceId || "",
                    scope: call.request.scope ?? deriveScopeFromArguments(parsedArgs.value),
                });
                callback(null, response);
            }
            catch (err) {
                mapleLog("error", "context_wall_execute_tool_with_policy_failed", { error: err.message });
                callback({ code: grpc.status.INTERNAL, message: err.message });
            }
        },
        async ForwardJsonRpcWithPolicy(call, callback) {
            try {
                const requestContext = normalizeRequestContext(call.request.context);
                const appId = String(call.request.appId || "");
                const targetUrl = String(call.request.targetUrl || "");
                const payloadParsed = parseJsonObject(call.request.payloadJson, {});
                if (!payloadParsed.ok) {
                    callback({ code: grpc.status.INVALID_ARGUMENT, message: "payloadJson must be valid JSON" });
                    return;
                }
                const payload = payloadParsed.value;
                const candidateStep = withContextMetadata({
                    index: 0,
                    timestamp: new Date().toISOString(),
                    actor: "agent",
                    type: "network",
                    prompt: `forward ${appId}`,
                    output: JSON.stringify(payload),
                    metadata: { appId, targetUrl },
                    riskScore: 0,
                    riskFlags: [],
                    guardStatus: "pending",
                }, requestContext);
                const decision = evaluateFirewallStep(candidateStep, getExternalRules());
                if (decision.shouldBlock) {
                    emitAuditEvent({
                        eventType: "AUDIT_EVENT_TYPE_POLICY_DENIED",
                        summary: `Blocked JSON-RPC forward ${appId}`,
                        severity: `RISK_SEVERITY_${decision.severity.toUpperCase()}`,
                        traceId: requestContext.traceId,
                        payload: { appId, targetUrl, reason: decision.message },
                    });
                    callback(null, {
                        allowed: false,
                        blockedReason: decision.message,
                        decision: toProtoPolicyDecision(decision),
                        success: false,
                        responseJson: Buffer.from(JSON.stringify({ error: decision.message })),
                        errorMessage: decision.message,
                    });
                    return;
                }
                const response = await mcpProxyBreaker.execute(() => grpcUnary(getMcpProxy(), "forwardJsonRpc", {
                    context: requestContext,
                    appId,
                    payloadJson: Buffer.from(JSON.stringify(payload)),
                    targetUrl,
                }));
                emitAuditEvent({
                    eventType: response?.success ? "AUDIT_EVENT_TYPE_POLICY_EVALUATED" : "AUDIT_EVENT_TYPE_TOOL_FAILED",
                    summary: `JSON-RPC forward ${appId} ${response?.success ? "completed" : "failed"}`,
                    traceId: requestContext.traceId,
                    payload: {
                        appId,
                        targetUrl,
                        success: Boolean(response?.success),
                    },
                });
                callback(null, {
                    allowed: true,
                    blockedReason: "",
                    decision: toProtoPolicyDecision(decision),
                    success: Boolean(response?.success),
                    responseJson: response?.responseJson ?? Buffer.from("{}"),
                    errorMessage: response?.errorMessage ?? "",
                });
            }
            catch (err) {
                mapleLog("error", "context_wall_forward_jsonrpc_with_policy_failed", { error: err.message });
                callback({ code: grpc.status.INTERNAL, message: err.message });
            }
        },
        async ReloadPolicies(call, callback) {
            try {
                if (!policyStore) {
                    callback(null, { success: false, ruleCount: 0, errorMessage: "PolicyStore not configured" });
                    return;
                }
                const result = await policyStore.reload();
                mapleLog("info", "context_wall_reload_policies", { success: result.success, ruleCount: result.ruleCount });
                callback(null, { success: result.success, ruleCount: result.ruleCount, errorMessage: result.error ?? "" });
            }
            catch (err) {
                mapleLog("error", "context_wall_reload_policies_failed", { error: err.message });
                callback({ code: grpc.status.INTERNAL, message: err.message });
            }
        },
    };
    server.addService(contextProto.ContextWallService.service, serviceImpl);
    return server;
}
//# sourceMappingURL=service.js.map
