import type { DownstreamAppConfig, DownstreamCallResult, DownstreamJsonRpcForwardResult } from "../../control/downstream-proxy.js";
import type { Trace, TraceStep } from "../../core/types.js";
import type { FirewallStepDecision } from "../../security/firewall-policy.js";

interface AuditSummary {
  overallRiskScore: number;
  severity: string;
}

export interface DownstreamDispatchLogResult {
  ok: boolean;
  blockedByPolicy: boolean;
  preExecutionWouldBlock: boolean;
  trace: Trace;
  step: TraceStep;
  preExecutionStep: TraceStep;
  preExecutionDecision: FirewallStepDecision;
  report: AuditSummary;
  app: DownstreamAppConfig;
  dispatch?: DownstreamCallResult;
  failure?: string;
}

export interface DownstreamChainStage {
  index: number;
  appId: string;
  ok: boolean;
  blockedByPolicy: boolean;
  preExecutionWouldBlock: boolean;
  traceId: string;
  sessionId: string;
  stepIndex: number;
  preExecutionStepIndex: number;
  policy: unknown;
  failure?: string;
}

export interface DownstreamChainDispatchResult {
  ok: boolean;
  blockedByPolicy: boolean;
  appIds: string[];
  stages: DownstreamChainStage[];
  finalResult: DownstreamDispatchLogResult;
  failure?: string;
}

export interface DownstreamJsonRpcLogResult {
  ok: boolean;
  blockedByPolicy: boolean;
  preExecutionWouldBlock: boolean;
  trace: Trace;
  step: TraceStep;
  preExecutionStep: TraceStep;
  preExecutionDecision: FirewallStepDecision;
  report: AuditSummary;
  app: DownstreamAppConfig;
  forward?: DownstreamJsonRpcForwardResult;
  failure?: string;
}

interface CreateDownstreamOrchestrationDeps {
  asString: (value: unknown) => string | undefined;
  auditAndPersist: (trace: Trace) => AuditSummary;
  compactUnknown: (value: unknown, maxChars?: number) => unknown;
  dispatchToolToDownstream: (
    app: DownstreamAppConfig,
    toolName: string,
    toolArgs: Record<string, unknown>
  ) => Promise<DownstreamCallResult>;
  errorMessage: (error: unknown) => string;
  evaluateFirewallStep: (candidateStep: TraceStep) => FirewallStepDecision;
  extractFirstUrl: (value: string) => string | undefined;
  extractLikelyCommand: (value: string) => string | undefined;
  forwardJsonRpcToDownstream: (
    app: DownstreamAppConfig,
    payload: Record<string, unknown>
  ) => Promise<DownstreamJsonRpcForwardResult>;
  inferStepTypeFromDownstream: (summary: string, toolName: string) => TraceStep["type"];
  parseAppIdList: (value: unknown) => string[];
  resolveDownstreamApp: (appId: string) => DownstreamAppConfig;
  resolveProxyTrace: (options: {
    traceId?: string;
    sessionId?: string;
    appId: string;
  }) => Trace;
  summarizeJsonRpcPayload: (payload: unknown, maxLength?: number) => string;
  toInvocationSummary: (toolName: string, toolArgs: Record<string, unknown>) => string;
  toPolicySnapshot: (decision: FirewallStepDecision) => unknown;
  truncateText: (value: string, maxLength?: number) => string;
  upsertTraceForCurrentOwner: (trace: Trace) => Trace;
}

