import { server, database, getGrpcClients } from "../state.js";
import { requireApiKeyResponse } from "../auth.js";
import { asString } from "../helpers.js";
import { grpcUnary } from "../grpc-clients.js";
import { mapleLog } from "../logging.js";
import { listBufferedApprovals } from "../hitl-broker.js";
import { approvalEventToApi } from "./hitl-routes-common.js";

export function registerHitlListApprovalsRoute(app: typeof server.app) {
  app.get("/api/hitl/approvals", async (c) => {
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
}
