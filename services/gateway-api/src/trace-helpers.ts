/**
 * trace-helpers.ts
 *
 * Extracted from app.ts: trace CRUD with owner isolation, OpenClaw event
 * ingestion, firewall chat context building, session polling, bridge helpers,
 * and markdown rendering.
 */

import {
  asString,
  asObject,
  dedupeBy,
  errorMessage,
  truncateText,
  compactUnknown,
  extractFirstUrl,
  extractLikelyCommand,
  toFiniteNumber,
  asNumber,
  sanitizeSessionId,
} from "./helpers.js";

import { mapleLog, requestContextStorage } from "./logging.js";

import {
  configuredBridgeUrl,
  configuredBridgeToken,
  primaryConfiguredApiKeyFingerprint,
  bridgeOverrideLockEnabled,
  firewallChatAiEnabled,
  evolvedSuggestionsServed,
  sessionPollEnabled,
  sessionPollIntervalMs,
  type FirewallChatAiProvider,
} from "./config.js";

import { traceStore, sharedTraceStore, database } from "./state.js";

import {
  authContextStorage,
  currentOwnerKeyFingerprint,
  currentOwnerKeyFingerprintsForLookup,
} from "./auth.js";

import { startObservation, stepFromBridgeEvent } from "./bridge/openclaw-bridge.js";

import {
  applyAuditToTrace,
  analyzeTraceRisks,
} from "@maple/risk-engine";

import {
  enforceTraceFirewall,
  evaluateFirewallStep,
  type FirewallStepDecision,
} from "@maple/security";

import { getGrpcClients } from "./state.js";
import { grpcUnary } from "./grpc-clients.js";

import type {
  Trace,
  TraceForkEdits,
  TraceStep,
  OpenClawRawEvent,
  AuditReport,
} from "@maple/types";

// ═══════════════════════════════════════════════════════════════════════════════
// gRPC wrapper helpers (fallback to local on failure)
// ═══════════════════════════════════════════════════════════════════════════════

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

interface OrchestrationToolInfo {
  name: string;
  description: string;
  inputSchemaJson: Buffer;
  appId: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Community baselines & audit-persist
// ═══════════════════════════════════════════════════════════════════════════════

export function getCommunityBaselines(enabled = true): number[][] {
  if (!enabled) {
    return [];
  }
  return sharedTraceStore.getEmbeddingBaselines(250);
}

export function auditAndPersist(
  trace: Trace,
  options: { useCommunityBaseline?: boolean; threshold?: number } = {}
) {
  const firewall = enforceTraceFirewall(trace);
  const report = analyzeTraceRisks(trace.steps, {
    communityBaselines: getCommunityBaselines(options.useCommunityBaseline ?? true),
    embeddingThreshold: options.threshold,
  });
  applyAuditToTrace(trace, report);
  trace.metadata = {
    ...(trace.metadata ?? {}),
    firewall: {
      ...(trace.metadata?.firewall && typeof trace.metadata.firewall === "object"
        ? (trace.metadata.firewall as Record<string, unknown>)
        : {}),
      blockedSteps: firewall.blockedSteps,
      redactedSteps: firewall.redactedSteps,
      enforcedAt: firewall.enforcedAt,
      enabled: firewall.enabled,
      defaultAction: firewall.defaultAction,
      ruleHits: firewall.ruleHits,
    },
  };
  upsertTraceForCurrentOwner(trace);
  return report;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Session polling (bridge auto-discovery)
// ═══════════════════════════════════════════════════════════════════════════════

export async function pollForNewSessions(): Promise<void> {
  if (!configuredBridgeUrl || !configuredBridgeToken) return;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);
    let bridgeSessions: string[];
    try {
      const res = await fetch(new URL("/sessions", configuredBridgeUrl), {
        headers: { Authorization: `Bearer ${configuredBridgeToken}` },
        signal: controller.signal,
      });
      if (!res.ok) return; // silent fail, retry next cycle
      const body = (await res.json()) as { sessions?: unknown };
      bridgeSessions = Array.isArray(body.sessions) ? body.sessions : [];
    } finally {
      clearTimeout(timeout);
    }

    if (bridgeSessions.length === 0) return;

    const ownerFingerprint = primaryConfiguredApiKeyFingerprint;
    const tracked = new Set(traceStore.listSessionIds(ownerFingerprint));

    for (const sessionId of bridgeSessions) {
      if (tracked.has(sessionId)) {
        await refreshExistingSession(sessionId, ownerFingerprint);
        continue;
      }

      try {
        const trace = await startObservation({
          sessionId,
          source: "openclaw",
          bridgeUrl: configuredBridgeUrl,
          token: configuredBridgeToken,
        });

        if (trace.steps.length === 0) continue;

        trace.ownerKeyFingerprint = ownerFingerprint;
        traceStore.upsertTrace(trace, ownerFingerprint);

        const firewall = enforceTraceFirewall(trace);
        const report = analyzeTraceRisks(trace.steps, {
          communityBaselines: getCommunityBaselines(true),
        });
        applyAuditToTrace(trace, report);
        trace.metadata = {
          ...(trace.metadata ?? {}),
          autoDiscovered: true,
          discoveredAt: new Date().toISOString(),
          firewall: {
            blockedSteps: firewall.blockedSteps,
            redactedSteps: firewall.redactedSteps,
            enforcedAt: firewall.enforcedAt,
            enabled: firewall.enabled,
            defaultAction: firewall.defaultAction,
            ruleHits: firewall.ruleHits,
          },
        };
        traceStore.upsertTrace(trace, ownerFingerprint);

        console.log(
          `[SESSION-POLL] New session: ${sessionId} (${trace.steps.length} steps, risk: ${report.overallRiskScore}, severity: ${report.severity})`
        );
      } catch (err) {
        console.error(
          `[SESSION-POLL] Failed to ingest ${sessionId}:`,
          err instanceof Error ? err.message : err
        );
      }
    }
  } catch {
    // Bridge unreachable or other top-level error — silent, retry next cycle
  }
}

