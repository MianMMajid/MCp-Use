import type { GuardAction, RiskFlag } from "./risk.js";

export type TraceStatus = "active" | "completed" | "quarantined";
export type TraceSource = "openclaw" | "manual";
export type StepActor = "agent" | "tool" | "system" | "user";
export type StepType =
  | "prompt"
  | "tool_call"
  | "shell"
  | "browser"
  | "network"
  | "email"
  | "system";

export interface TraceToolCall {
  name: string;
  input?: Record<string, unknown>;
  output?: unknown;
}

export interface TraceStep {
  index: number;
  timestamp: string;
  actor: StepActor;
  type: StepType;
  prompt?: string;
  toolCall?: TraceToolCall;
  output?: string;
  command?: string;
  externalUrl?: string;
  metadata?: Record<string, unknown>;
  riskScore: number;
  riskFlags: RiskFlag[];
  guardStatus: GuardAction;
}

export interface Trace {
  id: string;
  ownerKeyFingerprint?: string;
  sessionId: string;
  source: TraceSource;
  status: TraceStatus;
  startedAt: string;
  updatedAt: string;
  parentTraceId?: string;
  forkedFromStep?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
  steps: TraceStep[];
}

export interface TraceForkEdits {
  prompt?: string;
  output?: string;
  command?: string;
  toolName?: string;
  toolResponse?: string;
  appendSimulationNote?: string;
}

export interface TraceDiffChange {
  stepIndex: number;
  field: string;
  before?: string;
  after?: string;
}

export interface TraceDiff {
  changedSteps: number[];
  addedSteps: number[];
  changeLog: TraceDiffChange[];
}

export interface OpenClawRawEvent {
  eventId?: string;
  timestamp?: string;
  actor?: string;
  type?: string;
  prompt?: string;
  output?: string;
  command?: string;
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: unknown;
  url?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ObserveSessionOptions {
  sessionId: string;
  source?: "openclaw" | "manual";
  bridgeUrl: string;
  token: string;
}
