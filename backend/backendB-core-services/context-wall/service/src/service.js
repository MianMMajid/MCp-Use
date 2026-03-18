import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { loadGrpcTlsConfig, loadServiceClientSecurePooled, createGrpcServer, CircuitBreaker, mapleLog } from "@maple/common";
import {
    enforceTraceFirewall,
    evaluateFirewallStep,
    detectPromptInjection,
    scanForPII,
    redactPII,
    buildFilesystemMutationPlan,
    sanitizeTextWithLeakagePolicy,
    sanitizeStructuredContent,
    redactDisplayValue,
} from "@maple/security";
import { analyzeTraceRisks, applyAuditToTrace } from "@maple/risk-engine";
import { generateOpenAI } from "./providers/openai.js";
import { generateAnthropic } from "./providers/anthropic.js";
import { config } from "./config.js";
import { inferProviderForModel, normalizeReasoningEffort } from "../../../gateway-api/service/src/core/chat-models.js";
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
        if (Array.isArray(message?.toolCalls) && message.toolCalls.length > 0) {
            payload.tool_calls = message.toolCalls.map((toolCall) => ({
                id: String(toolCall?.id || randomUUID()),
                type: "function",
                function: {
                    name: String(toolCall?.function?.name || ""),
                    arguments: String(toolCall?.function?.arguments || "{}"),
                },
            }));
        }
        return payload;
    });
}
async function generateViaLocalProviders(request) {
    const requestedProvider = inferProviderForModel(request.model);
    const providerOrder = (() => {
        if (requestedProvider === "openai" || requestedProvider === "anthropic") {
            return [requestedProvider];
        }
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
            reasoningEffort: provider === "openai" ? normalizeReasoningEffort(model, request.reasoningEffort) : undefined,
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
async function emitAuditEvent(opts, { required = false } = {}) {
    try {
        await auditWriterBreaker.execute(() => grpcUnary(getAuditWriter(), "appendEvent", {
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
        }));
    }
    catch (error) {
        if (required || String(process.env.NODE_ENV ?? "").trim().toLowerCase() === "production") {
            throw error;
        }
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

function evaluateFilesystemMutationDecision(input = {}) {
    const plan = buildFilesystemMutationPlan({
        toolName: input.toolName,
        toolArgs: input.toolArgs,
        command: input.command,
        sourceSurface: "context_wall",
        sourceType: input.sourceType ?? "tool_call",
        traceId: input.traceId,
        sessionId: input.sessionId,
        taskText: input.taskText,
    }, {
        workspaceRoot: process.cwd(),
        allowedRoots: [process.cwd()],
    });
    if (!plan.detected || plan.lane === "direct_allow" || plan.lane === "none") {
        return null;
    }
    return {
        enabled: true,
        action: "deny",
        shouldBlock: true,
        severity: plan.lane === "hard_deny" ? "critical" : "high",
        message: plan.laneMessage || `Filesystem mutation requires ${plan.lane}.`,
        recommendation: plan.lane === "hard_deny"
            ? "Keep the request blocked."
            : "Use the filesystem intervention workflow and promote the reviewed bundle from an isolated fork.",
        rule: `filesystem-mutation-${plan.lane}`,
        redactedPatterns: [],
        evaluatedAt: new Date().toISOString(),
        defaultAction: "deny",
        step: undefined,
        lane: plan.lane,
        plan,
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
function stripMarkdownCodeFence(text) {
    const value = String(text ?? "").trim();
    const fencedMatch = value.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    return fencedMatch ? fencedMatch[1].trim() : value;
}
function resolveLeakagePolicyMode(values = []) {
    const normalized = (Array.isArray(values) ? values : [])
        .map((value) => String(value ?? "").trim().toLowerCase())
        .filter(Boolean);
    if (normalized.includes("strict")) {
        return "strict";
    }
    if (normalized.includes("review")) {
        return "review";
    }
    if (normalized.includes("monitor")) {
        return "monitor";
    }
    return "strict";
}
function replaceRanges(text, ranges = [], replacementSelector = (range) => range.replacement ?? "") {
    const source = String(text ?? "");
    const sorted = [...(Array.isArray(ranges) ? ranges : [])]
        .filter((range) => Number.isFinite(range?.startIndex) && Number.isFinite(range?.endIndex))
        .sort((left, right) => Number(right.startIndex) - Number(left.startIndex));
    let next = source;
    for (const range of sorted) {
        const start = Math.max(0, Number(range.startIndex));
        const end = Math.max(start, Number(range.endIndex));
        next = `${next.slice(0, start)}${replacementSelector(range)}${next.slice(end)}`;
    }
    return next;
}
function buildRedactedOriginalText(text, matches = []) {
    return replaceRanges(text, matches, (match) => match.redactedMatchedText || redactDisplayValue(match.matchedText, match.category));
}
function buildProtoLeakageMatches(matches = []) {
    return (Array.isArray(matches) ? matches : []).map((match) => ({
        entityId: String(match.entityId || ""),
        documentId: String(match.documentId || ""),
        category: String(match.category || ""),
        redactedValue: String(match.redactedMatchedText || redactDisplayValue(match.matchedText, match.category)),
        action: String(match.action || ""),
        replacementValue: String(match.replacementValue || ""),
        source: String(match.source || ""),
        severity: String(match.severity || ""),
        startIndex: Number(match.startIndex || 0),
        endIndex: Number(match.endIndex || 0),
    }));
}
function buildDetectorLeakageMatches(text, findings = [], { action = "block", policyMode = "strict", source = "detector" } = {}) {
    const sourceText = String(text ?? "");
    return (Array.isArray(findings) ? findings : []).map((finding, index) => ({
        entityId: `builtin-${String(finding?.category || "sensitive")}-${Number(finding?.startIndex || 0)}-${Number(finding?.endIndex || 0)}-${index}`,
        documentId: "",
        category: String(finding?.category || finding?.pattern || "sensitive"),
        matchedText: sourceText.slice(Number(finding?.startIndex || 0), Number(finding?.endIndex || 0)),
        redactedMatchedText: `[${String(finding?.category || "SENSITIVE").toUpperCase()}:${String(finding?.pattern || "match").toUpperCase()}]`,
        action,
        replacementValue: "",
        source,
        startIndex: Number(finding?.startIndex || 0),
        endIndex: Number(finding?.endIndex || 0),
        severity: String(finding?.severity || "high"),
        policyMode,
    }));
}
function buildPatternLeakageMatches(patterns = [], { action = "block", policyMode = "strict", source = "detector" } = {}) {
    return (Array.isArray(patterns) ? patterns : [])
        .map((pattern) => String(pattern ?? "").trim())
        .filter(Boolean)
        .map((pattern, index) => ({
        entityId: `builtin-pattern-${pattern}-${index}`,
        documentId: "",
        category: pattern,
        matchedText: "",
        redactedMatchedText: `[${pattern.toUpperCase()}]`,
        action,
        replacementValue: "",
        source,
        startIndex: 0,
        endIndex: 0,
        severity: /medical_record_number|ssn|private_key|api_token|credential/i.test(pattern) ? "critical" : "high",
        policyMode,
    }));
}
async function recordLeakageEvent(leakageStore, payload, failureLogKey) {
    if (!leakageStore) {
        return;
    }
    await leakageStore.recordEvent(payload).catch((error) => {
        mapleLog("warn", failureLogKey, {
            error: error instanceof Error ? error.message : String(error),
        });
    });
}
function hasUsableProviderApiKey(provider) {
    const apiKey = providerApiKey(provider);
    if (!apiKey) {
        return false;
    }
    const lowered = apiKey.toLowerCase();
    return !lowered.startsWith("test-") && !lowered.includes("placeholder");
}
function shouldTrySemanticLeakageAssist(text, toolName = "") {
    const source = String(text ?? "").trim();
    if (!source || source.length > 4000) {
        return false;
    }
    const normalizedToolName = String(toolName ?? "").trim().toLowerCase();
    if (normalizedToolName === "web_search" || normalizedToolName === "web_fetch") {
        return true;
    }
    return /\b(where i live|my address|home address|call me at|email me at|patient|medical record|mrn|dob|contact me|reddit|google|restaurants|recommend|near me|search)\b/i.test(source);
}
function firstJsonObjectFromText(text) {
    const stripped = stripMarkdownCodeFence(text);
    try {
        return JSON.parse(stripped);
    }
    catch {
        const start = stripped.indexOf("{");
        const end = stripped.lastIndexOf("}");
        if (start >= 0 && end > start) {
            try {
                return JSON.parse(stripped.slice(start, end + 1));
            }
            catch {
                return null;
            }
        }
    }
    return null;
}
async function generateSemanticLeakageDecision(text, context = {}, activeEntities = []) {
    if (String(process.env.NODE_ENV || "").trim().toLowerCase() === "test") {
        return null;
    }
    const requestedProvider = inferProviderForModel("");
    const providerOrder = requestedProvider === "anthropic"
        ? ["anthropic", "openai"]
        : ["openai", "anthropic"];
    const availableProvider = providerOrder.find((provider) => hasUsableProviderApiKey(provider));
    if (!availableProvider) {
        return null;
    }
    const policyHints = activeEntities.slice(0, 10).map((entity) => ({
        category: String(entity.category || ""),
        displayText: String(entity.displayText || ""),
        replacementValue: String(entity.replacementValue || ""),
        action: String(entity.action || ""),
        policyMode: String(entity.policyMode || "strict"),
    }));
    const response = await generateViaLocalProviders({
        model: providerModelName(availableProvider),
        reasoningEffort: "low",
        maxTokens: 250,
        temperature: 0,
        tools: [],
        messages: [
            {
                role: "CHAT_ROLE_SYSTEM",
                content: [
                    "You are a context-leakage sanitizer.",
                    "Return JSON only.",
                    'Schema: {"blocked":boolean,"sanitizedText":string,"category":string,"action":"rewrite|placeholder_redact|block|none","replacementValue":string,"confidence":number,"rationale":string}.',
                    "Rewrite exact home/work addresses to coarse location such as City, ST when possible.",
                    "Remove phone numbers or emails from research/search/recommendation requests when the request still makes sense.",
                    "Block patient-identity, DOB, MRN, secrets, credentials, and financial/government identifiers.",
                    "If no change is required, set action to none and sanitizedText to the input.",
                ].join("\n"),
            },
            {
                role: "CHAT_ROLE_USER",
                content: JSON.stringify({
                    toolName: String(context.toolName || ""),
                    policyMode: String(context.policyMode || "strict"),
                    policyHints,
                    text: String(text ?? ""),
                }),
            },
        ],
    }).catch((error) => {
        mapleLog("warn", "context_wall.semantic_sanitizer_failed", {
            error: error instanceof Error ? error.message : String(error),
        });
        return null;
    });
    const parsed = firstJsonObjectFromText(response?.message?.content || "");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return null;
    }
    const action = String(parsed.action || "none").trim().toLowerCase();
    return {
        blocked: parsed.blocked === true || action === "block",
        sanitizedText: typeof parsed.sanitizedText === "string" ? parsed.sanitizedText : String(text ?? ""),
        category: String(parsed.category || ""),
        action,
        replacementValue: String(parsed.replacementValue || ""),
        confidence: Number(parsed.confidence || 0),
        rationale: String(parsed.rationale || ""),
    };
}
async function applyLeakagePolicyToText(text, context = {}, leakageStore) {
    const tenantId = String(context.tenantId || "default");
    const orgId = String(context.orgId || "default");
    const activeEntities = leakageStore
        ? await leakageStore.getActiveEntities({ tenantId, orgId }).catch(() => [])
        : [];
    const deterministic = sanitizeTextWithLeakagePolicy(text, activeEntities, {
        toolName: context.toolName,
        policyMode: resolveLeakagePolicyMode(activeEntities.map((entity) => entity.policyMode)),
    });
    let result = {
        ...deterministic,
        policyMode: resolveLeakagePolicyMode([
            deterministic.matches.map((match) => match.policyMode),
            activeEntities.map((entity) => entity.policyMode),
        ].flat()),
        rationale: deterministic.matches.length > 0 ? "Deterministic leakage policy match." : "",
    };
    if (!result.blocked && result.matches.length === 0 && shouldTrySemanticLeakageAssist(text, context.toolName)) {
        const semantic = await generateSemanticLeakageDecision(text, {
            toolName: context.toolName,
            policyMode: result.policyMode,
        }, activeEntities);
        if (semantic && semantic.action !== "none" && semantic.confidence >= 0.55) {
            result = {
                blocked: semantic.blocked,
                blockedReason: semantic.blocked
                    ? semantic.rationale || `Sensitive ${semantic.category || "content"} blocked by semantic sanitizer.`
                    : "",
                modified: String(semantic.sanitizedText || "") !== String(text ?? ""),
                sanitizedText: semantic.sanitizedText || String(text ?? ""),
                matches: semantic.action === "none" ? [] : [{
                    entityId: "",
                    documentId: "",
                    category: semantic.category || "semantic_sensitive_content",
                    matchedText: "",
                    redactedMatchedText: `[${String(semantic.category || "SENSITIVE").toUpperCase()}]`,
                    action: semantic.action,
                    replacementValue: semantic.replacementValue || "",
                    source: "semantic",
                    startIndex: 0,
                    endIndex: 0,
                    severity: semantic.blocked ? "high" : "medium",
                    policyMode: result.policyMode,
                }],
                confidence: semantic.confidence,
                policyMode: result.policyMode,
                rationale: semantic.rationale || "Semantic leakage sanitizer rewrote or blocked the request.",
            };
        }
    }
    const redactedOriginalText = buildRedactedOriginalText(text, result.matches);
    if (leakageStore && (result.matches.length > 0 || result.blocked || result.modified)) {
        await recordLeakageEvent(leakageStore, {
            tenantId,
            orgId,
            sessionId: context.sessionId || "",
            runId: context.runId || "",
            traceId: context.traceId || "",
            toolName: context.toolName || "",
            direction: context.direction || "prompt",
            action: result.blocked ? "block" : result.modified ? "rewrite" : "monitor",
            blocked: result.blocked === true,
            documentId: result.matches.find((match) => match.documentId)?.documentId || "",
            entityIds: result.matches.map((match) => match.entityId).filter(Boolean),
            originalRedactedText: redactedOriginalText,
            sanitizedText: result.sanitizedText,
            reason: result.blockedReason || result.rationale || "",
            confidence: Number(result.confidence || 0),
        }, "context_wall.leakage_event_record_failed");
    }
    return {
        ...result,
        activeEntities,
        redactedOriginalText,
    };
}
async function applyLeakagePolicyToStructuredContent(value, context = {}, leakageStore) {
    const tenantId = String(context.tenantId || "default");
    const orgId = String(context.orgId || "default");
    const activeEntities = leakageStore
        ? await leakageStore.getActiveEntities({ tenantId, orgId }).catch(() => [])
        : [];
    const result = sanitizeStructuredContent(value, activeEntities, {
        toolName: context.toolName,
        policyMode: resolveLeakagePolicyMode(activeEntities.map((entity) => entity.policyMode)),
    });
    const redactedOriginalText = JSON.stringify({
        redactedMatches: result.matches.map((match) => ({
            category: match.category,
            value: match.redactedMatchedText || redactDisplayValue(match.matchedText, match.category),
            action: match.action,
        })),
    });
    if (leakageStore && (result.matches.length > 0 || result.blocked || result.modified)) {
        await recordLeakageEvent(leakageStore, {
            tenantId,
            orgId,
            sessionId: context.sessionId || "",
            runId: context.runId || "",
            traceId: context.traceId || "",
            toolName: context.toolName || "",
            direction: context.direction || "outbound_tool_args",
            action: result.blocked ? "block" : result.modified ? "rewrite" : "monitor",
            blocked: result.blocked === true,
            documentId: result.matches.find((match) => match.documentId)?.documentId || "",
            entityIds: result.matches.map((match) => match.entityId).filter(Boolean),
            originalRedactedText: redactedOriginalText,
            sanitizedText: JSON.stringify(result.sanitizedContent ?? {}),
            reason: result.blockedReason || "",
            confidence: Number(result.confidence || 0),
        }, "context_wall.leakage_structured_event_record_failed");
    }
    return {
        ...result,
        policyMode: resolveLeakagePolicyMode(activeEntities.map((entity) => entity.policyMode)),
        redactedOriginalText,
    };
}
function deriveScopeFromArguments(args, toolName = "") {
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
            allowFileDownload: String(toolName || "").endsWith(".web_fetch") || String(toolName || "") === "web_fetch",
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
        runId: String(raw?.runId || ""),
        userId: String(raw?.userId || ""),
        keyFingerprint: String(raw?.keyFingerprint || ""),
        sourceService: String(raw?.sourceService || ""),
        tenantId: String(raw?.tenantId || ""),
        orgId: String(raw?.orgId || ""),
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
// ── Per-peer gRPC rate limiter ────────────────────────────────────────────────
// Limits each calling service to a configurable number of requests per window
// to protect against runaway agents or misconfigured retry loops.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = Number(process.env.CONTEXT_WALL_RATE_LIMIT || 600);
const rateLimitBuckets = new Map();

function checkRateLimit(peerId) {
    const now = Date.now();
    let bucket = rateLimitBuckets.get(peerId);
    if (!bucket || now - bucket.windowStart > RATE_LIMIT_WINDOW_MS) {
        bucket = { windowStart: now, count: 0 };
        rateLimitBuckets.set(peerId, bucket);
    }
    bucket.count++;
    return bucket.count <= RATE_LIMIT_MAX_REQUESTS;
}

// Evict stale buckets every 5 minutes to prevent memory growth.
setInterval(() => {
    const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS * 2;
    for (const [key, bucket] of rateLimitBuckets) {
        if (bucket.windowStart < cutoff) rateLimitBuckets.delete(key);
    }
}, 300_000).unref();

function extractPeerId(call) {
    const peer = call.getPeer?.() || "unknown";
    return peer;
}

function embedToolExecutionMetadata(resultJson, cyberReport) {
    if (!cyberReport) {
        return resultJson ?? Buffer.from("{}");
    }
    let parsedResult = {};
    try {
        const raw = typeof resultJson === "string"
            ? resultJson
            : Buffer.isBuffer(resultJson)
                ? resultJson.toString("utf8")
                : String(resultJson ?? "{}");
        parsedResult = JSON.parse(raw);
    }
    catch {
        parsedResult = {};
    }
    return Buffer.from(JSON.stringify({
        __mapleMediatedToolResult: {
            result: parsedResult,
            cyberReport,
        },
    }));
}

export function createContextWallService(approvalQueue, policyStore, options = {}) {
    const getExternalRules = () => policyStore?.getExternalRules();
    const leakageStore = options?.leakageStore;
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
        const leakageResult = await applyLeakagePolicyToStructuredContent(parsedArgsResult.value, {
            ...normalizedContext,
            toolName: `${appId}.${toolName}`,
            direction: "outbound_tool_args",
            runId: request.runId || "",
        }, leakageStore);
        if (leakageResult.blocked) {
            const blockedReason = leakageResult.blockedReason || `Sensitive outbound content blocked for ${appId}.${toolName}.`;
            await emitAuditEvent({
                eventType: "AUDIT_EVENT_TYPE_POLICY_DENIED",
                summary: `Context leakage blocked ${appId}.${toolName}`,
                severity: "RISK_SEVERITY_HIGH",
                traceId,
                payload: {
                    appId,
                    toolName,
                    targetUrl,
                    sessionId,
                    reason: blockedReason,
                    leakageMatches: buildProtoLeakageMatches(leakageResult.matches),
                },
            }, { required: true });
            return {
                allowed: false,
                blockedReason,
                decision: toProtoPolicyDecision({
                    enabled: true,
                    action: "deny",
                    shouldBlock: true,
                    severity: "high",
                    message: blockedReason,
                    recommendation: "Remove the protected context or rely on the sanitized replacement.",
                    rule: "context-leakage-block",
                    redactedPatterns: leakageResult.matches.map((match) => `${match.category}:${match.redactedMatchedText || redactDisplayValue(match.matchedText, match.category)}`),
                    evaluatedAt: new Date().toISOString(),
                    defaultAction: "deny",
                    step: undefined,
                }),
                success: false,
                resultJson: Buffer.from(JSON.stringify({
                    error: blockedReason,
                    blocked: true,
                    leakageMatches: buildProtoLeakageMatches(leakageResult.matches),
                })),
                errorMessage: blockedReason,
                durationMs: 0,
                appId,
                toolName,
            };
        }
        const parsedArgs = leakageResult.sanitizedContent ?? parsedArgsResult.value;
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
        const mutationDecision = evaluateFilesystemMutationDecision({
            toolName: `${appId}.${toolName}`,
            toolArgs: parsedArgs,
            traceId,
            sessionId,
            taskText: JSON.stringify(parsedArgs),
        });
        if (mutationDecision) {
            await emitAuditEvent({
                eventType: "AUDIT_EVENT_TYPE_POLICY_DENIED",
                summary: `Filesystem mutation blocked for ${appId}.${toolName}`,
                severity: `RISK_SEVERITY_${mutationDecision.severity.toUpperCase()}`,
                traceId,
                payload: {
                    appId,
                    toolName,
                    targetUrl,
                    sessionId,
                    lane: mutationDecision.lane,
                    workspaceRoot: mutationDecision.plan.workspaceRoot,
                    candidatePaths: mutationDecision.plan.candidatePaths,
                },
            }, { required: true });
            return {
                allowed: false,
                blockedReason: mutationDecision.message,
                decision: toProtoPolicyDecision(mutationDecision),
                success: false,
                resultJson: Buffer.from(JSON.stringify({
                    error: mutationDecision.message,
                    lane: mutationDecision.lane,
                    candidatePaths: mutationDecision.plan.candidatePaths,
                })),
                errorMessage: mutationDecision.message,
                durationMs: 0,
                appId,
                toolName,
            };
        }
        let effectiveDecision = decision;
        if (decision.shouldBlock) {
            await approvalQueue.enqueue(traceId, approvalStepIndex, candidateStep, { timeoutMs: config.hitlApprovalTimeoutMs });
            await emitAuditEvent({
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
            }, { required: true });
            const approval = await approvalQueue.waitForResolution(traceId, approvalStepIndex, config.hitlApprovalTimeoutMs);
            if (!approval) {
                await emitAuditEvent({
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
                }, { required: true });
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
                await emitAuditEvent({
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
                }, { required: true });
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
            await emitAuditEvent({
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
            }, { required: true });
        }
        const requestedScope = request.scope;
        const derivedScope = deriveScopeFromArguments(parsedArgs, `${appId}.${toolName}`);
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
        await emitAuditEvent({
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
            resultJson: embedToolExecutionMetadata(response?.resultJson, response?.cyberReport),
            errorMessage: response?.errorMessage ?? "",
            durationMs: response?.durationMs ?? 0,
            appId: response?.appId ?? appId,
            toolName: response?.toolName ?? toolName,
        };
    };
    const serviceImpl = {
        async EvaluateStep(call, callback) {
            if (!checkRateLimit(extractPeerId(call))) {
                callback({ code: grpc.status.RESOURCE_EXHAUSTED, message: "Rate limit exceeded" });
                return;
            }
            try {
                const context = normalizeRequestContext(call.request.context);
                const step = withContextMetadata(stepFromProto(call.request.step), context);
                const firewallDecision = evaluateFirewallStep(step, getExternalRules());
                const mutationDecision = evaluateFilesystemMutationDecision({
                    toolName: step.toolCall?.name,
                    toolArgs: step.toolCall?.input,
                    command: step.command,
                    traceId: context.traceId,
                    sessionId: context.sessionId,
                    taskText: step.prompt || step.output || step.command || "",
                    sourceType: step.type,
                });
                const decision = mutationDecision ?? firewallDecision;
                mapleLog("debug", "context_wall_evaluate_step", { stepIndex: step.index, action: decision.action });
                if (decision.action === "deny") {
                    await approvalQueue.enqueue(context.traceId || "unknown", step.index, step, { timeoutMs: config.hitlApprovalTimeoutMs });
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
            if (!checkRateLimit(extractPeerId(call))) {
                callback({ code: grpc.status.RESOURCE_EXHAUSTED, message: "Rate limit exceeded" });
                return;
            }
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
        async SubmitApproval(call, callback) {
            try {
                const { traceId, stepIndex, action, reason, approverId } = call.request;
                const guardAction = action === "GUARD_ACTION_ALLOW" ? "allow" : action === "GUARD_ACTION_BLOCK" ? "block" : "pending";
                const result = await approvalQueue.resolve(traceId, stepIndex, guardAction, reason || "", approverId || "");
                if (result) {
                    await emitAuditEvent({
                        eventType: guardAction === "allow" ? "AUDIT_EVENT_TYPE_HITL_APPROVED" : "AUDIT_EVENT_TYPE_HITL_REJECTED",
                        summary: `HITL decision recorded for ${traceId}:${stepIndex}`,
                        traceId,
                        payload: {
                            stepIndex,
                            action: guardAction,
                            reason: reason || "",
                            approverId: approverId || "",
                        },
                    }, { required: true });
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
            let unwatched = false;
            const safeUnwatch = () => {
                if (unwatched) return;
                unwatched = true;
                unwatch();
            };
            const unwatch = approvalQueue.watch((event) => {
                if (unwatched) return;
                if (requestedSessionId && stepSessionId(event.step) !== requestedSessionId) {
                    return;
                }
                try {
                    const decision = evaluateFirewallStep(event.step, getExternalRules());
                    call.write({
                        traceId: event.traceId,
                        stepIndex: event.stepIndex,
                        step: toProtoStep(event.step),
                        pendingDecision: toProtoPolicyDecision(decision),
                        requestedAt: event.requestedAt,
                    });
                } catch {
                    safeUnwatch();
                }
            });
            call.on("cancelled", safeUnwatch);
            call.on("close", safeUnwatch);
            call.on("error", safeUnwatch);
        },
        async ListPendingApprovals(call, callback) {
            try {
                const requestedSessionId = String(call.request?.sessionId || "");
                const pending = await approvalQueue.getPending();
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
            (async () => {
                const prompt = String(call.request.prompt || "");
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
                        matches: [],
                        policyMode: "strict",
                        confidence: injectionResult.confidence,
                        rationale: "Prompt injection detector blocked the request.",
                        modified: false,
                        redactedOriginalPrompt: "[PROMPT_INJECTION_BLOCKED]",
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
                if (decision.shouldBlock) {
                    const policyMode = "strict";
                    const blockedText = String(decision.step?.prompt ?? prompt ?? "");
                    const piiDetectorFindings = scanForPII(blockedText);
                    const messagePatterns = decision.message && /PII\/PHI data detected/i.test(decision.message)
                        ? String(decision.message)
                            .match(/\(([^)]+)\)/)?.[1]
                            ?.split(",")
                            .map((value) => value.trim())
                        : [];
                    const detectorMatches = piiDetectorFindings.length > 0
                        ? buildDetectorLeakageMatches(blockedText, piiDetectorFindings, {
                            action: "block",
                            policyMode,
                            source: "detector",
                        })
                        : buildPatternLeakageMatches(messagePatterns, {
                            action: "block",
                            policyMode,
                            source: "detector",
                        });
                    const redactedOriginalPrompt = detectorMatches.length > 0
                        ? buildRedactedOriginalText(blockedText, detectorMatches)
                        : "[POLICY_BLOCKED]";
                    await recordLeakageEvent(leakageStore, {
                        tenantId: context.tenantId || "default",
                        orgId: context.orgId || "default",
                        sessionId: context.sessionId || "",
                        runId: context.runId || "",
                        traceId: context.traceId || "",
                        toolName: "",
                        direction: "prompt_input",
                        action: "block",
                        blocked: true,
                        documentId: detectorMatches.find((match) => match.documentId)?.documentId || "",
                        entityIds: detectorMatches.map((match) => match.entityId).filter(Boolean),
                        originalRedactedText: redactedOriginalPrompt,
                        sanitizedText: "",
                        reason: decision.message || "Prompt blocked by firewall policy.",
                        confidence: 1,
                    }, "context_wall.leakage_policy_block_event_record_failed");
                    callback(null, {
                        sanitizedPrompt: "",
                        redactedPatterns: decision.redactedPatterns ?? [],
                        hadSecrets: (decision.redactedPatterns ?? []).length > 0,
                        blocked: true,
                        blockedReason: decision.message || "Prompt blocked by firewall policy.",
                        injectionPatterns: injectionResult.matches.map(m => m.pattern),
                        matches: buildProtoLeakageMatches(detectorMatches),
                        policyMode,
                        confidence: 1,
                        rationale: decision.recommendation || "",
                        modified: false,
                        redactedOriginalPrompt,
                    });
                    return;
                }
                let sanitizedPrompt = decision.step?.prompt ?? prompt;
                const promptBeforePiiRedaction = String(sanitizedPrompt ?? "");
                const allRedactedPatterns = [...(decision.redactedPatterns ?? [])];
                // Run PII scan on the sanitized prompt text
                const piiFindings = scanForPII(sanitizedPrompt);
                const piiMatches = piiFindings.length > 0
                    ? buildDetectorLeakageMatches(promptBeforePiiRedaction, piiFindings, {
                        action: "placeholder_redact",
                        policyMode: "strict",
                        source: "detector",
                    })
                    : [];
                if (piiFindings.length > 0) {
                    sanitizedPrompt = redactPII(sanitizedPrompt, piiFindings);
                    for (const f of piiFindings) {
                        allRedactedPatterns.push(`pii:${f.pattern}`);
                    }
                }
                const leakageResult = await applyLeakagePolicyToText(sanitizedPrompt, {
                    ...context,
                    direction: "prompt_input",
                    toolName: "",
                }, leakageStore);
                const piiFallbackMatches = piiMatches.length > 0
                    ? piiMatches
                    : buildPatternLeakageMatches(allRedactedPatterns
                        .filter((pattern) => String(pattern).startsWith("pii:"))
                        .map((pattern) => String(pattern).slice(4)), {
                        action: "placeholder_redact",
                        policyMode: "strict",
                        source: "detector",
                    });
                if (piiFindings.length > 0 && piiFallbackMatches.length > 0) {
                    await recordLeakageEvent(leakageStore, {
                        tenantId: context.tenantId || "default",
                        orgId: context.orgId || "default",
                        sessionId: context.sessionId || "",
                        runId: context.runId || "",
                        traceId: context.traceId || "",
                        toolName: "",
                        direction: "prompt_input",
                        action: "rewrite",
                        blocked: false,
                        documentId: "",
                        entityIds: piiFallbackMatches.map((match) => match.entityId).filter(Boolean),
                        originalRedactedText: piiMatches.length > 0
                            ? buildRedactedOriginalText(promptBeforePiiRedaction, piiMatches)
                            : sanitizedPrompt,
                        sanitizedText: sanitizedPrompt,
                        reason: `Built-in PII redaction applied (${piiFindings.map((finding) => finding.pattern).join(", ")}).`,
                        confidence: 1,
                    }, "context_wall.pii_redaction_event_record_failed");
                }
                const effectivePromptMatches = leakageResult.matches.length > 0 ? leakageResult.matches : piiFallbackMatches;
                mapleLog("debug", "context_wall_sanitize_prompt", {
                    hadSecrets: allRedactedPatterns.length > 0,
                    piiFindings: piiFindings.length,
                    leakageMatches: leakageResult.matches.length,
                    leakageBlocked: leakageResult.blocked,
                });
                callback(null, {
                    sanitizedPrompt: leakageResult.blocked ? "" : leakageResult.sanitizedText,
                    redactedPatterns: allRedactedPatterns,
                    hadSecrets: allRedactedPatterns.length > 0,
                    blocked: leakageResult.blocked === true,
                    blockedReason: leakageResult.blocked ? leakageResult.blockedReason : "",
                    injectionPatterns: injectionResult.matches.map(m => m.pattern),
                    matches: buildProtoLeakageMatches(effectivePromptMatches),
                    policyMode: leakageResult.policyMode || "strict",
                    confidence: Number(leakageResult.confidence || 0),
                    rationale: leakageResult.rationale || "",
                    modified: leakageResult.modified === true || effectivePromptMatches.length > 0,
                    redactedOriginalPrompt: leakageResult.redactedOriginalText
                        || (piiMatches.length > 0
                            ? buildRedactedOriginalText(promptBeforePiiRedaction, piiMatches)
                            : effectivePromptMatches.length > 0
                                ? sanitizedPrompt
                                : buildRedactedOriginalText(prompt, leakageResult.matches)),
                });
            })().catch((err) => {
                mapleLog("error", "context_wall_sanitize_prompt_failed", { error: err.message });
                callback({ code: grpc.status.INTERNAL, message: err.message });
            });
        },
        SanitizeStructuredContent(call, callback) {
            (async () => {
                const context = normalizeRequestContext(call.request.context);
                const parsed = parseJsonObject(call.request.contentJson, {});
                if (!parsed.ok) {
                    callback({ code: grpc.status.INVALID_ARGUMENT, message: "contentJson must be valid JSON" });
                    return;
                }
                const toolName = String(call.request.toolName || "");
                const result = await applyLeakagePolicyToStructuredContent(parsed.value, {
                    ...context,
                    toolName,
                    direction: "outbound_tool_args",
                }, leakageStore);
                callback(null, {
                    allowed: result.blocked !== true,
                    blockedReason: result.blocked ? result.blockedReason : "",
                    sanitizedContentJson: Buffer.from(JSON.stringify(result.sanitizedContent ?? parsed.value)),
                    modified: result.modified === true,
                    matches: buildProtoLeakageMatches(result.matches),
                    policyMode: result.policyMode || "strict",
                    confidence: Number(result.confidence || 0),
                    rationale: result.blockedReason || "",
                    redactedOriginalText: result.redactedOriginalText || "",
                });
            })().catch((err) => {
                mapleLog("error", "context_wall_sanitize_structured_content_failed", { error: err.message });
                callback({ code: grpc.status.INTERNAL, message: err.message });
            });
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
            if (!checkRateLimit(extractPeerId(call))) {
                callback({ code: grpc.status.RESOURCE_EXHAUSTED, message: "Rate limit exceeded" });
                return;
            }
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
                const leakageResult = await applyLeakagePolicyToText(decision.step?.prompt ?? latestPrompt, {
                    ...requestContext,
                    direction: "orchestrate_chat_input",
                }, leakageStore);
                if (leakageResult.blocked) {
                    callback(null, {
                        allowed: false,
                        blockedReason: leakageResult.blockedReason || "Sensitive content blocked by context leakage policy.",
                        reply: "",
                        model: "",
                        redactedPatterns: leakageResult.matches.map((match) => `${match.category}:${match.redactedMatchedText || redactDisplayValue(match.matchedText, match.category)}`),
                    });
                    return;
                }
                const requestTools = Array.isArray(call.request.tools) ? call.request.tools : [];
                let rawTools = requestTools;
                if (rawTools.length === 0) {
                    try {
                        rawTools = await loadOrchestrationToolsFromMcpProxy();
                    }
                    catch (err) {
                        // Tool discovery failed — proceed without tools rather than blocking chat.
                        // Plain chat (no tools) should still work through the policy engine.
                        mapleLog("info", "context_wall_tool_discovery_skipped", {
                            reason: err.message || "tool discovery failed",
                            fallback: "proceeding_without_tools",
                        });
                        rawTools = [];
                    }
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
                        ? (leakageResult.sanitizedText || (decision.step?.prompt ?? String(t.content ?? "")))
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
                const maxTotalToolCalls = 20;
                for (let round = 0; round <= maxToolRounds; round += 1) {
                    const response = await generateChatModelResponse({
                        context: requestContext,
                        messages: modelMessages,
                        tools: modelTools,
                        model: call.request.model || "",
                        reasoningEffort: call.request.reasoningEffort || "",
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
                    // Hard cap on total tool calls to prevent DoS via models that
                    // request many tools per round. Log so operators can investigate.
                    if (toolCallCount > maxTotalToolCalls) {
                        mapleLog("warn", "context_wall_tool_call_limit_reached", {
                            traceId: requestContext.traceId,
                            toolCallCount,
                            maxTotalToolCalls,
                            round,
                        });
                        break;
                    }
                    modelMessages = [
                        ...modelMessages,
                        {
                            role: "CHAT_ROLE_ASSISTANT",
                            content: reply,
                            toolCalls: toolCalls.map((toolCall) => ({
                                id: String(toolCall?.id || randomUUID()),
                                type: "function",
                                function: {
                                    name: String(toolCall?.name || ""),
                                    arguments: bytesToUtf8String(toolCall?.argumentsJson, "{}"),
                                },
                            })),
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
                            scope: argsResult.ok ? deriveScopeFromArguments(argsResult.value, `${appId}.${toolName}`) : undefined,
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
            if (!checkRateLimit(extractPeerId(call))) {
                callback({ code: grpc.status.RESOURCE_EXHAUSTED, message: "Rate limit exceeded" });
                return;
            }
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
                    scope: call.request.scope ?? deriveScopeFromArguments(parsedArgs.value, `${call.request.appId || ""}.${call.request.toolName || ""}`),
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
                if (String(payload.method || "") === "tools/call" && payload.params && typeof payload.params === "object" && !Array.isArray(payload.params)) {
                    const toolName = String(payload.params.name || "");
                    const rawArgs = payload.params.arguments && typeof payload.params.arguments === "object" && !Array.isArray(payload.params.arguments)
                        ? payload.params.arguments
                        : {};
                    const leakageResult = await applyLeakagePolicyToStructuredContent(rawArgs, {
                        ...requestContext,
                        toolName,
                        direction: "jsonrpc_outbound",
                    }, leakageStore);
                    if (leakageResult.blocked) {
                        const blockedReason = leakageResult.blockedReason || `Sensitive outbound content blocked for ${toolName || appId}.`;
                        callback(null, {
                            allowed: false,
                            blockedReason,
                            decision: toProtoPolicyDecision({
                                enabled: true,
                                action: "deny",
                                shouldBlock: true,
                                severity: "high",
                                message: blockedReason,
                                recommendation: "Remove the protected context or rely on the sanitized replacement.",
                                rule: "context-leakage-block",
                                redactedPatterns: leakageResult.matches.map((match) => `${match.category}:${match.redactedMatchedText || redactDisplayValue(match.matchedText, match.category)}`),
                                evaluatedAt: new Date().toISOString(),
                                defaultAction: "deny",
                                step: undefined,
                            }),
                            success: false,
                            responseJson: Buffer.from(JSON.stringify({ error: blockedReason })),
                            errorMessage: blockedReason,
                        });
                        return;
                    }
                    payload.params.arguments = leakageResult.sanitizedContent ?? rawArgs;
                }
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
