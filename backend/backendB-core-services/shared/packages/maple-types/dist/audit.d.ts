import type { RiskSeverity } from "./risk.js";
import type { TraceStep } from "./trace.js";
export type FirewallAction = "allow" | "deny" | "log_only";
export interface FirewallEnforcementSummary {
    enabled: boolean;
    blockedSteps: number;
    redactedSteps: number;
    ruleHits: Record<string, number>;
    defaultAction: FirewallAction;
    enforcedAt: string;
}
export interface FirewallStepDecision {
    enabled: boolean;
    action: FirewallAction;
    shouldBlock: boolean;
    severity: RiskSeverity;
    message: string;
    recommendation: string;
    rule: string | null;
    secretPattern?: string;
    redactedPatterns: string[];
    evaluatedAt: string;
    defaultAction: FirewallAction;
    step?: TraceStep;
}
export type AuditEventType = "policy_evaluated" | "policy_denied" | "policy_allowed" | "policy_log_only" | "secret_redacted" | "hitl_requested" | "hitl_approved" | "hitl_rejected" | "hitl_timeout" | "tool_dispatched" | "tool_completed" | "tool_failed" | "tool_chain_started" | "tool_chain_completed" | "credential_minted" | "credential_revoked" | "credential_expired" | "url_checked" | "url_blocked" | "content_scanned" | "proxy_request" | "model_generate" | "model_stream" | "trace_created" | "trace_updated" | "trace_forked" | "trace_quarantined" | "service_started";
export interface AuditEvent {
    eventId: string;
    eventType: AuditEventType;
    timestamp: string;
    sourceService: string;
    traceId?: string;
    sessionId?: string;
    requestId?: string;
    userId?: string;
    keyFingerprint?: string;
    payload?: Record<string, unknown>;
    severity?: RiskSeverity;
    summary?: string;
}
//# sourceMappingURL=audit.d.ts.map