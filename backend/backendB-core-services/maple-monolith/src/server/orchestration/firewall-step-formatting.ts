import type { TraceStep } from "../../core/types.js";
import type { FirewallActionSummary } from "./firewall-chat-context.js";
import { extractFirstUrl, extractLikelyCommand, truncateText } from "./downstream-payload-utils.js";
import { toFiniteNumber } from "./value-utils.js";

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
