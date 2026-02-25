import { asString, sanitizeSessionId } from "../helpers.js";
import { startObservation } from "../bridge/openclaw-bridge.js";
import { traceStore } from "../state.js";
import { auditAndPersist } from "./trace-audit.js";
import { bridgeOverrideDeniedBody, resolveBridgeTarget } from "./trace-runtime-helpers.js";
import { stepToBridgeEvent } from "./trace-step-utils.js";
export async function writeEventsToBridgeSession(sessionId, events, bridgeUrl, token) {
    const target = new URL(`/sessions/${encodeURIComponent(sessionId)}/events`, bridgeUrl);
    const headers = {
        "content-type": "application/json",
    };
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }
    const resetResponse = await fetch(target, {
        method: "POST",
        headers,
        body: JSON.stringify({ reset: true }),
    });
    if (!resetResponse.ok) {
        throw new Error(`Bridge reset failed (${resetResponse.status}).`);
    }
    const appendResponse = await fetch(target, {
        method: "POST",
        headers,
        body: JSON.stringify({ events }),
    });
    if (!appendResponse.ok) {
        throw new Error(`Bridge append failed (${appendResponse.status}).`);
    }
}
export async function launchIsolatedForkSession(options) {
    const { forkedTrace, parentTrace, body } = options;
    const requestedForkSessionId = asString(body.forkSessionId);
    const generatedForkSessionId = `${parentTrace.sessionId}-fork-${Date.now().toString(36)}`;
    const forkSessionId = sanitizeSessionId(requestedForkSessionId ?? generatedForkSessionId);
    const bridgeTarget = resolveBridgeTarget(body);
    if (bridgeTarget.overrideRejected) {
        throw new Error(bridgeOverrideDeniedBody().reason);
    }
    const { bridgeUrl, token } = bridgeTarget;
    const events = forkedTrace.steps.map((step) => stepToBridgeEvent(step));
    await writeEventsToBridgeSession(forkSessionId, events, bridgeUrl, token);
    const runtimeTrace = await startObservation({
        sessionId: forkSessionId,
        source: "openclaw",
        bridgeUrl,
        token,
    });
    runtimeTrace.metadata = {
        ...(runtimeTrace.metadata ?? {}),
        mode: "openclaw-fork-runtime",
        parentTraceId: parentTrace.id,
        parentSessionId: parentTrace.sessionId,
        forkedTraceId: forkedTrace.id,
    };
    runtimeTrace.ownerKeyFingerprint = parentTrace.ownerKeyFingerprint;
    traceStore.upsertTrace(runtimeTrace, parentTrace.ownerKeyFingerprint);
    const runtimeReport = auditAndPersist(runtimeTrace);
    return {
        sessionId: forkSessionId,
        traceId: runtimeTrace.id,
        source: runtimeTrace.source,
        overallRiskScore: runtimeReport.overallRiskScore,
        severity: runtimeReport.severity,
    };
}
//# sourceMappingURL=trace-fork-runtime.js.map