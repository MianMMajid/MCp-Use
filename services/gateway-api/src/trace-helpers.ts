/**
 * trace-helpers.ts
 *
 * Extracted from app.ts: trace CRUD with owner isolation, OpenClaw event
 * ingestion, firewall chat context building, session polling, bridge helpers,
 * and markdown rendering.
 */

import {
  getLatestTraceBySessionForCurrentOwner,
  getTraceForCurrentOwner,
  listTracesForCurrentOwner,
} from "./core/trace-ownership.js";
import { buildFirewallChatContextFromTrace } from "./core/firewall-chat.js";
import type { FirewallChatContext } from "./core/firewall-chat.js";

import type {
  Trace,
} from "@maple/types";

// ═══════════════════════════════════════════════════════════════════════════════
// gRPC wrapper helpers (fallback to local on failure)
// ═══════════════════════════════════════════════════════════════════════════════

export {
  evaluateFirewallStepViaGrpc,
  generateViaGrpc,
} from "./core/firewall-grpc.js";
export { getCommunityBaselines } from "./core/trace-audit-baselines.js";
export { auditAndPersist } from "./core/trace-audit.js";
export {
  inferStepTypeFromDownstream,
  toInvocationSummary,
  toPolicySnapshot,
} from "./core/trace-policy-utils.js";
export {
  pollForNewSessions,
  refreshExistingSession,
} from "./core/trace-session-poller.js";
export { buildYcMetrics } from "./core/trace-metrics.js";
export {
  asOpenClawRawEvent,
  eventIdFromStep,
  ingestOpenClawEvents,
  type OpenClawIngestResult,
} from "./core/trace-openclaw-ingest.js";
export {
  createTraceForCurrentOwner,
  deleteTraceForCurrentOwner,
  getLatestTraceBySessionForCurrentOwner,
  getTraceForCurrentOwner,
  listTracesForCurrentOwner,
  resolveTraceByIdOrLatest,
  setGuardActionForCurrentOwner,
  upsertTraceForCurrentOwner,
  clearTracesForCurrentOwner,
} from "./core/trace-ownership.js";
export {
  bridgeOverrideDeniedBody,
  clampStepIndex,
  defaultForkEdits,
  eventIdentity,
  mergeLiveOpenClawTrace,
  recommendedRiskStepIndex,
  resolveBridgeTarget,
  type ResolvedBridgeTarget,
} from "./core/trace-runtime-helpers.js";
export {
  launchIsolatedForkSession,
  writeEventsToBridgeSession,
} from "./core/trace-fork-runtime.js";
export {
  asStepActor,
  asStepType,
  asTraceToolCall,
  buildCandidateStep,
  renderTraceMarkdown,
  stepToBridgeEvent,
} from "./core/trace-step-utils.js";
export type {
  FirewallActionSummary,
  FirewallBlockedStepSummary,
  FirewallChatContext,
  FirewallChatReplyResult,
  FirewallChatRole,
  FirewallChatTurn,
} from "./core/firewall-chat.js";
export {
  answerFirewallChatQuestion,
  buildFirewallChatSystemPrompt,
  buildFirewallRecommendations,
  extractStepIndexFromQuestion,
  formatRuleLabel,
  generateFirewallChatReply,
  isContextWallAvailable,
  isNetworkActionQuery,
  normalizeFirewallChatHistory,
  parseChatTurnContent,
  stepCommandOrUrl,
  stepFirewallRule,
  stepGuardReason,
  toFirewallActionSummary,
} from "./core/firewall-chat.js";
export { isContextWallAvailable as isModelRouterAvailable } from "./core/firewall-chat.js";

// ═══════════════════════════════════════════════════════════════════════════════
// Firewall chat context types & builders
// ═══════════════════════════════════════════════════════════════════════════════
export function resolveTraceForFirewallContext(options: { traceId?: string; sessionId?: string }): Trace | undefined {
  if (options.traceId) {
    return getTraceForCurrentOwner(options.traceId);
  }
  if (options.sessionId) {
    return getLatestTraceBySessionForCurrentOwner(options.sessionId);
  }
  return listTracesForCurrentOwner(1)[0];
}

export function buildFirewallChatContext(options: { traceId?: string; sessionId?: string } = {}): FirewallChatContext {
  const trace = resolveTraceForFirewallContext(options);
  return buildFirewallChatContextFromTrace(trace);
}
