import { server, database } from "../state.js";
import { bridgeOverrideLockEnabled } from "../config.js";
import { emitAuditEvent } from "../audit-emitter.js";
import { requireApiKeyResponse } from "../auth.js";
import { asString, asBoolean, readJsonBody } from "../helpers.js";
import { getTraceForCurrentOwner, getLatestTraceBySessionForCurrentOwner, createTraceForCurrentOwner, upsertTraceForCurrentOwner, auditAndPersist, buildCandidateStep, evaluateFirewallStepViaGrpc, } from "../trace-helpers.js";
export function registerFirewallDecisionRoutes() {
    // ── POST /api/firewall/decision ────────────────────────────────────────────
    server.app.post("/api/firewall/decision", async (c) => {
        const unauthorized = await requireApiKeyResponse(c, database);
        if (unauthorized) {
            return unauthorized;
        }
        const body = await readJsonBody(c);
        const enforce = asBoolean(body.enforce, true);
        const traceId = asString(body.traceId);
        const sessionId = asString(body.sessionId);
        let trace = traceId ? getTraceForCurrentOwner(traceId) : undefined;
        if (traceId && !trace) {
            return c.json({ error: "Trace not found." }, 404);
        }
        if (!trace && sessionId) {
            trace = getLatestTraceBySessionForCurrentOwner(sessionId);
        }
        const candidateIndex = trace ? trace.steps.length : 0;
        const candidateStep = buildCandidateStep(body, candidateIndex, {
            actor: "agent",
            type: "tool_call",
        });
        const decision = await evaluateFirewallStepViaGrpc(candidateStep);
        emitAuditEvent({
            eventType: decision.shouldBlock
                ? "AUDIT_EVENT_TYPE_POLICY_DENIED"
                : "AUDIT_EVENT_TYPE_POLICY_EVALUATED",
            sourceService: "gateway-api",
            traceId: traceId ?? undefined,
            sessionId: sessionId ?? undefined,
            summary: `Policy ${decision.action}: ${decision.message}`,
            severity: `RISK_SEVERITY_${decision.severity.toUpperCase()}`,
            payload: {
                action: decision.action,
                rule: decision.rule,
                shouldBlock: decision.shouldBlock,
            },
        });
        if (!enforce) {
            return c.json({
                ok: true,
                action: "firewall_decision",
                mode: "preview",
                decision: decision.action,
                executeAllowed: !decision.shouldBlock,
                shouldBlock: decision.shouldBlock,
                severity: decision.severity,
                rule: decision.rule,
                message: decision.message,
                recommendation: decision.recommendation,
                redactedPatterns: decision.redactedPatterns,
                evaluatedAt: decision.evaluatedAt,
                bridgeLocked: bridgeOverrideLockEnabled,
                step: decision.step,
            });
        }
        if (!trace) {
            const requestedSource = asString(body.source);
            const source = requestedSource === "openclaw" || requestedSource === "manual"
                ? requestedSource
                : "manual";
            trace = createTraceForCurrentOwner({
                sessionId: sessionId ?? `preflight-${Date.now()}`,
                source,
                status: "active",
                metadata: {
                    mode: "pre-execution-gate",
                },
                steps: [],
            });
        }
        const baseStep = decision.step ?? {
            index: trace.steps.length,
            timestamp: new Date().toISOString(),
            actor: "agent",
            type: "tool_call",
            riskScore: 0,
            riskFlags: [],
            guardStatus: "pending",
        };
        const guardedStep = {
            ...baseStep,
            index: trace.steps.length,
            timestamp: new Date().toISOString(),
            guardStatus: decision.shouldBlock ? "block" : "allow",
            metadata: {
                ...(baseStep.metadata ?? {}),
                preExecutionGate: true,
                executeAllowed: !decision.shouldBlock,
                gateDecisionAt: decision.evaluatedAt,
            },
        };
        trace.steps.push(guardedStep);
        if (decision.shouldBlock) {
            trace.status = "quarantined";
            emitAuditEvent({
                eventType: "AUDIT_EVENT_TYPE_TRACE_QUARANTINED",
                sourceService: "gateway-api",
                traceId: trace.id,
                sessionId: trace.sessionId,
                summary: `Trace quarantined: ${decision.message}`,
                severity: `RISK_SEVERITY_${decision.severity.toUpperCase()}`,
                payload: { rule: decision.rule, stepIndex: guardedStep.index },
            });
        }
        trace.metadata = {
            ...(trace.metadata ?? {}),
            lastPreExecutionDecision: {
                action: decision.action,
                rule: decision.rule,
                severity: decision.severity,
                shouldBlock: decision.shouldBlock,
                evaluatedAt: decision.evaluatedAt,
            },
        };
        upsertTraceForCurrentOwner(trace);
        const report = auditAndPersist(trace);
        return c.json({
            ok: true,
            action: "firewall_decision",
            mode: "enforce",
            traceId: trace.id,
            sessionId: trace.sessionId,
            stepIndex: guardedStep.index,
            decision: decision.action,
            executeAllowed: !decision.shouldBlock,
            shouldBlock: decision.shouldBlock,
            severity: decision.severity,
            rule: decision.rule,
            message: decision.message,
            recommendation: decision.recommendation,
            redactedPatterns: decision.redactedPatterns,
            evaluatedAt: decision.evaluatedAt,
            status: trace.status,
            overallRiskScore: report.overallRiskScore,
            riskSeverity: report.severity,
            bridgeLocked: bridgeOverrideLockEnabled,
        });
    });
    // ── POST /api/firewall/preview ────────────────────────────────────────────
    server.app.post("/api/firewall/preview", async (c) => {
        const unauthorized = await requireApiKeyResponse(c, database);
        if (unauthorized) {
            return unauthorized;
        }
        const body = await readJsonBody(c);
        const candidateStep = buildCandidateStep(body, Number(body.stepIndex ?? 0), {
            actor: "agent",
            type: "tool_call",
        });
        const decision = await evaluateFirewallStepViaGrpc(candidateStep);
        return c.json({
            ok: true,
            mode: "preview",
            decision: decision.action,
            executeAllowed: !decision.shouldBlock,
            shouldBlock: decision.shouldBlock,
            severity: decision.severity,
            rule: decision.rule,
            message: decision.message,
            recommendation: decision.recommendation,
            redactedPatterns: decision.redactedPatterns,
            evaluatedAt: decision.evaluatedAt,
            bridgeLocked: bridgeOverrideLockEnabled,
            step: decision.step,
        });
    });
}
//# sourceMappingURL=firewall-decision-routes.js.map
