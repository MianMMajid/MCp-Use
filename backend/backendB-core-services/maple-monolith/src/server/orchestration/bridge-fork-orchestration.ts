import type { Trace, TraceStep } from "../../core/types.js";

interface TraceStoreLike {
  upsertTrace: (trace: Trace, ownerKeyFingerprint?: string) => Trace;
}

interface AuditSummary {
  overallRiskScore: number;
  severity: string;
}

export interface ResolvedBridgeTarget {
  bridgeUrl: string;
  token: string;
  overrideLocked: boolean;
  overrideRejected: boolean;
}

interface CreateBridgeForkOrchestrationDeps {
  asString: (value: unknown) => string | undefined;
  auditAndPersist: (trace: Trace) => AuditSummary;
  bridgeOverrideLockEnabled: boolean;
  configuredBridgeToken: string;
  configuredBridgeUrl: string;
  startObservation: (options: {
    sessionId: string;
    source: "openclaw";
    bridgeUrl: string;
    token?: string;
  }) => Promise<Trace>;
  traceStore: TraceStoreLike;
}

function asStepActor(value: unknown): TraceStep["actor"] {
  if (value === "agent" || value === "tool" || value === "system" || value === "user") {
    return value;
  }
  return "agent";
}

function asStepType(value: unknown): TraceStep["type"] {
  if (
    value === "prompt" ||
    value === "tool_call" ||
    value === "shell" ||
    value === "browser" ||
    value === "network" ||
    value === "email" ||
    value === "system"
  ) {
    return value;
  }
  return "prompt";
}

function asTraceToolCall(
  asString: (value: unknown) => string | undefined,
  value: unknown
): TraceStep["toolCall"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const raw = value as Record<string, unknown>;
  const name = asString(raw.name);
  if (!name) {
    return undefined;
  }

  return {
    name,
    input:
      raw.input && typeof raw.input === "object" && !Array.isArray(raw.input)
        ? (raw.input as Record<string, unknown>)
        : undefined,
    output: raw.output,
  };
}

