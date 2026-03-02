import { database, getGrpcClients } from "../state.js";
import { requireApiKeyResponse, authContextStorage } from "../auth.js";
import { asNumber, asString, readJsonBody } from "../helpers.js";
import { grpcUnary } from "../grpc-clients.js";
import { mapleLog } from "../logging.js";
import { emitAuditEvent } from "../audit-emitter.js";
import { resolveBufferedApproval } from "../hitl-broker.js";
import { fromGuardActionEnum, toGuardActionEnum, } from "./hitl-routes-common.js";
export function registerHitlDecisionRoute(app) {
    app.post("/api/hitl/approvals/decision", async (c) => {
        const unauthorized = await requireApiKeyResponse(c, database);
        if (unauthorized) {
            return unauthorized;
        }
        const clients = getGrpcClients();
        if (!clients?.contextWall) {
            return c.json({ error: "context-wall unavailable" }, 503);
        }
        const body = await readJsonBody(c);
        const traceId = asString(body.traceId) ?? "";
        const stepIndexRaw = asNumber(body.stepIndex);
        const action = asString(body.action) ?? "";
        const reason = asString(body.reason) ?? "";
        // Phase 0E: Optional constraints on approval
        const constraints = body.constraints && typeof body.constraints === "object" ? {
            ...(Number.isFinite(body.constraints.timeboxSeconds) ? { timeboxSeconds: body.constraints.timeboxSeconds } : {}),
            ...(Number.isFinite(body.constraints.rowLimit) ? { rowLimit: body.constraints.rowLimit } : {}),
            ...(Array.isArray(body.constraints.allowedEndpoints) ? { allowedEndpoints: body.constraints.allowedEndpoints } : {}),
            ...(Number.isFinite(body.constraints.rateLimit) ? { rateLimit: body.constraints.rateLimit } : {}),
        } : null;
        const authContext = authContextStorage.getStore();
        const approverId = asString(body.approverId) ??
            authContext?.userId ??
            authContext?.keyFingerprint ??
            "gateway-admin";
        const stepIndex = Number.isFinite(stepIndexRaw) ? Math.max(0, Math.trunc(stepIndexRaw)) : -1;
        if (!traceId || stepIndex < 0) {
            return c.json({ error: "traceId and stepIndex are required" }, 400);
        }
        const grpcAction = toGuardActionEnum(action);
        if (grpcAction === "GUARD_ACTION_PENDING") {
            return c.json({ error: "action must be allow or block" }, 400);
        }
        try {
            const response = await grpcUnary(clients.contextWall, "submitApproval", {
                traceId,
                stepIndex,
                action: grpcAction,
                reason,
                approverId,
            });
            if (response?.accepted) {
                resolveBufferedApproval(traceId, stepIndex);
            }
            emitAuditEvent({
                eventType: grpcAction === "GUARD_ACTION_ALLOW"
                    ? "AUDIT_EVENT_TYPE_HITL_APPROVED"
                    : "AUDIT_EVENT_TYPE_HITL_REJECTED",
                sourceService: "gateway-api",
                traceId,
                userId: approverId,
                summary: `HITL decision submitted (${fromGuardActionEnum(grpcAction)})${constraints ? " with constraints" : ""}`,
                payload: {
                    traceId,
                    stepIndex,
                    action: fromGuardActionEnum(grpcAction),
                    reason,
                    accepted: Boolean(response?.accepted),
                    ...(constraints ? { constraints } : {}),
                },
                severity: grpcAction === "GUARD_ACTION_ALLOW" ? "RISK_SEVERITY_LOW" : "RISK_SEVERITY_HIGH",
            });
            return c.json({
                accepted: Boolean(response?.accepted),
                traceId: String(response?.traceId || traceId),
                stepIndex: Number(response?.stepIndex ?? stepIndex),
                resultingAction: fromGuardActionEnum(response?.resultingAction || grpcAction),
                ...(constraints ? { constraints } : {}),
            });
        }
        catch (err) {
            mapleLog("error", "hitl_submit_failed", { traceId, stepIndex, error: err.message });
            return c.json({ error: "Failed to submit approval", details: err.message }, 500);
        }
    });
}
//# sourceMappingURL=hitl-routes-decision.js.map