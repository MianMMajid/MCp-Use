import type { Trace, TraceStep } from "@maple/types";

export interface FirewallBlockedStepSummary {
  stepIndex: number;
  actor: TraceStep["actor"];
  type: TraceStep["type"];
  timestamp: string;
  rule: string | null;
  reason: string;
  commandOrUrl: string;
}

export interface FirewallActionSummary {
  stepIndex: number;
  actor: TraceStep["actor"];
  type: TraceStep["type"];
  timestamp: string;
  toolName: string | null;
  command: string | null;
  url: string | null;
  prompt: string;
  outputPreview: string;
  riskScore: number;
  guardStatus: TraceStep["guardStatus"];
}

export interface FirewallChatContext {
  generatedAt: string;
  trace:
    | {
        id: string;
        sessionId: string;
        source: Trace["source"];
        status: Trace["status"];
        startedAt: string;
        updatedAt: string;
        lastEventAt: string;
        stepCount: number;
        overallRiskScore: number;
        riskSeverity: string;
      }
    | null;
  firewall:
    | {
        enabled: boolean;
        defaultAction: string;
        blockedSteps: number;
        redactedSteps: number;
        highRiskSteps: number;
        guardCounts: {
          allow: number;
          block: number;
          pending: number;
        };
        ruleHits: Record<string, number>;
        topRules: Array<{ rule: string; count: number }>;
        quarantinedAt: string | null;
        lastBlockedStep: FirewallBlockedStepSummary | null;
        recentBlockedSteps: FirewallBlockedStepSummary[];
      }
    | null;
  activity:
    | {
        recentActions: FirewallActionSummary[];
        networkActions: FirewallActionSummary[];
        shellActions: FirewallActionSummary[];
      }
    | null;
  highlights: string[];
  recommendations: string[];
}
