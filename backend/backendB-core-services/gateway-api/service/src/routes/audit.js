import { Hono } from "hono";
import { grpcUnary } from "../grpc-clients.js";
export function auditRoutes(clients) {
    const router = new Hono();
    router.get("/api/audit/events", async (c) => {
        try {
            const response = await grpcUnary(clients.auditWriter, "QueryEvents", {
                traceId: c.req.query("traceId") || "",
                sessionId: c.req.query("sessionId") || "",
                sourceService: c.req.query("sourceService") || "",
                limit: Number(c.req.query("limit") || 50),
                cursor: c.req.query("cursor") || "",
            });
            return c.json(response);
        }
        catch (err) {
            return c.json({ error: err.message }, 500);
        }
    });
    return router;
}
//# sourceMappingURL=audit.js.map