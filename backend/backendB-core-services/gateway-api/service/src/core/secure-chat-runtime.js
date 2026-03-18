/**
 * Secure Chat Runtime
 *
 * Combines context-wall policy evaluation with native agent execution.
 * Architecture: INPUT POLICY → LLM EXECUTION → OUTPUT POLICY → AUDIT
 *
 * Context-wall handles: firewall rules, PII detection, risk scoring
 * Native runtime handles: LLM calls, MCP tools, conversation memory
 */

import { randomUUID } from "node:crypto";
import { asString } from "../helpers.js";
import { mapleLog } from "../logging.js";
import { getGrpcClients } from "../state.js";
import { grpcUnaryProtected } from "../grpc-clients.js";
import { authContextStorage } from "../auth.js";
import { requestContextStorage } from "../logging.js";
import { emitAuditEvent } from "../audit-emitter.js";
import { runNativeAgentTurn } from "./native-agent-runtime.js";

// ── Context-wall policy evaluation ──────────────────

function isContextWallAvailable() {
  return Boolean(getGrpcClients()?.contextWall);
}

function buildGrpcContext(options = {}) {
  const authContext = authContextStorage.getStore();
  const requestLog = requestContextStorage.getStore();
  return {
    requestId: options.requestId || requestLog?.requestId || randomUUID().slice(0, 12),
    sessionId: options.sessionId || requestLog?.sessionId || "",
    traceId: options.traceId || requestLog?.traceId || "",
    userId: options.userId || authContext?.userId || "anonymous",
    keyFingerprint: authContext?.keyFingerprint || "",
    sourceService: "gateway-api",
    tenantId: options.tenantId || requestLog?.tenantId || "default",
    deviceId: options.deviceId || requestLog?.deviceId || "web",
  };
}

/**
 * Evaluate a message through context-wall firewall rules.
 * Returns { allowed, blockedReason, redactedContent, decision }
 */
async function evaluateMessagePolicy(message, direction, options = {}) {
  if (!isContextWallAvailable()) {
    // No context-wall → allow by default (log warning)
    mapleLog("warn", "secure_chat.policy_unavailable", { direction, fallback: "allow" });
    return { allowed: true, content: message, redacted: [] };
  }

  const clients = getGrpcClients();
  const grpcContext = buildGrpcContext(options);

  if (direction === "input") {
    try {
      const response = await grpcUnaryProtected(clients.contextWall, "sanitizePrompt", {
        prompt: message,
        context: grpcContext,
      }, { deadlineMs: 10_000 });
      if (response?.blocked === true) {
        return {
          allowed: false,
          content: message,
          redacted: response?.redactedPatterns || [],
          blockedReason: response?.blockedReason || "Message blocked by firewall policy.",
          rule: "context-leakage",
        };
      }
      return {
        allowed: true,
        content: response?.sanitizedPrompt || message,
        redacted: response?.redactedPatterns || [],
        decision: response?.modified ? "sanitized" : "allow",
      };
    } catch (err) {
      mapleLog("warn", "secure_chat.prompt_sanitize_failed", {
        error: err.message,
        fallback: "evaluate_step",
      });
    }
  }

  const step = {
    index: 0,
    timestamp: new Date().toISOString(),
    actor: "STEP_ACTOR_AGENT",
    type: "STEP_TYPE_CHAT",
    prompt: direction === "input" ? message : "",
    output: direction === "output" ? message : "",
    command: "",
  };

  try {
    const response = await grpcUnaryProtected(clients.contextWall, "evaluateStep", {
      step,
      context: grpcContext,
    }, { deadlineMs: 10_000 });

    const decision = response?.decision;
    const action = String(decision?.action || "").replace("FIREWALL_ACTION_", "").toLowerCase();

    if (action === "deny" || action === "block") {
      return {
        allowed: false,
        content: message,
        redacted: [],
        blockedReason: decision?.message || "Message blocked by firewall policy.",
        rule: decision?.rule || null,
      };
    }

    return {
      allowed: true,
      content: message,
      redacted: decision?.redactedPatterns || [],
      decision: action,
    };
  } catch (err) {
    mapleLog("warn", "secure_chat.policy_eval_failed", {
      direction,
      error: err.message,
      fallback: "allow",
    });
    // Fail open for availability — log the failure, allow the message
    return { allowed: true, content: message, redacted: [], policyError: err.message };
  }
}

// ── Secure chat orchestrator ────────────────────────

