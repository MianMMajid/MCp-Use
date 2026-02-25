import { database, getGrpcClients } from "../state.js";
import { requireApiKeyResponse } from "../auth.js";
import { asString } from "../helpers.js";
import { subscribeBufferedApprovals } from "../hitl-broker.js";
import { approvalEventToApi } from "./hitl-routes-common.js";
export function registerHitlWatchApprovalsRoute(app) {
    app.get("/api/hitl/approvals/watch", async (c) => {
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
        let approvalStream;
        let unsubscribe = null;
        const stream = new ReadableStream({
            start(controller) {
                controller.enqueue(encoder.encode("event: ready\ndata: {}\n\n"));
                if (!sessionId) {
                    unsubscribe = subscribeBufferedApprovals((event) => {
                        controller.enqueue(encoder.encode(`event: approval\ndata: ${JSON.stringify(approvalEventToApi(event))}\n\n`));
                    });
                    return;
                }
                approvalStream = clients.contextWall.watchApprovalQueue({ sessionId });
                approvalStream.on("data", (event) => {
                    controller.enqueue(encoder.encode(`event: approval\ndata: ${JSON.stringify(approvalEventToApi(event))}\n\n`));
                });
                approvalStream.on("error", (err) => {
                    controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: String(err?.message || "watch failed") })}\n\n`));
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
                }
                else if (approvalStream && typeof approvalStream.destroy === "function") {
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
}
//# sourceMappingURL=hitl-routes-watch.js.map