import { server, database } from "../state.js";
import { firewallChatPrimaryProvider } from "../config.js";
import { authContextStorage, requireApiKeyResponse } from "../auth.js";
import { asString, asBoolean, readJsonBody } from "../helpers.js";
import { buildFirewallChatContext, generateFirewallChatReply, normalizeFirewallChatHistory, isContextWallAvailable, } from "../trace-helpers.js";
import { getOpenClawRuntimeStatus } from "../core/openclaw-agent-runtime.js";
function resolveFirewallRequestContext(options) {
    const authContext = authContextStorage.getStore();
    const tenantId = asString(options.body.tenantId) ?? asString(options.request.header("x-tenant-id")) ?? "default";
    const userId = asString(options.body.userId) ??
        authContext?.userId ??
        authContext?.keyFingerprint ??
        "anonymous";
    const deviceId = asString(options.body.deviceId) ??
        asString(options.request.header("x-device-id")) ??
        asString(options.request.header("user-agent")) ??
        "";
    return {
        tenantId,
        userId,
        deviceId,
        sessionId: options.sessionId ?? options.fallbackSessionId ?? "",
        traceId: options.traceId ?? options.fallbackTraceId ?? "",
    };
}
export function registerFirewallChatRoutes() {
    // ── POST /api/firewall/chat ────────────────────────────────────────────────
    server.app.post("/api/firewall/chat", async (c) => {
        const unauthorized = await requireApiKeyResponse(c, database);
        if (unauthorized) {
            return unauthorized;
        }
        const body = await readJsonBody(c);
        const message = asString(body.message) ?? "Give me a firewall status update.";
        const traceId = asString(body.traceId);
        const sessionId = asString(body.sessionId);
        const includeContext = asBoolean(body.includeContext, false);
        const context = buildFirewallChatContext({ traceId, sessionId });
        const requestContext = resolveFirewallRequestContext({
            body,
            request: c.req,
            traceId,
            sessionId,
            fallbackSessionId: context.trace?.sessionId,
            fallbackTraceId: context.trace?.id,
        });
        const chatResult = await generateFirewallChatReply({
            question: message,
            context,
            messages: [{ role: "user", content: message }],
            requestContext,
        });
        const orchestrationUnavailable = chatResult.mode === "unavailable";
        return c.json({
            ok: !orchestrationUnavailable,
            message,
            reply: chatResult.reply,
            mode: chatResult.mode,
            provider: chatResult.provider,
            attempts: chatResult.attempts,
            traceId: context.trace?.id ?? null,
            generatedAt: new Date().toISOString(),
            ...(includeContext ? { context } : {}),
        }, orchestrationUnavailable ? 503 : 200);
    });
    // ── Chat capabilities + streaming bridge ──────────────────────────────────
    server.get("/api/chat/capabilities", async (c) => {
        const contextWallReady = isContextWallAvailable();
        const openclaw = getOpenClawRuntimeStatus();
        return c.json({
            aiEnabled: contextWallReady || openclaw.ready,
            mode: openclaw.ready ? "openclaw-agent" : (contextWallReady ? "model-router" : "unavailable"),
            primaryProvider: firewallChatPrimaryProvider,
            contextWallAvailable: contextWallReady,
            modelRouterAvailable: contextWallReady,
            openclawAgent: openclaw,
        });
    });
    server.app.post("/api/chat/stream", async (c) => {
        const unauthorized = await requireApiKeyResponse(c, database);
        if (unauthorized) {
            return unauthorized;
        }
        const body = await readJsonBody(c);
        const messages = Array.isArray(body.messages) ? body.messages : [];
        const normalizedHistory = normalizeFirewallChatHistory(messages, "Give me a firewall status update.");
        const userTurns = normalizedHistory.filter((turn) => turn.role === "user");
        const message = asString(userTurns[userTurns.length - 1]?.content) ?? "Give me a firewall status update.";
        const traceId = asString(body.traceId);
        const sessionId = asString(body.sessionId);
        const context = buildFirewallChatContext({ traceId, sessionId });
        const requestContext = resolveFirewallRequestContext({
            body,
            request: c.req,
            traceId,
            sessionId,
            fallbackSessionId: context.trace?.sessionId,
            fallbackTraceId: context.trace?.id,
        });
        const chatResult = await generateFirewallChatReply({
            question: message,
            context,
            messages: normalizedHistory,
            requestContext,
        });
        if (chatResult.mode === "unavailable") {
            return c.json({
                ok: false,
                error: chatResult.reply,
                mode: chatResult.mode,
                provider: chatResult.provider,
                attempts: chatResult.attempts,
            }, 503);
        }
        const reply = chatResult.reply;
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            start(controller) {
                const words = reply.split(" ");
                let i = 0;
                const chunkSize = 3;
                function pushChunk() {
                    if (i >= words.length) {
                        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                        controller.close();
                        return;
                    }
                    const chunk = words.slice(i, i + chunkSize).join(" ") + (i + chunkSize < words.length ? " " : "");
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: chunk })}\n\n`));
                    i += chunkSize;
                    setTimeout(pushChunk, 30);
                }
                pushChunk();
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
//# sourceMappingURL=firewall-chat-routes.js.map
