import { server, database, getGrpcClients } from "../state.js";
import { requireApiKeyResponse, authContextStorage } from "../auth.js";
import { asNumber, asString, readJsonBody } from "../helpers.js";
import { grpcUnary } from "../grpc-clients.js";
import { mapleLog } from "../logging.js";
import { emitAuditEvent } from "../audit-emitter.js";
import { resolveBufferedApproval } from "../hitl-broker.js";
import {
  fromGuardActionEnum,
  toGuardActionEnum,
} from "./hitl-routes-common.js";

export function registerHitlDecisionRoute(app: typeof server.app) {
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
    const authContext = authContextStorage.getStore();
    const approverId =
      asString(body.approverId) ??
      authContext?.userId ??
      authContext?.keyFingerprint ??
      "gateway-admin";

    const stepIndex = Number.isFinite(stepIndexRaw) ? Math.max(0, Math.trunc(stepIndexRaw as number)) : -1;
    if (!traceId || stepIndex < 0) {
      return c.json({ error: "traceId and stepIndex are required" }, 400);
    }

    const grpcAction = toGuardActionEnum(action);
    if (grpcAction === "GUARD_ACTION_PENDING") {
      return c.json({ error: "action must be allow or block" }, 400);
    }

    try {
      const response = await grpcUnary<any>(clients.contextWall, "submitApproval", {
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
        eventType:
          grpcAction === "GUARD_ACTION_ALLOW"
            ? "AUDIT_EVENT_TYPE_HITL_APPROVED"
            : "AUDIT_EVENT_TYPE_HITL_REJECTED",
        sourceService: "gateway-api",
        traceId,
        userId: approverId,
        summary: `HITL decision submitted (${fromGuardActionEnum(grpcAction)})`,
        payload: {
          traceId,
          stepIndex,
          action: fromGuardActionEnum(grpcAction),
          reason,
          accepted: Boolean(response?.accepted),
        },
        severity: grpcAction === "GUARD_ACTION_ALLOW" ? "RISK_SEVERITY_LOW" : "RISK_SEVERITY_HIGH",
      });

      return c.json({
        accepted: Boolean(response?.accepted),
        traceId: String(response?.traceId || traceId),
        stepIndex: Number(response?.stepIndex ?? stepIndex),
        resultingAction: fromGuardActionEnum(response?.resultingAction || grpcAction),
      });
    } catch (err: any) {
      mapleLog("error", "hitl_submit_failed", { traceId, stepIndex, error: err.message });
      return c.json({ error: "Failed to submit approval", details: err.message }, 500);
    }
  });
}