export async function refreshExistingSession(
  sessionId: string,
  ownerFingerprint?: string
): Promise<void> {
  const existing = traceStore.getLatestTraceBySession(sessionId, ownerFingerprint);
  if (!existing) return;

  try {
    const latest = await startObservation({
      sessionId,
      source: "openclaw",
      bridgeUrl: configuredBridgeUrl,
      token: configuredBridgeToken,
    });

    if (latest.steps.length <= existing.steps.length) return;

    const merged = mergeLiveOpenClawTrace(existing, latest);
    traceStore.upsertTrace(merged, ownerFingerprint);

    const firewall = enforceTraceFirewall(merged);
    const report = analyzeTraceRisks(merged.steps, {
      communityBaselines: getCommunityBaselines(true),
    });
    applyAuditToTrace(merged, report);
    merged.metadata = {
      ...(merged.metadata ?? {}),
      firewall: {
        blockedSteps: firewall.blockedSteps,
        redactedSteps: firewall.redactedSteps,
        enforcedAt: firewall.enforcedAt,
        enabled: firewall.enabled,
        defaultAction: firewall.defaultAction,
        ruleHits: firewall.ruleHits,
      },
    };
    traceStore.upsertTrace(merged, ownerFingerprint);

    const newStepCount = latest.steps.length - existing.steps.length;
    console.log(
      `[SESSION-POLL] Updated session: ${sessionId} (+${newStepCount} steps, total: ${merged.steps.length}, risk: ${report.overallRiskScore})`
    );
  } catch {
    // Silent failure for refresh — will retry next cycle
  }
}

