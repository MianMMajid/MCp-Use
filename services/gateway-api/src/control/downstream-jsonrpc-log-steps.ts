import {
  compactUnknown,
  extractFirstUrl,
  extractLikelyCommand,
  summarizeJsonRpcPayload,
  truncateText,
} from "../helpers.js";
import { toPolicySnapshot } from "../trace-helpers.js";
import type {
  Trace,
  TraceStep,
} from "@maple/types";

interface JsonRpcStepApp {
  id: string;
  name: string;
  mcpUrl: string;
}

export function createJsonRpcPreExecutionCandidateStep(options: {
  traceStepIndex: number;
  app: JsonRpcStepApp;
  rpcMethod: string;
  rpcPayload: Record<string, unknown>;
  origin: "mcp_proxy";
}): TraceStep {
  const payloadSummary = summarizeJsonRpcPayload(options.rpcPayload);
  return {
    index: options.traceStepIndex,
    timestamp: new Date().toISOString(),
    actor: "agent",
    type: "tool_call",
    prompt: `rpc ${options.app.id}.${options.rpcMethod}`,
    toolCall: {
      name: `${options.app.id}::${options.rpcMethod}`,
      input: options.rpcPayload,
    },
    output: payloadSummary,
    command: extractLikelyCommand(payloadSummary),
    externalUrl: extractFirstUrl(payloadSummary),
    metadata: {
      downstream: {
        appId: options.app.id,
        appName: options.app.name,
        rpcMethod: options.rpcMethod,
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

export function createJsonRpcPreExecutionLoggedStep(options: {
  traceStepIndex: number;
  app: JsonRpcStepApp;
  rpcMethod: string;
  origin: "mcp_proxy";
  preExecutionWouldBlock: boolean;
  decision: any;
  candidateStep: TraceStep;
}): TraceStep {
  const preDecisionStep = options.decision.step ?? options.candidateStep;
  return {
    ...preDecisionStep,
    index: options.traceStepIndex,
    timestamp: new Date().toISOString(),
    output: options.preExecutionWouldBlock
      ? truncateText(
          `Policy denied before downstream JSON-RPC execution (${options.decision.message}). Forward canceled by Maple firewall.`,
        )
      : truncateText(`Pre-execution policy passed. Forwarding ${options.rpcMethod} through Maple.`),
    guardStatus: options.preExecutionWouldBlock ? "block" : "allow",
    metadata: {
      ...(preDecisionStep.metadata ?? {}),
      downstream: {
        appId: options.app.id,
        appName: options.app.name,
        rpcMethod: options.rpcMethod,
        origin: options.origin,
        stage: "pre_execution",
        mcpUrl: options.app.mcpUrl,
        policy: toPolicySnapshot(options.decision),
      },
    },
  };
}

export function createJsonRpcPostExecutionCandidateStep(options: {
  traceStepIndex: number;
  app: JsonRpcStepApp;
  rpcMethod: string;
  rpcPayload: Record<string, unknown>;
  origin: "mcp_proxy";
  preExecutionStepIndex: number;
  preExecutionDecision: any;
  payload: {
    output: unknown;
    responseStatus?: number;
    durationMs?: number;
    failed?: boolean;
    stage: "post_execution" | "dispatch_error";
  };
}): TraceStep {
  const summary = summarizeJsonRpcPayload(options.payload.output);
  return {
    index: options.traceStepIndex,
    timestamp: new Date().toISOString(),
    actor: "tool",
    type: "network",
    prompt: `rpc_response ${options.app.id}.${options.rpcMethod}`,
    toolCall: {
      name: `${options.app.id}::${options.rpcMethod}`,
      input: options.rpcPayload,
      output: compactUnknown(options.payload.output),
    },
    output: summary,
    command: extractLikelyCommand(summary),
    externalUrl: extractFirstUrl(summary),
    metadata: {
      downstream: {
        appId: options.app.id,
        appName: options.app.name,
        rpcMethod: options.rpcMethod,
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

export function setJsonRpcTraceDispatchMetadata(options: {
  trace: Trace;
  app: JsonRpcStepApp;
  rpcMethod: string;
  preExecutionWouldBlock: boolean;
}): void {
  options.trace.metadata = {
    ...(options.trace.metadata ?? {}),
    mode: "maple-downstream-proxy",
    downstreamLastAppId: options.app.id,
    downstreamLastRpcMethod: options.rpcMethod,
    downstreamDispatchAt: new Date().toISOString(),
    downstreamPreExecutionWouldBlock: options.preExecutionWouldBlock,
  };
}
