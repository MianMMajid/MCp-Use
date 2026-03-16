import { authContextStorage } from "../auth.js";
import { grpcUnary } from "../grpc-clients.js";
import { errorMessage } from "../helpers.js";
import { mapleLog, requestContextStorage } from "../logging.js";
import { getGrpcClients } from "../state.js";
export async function evaluateFirewallStepViaGrpc(candidateStep) {
    const clients = getGrpcClients();
    const requestLogContext = requestContextStorage.getStore();
    const authContext = authContextStorage.getStore();
    const stepMetadata = candidateStep.metadata && typeof candidateStep.metadata === "object"
        ? candidateStep.metadata
        : {};
    const grpcContext = {
        requestId: (typeof stepMetadata.requestId === "string" && stepMetadata.requestId.trim().length > 0
            ? stepMetadata.requestId
            : requestLogContext?.requestId) ?? "",
        sessionId: (typeof stepMetadata.sessionId === "string" && stepMetadata.sessionId.trim().length > 0
            ? stepMetadata.sessionId
            : requestLogContext?.sessionId) ?? "",
        traceId: (typeof stepMetadata.traceId === "string" && stepMetadata.traceId.trim().length > 0
            ? stepMetadata.traceId
            : requestLogContext?.traceId) ?? "",
        userId: (typeof stepMetadata.userId === "string" && stepMetadata.userId.trim().length > 0
            ? stepMetadata.userId
            : authContext?.userId ?? authContext?.keyFingerprint) ?? "",
        keyFingerprint: authContext?.keyFingerprint ?? "",
        sourceService: (typeof stepMetadata.sourceService === "string" && stepMetadata.sourceService.trim().length > 0
            ? stepMetadata.sourceService
            : "gateway-api"),
        tenantId: (typeof stepMetadata.tenantId === "string" && stepMetadata.tenantId.trim().length > 0
            ? stepMetadata.tenantId
            : requestLogContext?.tenantId) ?? "",
        deviceId: (typeof stepMetadata.deviceId === "string" && stepMetadata.deviceId.trim().length > 0
            ? stepMetadata.deviceId
            : requestLogContext?.deviceId) ?? "",
    };
    const policyUnavailableDecision = (message) => ({
        enabled: true,
        action: "deny",
        shouldBlock: true,
        severity: "high",
        message,
        recommendation: "Restore context-wall connectivity and retry.",
        rule: "context-wall-unavailable",
        redactedPatterns: [],
        evaluatedAt: new Date().toISOString(),
        defaultAction: "deny",
        step: candidateStep,
    });
    if (clients?.contextWall) {
        try {
            const toolCall = candidateStep.toolCall
                ? {
                    name: candidateStep.toolCall.name,
                    inputJson: candidateStep.toolCall.input
                        ? Buffer.from(JSON.stringify(candidateStep.toolCall.input))
                        : undefined,
                    outputJson: candidateStep.toolCall.output
                        ? Buffer.from(JSON.stringify(candidateStep.toolCall.output))
                        : undefined,
                }
                : undefined;
            const metadataJson = Object.keys(stepMetadata).length > 0
                ? Buffer.from(JSON.stringify(stepMetadata))
                : undefined;
            mapleLog("debug", "grpc_evaluate_step", { stepIndex: candidateStep.index });
            const response = await grpcUnary(clients.contextWall, "evaluateStep", {
                context: grpcContext,
                step: {
                    index: candidateStep.index,
                    timestamp: candidateStep.timestamp,
                    actor: `STEP_ACTOR_${candidateStep.actor.toUpperCase()}`,
                    type: `STEP_TYPE_${candidateStep.type.toUpperCase()}`,
                    prompt: candidateStep.prompt ?? "",
                    output: candidateStep.output ?? "",
                    command: candidateStep.command ?? "",
                    externalUrl: candidateStep.externalUrl ?? "",
                    toolCall,
                    metadataJson,
                    riskScore: candidateStep.riskScore,
                    guardStatus: `GUARD_ACTION_${candidateStep.guardStatus.toUpperCase()}`,
                },
            });
            const d = response.decision;
            if (d) {
                const action = d.action === "FIREWALL_ACTION_DENY" ? "deny" : d.action === "FIREWALL_ACTION_LOG_ONLY" ? "log_only" : "allow";
                return {
                    enabled: true,
                    action,
                    shouldBlock: action === "deny",
                    severity: (d.severity?.toLowerCase()?.replace("risk_severity_", "") ?? "low"),
                    message: d.message ?? "",
                    recommendation: d.recommendation ?? "",
                    rule: d.ruleName || null,
                    redactedPatterns: d.redactedPatterns ?? [],
                    evaluatedAt: d.evaluatedAt ?? new Date().toISOString(),
                    defaultAction: "allow",
                    step: candidateStep,
                };
            }
        }
        catch (err) {
            mapleLog("warn", "grpc_evaluate_step_fallback", { error: errorMessage(err) });
            return policyUnavailableDecision(`Policy service unavailable: ${errorMessage(err)}`);
        }
    }
    return policyUnavailableDecision("Policy service unavailable.");
}
export async function generateViaGrpc(messages, systemPrompt, requestContext) {
    const clients = getGrpcClients();
    if (!clients?.contextWall) {
        throw new Error("Context-wall unavailable for chat orchestration.");
    }
    try {
        const authContext = authContextStorage.getStore();
        const requestLogContext = requestContextStorage.getStore();
        const tenantId = requestContext?.tenantId ?? requestLogContext?.tenantId ?? "default";
        const userId = requestContext?.userId ?? authContext?.userId ?? authContext?.keyFingerprint ?? "anonymous";
        const deviceId = requestContext?.deviceId ?? requestLogContext?.deviceId ?? "unknown-device";
        const contextPayload = {
            requestId: requestLogContext?.requestId ?? "",
            sessionId: requestContext?.sessionId ?? requestLogContext?.sessionId ?? "",
            traceId: requestContext?.traceId ?? requestLogContext?.traceId ?? "",
            userId,
            keyFingerprint: authContext?.keyFingerprint ?? "",
            sourceService: "gateway-api",
            tenantId,
            deviceId,
        };
        // Tool discovery for chat orchestration is owned by context-wall.
        // Gateway always sends an explicit empty list here so context-wall can
        // resolve tools from mcp-proxy inside the policy plane.
        const tools = [];
        mapleLog("debug", "grpc_orchestrate_chat", { messageCount: messages.length, toolCount: 0 });
        const response = await grpcUnary(clients.contextWall, "orchestrateChat", {
            context: contextPayload,
            messages: messages.map((m) => ({
                role: m.role,
                content: m.content,
            })),
            tools,
            systemPrompt: systemPrompt ?? "",
            model: requestContext?.model ?? "",
            reasoningEffort: requestContext?.reasoningEffort ?? "",
            temperature: 0,
            maxTokens: 0,
        }, { deadlineMs: 30000 });
        if (response?.allowed === false) {
            return {
                content: response.blockedReason || "Request blocked by policy.",
                model: "policy-blocked",
            };
        }
        if (response?.reply) {
            return { content: response.reply, model: response.model ?? "unknown" };
        }
        throw new Error("Context-wall orchestrateChat returned no reply.");
    }
    catch (err) {
        mapleLog("warn", "grpc_orchestrate_chat_failed", { error: errorMessage(err) });
        throw err;
    }
}
//# sourceMappingURL=firewall-grpc.js.map