export function buildYcMetrics() {
  const traces = listTracesForCurrentOwner(1000);
  const community = sharedTraceStore.getStats();

  return {
    totalObservedTraces: traces.length,
    openclawTraces: traces.filter((trace) => trace.source === "openclaw").length,
    sharedTraces: community.sharedTraces,
    uniqueSignatures: community.uniqueSignatures,
    highRiskDetections: traces.filter((trace) => Number(trace.metadata?.overallRiskScore ?? 0) >= 60)
      .length,
    evolvedSuggestionsServed,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Step inference & policy snapshot
// ═══════════════════════════════════════════════════════════════════════════════

export function inferStepTypeFromDownstream(summary: string, toolName: string): TraceStep["type"] {
  const lower = `${toolName}\n${summary}`.toLowerCase();
  if (
    /(curl|wget|bash|zsh|sh|python|node|npm|pnpm|rm\s+-|chmod|sudo|terminal|shell|command)/.test(
      lower
    )
  ) {
    return "shell";
  }
  if (
    /https?:\/\/|web_fetch|browser|search|http|dns|socket|upload|download|request|fetch/.test(lower)
  ) {
    return "network";
  }
  if (/(mail|email|gmail|inbox|smtp|imap)/.test(lower)) {
    return "email";
  }
  return "tool_call";
}

export function toInvocationSummary(toolName: string, toolArgs: Record<string, unknown>): string {
  const compact = compactUnknown(toolArgs, 8_000);
  let serialized = "";
  try {
    serialized = JSON.stringify(compact, null, 2);
  } catch {
    serialized = String(compact ?? "");
  }
  const summary = serialized.trim().length > 0 ? `${toolName}\n${serialized}` : toolName;
  return truncateText(summary, 2400);
}

export function toPolicySnapshot(decision: FirewallStepDecision) {
  return {
    action: decision.action,
    shouldBlock: decision.shouldBlock,
    severity: decision.severity,
    rule: decision.rule,
    message: decision.message,
    recommendation: decision.recommendation,
    evaluatedAt: decision.evaluatedAt,
    redactedPatterns: decision.redactedPatterns,
    defaultAction: decision.defaultAction,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Trace ownership CRUD helpers
// ═══════════════════════════════════════════════════════════════════════════════

export function createTraceForCurrentOwner(base: Omit<Trace, "id" | "startedAt" | "updatedAt">): Trace {
  return traceStore.createTrace(base, currentOwnerKeyFingerprint());
}

export function upsertTraceForCurrentOwner(trace: Trace): Trace {
  return traceStore.upsertTrace(trace, trace.ownerKeyFingerprint ?? currentOwnerKeyFingerprint());
}

export function getTraceForCurrentOwner(traceId: string): Trace | undefined {
  const ownerScopes = currentOwnerKeyFingerprintsForLookup();
  if (!ownerScopes) {
    return traceStore.getTrace(traceId);
  }
  for (const owner of ownerScopes) {
    const matched = traceStore.getTrace(traceId, owner);
    if (matched) {
      return matched;
    }
  }
  return undefined;
}

export function getLatestTraceBySessionForCurrentOwner(sessionId: string): Trace | undefined {
  const ownerScopes = currentOwnerKeyFingerprintsForLookup();
  if (!ownerScopes) {
    return traceStore.getLatestTraceBySession(sessionId);
  }
  const candidates = ownerScopes
    .map((owner) => traceStore.getLatestTraceBySession(sessionId, owner))
    .filter((trace): trace is Trace => Boolean(trace))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return candidates[0];
}

export function listTracesForCurrentOwner(limit: number, sessionId?: string): Trace[] {
  const ownerScopes = currentOwnerKeyFingerprintsForLookup();
  if (!ownerScopes) {
    return traceStore.listTraces(limit, sessionId);
  }
  const merged = ownerScopes.flatMap((owner) => traceStore.listTraces(limit, sessionId, owner));
  const deduped = dedupeBy(merged, (trace) => trace.id);
  return deduped
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit);
}

export function deleteTraceForCurrentOwner(traceId: string): boolean {
  const trace = getTraceForCurrentOwner(traceId);
  if (!trace) {
    return false;
  }
  return traceStore.deleteTrace(trace.id, trace.ownerKeyFingerprint);
}

export function clearTracesForCurrentOwner(): number {
  let removed = 0;
  while (true) {
    const batch = listTracesForCurrentOwner(200);
    if (batch.length === 0) {
      break;
    }
    for (const trace of batch) {
      if (traceStore.deleteTrace(trace.id, trace.ownerKeyFingerprint)) {
        removed += 1;
      }
    }
  }
  return removed;
}

// ═══════════════════════════════════════════════════════════════════════════════
// OpenClaw event ingestion
// ═══════════════════════════════════════════════════════════════════════════════

export function asOpenClawRawEvent(value: unknown): OpenClawRawEvent | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as OpenClawRawEvent;
}

export function eventIdFromStep(step: TraceStep): string | undefined {
  const maybe = step.metadata?.eventId;
  if (typeof maybe !== "string") {
    return undefined;
  }
  const trimmed = maybe.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export interface OpenClawIngestResult {
  trace: Trace;
  appendedCount: number;
  skippedDuplicateCount: number;
  report: ReturnType<typeof auditAndPersist>;
}

export function ingestOpenClawEvents(options: {
  traceId?: string;
  sessionId?: string;
  events: OpenClawRawEvent[];
  sourceHint?: Trace["source"];
  metadata?: Record<string, unknown>;
}): OpenClawIngestResult {
  const { traceId, sessionId, events, sourceHint, metadata } = options;
  mapleLog("debug", "openclaw.ingest.begin", {
    traceId: traceId ?? null,
    sessionId: sessionId ?? null,
    sourceHint: sourceHint ?? null,
    eventCount: events.length,
    ingress: metadata?.ingress,
  });

  let trace = traceId ? getTraceForCurrentOwner(traceId) : undefined;
  if (traceId && !trace) {
    mapleLog("warn", "openclaw.ingest.trace_not_found", {
      traceId,
      sessionId: sessionId ?? null,
      eventCount: events.length,
    });
    throw new Error(`Trace ${traceId} not found.`);
  }

  if (!trace && sessionId) {
    trace = getLatestTraceBySessionForCurrentOwner(sessionId);
  }

  if (!trace) {
    trace = createTraceForCurrentOwner({
      sessionId: sessionId ?? `openclaw-${Date.now()}`,
      source: sourceHint === "manual" ? sourceHint : "openclaw",
      status: "active",
      metadata: {
        mode: "openclaw-push",
        ingestMode: "push",
        ...(metadata ?? {}),
      },
      steps: [],
    });
  }

  const seenEventIds = new Set<string>();
  for (const existingStep of trace.steps) {
    const eventId = eventIdFromStep(existingStep);
    if (eventId) {
      seenEventIds.add(eventId);
    }
  }

  let appendedCount = 0;
  let skippedDuplicateCount = 0;
  for (const event of events) {
    const nextIndex = trace.steps.length;
    const step = stepFromBridgeEvent(event, nextIndex);
    const eventId = eventIdFromStep(step);
    if (eventId && seenEventIds.has(eventId)) {
      skippedDuplicateCount += 1;
      continue;
    }

    trace.steps.push(step);
    appendedCount += 1;
    if (eventId) {
      seenEventIds.add(eventId);
    }
  }

  trace.source = sourceHint === "manual" ? sourceHint : "openclaw";
  trace.metadata = {
    ...(trace.metadata ?? {}),
    mode: trace.source === "openclaw" ? "openclaw-push" : trace.metadata?.mode,
    ingestMode: "push",
    ingestLastAt: new Date().toISOString(),
    ingestLastCount: appendedCount,
    ingestSkippedDuplicates: skippedDuplicateCount,
    ...(metadata ?? {}),
  };

  upsertTraceForCurrentOwner(trace);
  const report = auditAndPersist(trace);
  mapleLog("info", "openclaw.ingest.complete", {
    traceId: trace.id,
    sessionId: trace.sessionId,
    source: trace.source,
    appendedCount,
    skippedDuplicateCount,
    stepCount: trace.steps.length,
    status: trace.status,
    overallRiskScore: report.overallRiskScore,
    severity: report.severity,
    ingress: metadata?.ingress,
  });

  return {
    trace,
    appendedCount,
    skippedDuplicateCount,
    report,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Guard action for current owner
// ═══════════════════════════════════════════════════════════════════════════════

export function setGuardActionForCurrentOwner(
  traceId: string,
  stepIndex: number,
  action: "allow" | "block" | "pending",
  reason?: string
): Trace | undefined {
  const preferredOwner = currentOwnerKeyFingerprint();
  if (preferredOwner) {
    const updated = traceStore.setGuardAction(traceId, stepIndex, action, reason, preferredOwner);
    if (updated) {
      return updated;
    }
  }
  const ownerScopes = currentOwnerKeyFingerprintsForLookup();
  if (!ownerScopes) {
    return traceStore.setGuardAction(traceId, stepIndex, action, reason);
  }
  for (const owner of ownerScopes) {
    if (owner === preferredOwner) {
      continue;
    }
    const updated = traceStore.setGuardAction(traceId, stepIndex, action, reason, owner);
    if (updated) {
      return updated;
    }
  }
  return undefined;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Firewall chat context types & builders
// ═══════════════════════════════════════════════════════════════════════════════

export interface FirewallBlockedStepSummary {
  stepIndex: number;
  actor: TraceStep["actor"];
  type: TraceStep["type"];
  timestamp: string;
  rule: string | null;
  reason: string;
  commandOrUrl: string;
}

export interface FirewallActionSummary {
  stepIndex: number;
  actor: TraceStep["actor"];
  type: TraceStep["type"];
  timestamp: string;
  toolName: string | null;
  command: string | null;
  url: string | null;
  prompt: string;
  outputPreview: string;
  riskScore: number;
  guardStatus: TraceStep["guardStatus"];
}

export interface FirewallChatContext {
  generatedAt: string;
  trace:
    | {
        id: string;
        sessionId: string;
        source: Trace["source"];
        status: Trace["status"];
        startedAt: string;
        updatedAt: string;
        lastEventAt: string;
        stepCount: number;
        overallRiskScore: number;
        riskSeverity: string;
      }
    | null;
  firewall:
    | {
        enabled: boolean;
        defaultAction: string;
        blockedSteps: number;
        redactedSteps: number;
        highRiskSteps: number;
        guardCounts: {
          allow: number;
          block: number;
          pending: number;
        };
        ruleHits: Record<string, number>;
        topRules: Array<{ rule: string; count: number }>;
        quarantinedAt: string | null;
        lastBlockedStep: FirewallBlockedStepSummary | null;
        recentBlockedSteps: FirewallBlockedStepSummary[];
      }
    | null;
  activity:
    | {
        recentActions: FirewallActionSummary[];
        networkActions: FirewallActionSummary[];
        shellActions: FirewallActionSummary[];
      }
    | null;
  highlights: string[];
  recommendations: string[];
}

export function formatRuleLabel(rule: string): string {
  return rule
    .replace(/^firewall_/i, "")
    .replace(/[_-]+/g, " ")
    .trim();
}

export function stepCommandOrUrl(step: TraceStep): string {
  if (step.command) {
    return step.command;
  }
  if (step.externalUrl) {
    return step.externalUrl;
  }
  if (step.toolCall?.name) {
    return `tool:${step.toolCall.name}`;
  }
  if (step.prompt) {
    return step.prompt;
  }
  if (step.output) {
    return step.output;
  }
  return `${step.actor}:${step.type}`;
}

export function stepGuardReason(step: TraceStep): string {
  const guardReason =
    step.metadata && typeof step.metadata.guardReason === "string"
      ? step.metadata.guardReason
      : undefined;
  if (guardReason && guardReason.trim().length > 0) {
    return guardReason;
  }

  const firewallMessage =
    step.metadata &&
    typeof step.metadata.firewall === "object" &&
    step.metadata.firewall &&
    typeof (step.metadata.firewall as Record<string, unknown>).message === "string"
      ? String((step.metadata.firewall as Record<string, unknown>).message)
      : undefined;
  if (firewallMessage && firewallMessage.trim().length > 0) {
    return firewallMessage;
  }

  const firstFlag = Array.isArray(step.riskFlags) ? step.riskFlags[0] : undefined;
  if (firstFlag?.message) {
    return firstFlag.message;
  }

  return "Blocked by policy.";
}

export function stepFirewallRule(step: TraceStep): string | null {
  const rawRule =
    step.metadata &&
    typeof step.metadata.firewall === "object" &&
    step.metadata.firewall &&
    typeof (step.metadata.firewall as Record<string, unknown>).rule === "string"
      ? String((step.metadata.firewall as Record<string, unknown>).rule)
      : undefined;
  return rawRule && rawRule.trim().length > 0 ? rawRule : null;
}

export function toFirewallActionSummary(step: TraceStep): FirewallActionSummary {
  const prompt = typeof step.prompt === "string" ? step.prompt.trim() : "";
  const output = typeof step.output === "string" ? step.output.trim() : "";
  const inferredCommand = extractLikelyCommand([step.command ?? "", prompt, output].join("\n"));
  const inferredUrl =
    step.externalUrl ??
    extractFirstUrl([step.command ?? "", prompt, output, stepCommandOrUrl(step)].join("\n")) ??
    null;

  return {
    stepIndex: step.index,
    actor: step.actor,
    type: step.type,
    timestamp: step.timestamp,
    toolName: step.toolCall?.name ?? null,
    command: step.command ?? inferredCommand ?? null,
    url: inferredUrl,
    prompt: truncateText(prompt, 220),
    outputPreview: truncateText(output, 220),
    riskScore: toFiniteNumber(step.riskScore, 0),
    guardStatus: step.guardStatus,
  };
}

export function resolveTraceForFirewallContext(options: { traceId?: string; sessionId?: string }): Trace | undefined {
  if (options.traceId) {
    return getTraceForCurrentOwner(options.traceId);
  }
  if (options.sessionId) {
    return getLatestTraceBySessionForCurrentOwner(options.sessionId);
  }
  return listTracesForCurrentOwner(1)[0];
}

export function buildFirewallRecommendations(context: FirewallChatContext): string[] {
  if (!context.trace || !context.firewall) {
    return [
      "Start or ingest a trace first so Maple can evaluate firewall state.",
      "Use /api/firewall/decision before executing shell or network actions.",
    ];
  }

  const suggestions: string[] = [];
  if (context.firewall.blockedSteps > 0) {
    suggestions.push("Review blocked steps and keep deny decisions unless explicitly approved.");
  }
  if (context.firewall.highRiskSteps > 0) {
    suggestions.push("Run audit_risk and ml_anomaly_report to validate high-risk behavior clusters.");
  }
  if (context.firewall.redactedSteps > 0) {
    suggestions.push("Rotate credentials if redaction detected sensitive token patterns.");
  }
  if (context.trace.status !== "quarantined" && context.firewall.blockedSteps === 0) {
    suggestions.push("Keep pre-execution gating enabled to catch first risky action before execution.");
  }

  const topRule = context.firewall.topRules[0];
  if (topRule) {
    suggestions.push(`Most frequent firewall hit: ${formatRuleLabel(topRule.rule)}.`);
  }

  if (suggestions.length === 0) {
    suggestions.push("No immediate firewall actions required. Continue monitoring.");
  }
  return suggestions;
}

export function buildFirewallChatContext(options: { traceId?: string; sessionId?: string } = {}): FirewallChatContext {
  const generatedAt = new Date().toISOString();
  const trace = resolveTraceForFirewallContext(options);
  if (!trace) {
    const empty: FirewallChatContext = {
      generatedAt,
      trace: null,
      firewall: null,
      activity: null,
      highlights: ["No active trace available yet."],
      recommendations: [],
    };
    empty.recommendations = buildFirewallRecommendations(empty);
    return empty;
  }

  const overallRiskScore = toFiniteNumber(
    trace.metadata?.overallRiskScore,
    Math.max(0, ...trace.steps.map((step) => toFiniteNumber(step.riskScore, 0)))
  );
  const riskSeverity =
    (typeof trace.metadata?.riskSeverity === "string" && trace.metadata.riskSeverity) ||
    (overallRiskScore >= 80
      ? "critical"
      : overallRiskScore >= 60
        ? "high"
        : overallRiskScore >= 35
          ? "medium"
          : "low");
  const lastStep = trace.steps[trace.steps.length - 1];
  const lastEventAt = typeof lastStep?.timestamp === "string" ? lastStep.timestamp : trace.updatedAt;

  const guardCounts = {
    allow: trace.steps.filter((step) => step.guardStatus === "allow").length,
    block: trace.steps.filter((step) => step.guardStatus === "block").length,
    pending: trace.steps.filter((step) => step.guardStatus === "pending").length,
  };

  const blockedSteps = trace.steps
    .filter((step) => step.guardStatus === "block")
    .map((step) => ({
      stepIndex: step.index,
      actor: step.actor,
      type: step.type,
      timestamp: step.timestamp,
      rule: stepFirewallRule(step),
      reason: stepGuardReason(step),
      commandOrUrl: stepCommandOrUrl(step),
    }))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const ruleHitsFromStepScan = new Map<string, number>();
  for (const step of trace.steps) {
    const rule = stepFirewallRule(step);
    if (!rule) {
      continue;
    }
    ruleHitsFromStepScan.set(rule, (ruleHitsFromStepScan.get(rule) ?? 0) + 1);
  }
  const ruleHitsFromMetadata =
    trace.metadata &&
    typeof trace.metadata.firewall === "object" &&
    trace.metadata.firewall &&
    typeof (trace.metadata.firewall as Record<string, unknown>).ruleHits === "object"
      ? ((trace.metadata.firewall as Record<string, unknown>).ruleHits as Record<string, unknown>)
      : {};

  const mergedRuleHits = new Map<string, number>(ruleHitsFromStepScan.entries());
  for (const [rule, countValue] of Object.entries(ruleHitsFromMetadata)) {
    const count = toFiniteNumber(countValue, 0);
    if (count <= 0) {
      continue;
    }
    mergedRuleHits.set(rule, Math.max(count, mergedRuleHits.get(rule) ?? 0));
  }

  const ruleHits = Object.fromEntries(mergedRuleHits.entries());
  const topRules = [...mergedRuleHits.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([rule, count]) => ({ rule, count }));

  const firewallMetadata =
    trace.metadata && typeof trace.metadata.firewall === "object" && trace.metadata.firewall
      ? (trace.metadata.firewall as Record<string, unknown>)
      : {};

  const redactedStepsComputed = trace.steps.filter((step) => {
    const redactedPatterns =
      step.metadata &&
      typeof step.metadata.firewall === "object" &&
      step.metadata.firewall &&
      Array.isArray((step.metadata.firewall as Record<string, unknown>).redactedPatterns)
        ? ((step.metadata.firewall as Record<string, unknown>).redactedPatterns as unknown[])
        : [];
    return redactedPatterns.length > 0;
  }).length;

  const blockedStepsCount = toFiniteNumber(firewallMetadata.blockedSteps, blockedSteps.length);
  const redactedSteps = toFiniteNumber(firewallMetadata.redactedSteps, redactedStepsComputed);
  const highRiskSteps = trace.steps.filter((step) => toFiniteNumber(step.riskScore, 0) >= 60).length;
  const recentActions = trace.steps
    .slice(-20)
    .map((step) => toFirewallActionSummary(step))
    .reverse();
  const networkActions = trace.steps
    .filter(
      (step) =>
        step.type === "network" ||
        Boolean(step.externalUrl) ||
        /web_search|web_fetch|wikipedia|weather|hn_search|arxiv_search|openlibrary|github_repo_info/i.test(
          step.toolCall?.name ?? ""
        )
    )
    .slice(-20)
    .map((step) => toFirewallActionSummary(step))
    .reverse();
  const shellActions = trace.steps
    .filter((step) => step.type === "shell")
    .slice(-20)
    .map((step) => toFirewallActionSummary(step))
    .reverse();
  const quarantinedAt =
    trace.status === "quarantined"
      ? blockedSteps[blockedSteps.length - 1]?.timestamp ?? trace.updatedAt
      : null;

  const context: FirewallChatContext = {
    generatedAt,
    trace: {
      id: trace.id,
      sessionId: trace.sessionId,
      source: trace.source,
      status: trace.status,
      startedAt: trace.startedAt,
      updatedAt: trace.updatedAt,
      lastEventAt,
      stepCount: trace.steps.length,
      overallRiskScore,
      riskSeverity,
    },
    firewall: {
      enabled:
        typeof firewallMetadata.enabled === "boolean" ? Boolean(firewallMetadata.enabled) : true,
      defaultAction:
        typeof firewallMetadata.defaultAction === "string"
          ? String(firewallMetadata.defaultAction)
          : "allow",
      blockedSteps: blockedStepsCount,
      redactedSteps,
      highRiskSteps,
      guardCounts,
      ruleHits,
      topRules,
      quarantinedAt,
      lastBlockedStep: blockedSteps.length > 0 ? blockedSteps[blockedSteps.length - 1] : null,
      recentBlockedSteps: blockedSteps.slice(-8).reverse(),
    },
    activity: {
      recentActions,
      networkActions,
      shellActions,
    },
    highlights: [],
    recommendations: [],
  };

  const traceSummary = context.trace!;
  const firewallSummary = context.firewall!;
  const topRule = firewallSummary.topRules[0];
  context.highlights = [
    `Trace ${traceSummary.id} (${traceSummary.source}) is ${traceSummary.status}.`,
    `Risk ${traceSummary.overallRiskScore} (${traceSummary.riskSeverity}), ${firewallSummary.blockedSteps} blocked step(s).`,
    topRule
      ? `Most frequent policy hit: ${formatRuleLabel(topRule.rule)} (${topRule.count}).`
      : "No explicit firewall rule hits yet.",
  ];
  context.recommendations = buildFirewallRecommendations(context);

  return context;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Firewall chat Q&A (rule-based + AI)
// ═══════════════════════════════════════════════════════════════════════════════

export function extractStepIndexFromQuestion(question: string): number | null {
  const match = question.match(/step\s*#?\s*(\d+)/i);
  if (!match || !match[1]) {
    return null;
  }
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

export function answerFirewallChatQuestion(question: string, context: FirewallChatContext): string {
  const normalized = question.trim().toLowerCase();
  if (!context.trace || !context.firewall) {
    return [
      "No active trace is loaded yet.",
      "Start a session (demo start or observe_session), then ask again for live firewall status.",
    ].join("\n");
  }

  const trace = context.trace;
  const firewall = context.firewall;
  const latestBlocked = firewall.lastBlockedStep;
  const stepIndex = extractStepIndexFromQuestion(question);
  if (stepIndex !== null) {
    const byStep = firewall.recentBlockedSteps.find((entry) => entry.stepIndex === stepIndex);
    if (byStep) {
      return [
        `Step #${byStep.stepIndex} is blocked.`,
        `Rule: ${byStep.rule ? formatRuleLabel(byStep.rule) : "manual guard action"}.`,
        `Reason: ${byStep.reason}`,
        `Action: ${byStep.commandOrUrl}`,
      ].join("\n");
    }
    return `Step #${stepIndex} is not in the recent blocked list. Current blocked steps: ${firewall.blockedSteps}.`;
  }

  if (/status|summary|update|overview|health|what(?:'s| is)? going on/.test(normalized)) {
    return [
      `Trace ${trace.id} (${trace.source}) is ${trace.status}.`,
      `Risk score is ${trace.overallRiskScore} (${trace.riskSeverity}).`,
      `Firewall: ${firewall.blockedSteps} blocked, ${firewall.redactedSteps} redacted, ${firewall.highRiskSteps} high-risk steps.`,
      latestBlocked
        ? `Latest block: step #${latestBlocked.stepIndex} (${latestBlocked.type}) - ${latestBlocked.reason}`
        : "No blocked steps yet.",
    ].join("\n");
  }

  if (/blocked|block|deny|denied|quarantine|quarantined|why/.test(normalized)) {
    if (!latestBlocked) {
      return "No blocked steps recorded yet. Firewall default action is allow, with active deny rules for risky patterns.";
    }
    return [
      `Trace is ${trace.status}. Blocked steps: ${firewall.blockedSteps}.`,
      `Latest block: step #${latestBlocked.stepIndex} at ${latestBlocked.timestamp}.`,
      `Rule: ${latestBlocked.rule ? formatRuleLabel(latestBlocked.rule) : "manual guard action"}.`,
      `Reason: ${latestBlocked.reason}`,
    ].join("\n");
  }

  if (/network|web|http|https|url|request|fetch|download|upload/.test(normalized)) {
    const networkActions = context.activity?.networkActions ?? [];
    if (networkActions.length === 0) {
      return "No network actions are recorded in this trace window.";
    }
    const lines = networkActions.slice(0, 8).map((action) => {
      const surface = action.url ?? action.command ?? action.toolName ?? action.prompt ?? "unknown";
      return `#${action.stepIndex} ${action.type} ${action.actor}: ${truncateText(surface, 140)}`;
    });
    return [`Network actions (${networkActions.length} total in context):`, ...lines].join("\n");
  }

  if (/risk|severity|safe|danger|score/.test(normalized)) {
    return [
      `Current risk is ${trace.overallRiskScore} (${trace.riskSeverity}).`,
      `High-risk steps: ${firewall.highRiskSteps}.`,
      `Guard decisions: allow=${firewall.guardCounts.allow}, block=${firewall.guardCounts.block}, pending=${firewall.guardCounts.pending}.`,
    ].join("\n");
  }

  if (/latest|last|recent/.test(normalized)) {
    const latestSummary = latestBlocked
      ? `Latest blocked step #${latestBlocked.stepIndex}: ${latestBlocked.commandOrUrl}`
      : "No blocked step in the latest window.";
    return [
      `Last event: ${trace.lastEventAt}.`,
      latestSummary,
      `Trace status: ${trace.status}.`,
    ].join("\n");
  }

  if (/next|recommend|what should|mitigate|fix|action/.test(normalized)) {
    return context.recommendations.map((item, index) => `${index + 1}. ${item}`).join("\n");
  }

  if (/source|openclaw|mock|manual/.test(normalized)) {
    return [
      `Source: ${trace.source}.`,
      `Session: ${trace.sessionId}.`,
      `Trace status: ${trace.status}.`,
      "This trace is from live or ingested runtime events.",
    ].join("\n");
  }

  return [
    context.highlights[0],
    context.highlights[1],
    context.recommendations[0],
    "Ask: 'status update', 'why blocked', 'risk summary', or 'what should we do next'.",
  ]
    .filter((entry) => Boolean(entry))
    .join("\n");
}

export type FirewallChatRole = "user" | "assistant";

export interface FirewallChatTurn {
  role: FirewallChatRole;
  content: string;
}

export interface FirewallChatReplyResult {
  reply: string;
  mode: "ai" | "rules";
  provider: FirewallChatAiProvider | null;
  attempts: Array<{ provider: FirewallChatAiProvider; ok: boolean; error?: string }>;
}

export function parseChatTurnContent(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (Array.isArray(value)) {
    const parts = value
      .map((entry) => {
        if (
          entry &&
          typeof entry === "object" &&
          (entry as Record<string, unknown>).type === "text" &&
          typeof (entry as Record<string, unknown>).text === "string"
        ) {
          return String((entry as Record<string, unknown>).text).trim();
        }
        return "";
      })
      .filter((item) => item.length > 0);
    if (parts.length > 0) {
      return parts.join("\n");
    }
  }
  return undefined;
}

export function normalizeFirewallChatHistory(rawMessages: unknown, fallbackQuestion: string): FirewallChatTurn[] {
  const normalized: FirewallChatTurn[] = [];
  if (Array.isArray(rawMessages)) {
    for (const candidate of rawMessages) {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
        continue;
      }
      const roleRaw = asString((candidate as Record<string, unknown>).role);
      const role: FirewallChatRole | null =
        roleRaw === "assistant" ? "assistant" : roleRaw === "user" ? "user" : null;
      if (!role) {
        continue;
      }
      const content = parseChatTurnContent((candidate as Record<string, unknown>).content);
      if (!content) {
        continue;
      }
      normalized.push({ role, content });
    }
  }

  const recent = normalized.slice(-16);
  if (recent.length === 0 || recent[recent.length - 1]?.role !== "user") {
    recent.push({ role: "user", content: fallbackQuestion });
  }
  return recent;
}

export function buildFirewallChatSystemPrompt(context: FirewallChatContext): string {
  const contextSnapshot = {
    generatedAt: context.generatedAt,
    trace: context.trace,
    firewall: context.firewall,
    highlights: context.highlights,
    recommendations: context.recommendations,
  };

  return [
    "You are Maple Firewall Assistant for agent traces.",
    "Use only the provided context and chat history. Do not invent events, steps, rules, or tools.",
    "If data is missing in context, explicitly say it is unavailable.",
    "Keep answers concise and operational; reference concrete step indexes and rule labels when present.",
    "When recommending next actions, prioritize Maple-native controls like guard_action, /api/firewall/decision, audit_risk, and ml_anomaly_report.",
    "Context JSON:",
    JSON.stringify(contextSnapshot, null, 2),
  ].join("\n");
}

export function isNetworkActionQuery(question: string): boolean {
  const normalized = question.trim().toLowerCase();
  return (
    /(network|web|http|https|url|request|fetch|download|upload)/.test(normalized) &&
    /(action|actions|occur|occurred|happen|happened|list|show|which|what)/.test(normalized)
  );
}

/**
 * Check whether context-wall orchestration is available via gRPC.
 * Used by /api/chat/capabilities to report AI-path readiness.
 */
export function isContextWallAvailable(): boolean {
  const clients = getGrpcClients();
  return Boolean(clients?.contextWall);
}

/** @deprecated Use isContextWallAvailable() instead */
export const isModelRouterAvailable = isContextWallAvailable;

export async function generateFirewallChatReply(options: {
  question: string;
  context: FirewallChatContext;
  messages?: unknown;
  requestContext?: {
    tenantId?: string;
    userId?: string;
    deviceId?: string;
    sessionId?: string;
    traceId?: string;
  };
}): Promise<FirewallChatReplyResult> {
  const fallbackReply = answerFirewallChatQuestion(options.question, options.context);
  if (
    isNetworkActionQuery(options.question) &&
    (options.context.activity?.networkActions?.length ?? 0) > 0
  ) {
    return {
      reply: fallbackReply,
      mode: "rules",
      provider: null,
      attempts: [],
    };
  }

  if (!firewallChatAiEnabled) {
    return {
      reply: fallbackReply,
      mode: "rules",
      provider: null,
      attempts: [],
    };
  }

  const history = normalizeFirewallChatHistory(options.messages, options.question);
  const attempts: Array<{ provider: FirewallChatAiProvider; ok: boolean; error?: string }> = [];

  // Route all LLM requests through context-wall orchestration via gRPC.
  // Architecture mandates: gateway-api MUST NOT call LLM providers directly.
  try {
    const grpcResult = await generateViaGrpc(
      history.map((t) => ({ role: t.role, content: t.content })),
      buildFirewallChatSystemPrompt(options.context),
      {
        tenantId: options.requestContext?.tenantId ?? "",
        userId: options.requestContext?.userId ?? "",
        deviceId: options.requestContext?.deviceId ?? "",
        sessionId: options.requestContext?.sessionId ?? options.context.trace?.sessionId ?? "",
        traceId: options.requestContext?.traceId ?? options.context.trace?.id ?? "",
      },
    );
    if (grpcResult) {
      return { reply: grpcResult.content, mode: "ai", provider: null, attempts: [{ provider: "openai" as FirewallChatAiProvider, ok: true }] };
    }
  } catch (err) {
    mapleLog("warn", "firewall.chat.grpc_failed", { error: errorMessage(err) });
  }

  // Model-router unavailable — fall back to rules-based reply (no direct API calls)
  mapleLog("info", "firewall.chat.rules_fallback", {
    traceId: options.context.trace?.id ?? null,
  });

  return {
    reply: fallbackReply,
    mode: "rules",
    provider: null,
    attempts,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Trace resolution & step-index helpers
// ═══════════════════════════════════════════════════════════════════════════════

export function resolveTraceByIdOrLatest(traceId?: string): Trace | undefined {
  if (traceId) {
    return getTraceForCurrentOwner(traceId);
  }
  return listTracesForCurrentOwner(1)[0];
}

export function clampStepIndex(trace: Trace, stepIndex: number): number {
  if (trace.steps.length === 0) {
    return 0;
  }
  return Math.max(0, Math.min(Math.trunc(stepIndex), trace.steps.length - 1));
}

export function recommendedRiskStepIndex(trace: Trace): number {
  if (trace.steps.length === 0) {
    return 0;
  }

  const blocked = trace.steps.find((step) => step.guardStatus === "block");
  if (blocked) {
    return blocked.index;
  }

  const highRisk = trace.steps.find((step) => step.riskScore >= 60);
  if (highRisk) {
    return highRisk.index;
  }

  const shellOrNetwork = trace.steps.find((step) => step.type === "shell" || step.type === "network");
  if (shellOrNetwork) {
    return shellOrNetwork.index;
  }

  return trace.steps.reduce((best, current) =>
    current.riskScore > best.riskScore ? current : best
  ).index;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Live merge & event identity
// ═══════════════════════════════════════════════════════════════════════════════

export function eventIdentity(step: TraceStep): string {
  const rawEventId =
    step.metadata && typeof step.metadata.eventId === "string"
      ? String(step.metadata.eventId)
      : undefined;
  if (rawEventId && rawEventId.trim().length > 0) {
    return `event:${rawEventId}`;
  }
  return [
    "fallback",
    String(step.actor ?? ""),
    String(step.type ?? ""),
    String(step.timestamp ?? ""),
    String(step.prompt ?? ""),
    String(step.command ?? ""),
    String(step.externalUrl ?? ""),
    String(step.output ?? ""),
  ].join("|");
}

export function mergeLiveOpenClawTrace(existing: Trace, latest: Trace): Trace {
  const preservedByIdentity = new Map<string, TraceStep>();
  for (const step of existing.steps) {
    preservedByIdentity.set(eventIdentity(step), step);
  }

  const mergedSteps = latest.steps.map((step, index) => {
    const preserved = preservedByIdentity.get(eventIdentity(step));
    return {
      ...step,
      index,
      riskScore: preserved?.riskScore ?? step.riskScore ?? 0,
      riskFlags: preserved?.riskFlags ?? step.riskFlags ?? [],
      guardStatus: preserved?.guardStatus ?? step.guardStatus ?? "pending",
      metadata: {
        ...(preserved?.metadata ?? {}),
        ...(step.metadata ?? {}),
      },
    };
  });

  const merged: Trace = {
    ...existing,
    source: latest.source,
    status: existing.status,
    updatedAt: new Date().toISOString(),
    steps: mergedSteps,
    metadata: {
      ...(existing.metadata ?? {}),
      ...(latest.metadata ?? {}),
      mode: "openclaw-live-sync",
      fetchedEventCount: latest.steps.length,
    },
  };

  if (!merged.startedAt) {
    merged.startedAt = latest.startedAt;
  }
  return merged;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Fork edits & bridge helpers
// ═══════════════════════════════════════════════════════════════════════════════

export function defaultForkEdits(editsValue: unknown): TraceForkEdits {
  const edits = asObject(editsValue);
  return {
    prompt: asString(edits.prompt),
    output:
      asString(edits.output) ?? "Remote script execution blocked by Maple guardrails for safe replay.",
    command: asString(edits.command) ?? "echo 'blocked untrusted remote script'; exit 1",
    toolName: asString(edits.toolName),
    toolResponse: asString(edits.toolResponse),
    appendSimulationNote:
      asString(edits.appendSimulationNote) ??
      "Fork replay generated by Maple guided demo flow (dry-run).",
  };
}

export interface ResolvedBridgeTarget {
  bridgeUrl: string;
  token: string;
  overrideLocked: boolean;
  overrideRejected: boolean;
}

export function resolveBridgeTarget(
  body: Record<string, unknown>,
  options: { defaultBridgeUrl?: string; defaultToken?: string } = {}
): ResolvedBridgeTarget {
  const requestedBridgeUrl = asString(body.bridgeUrl);
  const requestedToken = asString(body.token);

  if (bridgeOverrideLockEnabled) {
    const overrideRejected =
      (requestedBridgeUrl !== undefined && requestedBridgeUrl !== configuredBridgeUrl) ||
      (requestedToken !== undefined && requestedToken !== configuredBridgeToken);
    return {
      bridgeUrl: configuredBridgeUrl,
      token: configuredBridgeToken,
      overrideLocked: true,
      overrideRejected,
    };
  }

  return {
    bridgeUrl: requestedBridgeUrl ?? options.defaultBridgeUrl ?? configuredBridgeUrl,
    token: requestedToken ?? options.defaultToken ?? configuredBridgeToken,
    overrideLocked: false,
    overrideRejected: false,
  };
}

export function bridgeOverrideDeniedBody() {
  return {
    error: "Bridge override denied",
    reason:
      "Per-request bridgeUrl/token overrides are disabled by policy. Use configured OPENCLAW_BRIDGE_URL and OPENCLAW_BRIDGE_TOKEN when running source=openclaw.",
    hint: "Unset request bridgeUrl/token, use source=auto/mock, or set MAPLE_ALLOW_BRIDGE_OVERRIDE=true in non-production.",
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Step type coercion & candidate step builder
// ═══════════════════════════════════════════════════════════════════════════════

export function asStepActor(value: unknown): TraceStep["actor"] {
  if (value === "agent" || value === "tool" || value === "system" || value === "user") {
    return value;
  }
  return "agent";
}

export function asStepType(value: unknown): TraceStep["type"] {
  if (
    value === "prompt" ||
    value === "tool_call" ||
    value === "shell" ||
    value === "browser" ||
    value === "network" ||
    value === "email" ||
    value === "system"
  ) {
    return value;
  }
  return "prompt";
}

export function asTraceToolCall(value: unknown): TraceStep["toolCall"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const raw = value as Record<string, unknown>;
  const name = asString(raw.name);
  if (!name) {
    return undefined;
  }

  return {
    name,
    input:
      raw.input && typeof raw.input === "object" && !Array.isArray(raw.input)
        ? (raw.input as Record<string, unknown>)
        : undefined,
    output: raw.output,
  };
}

export function buildCandidateStep(
  body: Record<string, unknown>,
  index: number,
  defaults: { actor: TraceStep["actor"]; type: TraceStep["type"] } = {
    actor: "agent",
    type: "prompt",
  }
): TraceStep {
  const toolCall = asTraceToolCall(body.toolCall);
  const command = asString(body.command);
  const externalUrl =
    asString(body.externalUrl) ??
    asString(body.url) ??
    asString(body.externalURL) ??
    asString(body.endpoint);
  const explicitType = asString(body.type);
  const inferredType: TraceStep["type"] = command
    ? "shell"
    : externalUrl
      ? "network"
      : toolCall
        ? "tool_call"
        : defaults.type;

  return {
    index,
    timestamp: new Date().toISOString(),
    actor: asStepActor(body.actor ?? defaults.actor),
    type: explicitType ? asStepType(explicitType) : inferredType,
    prompt: asString(body.prompt),
    toolCall,
    output: asString(body.output),
    command,
    externalUrl,
    metadata:
      body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
        ? (body.metadata as Record<string, unknown>)
        : undefined,
    riskScore: 0,
    riskFlags: [],
    guardStatus: "pending",
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Bridge event write & fork launch
// ═══════════════════════════════════════════════════════════════════════════════

export function stepToBridgeEvent(step: TraceStep): Record<string, unknown> {
  return {
    eventId: `${step.index}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: step.timestamp,
    actor: step.actor,
    type: step.type,
    prompt: step.prompt,
    output: step.output,
    command: step.command,
    toolName: step.toolCall?.name,
    toolInput: step.toolCall?.input,
    toolOutput: step.toolCall?.output,
    url: step.externalUrl,
  };
}

export async function writeEventsToBridgeSession(
  sessionId: string,
  events: Record<string, unknown>[],
  bridgeUrl: string,
  token?: string
) {
  const target = new URL(`/sessions/${encodeURIComponent(sessionId)}/events`, bridgeUrl);
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const resetResponse = await fetch(target, {
    method: "POST",
    headers,
    body: JSON.stringify({ reset: true }),
  });
  if (!resetResponse.ok) {
    throw new Error(`Bridge reset failed (${resetResponse.status}).`);
  }

  const appendResponse = await fetch(target, {
    method: "POST",
    headers,
    body: JSON.stringify({ events }),
  });
  if (!appendResponse.ok) {
    throw new Error(`Bridge append failed (${appendResponse.status}).`);
  }
}

export async function launchIsolatedForkSession(options: {
  forkedTrace: Trace;
  parentTrace: Trace;
  body: Record<string, unknown>;
}) {
  const { forkedTrace, parentTrace, body } = options;
  const requestedForkSessionId = asString(body.forkSessionId);
  const generatedForkSessionId = `${parentTrace.sessionId}-fork-${Date.now().toString(36)}`;
  const forkSessionId = sanitizeSessionId(requestedForkSessionId ?? generatedForkSessionId);
  const bridgeTarget = resolveBridgeTarget(body);
  if (bridgeTarget.overrideRejected) {
    throw new Error(bridgeOverrideDeniedBody().reason);
  }
  const { bridgeUrl, token } = bridgeTarget;
  const events = forkedTrace.steps.map((step) => stepToBridgeEvent(step));

  await writeEventsToBridgeSession(forkSessionId, events, bridgeUrl, token);

  const runtimeTrace = await startObservation({
    sessionId: forkSessionId,
    source: "openclaw",
    bridgeUrl,
    token,
  });

  runtimeTrace.metadata = {
    ...(runtimeTrace.metadata ?? {}),
    mode: "openclaw-fork-runtime",
    parentTraceId: parentTrace.id,
    parentSessionId: parentTrace.sessionId,
    forkedTraceId: forkedTrace.id,
  };
  runtimeTrace.ownerKeyFingerprint = parentTrace.ownerKeyFingerprint;
  traceStore.upsertTrace(runtimeTrace, parentTrace.ownerKeyFingerprint);
  const runtimeReport = auditAndPersist(runtimeTrace);

  return {
    sessionId: forkSessionId,
    traceId: runtimeTrace.id,
    source: runtimeTrace.source,
    overallRiskScore: runtimeReport.overallRiskScore,
    severity: runtimeReport.severity,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Markdown rendering
// ═══════════════════════════════════════════════════════════════════════════════

export function renderTraceMarkdown(trace: Trace): string {
  const lines: string[] = [];
  lines.push(`# Maple Trace Export`);
  lines.push(``);
  lines.push(`- Trace ID: ${trace.id}`);
  lines.push(`- Session ID: ${trace.sessionId}`);
  lines.push(`- Source: ${trace.source}`);
  lines.push(`- Status: ${trace.status}`);
  lines.push(`- Started: ${trace.startedAt}`);
  lines.push(`- Updated: ${trace.updatedAt}`);
  lines.push(`- Risk Score: ${trace.metadata?.overallRiskScore ?? 0}`);
  lines.push(`- Risk Severity: ${trace.metadata?.riskSeverity ?? "low"}`);
  lines.push(``);
  lines.push(`## Steps`);
  lines.push(``);

  for (const step of trace.steps) {
    lines.push(`### Step ${step.index}`);
    lines.push(`- Time: ${step.timestamp}`);
    lines.push(`- Actor: ${step.actor}`);
    lines.push(`- Type: ${step.type}`);
    lines.push(`- Guard: ${step.guardStatus}`);
    lines.push(`- Risk Score: ${step.riskScore}`);
    if (step.prompt) {
      lines.push(`- Prompt: ${step.prompt}`);
    }
    if (step.command) {
      lines.push(`- Command: ${step.command}`);
    }
    if (step.toolCall?.name) {
      lines.push(`- Tool: ${step.toolCall.name}`);
    }
    if (step.output) {
      lines.push(`- Output: ${step.output}`);
    }
    if (step.riskFlags.length > 0) {
      lines.push(`- Flags:`);
      for (const flag of step.riskFlags) {
        lines.push(
          `  - [${flag.severity}] ${flag.type}: ${flag.message}${flag.evidence ? ` (evidence: ${flag.evidence})` : ""}`
        );
      }
    }
    lines.push(``);
  }

  return lines.join("\n");
}
