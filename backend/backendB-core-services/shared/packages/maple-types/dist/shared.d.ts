import type { RiskSeverity, StepActor, StepType, TraceSource } from "./index.js";
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
export interface CommunityStats {
    sharedTraces: number;
    uniqueSignatures: number;
    quarantinedSharedTraces: number;
    highRiskSharedTraces: number;
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
//# sourceMappingURL=shared.d.ts.map