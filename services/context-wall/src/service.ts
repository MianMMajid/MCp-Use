import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { loadGrpcTlsConfig, loadServiceClientSecure, mapleLog } from "@maple/common";
import { enforceTraceFirewall, evaluateFirewallStep, detectPromptInjection, scanForPII, redactPII, type PolicyStore } from "@maple/security";
import { analyzeTraceRisks, applyAuditToTrace } from "@maple/risk-engine";
import { ApprovalQueue } from "./approval-queue.js";
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
  includeDirs: [PROTO_ROOT],
});

const proto = grpc.loadPackageDefinition(packageDefinition) as any;
const contextProto = proto.maple.context.v1;

function loadServiceClient(protoFile: string, servicePath: string, address: string): any {
  return loadServiceClientSecure(
    protoFile,
    servicePath,
    address,
    PROTO_ROOT,
    grpcTlsConfig,
  );
}

function grpcUnary<T>(client: any, method: string, request: any): Promise<T> {
  return new Promise((resolvePromise, rejectPromise) => {
    client[method](request, (err: grpc.ServiceError | null, response: T) => {
      if (err) rejectPromise(err);
      else resolvePromise(response);
    });
  });
}

let modelRouterClient: any;
let mcpProxyClient: any;
let auditWriterClient: any;

function getModelRouter(): any {
  if (!modelRouterClient) {
    modelRouterClient = loadServiceClient(
      "maple/model/v1/model_router.proto",
      "maple.model.v1.ModelRouterService",
      config.modelRouterAddress,
    );
  }
  return modelRouterClient;
}

function getMcpProxy(): any {
  if (!mcpProxyClient) {
    mcpProxyClient = loadServiceClient(
      "maple/proxy/v1/mcp_proxy.proto",
      "maple.proxy.v1.McpProxyService",
      config.mcpProxyAddress,
    );
  }
  return mcpProxyClient;
}

function getAuditWriter(): any {
  if (!auditWriterClient) {
    auditWriterClient = loadServiceClient(
      "maple/audit/v1/audit_writer.proto",
      "maple.audit.v1.AuditWriterService",
      config.auditWriterAddress,
    );
  }
  return auditWriterClient;
}

function emitAuditEvent(opts: {
  eventType: string;
  summary: string;
  severity?: string;
  traceId?: string;
  payload?: Record<string, unknown>;
}): void {
  try {
    grpcUnary(getAuditWriter(), "appendEvent", {
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
    }).catch((err) => {
      mapleLog("warn", "context_wall_audit_emit_failed", { error: err.message });
    });
  } catch {
    // fire-and-forget
  }
}

function toProtoPolicyDecision(decision: any): any {
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

function traceFromProto(protoTrace: any): any {
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
    metadata: protoTrace.metadataJson ? JSON.parse(Buffer.from(protoTrace.metadataJson).toString()) : {},
    steps: (protoTrace.steps || []).map((s: any) => ({
      index: s.index || 0,
      timestamp: s.timestamp || new Date().toISOString(),
      actor: s.actor === "STEP_ACTOR_AGENT" ? "agent" : s.actor === "STEP_ACTOR_TOOL" ? "tool" : s.actor === "STEP_ACTOR_SYSTEM" ? "system" : s.actor === "STEP_ACTOR_USER" ? "user" : "agent",
      type: s.type === "STEP_TYPE_TOOL_CALL" ? "tool_call" : s.type === "STEP_TYPE_SHELL" ? "shell" : s.type === "STEP_TYPE_BROWSER" ? "browser" : s.type === "STEP_TYPE_NETWORK" ? "network" : s.type === "STEP_TYPE_EMAIL" ? "email" : s.type === "STEP_TYPE_SYSTEM" ? "system" : "prompt",
      prompt: s.prompt,
      output: s.output,
      command: s.command,
      externalUrl: s.externalUrl,
      toolCall: s.toolCall ? { name: s.toolCall.name, input: s.toolCall.inputJson ? JSON.parse(Buffer.from(s.toolCall.inputJson).toString()) : undefined, output: s.toolCall.outputJson ? JSON.parse(Buffer.from(s.toolCall.outputJson).toString()) : undefined } : undefined,
      metadata: s.metadataJson ? JSON.parse(Buffer.from(s.metadataJson).toString()) : undefined,
      riskScore: s.riskScore || 0,
      riskFlags: (s.riskFlags || []).map((f: any) => ({ id: f.id, type: f.type, severity: f.severity?.toLowerCase()?.replace("risk_severity_", "") || "low", stepIndex: f.stepIndex, message: f.message, recommendation: f.recommendation, evidence: f.evidence })),
      guardStatus: s.guardStatus === "GUARD_ACTION_ALLOW" ? "allow" : s.guardStatus === "GUARD_ACTION_BLOCK" ? "block" : "pending",
    })),
  };
}

