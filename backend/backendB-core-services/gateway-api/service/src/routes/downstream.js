import { Hono } from "hono";
import { grpcUnary } from "../grpc-clients.js";
import { mapleLog } from "@maple/common";
export function downstreamRoutes(clients) {
    const router = new Hono();
    router.get("/api/downstream/apps", async (c) => {
        try {
            const response = await grpcUnary(clients.mcpProxy, "ListDownstreamApps", {
                includeDisabled: c.req.query("includeDisabled") === "true",
            });
            return c.json({ apps: response.apps || [] });
        }
        catch (err) {
            return c.json({ error: err.message }, 500);
        }
    });
    router.get("/api/downstream/tools", async (c) => {
        try {
            const response = await grpcUnary(clients.mcpProxy, "ListTools", {
                appId: c.req.query("appId") || "",
            });
            return c.json({ tools: response.tools || [] });
        }
        catch (err) {
            return c.json({ error: err.message }, 500);
        }
    });
    router.post("/api/downstream/execute", async (c) => {
        try {
            const body = await c.req.json();
            mapleLog("info", "gateway_tool_execute", { appId: body.appId, toolName: body.toolName });
            const response = await grpcUnary(clients.mcpProxy, "ExecuteTool", {
                context: { requestId: c.get("requestId"), sessionId: body.sessionId },
                appId: body.appId,
                toolName: body.toolName,
                argumentsJson: Buffer.from(JSON.stringify(body.arguments || {})),
                sessionId: body.sessionId || "gateway",
                traceId: body.traceId,
            });
            return c.json(response);
        }
        catch (err) {
            return c.json({ error: err.message }, 500);
        }
    });
    return router;
}
//# sourceMappingURL=downstream.js.map