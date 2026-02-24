import { toPolicySnapshot } from "../trace-helpers.js";

import type { FirewallStepDecision } from "@maple/security";
import type { AuditReport, Trace, TraceStep } from "@maple/types";
import type {
  DownstreamAppConfig,
  DownstreamCallResult,
  DownstreamJsonRpcForwardResult,
} from "./downstream-proxy.js";

export interface DownstreamDispatchLogResult {
  ok: boolean;
  blockedByPolicy: boolean;
  preExecutionWouldBlock: boolean;
  trace: Trace;
  step: TraceStep;
  preExecutionStep: TraceStep;
  preExecutionDecision: FirewallStepDecision;
  report: AuditReport;
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
  policy: ReturnType<typeof toPolicySnapshot>;
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
  report: AuditReport;
  app: DownstreamAppConfig;
  forward?: DownstreamJsonRpcForwardResult;
  failure?: string;
}
