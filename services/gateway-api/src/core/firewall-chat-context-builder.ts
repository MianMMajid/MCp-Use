import { toFiniteNumber } from "../helpers.js";
import { buildFirewallRecommendations } from "./firewall-chat-context-recommendations.js";
import {
  formatRuleLabel,
  stepCommandOrUrl,
  stepFirewallRule,
  stepGuardReason,
  toFirewallActionSummary,
} from "./firewall-chat-context-steps.js";

import type { Trace } from "@maple/types";
import type { FirewallChatContext } from "./firewall-chat-context-types.js";

export function buildFirewallChatContextFromTrace(trace?: Trace, generatedAt = new Date().toISOString()): FirewallChatContext {
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
    Math.max(0, ...trace.steps.map((step) => toFiniteNumber(step.riskScore, 0))),
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
          step.toolCall?.name ?? "",
        ),
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
