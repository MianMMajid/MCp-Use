import { createHash, randomUUID } from "node:crypto";
import type { ShareTraceOptions, SharedTrace, SharedTraceStep, Trace, TraceStep } from "@maple/types";
import { deriveSeverityFromScore } from "../core/risk-engine.js";
import { getTraceEmbedding } from "../ml/anomaly-detector.js";

function redact(text: string): string {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[ip]")
    .replace(/https?:\/\/[^\s)]+/gi, "[url]")
    .replace(/\b(?:sk|ghp|xoxb|xoxp|api|token|secret|password)[-_a-z0-9]{8,}\b/gi, "[secret]")
    .replace(/\b[a-f0-9]{24,}\b/gi, "[hash]");
}

function commandTemplate(command?: string): string | undefined {
  if (!command) {
    return undefined;
  }

  return redact(command)
    .replace(/\/(?:[\w.-]+\/)+[\w.-]+/g, "<path>")
    .replace(/\b\d+\b/g, "<num>");
}

function summarizeStep(step: TraceStep): string {
  if (step.command) {
    return `shell:${commandTemplate(step.command)}`;
  }

  if (step.toolCall?.name) {
    return `tool:${step.toolCall.name}:${redact(step.output ?? "")}`;
  }

  if (step.prompt) {
    return `prompt:${redact(step.prompt)}`;
  }

  if (step.output) {
    return `output:${redact(step.output)}`;
  }

  return `${step.actor}:${step.type}`;
}

function buildBehaviorSignature(steps: SharedTraceStep[]): string {
  const signatureBase = steps
    .map((step) => `${step.type}:${step.toolName ?? "none"}:${step.flagTypes.sort().join("+")}`)
    .join("|");

  return createHash("sha256").update(signatureBase).digest("hex").slice(0, 16);
}

function sourceTraceHash(trace: Trace): string {
  return createHash("sha256").update(`${trace.id}:${trace.sessionId}`).digest("hex").slice(0, 16);
}

export function anonymizeTrace(trace: Trace, options: ShareTraceOptions = {}): SharedTrace {
  const sanitizedSteps: SharedTraceStep[] = trace.steps.map((step) => ({
    index: step.index,
    actor: step.actor,
    type: step.type,
    summary: summarizeStep(step),
    toolName: step.toolCall?.name,
    commandTemplate: commandTemplate(step.command),
    riskScore: step.riskScore,
    flagTypes: step.riskFlags.map((flag) => flag.type),
  }));

  const embedding = getTraceEmbedding(trace.steps);
  const riskScore = Number(trace.metadata?.overallRiskScore ?? 0);

  return {
    id: randomUUID(),
    sourceTraceIdHash: sourceTraceHash(trace),
    sharedAt: new Date().toISOString(),
    source: trace.source,
    taskLabel: options.taskLabel ?? "General automation",
    objective: options.objective ? redact(options.objective) : undefined,
    tags: (options.tags ?? []).map((tag) => tag.toLowerCase().trim()).filter(Boolean),
    behaviorSignature: buildBehaviorSignature(sanitizedSteps),
    embedding,
    riskScore,
    riskSeverity: deriveSeverityFromScore(riskScore),
    flaggedSteps: sanitizedSteps.filter((step) => step.flagTypes.length > 0).length,
    quarantined: trace.status === "quarantined",
    stepCount: sanitizedSteps.length,
    steps: sanitizedSteps,
  };
}
