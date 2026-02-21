import type {
  AuditReport,
  Trace,
  TraceDiff,
  TraceForkEdits,
  TraceStep,
} from "./types.js";
import type {
  ReplaySimulatorProps,
  RiskDashboardProps,
  TimelineWidgetProps,
} from "./widget-schemas.js";

function trim(value: string, maxLength = 120): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 3)}...`;
}

export function summarizeStep(step: TraceStep): string {
  if (step.command) {
    return `Shell: ${trim(step.command, 90)}`;
  }
  if (step.toolCall?.name) {
    return `Tool ${step.toolCall.name}${step.output ? ` -> ${trim(step.output, 70)}` : ""}`;
  }
  if (step.prompt) {
    return `Prompt: ${trim(step.prompt, 90)}`;
  }
  if (step.output) {
    return `Output: ${trim(step.output, 90)}`;
  }
  return `${step.actor} ${step.type}`;
}

export function toTimelineWidgetProps(trace: Trace): TimelineWidgetProps {
  const overallRiskScore = Number(trace.metadata?.overallRiskScore ?? 0);
  const flaggedSteps = trace.steps.filter((step) => step.riskFlags.length > 0).length;

  return {
    traceId: trace.id,
    sessionId: trace.sessionId,
    source: trace.source,
    status: trace.status,
    startedAt: trace.startedAt,
    updatedAt: trace.updatedAt,
    overallRiskScore,
    flaggedSteps,
    quarantined: trace.status === "quarantined",
    steps: trace.steps.map((step) => ({
      index: step.index,
      timestamp: step.timestamp,
      actor: step.actor,
      type: step.type,
      summary: summarizeStep(step),
      riskScore: step.riskScore,
      guardStatus: step.guardStatus,
      flags: step.riskFlags,
    })),
  };
}

export function toReplayWidgetProps(
  originalTrace: Trace,
  forkedTrace: Trace,
  diff: TraceDiff,
  forkStepIndex: number,
  edits: TraceForkEdits
): ReplaySimulatorProps {
  const projectSteps = (trace: Trace) =>
    trace.steps.map((step) => ({
      index: step.index,
      timestamp: step.timestamp,
      actor: step.actor,
      type: step.type,
      summary: summarizeStep(step),
      riskScore: step.riskScore,
      guardStatus: step.guardStatus,
      flags: step.riskFlags,
    }));

  return {
    originalTraceId: originalTrace.id,
    forkedTraceId: forkedTrace.id,
    forkStepIndex,
    edits: Object.fromEntries(
      Object.entries(edits).filter(([, value]) => value !== undefined)
    ),
    changedSteps: diff.changedSteps,
    addedSteps: diff.addedSteps,
    changeLog: diff.changeLog,
    originalSteps: projectSteps(originalTrace),
    forkedSteps: projectSteps(forkedTrace),
  };
}

export function toRiskWidgetProps(
  trace: Trace,
  report: AuditReport,
  topFlags: number
): RiskDashboardProps {
  return {
    traceId: trace.id,
    status: trace.status,
    overallRiskScore: report.overallRiskScore,
    severity: report.severity,
    breakdown: report.breakdown,
    recommendations: report.recommendations,
    flags: report.flags.slice(0, topFlags),
  };
}

export function toTraceSummary(trace: Trace): Record<string, unknown> {
  return {
    traceId: trace.id,
    sessionId: trace.sessionId,
    source: trace.source,
    status: trace.status,
    startedAt: trace.startedAt,
    updatedAt: trace.updatedAt,
    parentTraceId: trace.parentTraceId,
    stepCount: trace.steps.length,
    overallRiskScore: Number(trace.metadata?.overallRiskScore ?? 0),
    riskSeverity: trace.metadata?.riskSeverity ?? "low",
  };
}
