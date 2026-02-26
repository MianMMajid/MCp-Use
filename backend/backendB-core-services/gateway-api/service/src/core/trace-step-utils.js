import { asString } from "../helpers.js";
export function asStepActor(value) {
    if (value === "agent" || value === "tool" || value === "system" || value === "user") {
        return value;
    }
    return "agent";
}
export function asStepType(value) {
    if (value === "prompt" ||
        value === "tool_call" ||
        value === "shell" ||
        value === "browser" ||
        value === "network" ||
        value === "email" ||
        value === "system") {
        return value;
    }
    return "prompt";
}
export function asTraceToolCall(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return undefined;
    }
    const raw = value;
    const name = asString(raw.name);
    if (!name) {
        return undefined;
    }
    return {
        name,
        input: raw.input && typeof raw.input === "object" && !Array.isArray(raw.input)
            ? raw.input
            : undefined,
        output: raw.output,
    };
}
export function buildCandidateStep(body, index, defaults = {
    actor: "agent",
    type: "prompt",
}) {
    const toolCall = asTraceToolCall(body.toolCall);
    const command = asString(body.command);
    const externalUrl = asString(body.externalUrl) ??
        asString(body.url) ??
        asString(body.externalURL) ??
        asString(body.endpoint);
    const explicitType = asString(body.type);
    const inferredType = command
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
        metadata: body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
            ? body.metadata
            : undefined,
        riskScore: 0,
        riskFlags: [],
        guardStatus: "pending",
    };
}
export function stepToBridgeEvent(step) {
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
export function renderTraceMarkdown(trace) {
    const lines = [];
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
                lines.push(`  - [${flag.severity}] ${flag.type}: ${flag.message}${flag.evidence ? ` (evidence: ${flag.evidence})` : ""}`);
            }
        }
        lines.push("");
    }
    return lines.join("\n");
}
//# sourceMappingURL=trace-step-utils.js.map