function sanitizeSessionId(value: string): string {
  const normalized = value
    .replace(/[^a-zA-Z0-9._:-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 96);
  return normalized.length > 0 ? normalized : `fork-${Date.now().toString(36)}`;
}

function stepToBridgeEvent(step: TraceStep): Record<string, unknown> {
  return {
    eventId: `${step.index}-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`,
    timestamp: step.timestamp,
    actor: step.actor,
    type: step.type,
    prompt: step.prompt,
    output: step.output,
    command: step.command,
    toolName: step.toolCall?.name,
    toolInput: step.toolCall?.input,
    toolOutput: step.toolCall?.output,
    url: step.externalUrl,
  };
}

async function writeEventsToBridgeSession(
  sessionId: string,
  events: Record<string, unknown>[],
  bridgeUrl: string,
  token?: string
): Promise<void> {
  const target = new URL(`/sessions/${encodeURIComponent(sessionId)}/events`, bridgeUrl);
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const resetResponse = await fetch(target, {
    method: "POST",
    headers,
    body: JSON.stringify({ reset: true }),
  });
  if (!resetResponse.ok) {
    throw new Error(`Bridge reset failed (${resetResponse.status}).`);
  }

  const appendResponse = await fetch(target, {
    method: "POST",
    headers,
    body: JSON.stringify({ events }),
  });
  if (!appendResponse.ok) {
    throw new Error(`Bridge append failed (${appendResponse.status}).`);
  }
}

export function createBridgeForkOrchestration(
  deps: CreateBridgeForkOrchestrationDeps
): {
  resolveBridgeTarget: (
    body: Record<string, unknown>,
    options?: { defaultBridgeUrl?: string; defaultToken?: string }
  ) => ResolvedBridgeTarget;
  bridgeOverrideDeniedBody: () => {
    error: string;
    reason: string;
    hint: string;
  };
  buildCandidateStep: (
    body: Record<string, unknown>,
    index: number,
    defaults?: { actor: TraceStep["actor"]; type: TraceStep["type"] }
  ) => TraceStep;
  launchIsolatedForkSession: (options: {
    forkedTrace: Trace;
    parentTrace: Trace;
    body: Record<string, unknown>;
  }) => Promise<{
    sessionId: string;
    traceId: string;
    source: Trace["source"];
    overallRiskScore: number;
    severity: string;
  }>;
} {
  const bridgeOverrideDeniedBody = () => {
    return {
      error: "Bridge override denied",
      reason:
        "Per-request bridgeUrl/token overrides are disabled by policy. Use configured OPENCLAW_BRIDGE_URL and OPENCLAW_BRIDGE_TOKEN when running source=openclaw.",
      hint: "Unset request bridgeUrl/token, use source=auto/mock, or set MAPLE_ALLOW_BRIDGE_OVERRIDE=true in non-production.",
    };
  };

  const resolveBridgeTarget = (
    body: Record<string, unknown>,
    options: { defaultBridgeUrl?: string; defaultToken?: string } = {}
  ): ResolvedBridgeTarget => {
    const requestedBridgeUrl = deps.asString(body.bridgeUrl);
    const requestedToken = deps.asString(body.token);

    if (deps.bridgeOverrideLockEnabled) {
      const overrideRejected =
        (requestedBridgeUrl !== undefined &&
          requestedBridgeUrl !== deps.configuredBridgeUrl) ||
        (requestedToken !== undefined && requestedToken !== deps.configuredBridgeToken);
      return {
        bridgeUrl: deps.configuredBridgeUrl,
        token: deps.configuredBridgeToken,
        overrideLocked: true,
        overrideRejected,
      };
    }

    return {
      bridgeUrl:
        requestedBridgeUrl ?? options.defaultBridgeUrl ?? deps.configuredBridgeUrl,
      token: requestedToken ?? options.defaultToken ?? deps.configuredBridgeToken,
      overrideLocked: false,
      overrideRejected: false,
    };
  };

  const buildCandidateStep = (
    body: Record<string, unknown>,
    index: number,
    defaults: { actor: TraceStep["actor"]; type: TraceStep["type"] } = {
      actor: "agent",
      type: "prompt",
    }
  ): TraceStep => {
    const toolCall = asTraceToolCall(deps.asString, body.toolCall);
    const command = deps.asString(body.command);
    const externalUrl =
      deps.asString(body.externalUrl) ??
      deps.asString(body.url) ??
      deps.asString(body.externalURL) ??
      deps.asString(body.endpoint);
    const explicitType = deps.asString(body.type);
    const inferredType: TraceStep["type"] = command
      ? "shell"
      : externalUrl
        ? "network"
        : toolCall
          ? "tool_call"
          : defaults.type;

    return {
      index,
      timestamp: new Date().toISOString(),
      actor: asStepActor(body.actor ?? defaults.actor),
      type: explicitType ? asStepType(explicitType) : inferredType,
      prompt: deps.asString(body.prompt),
      toolCall,
      output: deps.asString(body.output),
      command,
      externalUrl,
      metadata:
        body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
          ? (body.metadata as Record<string, unknown>)
          : undefined,
      riskScore: 0,
      riskFlags: [],
      guardStatus: "pending",
    };
  };

  const launchIsolatedForkSession = async (options: {
    forkedTrace: Trace;
    parentTrace: Trace;
    body: Record<string, unknown>;
  }) => {
    const { forkedTrace, parentTrace, body } = options;
    const requestedForkSessionId = deps.asString(body.forkSessionId);
    const generatedForkSessionId = `${parentTrace.sessionId}-fork-${Date.now().toString(36)}`;
    const forkSessionId = sanitizeSessionId(
      requestedForkSessionId ?? generatedForkSessionId
    );
    const bridgeTarget = resolveBridgeTarget(body);
    if (bridgeTarget.overrideRejected) {
      throw new Error(bridgeOverrideDeniedBody().reason);
    }
    const { bridgeUrl, token } = bridgeTarget;
    const events = forkedTrace.steps.map((step) => stepToBridgeEvent(step));

    await writeEventsToBridgeSession(forkSessionId, events, bridgeUrl, token);

    const runtimeTrace = await deps.startObservation({
      sessionId: forkSessionId,
      source: "openclaw",
      bridgeUrl,
      token,
    });

    runtimeTrace.metadata = {
      ...(runtimeTrace.metadata ?? {}),
      mode: "openclaw-fork-runtime",
      parentTraceId: parentTrace.id,
      parentSessionId: parentTrace.sessionId,
      forkedTraceId: forkedTrace.id,
    };
    runtimeTrace.ownerKeyFingerprint = parentTrace.ownerKeyFingerprint;
    deps.traceStore.upsertTrace(runtimeTrace, parentTrace.ownerKeyFingerprint);
    const runtimeReport = deps.auditAndPersist(runtimeTrace);

    return {
      sessionId: forkSessionId,
      traceId: runtimeTrace.id,
      source: runtimeTrace.source,
      overallRiskScore: runtimeReport.overallRiskScore,
      severity: runtimeReport.severity,
    };
  };

  return {
    bridgeOverrideDeniedBody,
    buildCandidateStep,
    launchIsolatedForkSession,
    resolveBridgeTarget,
  };
}
