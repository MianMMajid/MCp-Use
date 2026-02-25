import type { TraceStep } from "../../core/types.js";
import type { FirewallStepDecision } from "../../security/firewall-policy.js";

export function truncateText(value: string, maxLength = 2400): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 3)}...`;
}

export function compactUnknown(value: unknown, maxChars = 24_000): unknown {
  try {
    const json = JSON.stringify(value);
    if (!json) {
      return value;
    }
    if (json.length <= maxChars) {
      return value;
    }
    return {
      truncated: true,
      preview: `${json.slice(0, maxChars - 3)}...`,
      originalBytes: Buffer.byteLength(json, "utf8"),
    };
  } catch {
    const fallback = String(value ?? "");
    return {
      truncated: true,
      preview: truncateText(fallback, Math.min(maxChars, 3000)),
    };
  }
}

export function summarizeJsonRpcPayload(payload: unknown, maxLength = 2400): string {
  try {
    const json = JSON.stringify(payload);
    if (!json) {
      return "";
    }
    return truncateText(json, maxLength);
  } catch {
    return truncateText(String(payload ?? ""), maxLength);
  }
}

export function extractFirstUrl(value: string): string | undefined {
  const match = value.match(/https?:\/\/[^\s)]+/i);
  return match ? match[0] : undefined;
}

export function extractLikelyCommand(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const fenced = trimmed.match(/```(?:bash|sh|zsh|shell)?\n([\s\S]*?)```/i);
  if (fenced && fenced[1]) {
    const line = fenced[1]
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .find((entry) => entry.length > 0);
    if (line) {
      return line;
    }
  }

  return trimmed
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) =>
      /^(curl|wget|bash|zsh|sh|python|node|npm|pnpm|yarn|pip|git|rm|chmod|scp|ssh)\b/i.test(
        entry
      )
    );
}

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
