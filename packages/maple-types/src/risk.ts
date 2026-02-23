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
