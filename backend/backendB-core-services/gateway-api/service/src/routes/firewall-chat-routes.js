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
        const normalizedHistory = normalizeFirewallChatHistory(messages, "Give me a firewall status update.");
        const userTurns = normalizedHistory.filter((turn) => turn.role === "user");
        const message = asString(userTurns[userTurns.length - 1]?.content) ?? "Give me a firewall status update.";
        const sessionId = asString(body.sessionId) || `global-chat-${(c.req.header("x-session-id") || "default")}`;
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
            sessionId,
        });
        // Stream starts immediately so the proxy's await fetch() resolves on
        // the first byte instead of blocking for the entire LLM call duration.
        // This prevents SvelteKit's single-threaded dev server from freezing.
        const encoder = new TextEncoder();
        let closed = false;
        let timer;
        let heartbeatTimer;
        const stream = new ReadableStream({
            async start(controller) {
                const safeClose = () => {
                    if (closed) return;
                    closed = true;
                    clearTimeout(timer);
                    clearInterval(heartbeatTimer);
                    try { controller.close(); } catch {}
                };
                const safeEnqueue = (payload) => {
                    if (closed) return false;
                    try { controller.enqueue(payload); return true; }
                    catch { closed = true; clearTimeout(timer); clearInterval(heartbeatTimer); return false; }
                };

                // Send an immediate heartbeat so the HTTP response starts flowing
                safeEnqueue(encoder.encode(`data: ${JSON.stringify({ status: "thinking" })}\n\n`));

                // Keep-alive heartbeats every 3s while LLM is processing
                heartbeatTimer = setInterval(() => {
                    safeEnqueue(encoder.encode(`data: ${JSON.stringify({ status: "thinking" })}\n\n`));
                }, 3000);

                // Run the LLM call
                let secureChatResult;
                try {
                    secureChatResult = await runSecureChatTurn({
                        message,
                        sessionId,
                        requestContext,
                        provider: asString(body.provider) || undefined,
                        model: asString(body.model) || undefined,
                    });
                } catch (err) {
                    clearInterval(heartbeatTimer);
                    safeEnqueue(encoder.encode(`data: ${JSON.stringify({ content: "Chat is temporarily unavailable. Please try again." })}\n\n`));
                    safeEnqueue(encoder.encode(`data: [DONE]\n\n`));
                    safeClose();
                    return;
                }
                clearInterval(heartbeatTimer);

                if (secureChatResult.mode === "error" || secureChatResult.blocked) {
                    const errorMsg = secureChatResult.reply || "Request could not be completed.";
                    safeEnqueue(encoder.encode(`data: ${JSON.stringify({ content: errorMsg })}\n\n`));
                    safeEnqueue(encoder.encode(`data: [DONE]\n\n`));
                    safeClose();
                    return;
                }

                // Stream the reply word by word
                const reply = secureChatResult.reply || "";
                const words = reply.split(" ");
                let i = 0;
                const chunkSize = 3;
                function pushChunk() {
                    if (closed) return;
                    if (i >= words.length) {
                        const donePayload = secureChatResult.attachments
                            ? JSON.stringify({ done: true, attachments: secureChatResult.attachments })
                            : "[DONE]";
                        safeEnqueue(encoder.encode(`data: ${donePayload}\n\n`));
                        safeClose();
                        return;
                    }
                    const chunk = words.slice(i, i + chunkSize).join(" ") + (i + chunkSize < words.length ? " " : "");
                    if (!safeEnqueue(encoder.encode(`data: ${JSON.stringify({ content: chunk })}\n\n`))) return;
                    i += chunkSize;
                    timer = setTimeout(pushChunk, 30);
                }
                pushChunk();
            },
            cancel() {
                closed = true;
                clearTimeout(timer);
                clearInterval(heartbeatTimer);
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
