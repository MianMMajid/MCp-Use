import { getCommunityBaselines } from "./trace-audit-baselines.js";
import { upsertTraceForCurrentOwner } from "./trace-ownership.js";

import { applyAuditToTrace, analyzeTraceRisks } from "@maple/risk-engine";
import { enforceTraceFirewall } from "@maple/security";

import type { Trace } from "@maple/types";

export function auditAndPersist(
  trace: Trace,
  options: { useCommunityBaseline?: boolean; threshold?: number } = {},
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
