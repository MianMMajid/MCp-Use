import { compactUnknown, extractFirstUrl, extractLikelyCommand, truncateText, } from "../helpers.js";
import { inferStepTypeFromDownstream, toPolicySnapshot, } from "../trace-helpers.js";
export function setTraceDispatchMetadata(options) {
    options.trace.metadata = {
        ...(options.trace.metadata ?? {}),
        mode: "maple-downstream-proxy",
        downstreamLastAppId: options.app.id,
        downstreamLastToolName: options.toolName,
        downstreamDispatchAt: new Date().toISOString(),
        downstreamPreExecutionWouldBlock: options.preExecutionWouldBlock,
    };
}
export function createPreExecutionCandidateStep(options) {
    return {
        index: options.traceStepIndex,
        timestamp: new Date().toISOString(),
        actor: "agent",
        type: inferStepTypeFromDownstream(options.invocationSummary, options.toolName),
        prompt: `dispatch ${options.app.id}.${options.toolName}`,
        toolCall: {
            name: `${options.app.id}.${options.toolName}`,
            input: options.toolArgs,
        },
        output: options.invocationSummary,
        command: extractLikelyCommand(options.invocationSummary),
        externalUrl: extractFirstUrl(options.invocationSummary),
        metadata: {
            downstream: {
                appId: options.app.id,
                appName: options.app.name,
                toolName: options.toolName,
                origin: options.origin,
                stage: "pre_execution",
                mcpUrl: options.app.mcpUrl,
            },
        },
        riskScore: 0,
        riskFlags: [],
        guardStatus: "pending",
    };
}
export function createPreExecutionLoggedStep(options) {
    const preDecisionStep = options.decision.step ?? options.candidateStep;
    return {
        ...preDecisionStep,
        index: options.traceStepIndex,
        timestamp: new Date().toISOString(),
        output: options.preExecutionWouldBlock
            ? truncateText(`Policy denied before downstream execution (${options.decision.message}). Dispatch canceled by Maple firewall.`)
            : truncateText(`Pre-execution policy passed. Dispatching ${options.app.id}.${options.toolName} through Maple.`),
        guardStatus: options.preExecutionWouldBlock ? "block" : "allow",
        metadata: {
            ...(preDecisionStep.metadata ?? {}),
            downstream: {
                appId: options.app.id,
                appName: options.app.name,
                toolName: options.toolName,
                origin: options.origin,
                stage: "pre_execution",
                mcpUrl: options.app.mcpUrl,
                policy: toPolicySnapshot(options.decision),
            },
        },
    };
}
export function createPostExecutionCandidateStep(options) {
    const summary = truncateText(options.payload.output.trim() || "No textual output returned.");
    return {
        index: options.traceStepIndex,
        timestamp: new Date().toISOString(),
        actor: "tool",
        type: inferStepTypeFromDownstream(summary, options.toolName),
        prompt: `proxy ${options.app.id}.${options.toolName}`,
        toolCall: {
            name: `${options.app.id}.${options.toolName}`,
            input: options.toolArgs,
            output: compactUnknown(options.payload.toolOutput),
        },
        output: summary,
        command: extractLikelyCommand(summary),
        externalUrl: extractFirstUrl(summary),
        metadata: {
            downstream: {
                appId: options.app.id,
                appName: options.app.name,
                toolName: options.toolName,
                requestId: options.payload.requestId,
                responseStatus: options.payload.responseStatus,
                durationMs: options.payload.durationMs,
                origin: options.origin,
                failed: options.payload.failed === true,
                mcpUrl: options.app.mcpUrl,
                stage: options.payload.stage,
                preExecutionStepIndex: options.preExecutionStepIndex,
                preExecutionPolicy: toPolicySnapshot(options.preExecutionDecision),
            },
        },
        riskScore: 0,
        riskFlags: [],
        guardStatus: "pending",
    };
}
//# sourceMappingURL=downstream-tool-dispatch-steps.js.map