import { asString, errorMessage, } from "../helpers.js";
import { firewallChatAiEnabled, firewallChatPreferOpenClaw, firewallChatStrictMode, } from "../config.js";
import { mapleLog } from "../logging.js";
import { getGrpcClients } from "../state.js";
import { generateViaGrpc } from "./firewall-grpc.js";
import { answerFirewallChatQuestion, isNetworkActionQuery, } from "./firewall-chat-rules.js";
import { runOpenClawTurn } from "./openclaw-agent-runtime.js";
export function parseChatTurnContent(value) {
    if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : undefined;
    }
    if (Array.isArray(value)) {
        const parts = value
            .map((entry) => {
            if (entry &&
                typeof entry === "object" &&
                entry.type === "text" &&
                typeof entry.text === "string") {
                return String(entry.text).trim();
            }
            return "";
        })
            .filter((item) => item.length > 0);
        if (parts.length > 0) {
            return parts.join("\n");
        }
    }
    return undefined;
}
export function normalizeFirewallChatHistory(rawMessages, fallbackQuestion) {
    const normalized = [];
    if (Array.isArray(rawMessages)) {
        for (const candidate of rawMessages) {
            if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
                continue;
            }
            const roleRaw = asString(candidate.role);
            const role = roleRaw === "assistant" ? "assistant" : roleRaw === "user" ? "user" : null;
            if (!role) {
                continue;
            }
            const content = parseChatTurnContent(candidate.content);
            if (!content) {
                continue;
            }
            normalized.push({ role, content });
        }
    }
    const recent = normalized.slice(-16);
    if (recent.length === 0 || recent[recent.length - 1]?.role !== "user") {
        recent.push({ role: "user", content: fallbackQuestion });
    }
    return recent;
}
export function buildFirewallChatSystemPrompt(context) {
    const contextSnapshot = {
        generatedAt: context.generatedAt,
        trace: context.trace,
        firewall: context.firewall,
        highlights: context.highlights,
        recommendations: context.recommendations,
    };
    return [
        "You are Maple Firewall Assistant for agent traces.",
        "Use only the provided context and chat history. Do not invent events, steps, rules, or tools.",
        "If data is missing in context, explicitly say it is unavailable.",
        "Keep answers concise and operational; reference concrete step indexes and rule labels when present.",
        "When recommending next actions, prioritize Maple-native controls like guard_action, /api/firewall/decision, audit_risk, and ml_anomaly_report.",
        "Context JSON:",
        JSON.stringify(contextSnapshot, null, 2),
    ].join("\n");
}
/**
 * Check whether context-wall orchestration is available via gRPC.
 * Used by /api/chat/capabilities to report AI-path readiness.
 */
export function isContextWallAvailable() {
    const clients = getGrpcClients();
    return Boolean(clients?.contextWall);
}
export async function generateFirewallChatReply(options) {
    const fallbackReply = answerFirewallChatQuestion(options.question, options.context);
    const attempts = [];
    if (isNetworkActionQuery(options.question) &&
        (options.context.activity?.networkActions?.length ?? 0) > 0) {
        return {
            reply: fallbackReply,
            mode: "rules",
            provider: null,
            attempts: [],
        };
    }
    if (firewallChatPreferOpenClaw) {
        try {
            const agentResult = await runOpenClawTurn({
                sessionId: options.requestContext?.sessionId ?? options.context.trace?.sessionId,
                message: options.question,
                thinking: "medium",
                timeoutSeconds: 120,
            });
            const reply = asString(agentResult.reply) ?? "";
            if (!reply && firewallChatStrictMode) {
                attempts.push({ provider: "openclaw", ok: false, reason: "empty_reply" });
            }
            else {
                attempts.push({ provider: "openclaw", ok: true });
                return {
                    reply: reply || fallbackReply,
                    mode: "openclaw-agent",
                    provider: "openclaw",
                    attempts,
                };
            }
        }
        catch (err) {
            attempts.push({ provider: "openclaw", ok: false });
            mapleLog("warn", "firewall.chat.openclaw_failed", {
                error: errorMessage(err),
                traceId: options.context.trace?.id ?? null,
            });
        }
    }
    if (!firewallChatAiEnabled) {
        if (firewallChatStrictMode) {
            return {
                reply: "Chat strict mode is enabled and no AI provider is currently available.",
                mode: "unavailable",
                provider: null,
                attempts,
            };
        }
        return {
            reply: fallbackReply,
            mode: "rules",
            provider: null,
            attempts,
        };
    }
    if (!isContextWallAvailable()) {
        mapleLog("warn", "firewall.chat.unavailable", {
            traceId: options.context.trace?.id ?? null,
            reason: "context-wall unavailable",
        });
        return {
            reply: "Chat orchestration is temporarily unavailable. Context-wall is unreachable.",
            mode: "unavailable",
            provider: null,
            attempts: [...attempts, { provider: "context-wall", ok: false }],
        };
    }
    const history = normalizeFirewallChatHistory(options.messages, options.question);
    // Route all LLM requests through context-wall orchestration via gRPC.
    // Architecture mandates: gateway-api MUST NOT call LLM providers directly.
    try {
        const grpcResult = await generateViaGrpc(history.map((turn) => ({ role: turn.role, content: turn.content })), buildFirewallChatSystemPrompt(options.context), {
            tenantId: options.requestContext?.tenantId ?? "",
            userId: options.requestContext?.userId ?? "",
            deviceId: options.requestContext?.deviceId ?? "",
            sessionId: options.requestContext?.sessionId ?? options.context.trace?.sessionId ?? "",
            traceId: options.requestContext?.traceId ?? options.context.trace?.id ?? "",
        });
        if (grpcResult) {
            return {
                reply: grpcResult.content,
                mode: "ai",
                provider: null,
                attempts: [...attempts, { provider: "context-wall", ok: true }],
            };
        }
    }
    catch (err) {
        mapleLog("warn", "firewall.chat.grpc_failed", { error: errorMessage(err) });
        return {
            reply: "Chat orchestration is temporarily unavailable. Please retry once context services are healthy.",
            mode: "unavailable",
            provider: null,
            attempts: [...attempts, { provider: "context-wall", ok: false }],
        };
    }
    mapleLog("warn", "firewall.chat.unavailable", {
        traceId: options.context.trace?.id ?? null,
        reason: "orchestrate_chat_empty",
    });
    return {
        reply: "Chat orchestration is temporarily unavailable. Please retry shortly.",
        mode: "unavailable",
        provider: null,
        attempts: [...attempts, { provider: "context-wall", ok: false }],
    };
}
//# sourceMappingURL=firewall-chat-ai.js.map