function stepFromProto(protoStep: any): any {
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
    metadata: protoStep.metadataJson ? JSON.parse(Buffer.from(protoStep.metadataJson).toString()) : undefined,
    riskScore: protoStep.riskScore || 0,
    riskFlags: protoStep.riskFlags || [],
    guardStatus: protoStep.guardStatus === "GUARD_ACTION_ALLOW" ? "allow" : protoStep.guardStatus === "GUARD_ACTION_BLOCK" ? "block" : "pending",
  };
}

function toProtoStep(step: any): any {
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

function toModelRole(role: string): string {
  const normalized = String(role || "user").trim().toLowerCase();
  if (normalized === "system") return "CHAT_ROLE_SYSTEM";
  if (normalized === "assistant") return "CHAT_ROLE_ASSISTANT";
  if (normalized === "tool") return "CHAT_ROLE_TOOL";
  return "CHAT_ROLE_USER";
}

function bytesToUtf8String(raw: unknown, fallback = "{}"): string {
  if (typeof raw === "string") return raw;
  if (Buffer.isBuffer(raw)) return raw.toString("utf-8");
  if (raw === null || raw === undefined) return fallback;
  return String(raw);
}

function parseJsonObject(raw: unknown, fallback: Record<string, unknown>): { ok: true; value: Record<string, unknown> } | { ok: false } {
  try {
    const parsed = JSON.parse(bytesToUtf8String(raw));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false };
    }
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch {
    return { ok: false };
  }
}

function parseJsonValue(raw: unknown, fallback: unknown): unknown {
  try {
    return JSON.parse(bytesToUtf8String(raw));
  } catch {
    return fallback;
  }
}

function deriveScopeFromArguments(
  args: Record<string, unknown>,
): { allowedDomains?: string[]; maxBytes?: number; allowFileDownload?: boolean } | undefined {
  const candidateUrl =
    typeof args.url === "string" ? args.url
      : typeof args.targetUrl === "string" ? args.targetUrl
        : typeof args.endpoint === "string" ? args.endpoint
          : undefined;

  if (!candidateUrl) return undefined;
  try {
    const hostname = new URL(candidateUrl).hostname;
    if (!hostname) return undefined;
    return {
      allowedDomains: [hostname],
      maxBytes: 500_000,
      allowFileDownload: false,
    };
  } catch {
    return undefined;
  }
}

interface NormalizedRequestContext {
  requestId: string;
  sessionId: string;
  traceId: string;
  userId: string;
  keyFingerprint: string;
  sourceService: string;
  tenantId: string;
  deviceId: string;
}

