import { configuredBridgeToken, configuredBridgeUrl, primaryConfiguredApiKeyFingerprint, } from "../config.js";
import { startObservation } from "../bridge/openclaw-bridge.js";
import { mergeLiveOpenClawTrace } from "./trace-runtime-helpers.js";
import { getCommunityBaselines } from "./trace-audit-baselines.js";
import { traceStore } from "../state.js";
import { applyAuditToTrace, analyzeTraceRisks } from "@maple/risk-engine";
import { enforceTraceFirewall } from "@maple/security";
export async function pollForNewSessions() {
    if (!configuredBridgeUrl || !configuredBridgeToken)
        return;
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4500);
        let bridgeSessions;
        try {
            const res = await fetch(new URL("/sessions", configuredBridgeUrl), {
                headers: { Authorization: `Bearer ${configuredBridgeToken}` },
                signal: controller.signal,
            });
            if (!res.ok)
                return;
            const body = (await res.json());
            bridgeSessions = Array.isArray(body.sessions) ? body.sessions : [];
        }
        finally {
            clearTimeout(timeout);
        }
        if (bridgeSessions.length === 0)
            return;
        const ownerFingerprint = primaryConfiguredApiKeyFingerprint;
        const tracked = new Set(traceStore.listSessionIds(ownerFingerprint));
        for (const sessionId of bridgeSessions) {
            if (tracked.has(sessionId)) {
                await refreshExistingSession(sessionId, ownerFingerprint);
                continue;
            }
            try {
                const trace = await startObservation({
                    sessionId,
                    source: "openclaw",
                    bridgeUrl: configuredBridgeUrl,
                    token: configuredBridgeToken,
                });
                if (trace.steps.length === 0)
                    continue;
                trace.ownerKeyFingerprint = ownerFingerprint;
                traceStore.upsertTrace(trace, ownerFingerprint);
                const firewall = enforceTraceFirewall(trace);
                const report = analyzeTraceRisks(trace.steps, {
                    communityBaselines: getCommunityBaselines(true),
                });
                applyAuditToTrace(trace, report);
                trace.metadata = {
                    ...(trace.metadata ?? {}),
                    autoDiscovered: true,
                    discoveredAt: new Date().toISOString(),
                    firewall: {
                        blockedSteps: firewall.blockedSteps,
                        redactedSteps: firewall.redactedSteps,
                        enforcedAt: firewall.enforcedAt,
                        enabled: firewall.enabled,
                        defaultAction: firewall.defaultAction,
                        ruleHits: firewall.ruleHits,
                    },
                };
                traceStore.upsertTrace(trace, ownerFingerprint);
                console.log(`[SESSION-POLL] New session: ${sessionId} (${trace.steps.length} steps, risk: ${report.overallRiskScore}, severity: ${report.severity})`);
            }
            catch (err) {
                console.error(`[SESSION-POLL] Failed to ingest ${sessionId}:`, err instanceof Error ? err.message : err);
            }
        }
    }
    catch {
        // Bridge unreachable or other top-level error — silent, retry next cycle
    }
}
export async function refreshExistingSession(sessionId, ownerFingerprint) {
    const existing = traceStore.getLatestTraceBySession(sessionId, ownerFingerprint);
    if (!existing)
        return;
    try {
        const latest = await startObservation({
            sessionId,
            source: "openclaw",
            bridgeUrl: configuredBridgeUrl,
            token: configuredBridgeToken,
        });
        if (latest.steps.length <= existing.steps.length)
            return;
        const merged = mergeLiveOpenClawTrace(existing, latest);
        traceStore.upsertTrace(merged, ownerFingerprint);
        const firewall = enforceTraceFirewall(merged);
        const report = analyzeTraceRisks(merged.steps, {
            communityBaselines: getCommunityBaselines(true),
        });
        applyAuditToTrace(merged, report);
        merged.metadata = {
            ...(merged.metadata ?? {}),
            firewall: {
                blockedSteps: firewall.blockedSteps,
                redactedSteps: firewall.redactedSteps,
                enforcedAt: firewall.enforcedAt,
                enabled: firewall.enabled,
                defaultAction: firewall.defaultAction,
                ruleHits: firewall.ruleHits,
            },
        };
        traceStore.upsertTrace(merged, ownerFingerprint);
        const newStepCount = latest.steps.length - existing.steps.length;
        console.log(`[SESSION-POLL] Updated session: ${sessionId} (+${newStepCount} steps, total: ${merged.steps.length}, risk: ${report.overallRiskScore})`);
    }
    catch {
        // Silent failure for refresh — will retry next cycle
    }
}
//# sourceMappingURL=trace-session-poller.js.map