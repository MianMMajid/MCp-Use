import { server, database } from "../state.js";
import { firewallChatPrimaryProvider, firewallChatStrictMode } from "../config.js";
import { requireApiKeyResponse } from "../auth.js";
import { getAuthContext } from "../auth-api-key.js";
import { asString, asBoolean, readJsonBody } from "../helpers.js";
import { buildFirewallChatContext, generateFirewallChatReply, normalizeFirewallChatHistory, } from "../trace-helpers.js";
import { buildFeatureCapabilitiesFromDependencyReport, evaluateGatewayRuntimeDependencies, } from "../core/runtime-dependencies.js";
import { resolveVerifiedTenantScope } from "../core/tenant-claim-resolver.js";
import { runSecureChatTurn } from "../core/secure-chat-runtime.js";
function resolveFirewallRequestContext(options) {
    const authContext = getAuthContext(options.context);
    const requestContext = options.context?.get("mapleRequestContext") ?? {};
    // Use verified scope for tenantId — ignore body.tenantId to prevent spoofing
    const tenantId = options.verifiedTenantId ?? asString(requestContext.tenantId) ?? "default";
    // Use auth context for userId — ignore body.userId to prevent spoofing
    const userId = authContext?.userId ??
        authContext?.keyFingerprint ??
        "anonymous";
    const deviceId = asString(options.body.deviceId) ??
        asString(options.request.header("x-device-id")) ??
        asString(requestContext.deviceId) ??
        asString(options.request.header("user-agent")) ??
        "cli";
    return {
        tenantId,
        userId,
        deviceId,
        sessionId: options.sessionId ?? asString(requestContext.sessionId) ?? options.fallbackSessionId ?? "",
        traceId: options.traceId ?? asString(requestContext.traceId) ?? options.fallbackTraceId ?? "",
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
        const model = asString(body.model) ?? "";
        const reasoningEffort = asString(body.reasoningEffort) ?? "";
        const traceId = asString(body.traceId);
        const sessionId = asString(body.sessionId);
        const includeContext = asBoolean(body.includeContext, false);
        const context = buildFirewallChatContext({ traceId, sessionId });
        const scope = await resolveVerifiedTenantScope({
            tenantId: asString(c.req.header("x-tenant-id")) ?? "",
            orgId: asString(c.req.header("x-org-id")) ?? "",
            tenantClaimSignature: asString(c.req.header("x-maple-tenant-claim")) ?? "",
        });
        const requestContext = resolveFirewallRequestContext({
            body,
            context: c,
            request: c.req,
            verifiedTenantId: scope.verified ? scope.tenantId : "default",
            traceId,
            sessionId,
            fallbackSessionId: context.trace?.sessionId,
            fallbackTraceId: context.trace?.id,
        });
        // Use secure chat runtime: INPUT POLICY → LLM → OUTPUT POLICY → AUDIT
        const secureChatResult = await runSecureChatTurn({
            message,
            sessionId: requestContext.sessionId || context.trace?.sessionId,
            requestContext,
        });

        const blocked = secureChatResult.blocked === true;
        const failed = secureChatResult.mode === "error";
        return c.json({
            ok: !blocked && !failed,
            message,
            reply: secureChatResult.reply,
            mode: secureChatResult.mode,
            provider: secureChatResult.provider,
            model: secureChatResult.model,
            blocked,
            traceId: context.trace?.id ?? null,
            generatedAt: new Date().toISOString(),
            ...(includeContext ? { context } : {}),
        }, blocked ? 403 : failed ? 503 : 200);
    });
    // ── Chat capabilities + streaming bridge ──────────────────────────────────
    server.get("/api/chat/capabilities", async (c) => {
        const report = await evaluateGatewayRuntimeDependencies();
        const capabilities = buildFeatureCapabilitiesFromDependencyReport(report);
        const openclaw = capabilities.features.openclawAgent;
        const chatOrchestration = capabilities.features.chatOrchestration;
        return c.json({
            aiEnabled: Boolean(chatOrchestration.enabled || openclaw.enabled),
            mode: openclaw.enabled
                ? "openclaw-agent"
                : chatOrchestration.enabled
                    ? "context-wall-local-provider"
                    : "unavailable",
            primaryProvider: firewallChatPrimaryProvider,
            strictChatMode: firewallChatStrictMode,
            contextWallAvailable: report.checks.find((check) => check.id === "grpc.context_wall")?.ok === true,
            localProviderRoutingEnabled: chatOrchestration.enabled,
            openclawAgent: openclaw,
            chatOrchestration,
            strictDependencies: report.strict,
        });
    });
    server.app.post("/api/chat/stream", async (c) => {
        const unauthorized = await requireApiKeyResponse(c, database);
        if (unauthorized) {
            return unauthorized;
        }
        const body = await readJsonBody(c);
        const messages = Array.isArray(body.messages) ? body.messages : [];
        const model = asString(body.model) ?? "";
        const reasoningEffort = asString(body.reasoningEffort) ?? "";
        const normalizedHistory = normalizeFirewallChatHistory(messages, "Give me a firewall status update.");
        const userTurns = normalizedHistory.filter((turn) => turn.role === "user");
        const message = asString(userTurns[userTurns.length - 1]?.content) ?? "Give me a firewall status update.";
        const traceId = asString(body.traceId);
        const sessionId = asString(body.sessionId);
        const context = buildFirewallChatContext({ traceId, sessionId });
        const streamScope = await resolveVerifiedTenantScope({
            tenantId: asString(c.req.header("x-tenant-id")) ?? "",
            orgId: asString(c.req.header("x-org-id")) ?? "",
            tenantClaimSignature: asString(c.req.header("x-maple-tenant-claim")) ?? "",
        });
        const requestContext = resolveFirewallRequestContext({
            body,
            context: c,
            request: c.req,
            verifiedTenantId: streamScope.verified ? streamScope.tenantId : "default",
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
            model,
            reasoningEffort,
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
        let closed = false;
        let timer;
        const stream = new ReadableStream({
            start(controller) {
                const words = reply.split(" ");
                let i = 0;
                const chunkSize = 3;
                const safeClose = () => {
                    if (closed) {
                        return;
                    }
                    closed = true;
                    if (timer) {
                        clearTimeout(timer);
                        timer = undefined;
                    }
                    try {
                        controller.close();
                    }
                    catch {
                        // Ignore closed stream errors.
                    }
                };
                const safeEnqueue = (payload) => {
                    if (closed) {
                        return false;
                    }
                    try {
                        controller.enqueue(payload);
                        return true;
                    }
                    catch {
                        closed = true;
                        if (timer) {
                            clearTimeout(timer);
                            timer = undefined;
                        }
                        return false;
                    }
                };
                function pushChunk() {
                    if (closed) {
                        return;
                    }
                    if (i >= words.length) {
                        safeEnqueue(encoder.encode("data: [DONE]\n\n"));
                        safeClose();
                        return;
                    }
                    const chunk = words.slice(i, i + chunkSize).join(" ") + (i + chunkSize < words.length ? " " : "");
                    if (!safeEnqueue(encoder.encode(`data: ${JSON.stringify({ content: chunk })}\n\n`))) {
                        return;
                    }
                    i += chunkSize;
                    timer = setTimeout(pushChunk, 30);
                }
                pushChunk();
            },
            cancel() {
                closed = true;
                if (timer) {
                    clearTimeout(timer);
                    timer = undefined;
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
//# sourceMappingURL=firewall-chat-routes.js.map
