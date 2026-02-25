import type { Hono } from "hono";
import type { Trace, TraceStep } from "../../core/types.js";
import type { FirewallStepDecision } from "../../security/firewall-policy.js";

type FirewallChatAiProvider = "openai" | "anthropic";
type FirewallChatMode = "ai" | "rules";

interface FirewallChatContext {
  trace?: { id?: string | null } | null;
}

interface FirewallChatResult {
  reply: string;
  mode: FirewallChatMode;
  provider: FirewallChatAiProvider | null;
  attempts: Array<{ provider?: FirewallChatAiProvider; ok?: boolean; error?: string }>;
}

interface RequireApiKeyContext {
  req: {
    header: (name: string) => string | undefined;
  };
  json: (body: unknown, status?: number) => Response;
}

interface RegisterFirewallChatRoutesDeps {
  asBoolean: (value: unknown, fallback: boolean) => boolean;
  asString: (value: unknown) => string | undefined;
  auditAndPersist: (
    trace: Trace,
    options?: { useCommunityBaseline?: boolean; threshold?: number }
  ) => { overallRiskScore: number; severity: string };
  bridgeOverrideLockEnabled: boolean;
  buildCandidateStep: (
    value: Record<string, unknown>,
    index: number,
    defaults?: { actor: TraceStep["actor"]; type: TraceStep["type"] }
  ) => TraceStep;
  buildFirewallChatContext: (
    options?: { traceId?: string; sessionId?: string }
  ) => FirewallChatContext;
  createTraceForCurrentOwner: (base: Omit<Trace, "id" | "startedAt" | "updatedAt">) => Trace;
  evaluateFirewallStep: (step: TraceStep) => FirewallStepDecision;
  firewallChatAnthropicModel: string;
  firewallChatOpenAiModel: string;
  firewallChatPrimaryProvider: FirewallChatAiProvider;
  firewallChatProviderOrder: () => FirewallChatAiProvider[];
  generateFirewallChatReply: (options: {
    question: string;
    context: any;
    messages?: unknown;
  }) => Promise<FirewallChatResult>;
  getLatestTraceBySessionForCurrentOwner: (sessionId: string) => Trace | undefined;
  getTraceForCurrentOwner: (traceId: string) => Trace | undefined;
  normalizeFirewallChatHistory: (
    rawMessages: unknown,
    fallbackQuestion: string
  ) => Array<{ role: "system" | "user" | "assistant"; content: string }>;
  readJsonBody: (c: { req: { json: () => Promise<unknown> } }) => Promise<Record<string, unknown>>;
  requireApiKeyResponse: (
    c: RequireApiKeyContext,
    options?: { allowSession?: boolean; requireApiKey?: boolean }
  ) => Response | undefined;
  upsertTraceForCurrentOwner: (trace: Trace) => Trace;
}

export function registerFirewallChatRoutes(
  app: Hono,
  deps: RegisterFirewallChatRoutesDeps
): void {
  const {
    asBoolean,
    asString,
    auditAndPersist,
    bridgeOverrideLockEnabled,
    buildCandidateStep,
    buildFirewallChatContext,
    createTraceForCurrentOwner,
    evaluateFirewallStep,
    firewallChatAnthropicModel,
    firewallChatOpenAiModel,
    firewallChatPrimaryProvider,
    firewallChatProviderOrder,
    generateFirewallChatReply,
    getLatestTraceBySessionForCurrentOwner,
    getTraceForCurrentOwner,
    normalizeFirewallChatHistory,
    readJsonBody,
    requireApiKeyResponse,
    upsertTraceForCurrentOwner,
  } = deps;

  app.get("/api/firewall/state", (c) => {
    const unauthorized = requireApiKeyResponse(c);
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

  app.post("/api/firewall/chat", async (c) => {
    const unauthorized = requireApiKeyResponse(c);
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

  app.get("/api/chat/capabilities", async (c) => {
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

  app.post("/api/chat/stream", async (c) => {
    const unauthorized = requireApiKeyResponse(c);
    if (unauthorized) {
      return unauthorized;
    }

    const body = await readJsonBody(c);
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const normalizedHistory = normalizeFirewallChatHistory(
      messages,
      "Give me a firewall status update."
    );
    const userTurns = normalizedHistory.filter((turn) => turn.role === "user");
    const message =
      asString(userTurns[userTurns.length - 1]?.content) ??
      "Give me a firewall status update.";
    const traceId = asString(body.traceId);
    const sessionId = asString(body.sessionId);
    const context = buildFirewallChatContext({ traceId, sessionId });
    const chatResult = await generateFirewallChatReply({
      question: message,
      context,
      messages: normalizedHistory,
    });
    const reply = chatResult.reply;

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const words = reply.split(" ");
        let i = 0;
        const chunkSize = 3;
        const pushChunk = () => {
          if (i >= words.length) {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
            return;
          }
          const chunk =
            words.slice(i, i + chunkSize).join(" ") +
            (i + chunkSize < words.length ? " " : "");
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: chunk })}\n\n`));
          i += chunkSize;
          setTimeout(pushChunk, 30);
        };
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

  app.post("/api/firewall/decision", async (c) => {
    const unauthorized = requireApiKeyResponse(c);
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
}
