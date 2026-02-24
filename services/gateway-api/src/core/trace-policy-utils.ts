import { compactUnknown, truncateText } from "../helpers.js";

import type { FirewallStepDecision } from "@maple/security";
import type { TraceStep } from "@maple/types";

export function inferStepTypeFromDownstream(summary: string, toolName: string): TraceStep["type"] {
  const lower = `${toolName}\n${summary}`.toLowerCase();
  if (
    /(curl|wget|bash|zsh|sh|python|node|npm|pnpm|rm\s+-|chmod|sudo|terminal|shell|command)/.test(
      lower,
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
