import { server, database, getGrpcClients } from "../state.js";
import { requireApiKeyResponse, authContextStorage } from "../auth.js";
import { asNumber, asString, readJsonBody } from "../helpers.js";
import { grpcUnary } from "../grpc-clients.js";
import { mapleLog } from "../logging.js";
import { emitAuditEvent } from "../audit-emitter.js";
import { listBufferedApprovals, resolveBufferedApproval, subscribeBufferedApprovals } from "../hitl-broker.js";

function toGuardActionEnum(raw: string): string {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "allow") return "GUARD_ACTION_ALLOW";
  if (normalized === "block" || normalized === "deny" || normalized === "reject") return "GUARD_ACTION_BLOCK";
  return "GUARD_ACTION_PENDING";
}

function fromGuardActionEnum(raw: unknown): string {
  const value = String(raw || "");
  if (value === "GUARD_ACTION_ALLOW") return "allow";
  if (value === "GUARD_ACTION_BLOCK") return "block";
  return "pending";
}

function approvalEventToApi(event: any): Record<string, unknown> {
  return {
    traceId: String(event?.traceId || ""),
    stepIndex: Number(event?.stepIndex || 0),
    requestedAt: String(event?.requestedAt || ""),
    step: event?.step ?? null,
    pendingDecision: event?.pendingDecision ?? null,
  };
}

server.get("/api/hitl/approvals", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) {
    return unauthorized;
  }

  const clients = getGrpcClients();
  if (!clients?.contextWall) {
    return c.json({ error: "context-wall unavailable" }, 503);
  }

  try {
    const sessionId = asString(c.req.query("sessionId")) ?? "";
    if (!sessionId) {
      const approvals = listBufferedApprovals();
      return c.json({
        approvals: approvals.map((event) => approvalEventToApi(event)),
        count: approvals.length,
        source: "gateway-buffer",
      });
    }
    const response = await grpcUnary<any>(clients.contextWall, "listPendingApprovals", {
      sessionId,
    });
    const approvals = Array.isArray(response?.approvals) ? response.approvals : [];
    return c.json({
      approvals: approvals.map((event: any) => approvalEventToApi(event)),
      count: approvals.length,
    });
  } catch (err: any) {
    mapleLog("error", "hitl_list_pending_failed", { error: err.message });
    return c.json({ error: "Failed to list pending approvals", details: err.message }, 500);
  }
});

server.get("/api/hitl/approvals/watch", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) {
    return unauthorized;
  }

  const clients = getGrpcClients();
  if (!clients?.contextWall) {
    return c.json({ error: "context-wall unavailable" }, 503);
  }

  const sessionId = asString(c.req.query("sessionId")) ?? "";
  const encoder = new TextEncoder();
  let approvalStream: any;
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode("event: ready\ndata: {}\n\n"));
      if (!sessionId) {
        unsubscribe = subscribeBufferedApprovals((event) => {
          controller.enqueue(
            encoder.encode(`event: approval\ndata: ${JSON.stringify(approvalEventToApi(event))}\n\n`),
          );
        });
        return;
      }
      approvalStream = clients.contextWall.watchApprovalQueue({ sessionId });
      approvalStream.on("data", (event: any) => {
        controller.enqueue(
          encoder.encode(`event: approval\ndata: ${JSON.stringify(approvalEventToApi(event))}\n\n`),
        );
      });
      approvalStream.on("error", (err: any) => {
        controller.enqueue(
          encoder.encode(`event: error\ndata: ${JSON.stringify({ error: String(err?.message || "watch failed") })}\n\n`),
        );
        controller.close();
      });
      approvalStream.on("end", () => {
        controller.enqueue(encoder.encode("event: end\ndata: {}\n\n"));
        controller.close();
      });
    },
    cancel() {
      if (unsubscribe) {
        unsubscribe();
      }
      if (approvalStream && typeof approvalStream.cancel === "function") {
        approvalStream.cancel();
      } else if (approvalStream && typeof approvalStream.destroy === "function") {
        approvalStream.destroy();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});

server.post("/api/hitl/approvals/decision", async (c) => {
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
