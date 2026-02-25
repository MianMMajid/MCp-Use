import type { Trace } from "../../core/types.js";

export function renderTraceMarkdown(trace: Trace): string {
  const lines: string[] = [];
  lines.push(`# Maple Trace Export`);
  lines.push(``);
  lines.push(`- Trace ID: ${trace.id}`);
  lines.push(`- Session ID: ${trace.sessionId}`);
  lines.push(`- Source: ${trace.source}`);
  lines.push(`- Status: ${trace.status}`);
  lines.push(`- Started: ${trace.startedAt}`);
  lines.push(`- Updated: ${trace.updatedAt}`);
  lines.push(`- Risk Score: ${trace.metadata?.overallRiskScore ?? 0}`);
  lines.push(`- Risk Severity: ${trace.metadata?.riskSeverity ?? "low"}`);
  lines.push(``);
  lines.push(`## Steps`);
  lines.push(``);

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
          `  - [${flag.severity}] ${flag.type}: ${flag.message}${flag.evidence ? ` (evidence: ${flag.evidence})` : ""}`
        );
      }
    }
    lines.push(``);
  }

  return lines.join("\n");
}
