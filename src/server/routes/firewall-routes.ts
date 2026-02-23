import { server, database, buildRuntimeStatus } from "../state.js";
import {
  firewallChatPrimaryProvider,
  firewallChatOpenAiModel,
  firewallChatAnthropicModel,
  bridgeOverrideLockEnabled,
} from "../config.js";
import { requireApiKeyResponse } from "../auth.js";
import { asString, asBoolean, asNumber, readJsonBody } from "../helpers.js";
import {
  buildFirewallChatContext,
  generateFirewallChatReply,
  normalizeFirewallChatHistory,
  firewallChatProviderOrder,
  getTraceForCurrentOwner,
  getLatestTraceBySessionForCurrentOwner,
  createTraceForCurrentOwner,
  upsertTraceForCurrentOwner,
  auditAndPersist,
  buildYcMetrics,
  buildCandidateStep,
} from "../trace-helpers.js";
import { buildYcAppBrief, type YcBriefFocus } from "../../strategy/yc-narrative.js";
import { evaluateFirewallStep } from "../../security/firewall-policy.js";
import type { TraceStep } from "../../core/types.js";

// ── GET /api/yc/brief ────────────────────────────────────────────────────────

server.get("/api/yc/brief", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) {
    return unauthorized;
  }

  const rawFocus = c.req.query("focus");
  const focus: YcBriefFocus =
    rawFocus === "moat" || rawFocus === "traction" || rawFocus === "revenue" ? rawFocus : "full";

  const metrics = buildYcMetrics();
  return c.json({
    generatedAt: new Date().toISOString(),
    metrics,
    brief: buildYcAppBrief(metrics, focus),
  });
});

// ── GET /api/runtime/status ──────────────────────────────────────────────────

server.get("/api/runtime/status", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) {
    return unauthorized;
  }

  return c.json({
    ok: true,
    status: buildRuntimeStatus(),
  });
});

// ── GET /api/firewall/state ──────────────────────────────────────────────────

server.get("/api/firewall/state", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) {
    return unauthorized;
  }

  const traceId = asString(c.req.query("traceId"));
  const sessionId = asString(c.req.query("sessionId"));
  const context = buildFirewallChatContext({ traceId, sessionId });
  return c.json({
    ok: true,
    traceFound: Boolean(context.trace),
    context,
  });
});

// ── POST /api/firewall/chat ──────────────────────────────────────────────────

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
  const chatResult = await generateFirewallChatReply({
    question: message,
    context,
    messages: [{ role: "user", content: message }],
  });

  return c.json({
    ok: true,
    message,
    reply: chatResult.reply,
    mode: chatResult.mode,
    provider: chatResult.provider,
    attempts: chatResult.attempts,
    traceId: context.trace?.id ?? null,
    generatedAt: new Date().toISOString(),
    ...(includeContext ? { context } : {}),
  });
});

// ── Chat capabilities + streaming bridge ──

server.get("/api/chat/capabilities", async (c) => {
  const providers = firewallChatProviderOrder();
  return c.json({
    aiEnabled: providers.length > 0,
    mode: providers.length > 0 ? "ai-fallback" : "rules",
    primaryProvider: firewallChatPrimaryProvider,
    providers,
    models: {
      openai: providers.includes("openai") ? firewallChatOpenAiModel : null,
      anthropic: providers.includes("anthropic") ? firewallChatAnthropicModel : null,
    },
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
  const chatResult = await generateFirewallChatReply({
    question: message,
    context,
    messages: normalizedHistory,
  });
  const reply = chatResult.reply;

  // Stream the reply as SSE chunks to match frontend expectations
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      // Send reply in chunks to simulate streaming
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

// ── POST /api/firewall/decision ──────────────────────────────────────────────

server.app.post("/api/firewall/decision", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) {
    return unauthorized;
  }

  const body = await readJsonBody(c);
  const enforce = asBoolean(body.enforce, true);
  const traceId = asString(body.traceId);
  const sessionId = asString(body.sessionId);

  let trace = traceId ? getTraceForCurrentOwner(traceId) : undefined;
  if (traceId && !trace) {
    return c.json({ error: "Trace not found." }, 404);
  }

  if (!trace && sessionId) {
    trace = getLatestTraceBySessionForCurrentOwner(sessionId);
  }

  const candidateIndex = trace ? trace.steps.length : 0;
  const candidateStep = buildCandidateStep(body, candidateIndex, {
    actor: "agent",
    type: "tool_call",
  });
  const decision = evaluateFirewallStep(candidateStep);

  if (!enforce) {
    return c.json({
      ok: true,
      action: "firewall_decision",
      mode: "preview",
      decision: decision.action,
      executeAllowed: !decision.shouldBlock,
      shouldBlock: decision.shouldBlock,
      severity: decision.severity,
      rule: decision.rule,
      message: decision.message,
      recommendation: decision.recommendation,
      redactedPatterns: decision.redactedPatterns,
      evaluatedAt: decision.evaluatedAt,
      bridgeLocked: bridgeOverrideLockEnabled,
      step: decision.step,
    });
  }

  if (!trace) {
    const requestedSource = asString(body.source);
    const source =
      requestedSource === "openclaw" || requestedSource === "manual"
        ? requestedSource
        : "manual";
    trace = createTraceForCurrentOwner({
      sessionId: sessionId ?? `preflight-${Date.now()}`,
      source,
      status: "active",
      metadata: {
        mode: "pre-execution-gate",
      },
      steps: [],
    });
  }

  const guardedStep: TraceStep = {
    ...decision.step,
    index: trace.steps.length,
    timestamp: new Date().toISOString(),
    guardStatus: decision.shouldBlock ? "block" : "allow",
    metadata: {
      ...(decision.step.metadata ?? {}),
      preExecutionGate: true,
      executeAllowed: !decision.shouldBlock,
      gateDecisionAt: decision.evaluatedAt,
    },
  };

  trace.steps.push(guardedStep);
  if (decision.shouldBlock) {
    trace.status = "quarantined";
  }
  trace.metadata = {
    ...(trace.metadata ?? {}),
    lastPreExecutionDecision: {
      action: decision.action,
      rule: decision.rule,
      severity: decision.severity,
      shouldBlock: decision.shouldBlock,
      evaluatedAt: decision.evaluatedAt,
    },
  };
  upsertTraceForCurrentOwner(trace);
  const report = auditAndPersist(trace);

  return c.json({
    ok: true,
    action: "firewall_decision",
    mode: "enforce",
    traceId: trace.id,
    sessionId: trace.sessionId,
    stepIndex: guardedStep.index,
    decision: decision.action,
    executeAllowed: !decision.shouldBlock,
    shouldBlock: decision.shouldBlock,
    severity: decision.severity,
    rule: decision.rule,
    message: decision.message,
    recommendation: decision.recommendation,
    redactedPatterns: decision.redactedPatterns,
    evaluatedAt: decision.evaluatedAt,
    status: trace.status,
    overallRiskScore: report.overallRiskScore,
    riskSeverity: report.severity,
    bridgeLocked: bridgeOverrideLockEnabled,
  });
});
