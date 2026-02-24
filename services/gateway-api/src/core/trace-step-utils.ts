import { asString } from "../helpers.js";

import type { Trace, TraceStep } from "@maple/types";

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
  },
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

export function renderTraceMarkdown(trace: Trace): string {
  const lines: string[] = [];
  lines.push(`# Maple Trace Export`);
  lines.push("");
  lines.push(`- Trace ID: ${trace.id}`);
  lines.push(`- Session ID: ${trace.sessionId}`);
  lines.push(`- Source: ${trace.source}`);
  lines.push(`- Status: ${trace.status}`);
  lines.push(`- Started: ${trace.startedAt}`);
  lines.push(`- Updated: ${trace.updatedAt}`);
  lines.push(`- Risk Score: ${trace.metadata?.overallRiskScore ?? 0}`);
  lines.push(`- Risk Severity: ${trace.metadata?.riskSeverity ?? "low"}`);
  lines.push("");
  lines.push(`## Steps`);
  lines.push("");

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
          `  - [${flag.severity}] ${flag.type}: ${flag.message}${flag.evidence ? ` (evidence: ${flag.evidence})` : ""}`,
        );
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}
