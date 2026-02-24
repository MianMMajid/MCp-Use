import {
  compactUnknown,
  extractFirstUrl,
  extractLikelyCommand,
  truncateText,
} from "../helpers.js";
import {
  inferStepTypeFromDownstream,
  toPolicySnapshot,
} from "../trace-helpers.js";

import type { FirewallStepDecision } from "@maple/security";
import type { Trace, TraceStep } from "@maple/types";
import type { DownstreamAppConfig } from "./downstream-proxy.js";

export function setTraceDispatchMetadata(options: {
  trace: Trace;
  app: DownstreamAppConfig;
  toolName: string;
  preExecutionWouldBlock: boolean;
}) {
  options.trace.metadata = {
    ...(options.trace.metadata ?? {}),
    mode: "maple-downstream-proxy",
    downstreamLastAppId: options.app.id,
    downstreamLastToolName: options.toolName,
    downstreamDispatchAt: new Date().toISOString(),
    downstreamPreExecutionWouldBlock: options.preExecutionWouldBlock,
  };
}

export function createPreExecutionCandidateStep(options: {
  traceStepIndex: number;
  app: DownstreamAppConfig;
  toolName: string;
  toolArgs: Record<string, unknown>;
  invocationSummary: string;
  origin: "api" | "mcp" | "mcp_proxy";
}): TraceStep {
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

export function createPreExecutionLoggedStep(options: {
  traceStepIndex: number;
  app: DownstreamAppConfig;
  toolName: string;
  origin: "api" | "mcp" | "mcp_proxy";
  decision: FirewallStepDecision;
  preExecutionWouldBlock: boolean;
  candidateStep: TraceStep;
}): TraceStep {
  const preDecisionStep = options.decision.step ?? options.candidateStep;
  return {
    ...preDecisionStep,
    index: options.traceStepIndex,
    timestamp: new Date().toISOString(),
    output: options.preExecutionWouldBlock
      ? truncateText(
        `Policy denied before downstream execution (${options.decision.message}). Dispatch canceled by Maple firewall.`,
      )
      : truncateText(
        `Pre-execution policy passed. Dispatching ${options.app.id}.${options.toolName} through Maple.`,
      ),
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

export function createPostExecutionCandidateStep(options: {
  traceStepIndex: number;
  app: DownstreamAppConfig;
  toolName: string;
  toolArgs: Record<string, unknown>;
  origin: "api" | "mcp" | "mcp_proxy";
  preExecutionStepIndex: number;
  preExecutionDecision: FirewallStepDecision;
  payload: {
    output: string;
    toolOutput: unknown;
    responseStatus?: number;
    requestId?: string;
    durationMs?: number;
    failed?: boolean;
    stage: "post_execution" | "dispatch_error";
  };
}): TraceStep {
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