function normalizeRequestContext(raw: any): NormalizedRequestContext {
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

function withContextMetadata(
  step: any,
  context: NormalizedRequestContext,
): any {
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

function stepSessionId(step: any): string {
  return step?.metadata && typeof step.metadata === "object"
    ? String((step.metadata as Record<string, unknown>).sessionId || "")
    : "";
}

interface OrchestrationTool {
  name: string;
  description: string;
  inputSchemaJson: Buffer;
  appId: string;
}

const ORCHESTRATION_TOOLS_CACHE_TTL_MS = 30_000;
let orchestrationToolsCache:
  | {
      expiresAt: number;
      tools: OrchestrationTool[];
    }
  | null = null;

function normalizeToolSchemaBytes(raw: unknown): Buffer {
  if (!raw) {
    return Buffer.from("{}");
  }
  try {
    const json = typeof raw === "string" ? raw : Buffer.from(raw as any).toString("utf-8");
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return Buffer.from("{}");
    }
    return Buffer.from(JSON.stringify(parsed));
  } catch {
    return Buffer.from("{}");
  }
}

async function loadOrchestrationToolsFromMcpProxy(): Promise<OrchestrationTool[]> {
  if (orchestrationToolsCache && orchestrationToolsCache.expiresAt > Date.now()) {
    return orchestrationToolsCache.tools;
  }

  const response = await grpcUnary<any>(getMcpProxy(), "listTools", { appId: "" });
  const rawTools = Array.isArray(response?.tools) ? response.tools : [];
  const seenNames = new Set<string>();
  const tools: OrchestrationTool[] = [];
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

export function createContextWallService(approvalQueue: ApprovalQueue, policyStore?: PolicyStore): grpc.Server {
  const getExternalRules = () => policyStore?.getExternalRules();
  const server = new grpc.Server();

  const executeToolWithPolicyInternal = async (request: any): Promise<any> => {
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
    const toolCallId = String(
      request.toolCallId ||
      `${traceId || "trace"}.${approvalStepIndex}.${appId}.${toolName}`,
    );

    const candidateStep = withContextMetadata({
      index: approvalStepIndex,
      timestamp: new Date().toISOString(),
      actor: "agent" as const,
      type: "tool_call" as const,
      toolCall: { name: `${appId}.${toolName}`, input: parsedArgs },
      output: JSON.stringify(parsedArgs),
      metadata: {
        targetUrl,
        appId,
      },
      riskScore: 0,
      riskFlags: [] as any[],
      guardStatus: "pending" as const,
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

      const approval = await approvalQueue.waitForResolution(
        traceId,
        approvalStepIndex,
        config.hitlApprovalTimeoutMs,
      );

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
    const response = await grpcUnary<any>(getMcpProxy(), "executeTool", {
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
    });

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
    EvaluateStep(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
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
      } catch (err: any) {
        mapleLog("error", "context_wall_evaluate_step_failed", { error: err.message });
        callback({ code: grpc.status.INTERNAL, message: err.message });
      }
    },

    EvaluateTrace(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
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
      } catch (err: any) {
        callback({ code: grpc.status.INTERNAL, message: err.message });
      }
    },

    GetPolicyDecision(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
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
          actor: "agent" as const,
          type: action === "tool_call"
            ? "tool_call" as const
            : action === "network"
              ? "network" as const
              : action === "shell"
                ? "shell" as const
                : "prompt" as const,
          toolCall: toolName ? { name: toolName } : undefined,
          metadata: { tenantId, userId, deviceId },
          riskScore: 0,
          riskFlags: [] as any[],
          guardStatus: "pending" as const,
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
      } catch (err: any) {
        mapleLog("error", "context_wall_get_policy_decision_failed", { error: err.message });
        callback({ code: grpc.status.INTERNAL, message: err.message });
      }
    },

    SubmitApproval(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
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
      } catch (err: any) {
        callback({ code: grpc.status.INTERNAL, message: err.message });
      }
    },

    WatchApprovalQueue(call: grpc.ServerWritableStream<any, any>) {
      const requestedSessionId = String(call.request?.sessionId || "");
      const unwatch = approvalQueue.watch((event) => {
        if (requestedSessionId && stepSessionId(event.step) !== requestedSessionId) {
          return;
        }
        const decision = evaluateFirewallStep(event.step, getExternalRules());
        call.write({
          traceId: event.traceId,
          stepIndex: event.stepIndex,
          step: toProtoStep(event.step),
          pendingDecision: toProtoPolicyDecision(decision),
          requestedAt: event.requestedAt,
        });
      });
      call.on("cancelled", unwatch);
      call.on("close", unwatch);
    },

    ListPendingApprovals(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
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
      } catch (err: any) {
        callback({ code: grpc.status.INTERNAL, message: err.message });
      }
    },

    AuditTrace(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
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
      } catch (err: any) {
        callback({ code: grpc.status.INTERNAL, message: err.message });
      }
    },

    SanitizePrompt(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
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
          actor: "agent" as const,
          type: "prompt" as const,
          prompt,
          riskScore: 0,
          riskFlags: [] as any[],
          guardStatus: "pending" as const,
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
      } catch (err: any) {
        mapleLog("error", "context_wall_sanitize_prompt_failed", { error: err.message });
        callback({ code: grpc.status.INTERNAL, message: err.message });
      }
    },

    GetAllowedTools(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
      try {
        const context = normalizeRequestContext(call.request.context);
        const toolNames: string[] = call.request.toolNames || [];
        const allowed: string[] = [];
        const denied: string[] = [];
        for (const toolName of toolNames) {
          const syntheticStep = withContextMetadata({
            index: 0,
            timestamp: new Date().toISOString(),
            actor: "tool" as const,
            type: "tool_call" as const,
            toolCall: { name: toolName },
            riskScore: 0,
            riskFlags: [] as any[],
            guardStatus: "pending" as const,
          }, context);
          const decision = evaluateFirewallStep(syntheticStep, getExternalRules());
          if (decision.shouldBlock) {
            denied.push(toolName);
          } else {
            allowed.push(toolName);
          }
        }
        mapleLog("debug", "context_wall_get_allowed_tools", { total: toolNames.length, allowed: allowed.length, denied: denied.length });
        callback(null, { allowedTools: allowed, deniedTools: denied });
      } catch (err: any) {
        mapleLog("error", "context_wall_get_allowed_tools_failed", { error: err.message });
        callback({ code: grpc.status.INTERNAL, message: err.message });
      }
    },

    async OrchestrateChat(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
      try {
        const requestContext = normalizeRequestContext(call.request.context);
        const turns = Array.isArray(call.request.messages) ? call.request.messages : [];
        const latestUserTurnIndex = turns.map((t: any) => String(t.role || "").toLowerCase()).lastIndexOf("user");
        const latestPrompt = latestUserTurnIndex >= 0
          ? String(turns[latestUserTurnIndex]?.content ?? "")
          : String(turns[turns.length - 1]?.content ?? "");

        const candidateStep = withContextMetadata({
          index: 0,
          timestamp: new Date().toISOString(),
          actor: "agent" as const,
          type: "prompt" as const,
          prompt: latestPrompt,
          riskScore: 0,
          riskFlags: [] as any[],
          guardStatus: "pending" as const,
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
        if (rawTools.length === 0) {
          try {
            rawTools = await loadOrchestrationToolsFromMcpProxy();
          } catch (err: any) {
            mapleLog("warn", "context_wall_load_orchestration_tools_failed", { error: err.message });
            rawTools = [];
          }
        }
        const modelTools = rawTools
          .map((tool: any) => ({
            name: String(tool.name || ""),
            description: String(tool.description || ""),
            parametersJson: Buffer.from(bytesToUtf8String(tool.inputSchemaJson, "{}")),
          }))
          .filter((tool: any) => tool.name.length > 0);
        const toolByName = new Map<string, any>();
        for (const tool of rawTools) {
          const name = String(tool?.name || "");
          if (name.length > 0) toolByName.set(name, tool);
        }

        const initialModelMessages = turns.map((t: any, idx: number) => {
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
          const response = await grpcUnary<any>(getModelRouter(), "generate", {
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

            let toolPayload: unknown = {};
            if (!executeResult.allowed) {
              toolPayload = { error: executeResult.blockedReason || "Tool blocked by policy." };
            } else if (!executeResult.success) {
              toolPayload = { error: executeResult.errorMessage || "Tool execution failed." };
            } else {
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
      } catch (err: any) {
        mapleLog("error", "context_wall_orchestrate_chat_failed", { error: err.message });
        callback({ code: grpc.status.INTERNAL, message: err.message });
      }
    },

    async ExecuteToolWithPolicy(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
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
      } catch (err: any) {
        mapleLog("error", "context_wall_execute_tool_with_policy_failed", { error: err.message });
        callback({ code: grpc.status.INTERNAL, message: err.message });
      }
    },

    async ForwardJsonRpcWithPolicy(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
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
          actor: "agent" as const,
          type: "network" as const,
          prompt: `forward ${appId}`,
          output: JSON.stringify(payload),
          metadata: { appId, targetUrl },
          riskScore: 0,
          riskFlags: [] as any[],
          guardStatus: "pending" as const,
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

        const response = await grpcUnary<any>(getMcpProxy(), "forwardJsonRpc", {
          context: requestContext,
          appId,
          payloadJson: Buffer.from(JSON.stringify(payload)),
          targetUrl,
        });

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
      } catch (err: any) {
        mapleLog("error", "context_wall_forward_jsonrpc_with_policy_failed", { error: err.message });
        callback({ code: grpc.status.INTERNAL, message: err.message });
      }
    },

    async ReloadPolicies(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
      try {
        if (!policyStore) {
          callback(null, { success: false, ruleCount: 0, errorMessage: "PolicyStore not configured" });
          return;
        }
        const result = await policyStore.reload();
        mapleLog("info", "context_wall_reload_policies", { success: result.success, ruleCount: result.ruleCount });
        callback(null, { success: result.success, ruleCount: result.ruleCount, errorMessage: result.error ?? "" });
      } catch (err: any) {
        mapleLog("error", "context_wall_reload_policies_failed", { error: err.message });
        callback({ code: grpc.status.INTERNAL, message: err.message });
      }
    },
  };

  server.addService(contextProto.ContextWallService.service, serviceImpl);
  return server;
}
