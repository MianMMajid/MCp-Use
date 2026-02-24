import type { FirewallChatContext } from "./firewall-chat-context-types.js";
import { formatRuleLabel } from "./firewall-chat-context-steps.js";

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