export function createDownstreamOrchestration(deps: CreateDownstreamOrchestrationDeps): {
  dispatchDownstreamAndLog: (options: {
    appId: string;
    toolName: string;
    toolArgs: Record<string, unknown>;
    traceId?: string;
    sessionId?: string;
    origin: "api" | "mcp" | "mcp_proxy";
  }) => Promise<DownstreamDispatchLogResult>;
  dispatchDownstreamChainAndLog: (options: {
    appIds: string[];
    toolName: string;
    toolArgs: Record<string, unknown>;
    traceId?: string;
    sessionId?: string;
    origin: "api" | "mcp" | "mcp_proxy";
  }) => Promise<DownstreamChainDispatchResult>;
  forwardJsonRpcAndLog: (options: {
    appId: string;
    rpcMethod: string;
    rpcPayload: Record<string, unknown>;
    traceId?: string;
    sessionId?: string;
    origin: "mcp_proxy";
  }) => Promise<DownstreamJsonRpcLogResult>;
} {
  const {
    asString,
    auditAndPersist,
    compactUnknown,
    dispatchToolToDownstream,
    errorMessage,
    evaluateFirewallStep,
    extractFirstUrl,
    extractLikelyCommand,
    forwardJsonRpcToDownstream,
    inferStepTypeFromDownstream,
    parseAppIdList,
    resolveDownstreamApp,
    resolveProxyTrace,
    summarizeJsonRpcPayload,
    toInvocationSummary,
    toPolicySnapshot,
    truncateText,
    upsertTraceForCurrentOwner,
  } = deps;

  const dispatchDownstreamAndLog = async (options: {
    appId: string;
    toolName: string;
    toolArgs: Record<string, unknown>;
    traceId?: string;
    sessionId?: string;
    origin: "api" | "mcp" | "mcp_proxy";
  }): Promise<DownstreamDispatchLogResult> => {
    const app = resolveDownstreamApp(options.appId);
    const trace = resolveProxyTrace({
      traceId: options.traceId,
      sessionId: options.sessionId,
      appId: app.id,
    });

    const invocationSummary = toInvocationSummary(options.toolName, options.toolArgs);
    const preExecutionCandidateStep: TraceStep = {
      index: trace.steps.length,
      timestamp: new Date().toISOString(),
      actor: "agent",
      type: inferStepTypeFromDownstream(invocationSummary, options.toolName),
      prompt: `dispatch ${app.id}.${options.toolName}`,
      toolCall: {
        name: `${app.id}.${options.toolName}`,
        input: options.toolArgs,
      },
      output: invocationSummary,
      command: extractLikelyCommand(invocationSummary),
      externalUrl: extractFirstUrl(invocationSummary),
      metadata: {
        downstream: {
          appId: app.id,
          appName: app.name,
          toolName: options.toolName,
          origin: options.origin,
          stage: "pre_execution",
          mcpUrl: app.mcpUrl,
        },
      },
      riskScore: 0,
      riskFlags: [],
      guardStatus: "pending",
    };

    const preExecutionDecision = evaluateFirewallStep(preExecutionCandidateStep);
    const preExecutionWouldBlock = preExecutionDecision.shouldBlock;
    const preExecutionStep: TraceStep = {
      ...preExecutionDecision.step,
      index: trace.steps.length,
      timestamp: new Date().toISOString(),
      output: preExecutionWouldBlock
        ? truncateText(
            `Policy denied before downstream execution (${preExecutionDecision.message}). Dispatch canceled by Maple firewall.`
          )
        : truncateText(
            `Pre-execution policy passed. Dispatching ${app.id}.${options.toolName} through Maple.`
          ),
      guardStatus: preExecutionWouldBlock ? "block" : "allow",
      metadata: {
        ...(preExecutionDecision.step.metadata ?? {}),
        downstream: {
          appId: app.id,
          appName: app.name,
          toolName: options.toolName,
          origin: options.origin,
          stage: "pre_execution",
          mcpUrl: app.mcpUrl,
          policy: toPolicySnapshot(preExecutionDecision),
        },
      },
    };
    trace.steps.push(preExecutionStep);
    trace.metadata = {
      ...(trace.metadata ?? {}),
      mode: "maple-downstream-proxy",
      downstreamLastAppId: app.id,
      downstreamLastToolName: options.toolName,
      downstreamDispatchAt: new Date().toISOString(),
      downstreamPreExecutionWouldBlock: preExecutionWouldBlock,
    };

    if (preExecutionWouldBlock) {
      trace.status = "quarantined";
      upsertTraceForCurrentOwner(trace);
      const report = auditAndPersist(trace);
      return {
        ok: false,
        blockedByPolicy: true,
        preExecutionWouldBlock,
        trace,
        step: preExecutionStep,
        preExecutionStep,
        preExecutionDecision,
        report,
        app,
        failure: `Policy blocked before downstream execution: ${preExecutionDecision.message}`,
      };
    }

    const appendLoggedStep = (payload: {
      output: string;
      toolOutput: unknown;
      responseStatus?: number;
      requestId?: string;
      durationMs?: number;
      failed?: boolean;
      stage: "post_execution" | "dispatch_error";
    }) => {
      const summary = truncateText(payload.output.trim() || "No textual output returned.");
      const externalUrl = extractFirstUrl(summary);
      const command = extractLikelyCommand(summary);
      const candidateStep: TraceStep = {
        index: trace.steps.length,
        timestamp: new Date().toISOString(),
        actor: "tool",
        type: inferStepTypeFromDownstream(summary, options.toolName),
        prompt: `proxy ${app.id}.${options.toolName}`,
        toolCall: {
          name: `${app.id}.${options.toolName}`,
          input: options.toolArgs,
          output: compactUnknown(payload.toolOutput),
        },
        output: summary,
        command,
        externalUrl,
        metadata: {
          downstream: {
            appId: app.id,
            appName: app.name,
            toolName: options.toolName,
            requestId: payload.requestId,
            responseStatus: payload.responseStatus,
            durationMs: payload.durationMs,
            origin: options.origin,
            failed: payload.failed === true,
            mcpUrl: app.mcpUrl,
            stage: payload.stage,
            preExecutionStepIndex: preExecutionStep.index,
            preExecutionPolicy: toPolicySnapshot(preExecutionDecision),
          },
        },
        riskScore: 0,
        riskFlags: [],
        guardStatus: "pending",
      };

      const decision = evaluateFirewallStep(candidateStep);
      const loggedStep: TraceStep = {
        ...decision.step,
        index: trace.steps.length,
        timestamp: new Date().toISOString(),
        guardStatus: decision.shouldBlock ? "block" : "allow",
      };

      trace.steps.push(loggedStep);
      trace.metadata = {
        ...(trace.metadata ?? {}),
        mode: "maple-downstream-proxy",
        downstreamLastAppId: app.id,
        downstreamLastToolName: options.toolName,
        downstreamDispatchAt: new Date().toISOString(),
        downstreamPreExecutionWouldBlock: preExecutionWouldBlock,
      };
      if (decision.shouldBlock) {
        trace.status = "quarantined";
      }
      upsertTraceForCurrentOwner(trace);
      const report = auditAndPersist(trace);
      return { loggedStep, report };
    };

    try {
      const dispatch = await dispatchToolToDownstream(app, options.toolName, options.toolArgs);
      const { loggedStep, report } = appendLoggedStep({
        output: dispatch.textPreview,
        toolOutput: dispatch.result,
        requestId: dispatch.requestId,
        responseStatus: dispatch.responseStatus,
        durationMs: dispatch.durationMs,
        failed: false,
        stage: "post_execution",
      });
      return {
        ok: true,
        blockedByPolicy: false,
        preExecutionWouldBlock,
        trace,
        step: loggedStep,
        preExecutionStep,
        preExecutionDecision,
        report,
        app,
        dispatch,
      };
    } catch (dispatchError) {
      const failure = `Downstream dispatch failed: ${errorMessage(dispatchError)}`;
      const { loggedStep, report } = appendLoggedStep({
        output: failure,
        toolOutput: { error: failure },
        failed: true,
        stage: "dispatch_error",
      });
      return {
        ok: false,
        blockedByPolicy: false,
        preExecutionWouldBlock,
        trace,
        step: loggedStep,
        preExecutionStep,
        preExecutionDecision,
        report,
        app,
        failure,
      };
    }
  };

  const dispatchDownstreamChainAndLog = async (options: {
    appIds: string[];
    toolName: string;
    toolArgs: Record<string, unknown>;
    traceId?: string;
    sessionId?: string;
    origin: "api" | "mcp" | "mcp_proxy";
  }): Promise<DownstreamChainDispatchResult> => {
    const normalizedAppIds = parseAppIdList(options.appIds);
    if (normalizedAppIds.length === 0) {
      throw new Error("At least one downstream app is required for chain dispatch.");
    }
    normalizedAppIds.forEach((appId) => resolveDownstreamApp(appId));

    const stages: DownstreamChainStage[] = [];
    let activeTraceId = asString(options.traceId);
    let finalResult: DownstreamDispatchLogResult | undefined;

    for (let index = 0; index < normalizedAppIds.length; index += 1) {
      const appId = normalizedAppIds[index];
      const stageResult = await dispatchDownstreamAndLog({
        appId,
        toolName: options.toolName,
        toolArgs: options.toolArgs,
        traceId: activeTraceId,
        sessionId: options.sessionId,
        origin: options.origin,
      });
      finalResult = stageResult;
      activeTraceId = stageResult.trace.id;

      stages.push({
        index,
        appId,
        ok: stageResult.ok,
        blockedByPolicy: stageResult.blockedByPolicy,
        preExecutionWouldBlock: stageResult.preExecutionWouldBlock,
        traceId: stageResult.trace.id,
        sessionId: stageResult.trace.sessionId,
        stepIndex: stageResult.step.index,
        preExecutionStepIndex: stageResult.preExecutionStep.index,
        policy: toPolicySnapshot(stageResult.preExecutionDecision),
        failure: stageResult.failure,
      });

      if (!stageResult.ok) {
        return {
          ok: false,
          blockedByPolicy: stageResult.blockedByPolicy,
          appIds: normalizedAppIds,
          stages,
          finalResult: stageResult,
          failure:
            stageResult.failure ??
            `Downstream chain failed on stage ${index + 1} (${appId}) for tool ${options.toolName}.`,
        };
      }
    }

    if (!finalResult) {
      throw new Error("Downstream chain completed without a final result.");
    }

    return {
      ok: true,
      blockedByPolicy: false,
      appIds: normalizedAppIds,
      stages,
      finalResult,
    };
  };

  const forwardJsonRpcAndLog = async (options: {
    appId: string;
    rpcMethod: string;
    rpcPayload: Record<string, unknown>;
    traceId?: string;
    sessionId?: string;
    origin: "mcp_proxy";
  }): Promise<DownstreamJsonRpcLogResult> => {
    const app = resolveDownstreamApp(options.appId);
    const trace = resolveProxyTrace({
      traceId: options.traceId,
      sessionId: options.sessionId,
      appId: app.id,
    });
    const payloadSummary = summarizeJsonRpcPayload(options.rpcPayload);

    const preExecutionCandidateStep: TraceStep = {
      index: trace.steps.length,
      timestamp: new Date().toISOString(),
      actor: "agent",
      type: "tool_call",
      prompt: `rpc ${app.id}.${options.rpcMethod}`,
      toolCall: {
        name: `${app.id}::${options.rpcMethod}`,
        input: options.rpcPayload,
      },
      output: payloadSummary,
      command: extractLikelyCommand(payloadSummary),
      externalUrl: extractFirstUrl(payloadSummary),
      metadata: {
        downstream: {
          appId: app.id,
          appName: app.name,
          rpcMethod: options.rpcMethod,
          origin: options.origin,
          stage: "pre_execution",
          mcpUrl: app.mcpUrl,
        },
      },
      riskScore: 0,
      riskFlags: [],
      guardStatus: "pending",
    };

    const preExecutionDecision = evaluateFirewallStep(preExecutionCandidateStep);
    const preExecutionWouldBlock = preExecutionDecision.shouldBlock;
    const preExecutionStep: TraceStep = {
      ...preExecutionDecision.step,
      index: trace.steps.length,
      timestamp: new Date().toISOString(),
      output: preExecutionWouldBlock
        ? truncateText(
            `Policy denied before downstream JSON-RPC execution (${preExecutionDecision.message}). Forward canceled by Maple firewall.`
          )
        : truncateText(`Pre-execution policy passed. Forwarding ${options.rpcMethod} through Maple.`),
      guardStatus: preExecutionWouldBlock ? "block" : "allow",
      metadata: {
        ...(preExecutionDecision.step.metadata ?? {}),
        downstream: {
          appId: app.id,
          appName: app.name,
          rpcMethod: options.rpcMethod,
          origin: options.origin,
          stage: "pre_execution",
          mcpUrl: app.mcpUrl,
          policy: toPolicySnapshot(preExecutionDecision),
        },
      },
    };
    trace.steps.push(preExecutionStep);
    trace.metadata = {
      ...(trace.metadata ?? {}),
      mode: "maple-downstream-proxy",
      downstreamLastAppId: app.id,
      downstreamLastRpcMethod: options.rpcMethod,
      downstreamDispatchAt: new Date().toISOString(),
      downstreamPreExecutionWouldBlock: preExecutionWouldBlock,
    };

    if (preExecutionWouldBlock) {
      trace.status = "quarantined";
      upsertTraceForCurrentOwner(trace);
      const report = auditAndPersist(trace);
      return {
        ok: false,
        blockedByPolicy: true,
        preExecutionWouldBlock,
        trace,
        step: preExecutionStep,
        preExecutionStep,
        preExecutionDecision,
        report,
        app,
        failure: `Policy blocked before downstream JSON-RPC execution: ${preExecutionDecision.message}`,
      };
    }

    const appendLoggedStep = (payload: {
      output: unknown;
      responseStatus?: number;
      durationMs?: number;
      failed?: boolean;
      stage: "post_execution" | "dispatch_error";
    }) => {
      const summary = summarizeJsonRpcPayload(payload.output);
      const candidateStep: TraceStep = {
        index: trace.steps.length,
        timestamp: new Date().toISOString(),
        actor: "tool",
        type: "network",
        prompt: `rpc_response ${app.id}.${options.rpcMethod}`,
        toolCall: {
          name: `${app.id}::${options.rpcMethod}`,
          input: options.rpcPayload,
          output: compactUnknown(payload.output),
        },
        output: summary,
        command: extractLikelyCommand(summary),
        externalUrl: extractFirstUrl(summary),
        metadata: {
          downstream: {
            appId: app.id,
            appName: app.name,
            rpcMethod: options.rpcMethod,
            responseStatus: payload.responseStatus,
            durationMs: payload.durationMs,
            origin: options.origin,
            failed: payload.failed === true,
            mcpUrl: app.mcpUrl,
            stage: payload.stage,
            preExecutionStepIndex: preExecutionStep.index,
            preExecutionPolicy: toPolicySnapshot(preExecutionDecision),
          },
        },
        riskScore: 0,
        riskFlags: [],
        guardStatus: "pending",
      };

      const decision = evaluateFirewallStep(candidateStep);
      const loggedStep: TraceStep = {
        ...decision.step,
        index: trace.steps.length,
        timestamp: new Date().toISOString(),
        guardStatus: decision.shouldBlock ? "block" : "allow",
      };
      trace.steps.push(loggedStep);
      trace.metadata = {
        ...(trace.metadata ?? {}),
        mode: "maple-downstream-proxy",
        downstreamLastAppId: app.id,
        downstreamLastRpcMethod: options.rpcMethod,
        downstreamDispatchAt: new Date().toISOString(),
        downstreamPreExecutionWouldBlock: preExecutionWouldBlock,
      };
      if (decision.shouldBlock) {
        trace.status = "quarantined";
      }
      upsertTraceForCurrentOwner(trace);
      const report = auditAndPersist(trace);
      return { loggedStep, report };
    };

    try {
      const forwarded = await forwardJsonRpcToDownstream(app, options.rpcPayload);
      const { loggedStep, report } = appendLoggedStep({
        output: forwarded.payload,
        responseStatus: forwarded.responseStatus,
        durationMs: forwarded.durationMs,
        failed: false,
        stage: "post_execution",
      });
      return {
        ok: true,
        blockedByPolicy: false,
        preExecutionWouldBlock,
        trace,
        step: loggedStep,
        preExecutionStep,
        preExecutionDecision,
        report,
        app,
        forward: forwarded,
      };
    } catch (forwardError) {
      const failure = `Downstream JSON-RPC forward failed: ${errorMessage(forwardError)}`;
      const { loggedStep, report } = appendLoggedStep({
        output: { error: failure },
        failed: true,
        stage: "dispatch_error",
      });
      return {
        ok: false,
        blockedByPolicy: false,
        preExecutionWouldBlock,
        trace,
        step: loggedStep,
        preExecutionStep,
        preExecutionDecision,
        report,
        app,
        failure,
      };
    }
  };

  return {
    dispatchDownstreamAndLog,
    dispatchDownstreamChainAndLog,
    forwardJsonRpcAndLog,
  };
}
