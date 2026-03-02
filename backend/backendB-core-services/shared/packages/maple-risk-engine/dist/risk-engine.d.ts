import type { AuditReport, RiskSeverity, Trace, TraceStep } from "@maple/types";
export interface AnalyzeRiskOptions {
    communityBaselines?: number[][];
    embeddingThreshold?: number;
}
export declare function deriveSeverityFromScore(score: number): RiskSeverity;
export declare function analyzeTraceRisks(steps: TraceStep[], options?: AnalyzeRiskOptions): AuditReport;
export declare function applyAuditToTrace(trace: Trace, report: AuditReport): Trace;
//# sourceMappingURL=risk-engine.d.ts.map