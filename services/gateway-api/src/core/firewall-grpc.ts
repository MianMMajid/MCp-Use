import {
  evaluateFirewallStep,
  type FirewallStepDecision,
} from "@maple/security";
import type { TraceStep } from "@maple/types";
import { authContextStorage } from "../auth.js";
import { grpcUnary } from "../grpc-clients.js";
import { errorMessage } from "../helpers.js";
import { mapleLog, requestContextStorage } from "../logging.js";
import { getGrpcClients } from "../state.js";

export async function evaluateFirewallStepViaGrpc(
  candidateStep: TraceStep,
  options: { failClosed?: boolean } = {},
): Promise<FirewallStepDecision> {
  const clients = getGrpcClients();
  const requestLogContext = requestContextStorage.getStore();
  const authContext = authContextStorage.getStore();
  const stepMetadata =
    candidateStep.metadata && typeof candidateStep.metadata === "object"
      ? (candidateStep.metadata as Record<string, unknown>)
      : {};
  const grpcContext = {
    requestId:
      (typeof stepMetadata.requestId === "string" && stepMetadata.requestId.trim().length > 0
        ? stepMetadata.requestId
        : requestLogContext?.requestId) ?? "",
    sessionId:
      (typeof stepMetadata.sessionId === "string" && stepMetadata.sessionId.trim().length > 0
        ? stepMetadata.sessionId
        : requestLogContext?.sessionId) ?? "",
    traceId:
      (typeof stepMetadata.traceId === "string" && stepMetadata.traceId.trim().length > 0
        ? stepMetadata.traceId
        : requestLogContext?.traceId) ?? "",
    userId:
      (typeof stepMetadata.userId === "string" && stepMetadata.userId.trim().length > 0
        ? stepMetadata.userId
        : authContext?.userId ?? authContext?.keyFingerprint) ?? "",
    keyFingerprint: authContext?.keyFingerprint ?? "",
    sourceService:
      (typeof stepMetadata.sourceService === "string" && stepMetadata.sourceService.trim().length > 0
        ? stepMetadata.sourceService
        : "gateway-api"),
    tenantId:
      (typeof stepMetadata.tenantId === "string" && stepMetadata.tenantId.trim().length > 0
        ? stepMetadata.tenantId
        : requestLogContext?.tenantId) ?? "",
    deviceId:
      (typeof stepMetadata.deviceId === "string" && stepMetadata.deviceId.trim().length > 0
        ? stepMetadata.deviceId
        : requestLogContext?.deviceId) ?? "",
  };

  const failClosed = Boolean(options.failClosed);

  if (clients?.contextWall) {
    try {
      mapleLog("debug", "grpc_evaluate_step", { stepIndex: candidateStep.index });
      const response = await grpcUnary<any>(clients.contextWall, "evaluateStep", {
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
          toolCall: candidateStep.toolCall ? { name: candidateStep.toolCall.name } : undefined,
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
          severity: (d.severity?.toLowerCase()?.replace("risk_severity_", "") ?? "low") as any,
          message: d.message ?? "",
          recommendation: d.recommendation ?? "",
          rule: d.ruleName || null,
          redactedPatterns: d.redactedPatterns ?? [],
          evaluatedAt: d.evaluatedAt ?? new Date().toISOString(),
          defaultAction: "allow",
          step: candidateStep,
        };
      }
    } catch (err) {
      mapleLog("warn", "grpc_evaluate_step_fallback", { error: errorMessage(err) });
      if (failClosed) {
        return {
          enabled: true,
          action: "deny",
          shouldBlock: true,
          severity: "high",
          message: `Policy service unavailable: ${errorMessage(err)}`,
          recommendation: "Restore context-wall connectivity and retry.",
          rule: "context-wall-unavailable",
          redactedPatterns: [],
          evaluatedAt: new Date().toISOString(),
          defaultAction: "deny",
          step: candidateStep,
        };
      }
    }
  }

  if (failClosed) {
    return {
      enabled: true,
      action: "deny",
      shouldBlock: true,
      severity: "high",
      message: "Policy service unavailable.",
      recommendation: "Restore context-wall connectivity and retry.",
      rule: "context-wall-unavailable",
      redactedPatterns: [],
      evaluatedAt: new Date().toISOString(),
      defaultAction: "deny",
      step: candidateStep,
    };
  }

  return evaluateFirewallStep(candidateStep);
}

interface OrchestrationToolInfo {
  name: string;
  description: string;
  inputSchemaJson: Buffer;
  appId: string;
}

export async function generateViaGrpc(
  messages: Array<{ role: string; content: string }>,
  systemPrompt?: string,
  requestContext?: {
    tenantId?: string;
    userId?: string;
    deviceId?: string;
    sessionId?: string;
    traceId?: string;
  },
): Promise<{ content: string; model: string } | null> {
  const clients = getGrpcClients();
  if (!clients?.contextWall) return null;
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
    const tools: OrchestrationToolInfo[] = [];

    mapleLog("debug", "grpc_orchestrate_chat", { messageCount: messages.length, toolCount: 0 });
    const response = await grpcUnary<any>(clients.contextWall, "orchestrateChat", {
      context: contextPayload,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      tools,
      systemPrompt: systemPrompt ?? "",
      model: "",
      temperature: 0,
      maxTokens: 0,
    });
    if (response?.allowed === false) {
      return {
        content: response.blockedReason || "Request blocked by policy.",
        model: "policy-blocked",
      };
    }
    if (response?.reply) {
      return { content: response.reply, model: response.model ?? "unknown" };
    }
  } catch (err) {
    mapleLog("warn", "grpc_orchestrate_chat_fallback", { error: errorMessage(err) });
  }
  return null;
}
