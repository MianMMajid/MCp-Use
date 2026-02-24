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

export type RiskSeverity = "low" | "medium" | "high" | "critical";
export type GuardAction = "allow" | "block" | "pending";

export interface RiskFlag {
  id: string;
  type: string;
  severity: RiskSeverity;
  stepIndex: number;
  message: string;
  recommendation: string;
  evidence?: string;
}

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

export interface StepRiskResult {
  stepIndex: number;
  riskScore: number;
  flags: RiskFlag[];
}

export interface AuditBreakdown {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface AuditReport {
  overallRiskScore: number;
  severity: RiskSeverity;
  summary: string;
  recommendations: string[];
  flags: RiskFlag[];
  stepResults: StepRiskResult[];
  breakdown: AuditBreakdown;
}

export interface ObserveSessionOptions {
  sessionId: string;
  source?: "openclaw" | "auto";
  bridgeUrl?: string;
  token?: string;
}

export interface OpenClawRawEvent {
  [key: string]: unknown;
}

export interface SharedTraceStep {
  index: number;
  actor: StepActor;
  type: StepType;
  summary: string;
  toolName?: string;
  commandTemplate?: string;
  riskScore: number;
  flagTypes: string[];
}

export interface SharedTrace {
  id: string;
  sourceTraceIdHash: string;
  sharedAt: string;
  source: TraceSource;
  taskLabel: string;
  objective?: string;
  tags: string[];
  behaviorSignature: string;
  embedding: number[];
  riskScore: number;
  riskSeverity: RiskSeverity;
  flaggedSteps: number;
  quarantined: boolean;
  stepCount: number;
  steps: SharedTraceStep[];
}

export interface ShareTraceOptions {
  taskLabel?: string;
  objective?: string;
  tags?: string[];
}

export interface EvolvedSkillSuggestion {
  id: string;
  title: string;
  description: string;
  confidence: number;
  adoptionScore: number;
  suggestedPromptPatch: string;
  guardrails: string[];
  evidenceTraceIds: string[];
}

export interface CommunityStats {
  sharedTraces: number;
  uniqueSignatures: number;
  quarantinedSharedTraces: number;
  highRiskSharedTraces: number;
}