/**
 * Run a secure chat turn: policy-gated input → LLM execution → policy-gated output.
 *
 * @param {object} options
 * @param {string} options.message - User message
 * @param {string} [options.sessionId] - Session for conversation continuity
 * @param {string} [options.agentId] - Agent ID (for agent-specific chat)
 * @param {object} [options.agent] - Agent record (if already loaded)
 * @param {object} [options.requestContext] - Request context for policy evaluation
 * @returns {{ reply, mode, provider, model, blocked, policyChecks }}
 */
export async function runSecureChatTurn(options = {}) {
  const message = asString(options.message);
  if (!message) throw new Error("Missing chat message.");

  const sessionId = options.sessionId || `chat-${randomUUID().slice(0, 8)}`;
  const turnId = randomUUID().slice(0, 12);
  const policyChecks = [];

  mapleLog("info", "secure_chat.turn_begin", { turnId, sessionId, hasAgent: !!options.agentId });

  // ── Step 1: INPUT POLICY ──────────────────────────
  const inputPolicy = await evaluateMessagePolicy(message, "input", {
    sessionId,
    ...options.requestContext,
  });
  policyChecks.push({ phase: "input", ...inputPolicy });

  if (!inputPolicy.allowed) {
    mapleLog("info", "secure_chat.input_blocked", {
      turnId,
      reason: inputPolicy.blockedReason,
      rule: inputPolicy.rule,
    });

    emitAuditEvent({
      eventType: "AUDIT_EVENT_TYPE_CHAT_BLOCKED",
      sourceService: "gateway-api",
      summary: `Chat input blocked: ${inputPolicy.blockedReason}`,
      payload: {
        turnId,
        sessionId,
        direction: "input",
        rule: inputPolicy.rule,
      },
    });

    return {
      reply: inputPolicy.blockedReason,
      mode: "blocked",
      provider: null,
      model: null,
      blocked: true,
      policyChecks,
    };
  }

  // ── Step 2: LLM EXECUTION (native runtime) ───────
  const agent = options.agent || null;
  const equippedToolIds = agent?.config?.toolbelt?.equippedToolIds || agent?.capabilities || [];

  let llmResult;
  try {
    llmResult = await runNativeAgentTurn({
      message,
      sessionId,
      agentId: options.agentId,
      tools: equippedToolIds,
      agentName: agent?.name || "Maple Assistant",
      agentDescription: agent?.description || "",
      timeoutSeconds: 120,
    });
  } catch (err) {
    mapleLog("error", "secure_chat.execution_failed", { turnId, error: err.message });
    return {
      reply: "Chat is temporarily unavailable. Please try again.",
      mode: "error",
      provider: null,
      model: null,
      blocked: false,
      policyChecks,
    };
  }

  // ── Step 3: OUTPUT POLICY ─────────────────────────
  const reply = llmResult.reply || "";
  const outputPolicy = await evaluateMessagePolicy(reply, "output", {
    sessionId,
    ...options.requestContext,
  });
  policyChecks.push({ phase: "output", ...outputPolicy });

  if (!outputPolicy.allowed) {
    mapleLog("info", "secure_chat.output_blocked", {
      turnId,
      reason: outputPolicy.blockedReason,
    });

    emitAuditEvent({
      eventType: "AUDIT_EVENT_TYPE_CHAT_BLOCKED",
      sourceService: "gateway-api",
      summary: `Chat output blocked: ${outputPolicy.blockedReason}`,
      payload: {
        turnId,
        sessionId,
        direction: "output",
        rule: outputPolicy.rule,
      },
    });

    return {
      reply: "The response was filtered by security policy. Please rephrase your request.",
      mode: "output_blocked",
      provider: llmResult.provider,
      model: llmResult.model,
      blocked: true,
      policyChecks,
    };
  }

  // ── Step 4: AUDIT ─────────────────────────────────
  emitAuditEvent({
    eventType: "AUDIT_EVENT_TYPE_CHAT_COMPLETED",
    sourceService: "gateway-api",
    summary: `Chat turn completed`,
    payload: {
      turnId,
      sessionId,
      agentId: options.agentId || null,
      provider: llmResult.provider,
      model: llmResult.model,
      toolCalls: llmResult.toolCalls?.length || 0,
      inputRedacted: inputPolicy.redacted?.length || 0,
      outputRedacted: outputPolicy.redacted?.length || 0,
    },
  });

  mapleLog("info", "secure_chat.turn_complete", {
    turnId,
    sessionId,
    provider: llmResult.provider,
    model: llmResult.model,
    replyChars: reply.length,
    toolCalls: llmResult.toolCalls?.length || 0,
  });

  return {
    reply,
    mode: "secure",
    provider: llmResult.provider,
    model: llmResult.model,
    blocked: false,
    policyChecks,
    toolCalls: llmResult.toolCalls,
    usage: llmResult.usage,
  };
}
