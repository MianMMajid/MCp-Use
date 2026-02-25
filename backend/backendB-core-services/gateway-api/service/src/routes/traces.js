import { Hono } from "hono";
import { grpcUnary } from "../grpc-clients.js";
export function traceRoutes(clients) {
    const router = new Hono();
    router.get("/api/traces", async (c) => {
        try {
            const response = await grpcUnary(clients.auditWriter, "QueryEvents", {
                eventTypes: ["AUDIT_EVENT_TYPE_TRACE_CREATED", "AUDIT_EVENT_TYPE_TRACE_UPDATED"],
                limit: Number(c.req.query("limit") || 20),
            });
            return c.json({ traces: response.events || [], total: response.totalCount || 0 });
        }
        catch (err) {
            return c.json({ error: err.message }, 500);
        }
    });
    router.get("/api/traces/:traceId", async (c) => {
        try {
            const traceId = c.req.param("traceId");
            const response = await grpcUnary(clients.auditWriter, "QueryEvents", {
                traceId,
                limit: 100,
            });
            return c.json({ traceId, events: response.events || [] });
        }
        catch (err) {
            return c.json({ error: err.message }, 500);
        }
    });
    return router;
}
//# sourceMappingURL=traces.js.map