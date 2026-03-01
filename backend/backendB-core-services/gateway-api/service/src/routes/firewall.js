import { Hono } from "hono";
import { grpcUnary } from "../grpc-clients.js";
import { mapleLog } from "@maple/common";
export function firewallRoutes(clients) {
    const router = new Hono();
    router.get("/api/firewall/state", async (c) => {
        return c.json({ enabled: true, service: "context-wall", status: "operational" });
    });
    router.post("/api/firewall/decision", async (c) => {
        try {
            const body = await c.req.json();
            const response = await grpcUnary(clients.contextWall, "EvaluateStep", {
                step: {
                    index: body.stepIndex ?? 0,
                    timestamp: new Date().toISOString(),
                    actor: "STEP_ACTOR_AGENT",
                    type: "STEP_TYPE_TOOL_CALL",
                    prompt: body.prompt,
                    command: body.command,
                    output: body.output,
                    riskScore: 0,
                    riskFlags: [],
                    guardStatus: "GUARD_ACTION_PENDING",
                },
                context: { requestId: c.get("requestId"), sessionId: body.sessionId },
            });
            return c.json(response);
        }
        catch (err) {
            mapleLog("error", "firewall_decision_failed", { error: err.message });
            return c.json({ error: "Firewall operation failed" }, 500);
        }
    });
    router.post("/api/firewall/chat", async (c) => {
        try {
            const body = await c.req.json();
            const messages = body.messages || [{ role: "CHAT_ROLE_USER", content: body.message || "" }];
            const response = await grpcUnary(clients.modelRouter, "Generate", {
                context: { requestId: c.get("requestId"), sessionId: body.sessionId },
                messages: messages.map((m) => ({
                    role: m.role === "user" ? "CHAT_ROLE_USER" : m.role === "assistant" ? "CHAT_ROLE_ASSISTANT" : m.role === "system" ? "CHAT_ROLE_SYSTEM" : "CHAT_ROLE_USER",
                    content: m.content,
                })),
                systemPrompt: body.systemPrompt || "",
            });
            return c.json(response);
        }
        catch (err) {
            mapleLog("error", "firewall_chat_failed", { error: err.message });
            return c.json({ error: "Firewall operation failed" }, 500);
        }
    });
    return router;
}
//# sourceMappingURL=firewall.js.map