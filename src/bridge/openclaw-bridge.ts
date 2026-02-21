import { randomUUID } from "node:crypto";
import type {
  OpenClawRawEvent,
  ObserveSessionOptions,
  StepActor,
  StepType,
  Trace,
  TraceStep,
} from "../core/types.js";

const DEFAULT_BRIDGE_TIMEOUT_MS = 4500;
const HARDCODED_BRIDGE_URL = "http://127.0.0.1:8787";

function inferActor(value: unknown): StepActor {
  if (value === "tool" || value === "system" || value === "user") {
    return value;
  }
  return "agent";
}

function inferType(value: unknown): StepType {
  const normalized = String(value ?? "prompt").toLowerCase();
  if (
    normalized === "tool_call" ||
    normalized === "shell" ||
    normalized === "browser" ||
    normalized === "network" ||
    normalized === "email" ||
    normalized === "system"
  ) {
    return normalized;
  }

  return "prompt";
}

function toTraceStep(event: OpenClawRawEvent, index: number): TraceStep {
  const actor = inferActor(event.actor);
  const type = inferType(event.type ?? event.actionType);

  const toolName =
    typeof event.toolName === "string"
      ? event.toolName
      : typeof event.tool === "string"
        ? event.tool
        : undefined;

  const prompt =
    typeof event.prompt === "string"
      ? event.prompt
      : typeof event.input === "string"
        ? event.input
        : typeof event.message === "string"
          ? event.message
          : undefined;

  const output =
    typeof event.output === "string"
      ? event.output
      : typeof event.result === "string"
        ? event.result
        : typeof event.response === "string"
          ? event.response
          : undefined;

  const command =
    typeof event.command === "string"
      ? event.command
      : typeof event.shellCommand === "string"
        ? event.shellCommand
        : undefined;

  const externalUrl =
    typeof event.url === "string"
      ? event.url
      : typeof event.externalUrl === "string"
        ? event.externalUrl
        : undefined;

  return {
    index,
    timestamp:
      typeof event.timestamp === "string"
        ? event.timestamp
        : new Date().toISOString(),
    actor,
    type,
    prompt,
    output,
    command,
    externalUrl,
    toolCall: toolName
      ? {
          name: toolName,
          input:
            event.toolInput && typeof event.toolInput === "object"
              ? (event.toolInput as Record<string, unknown>)
              : undefined,
          output: event.toolOutput,
        }
      : undefined,
    metadata: {
      eventId:
        typeof event.eventId === "string"
          ? event.eventId
          : typeof event.id === "string"
            ? event.id
            : undefined,
      rawType: event.type,
    },
    riskScore: 0,
    riskFlags: [],
    guardStatus: "pending",
  };
}

function normalizeEventPayload(payload: unknown): OpenClawRawEvent[] {
  if (Array.isArray(payload)) {
    return payload.filter((item): item is OpenClawRawEvent => !!item && typeof item === "object");
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const maybeEvents = (payload as { events?: unknown }).events;
  if (Array.isArray(maybeEvents)) {
    return maybeEvents.filter((item): item is OpenClawRawEvent => !!item && typeof item === "object");
  }

  return [];
}

async function fetchEventsFromBridge(
  sessionId: string,
  bridgeUrl: string,
  token?: string
): Promise<OpenClawRawEvent[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_BRIDGE_TIMEOUT_MS);

  try {
    const url = new URL(`/sessions/${encodeURIComponent(sessionId)}/events`, bridgeUrl);
    const response = await fetch(url, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Bridge request failed with status ${response.status}`);
    }

    const payload = (await response.json()) as unknown;
    return normalizeEventPayload(payload);
  } finally {
    clearTimeout(timeout);
  }
}

function createTraceBase(
  sessionId: string,
  source: Trace["source"],
  steps: TraceStep[],
  metadata?: Record<string, unknown>
): Trace {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    sessionId,
    source,
    status: "active",
    startedAt: now,
    updatedAt: now,
    metadata,
    steps,
  };
}

export async function startObservation(options: ObserveSessionOptions): Promise<Trace> {
  // Push mode: source=openclaw creates a push-ready empty trace without fetching from bridge.
  // Events arrive via POST /api/openclaw/events instead of being pulled from the bridge.
  if (options.source === "openclaw") {
    return createTraceBase(options.sessionId, "openclaw", [], {
      mode: "openclaw-push",
      ingestMode: "push",
      note: "Push-ready trace. Events arrive via POST /api/openclaw/events.",
    });
  }

  // Pull mode (default): fetch events from the OpenClaw bridge
  const bridgeUrl = options.bridgeUrl ?? process.env.OPENCLAW_BRIDGE_URL ?? HARDCODED_BRIDGE_URL;
  const token = options.token ?? process.env.OPENCLAW_BRIDGE_TOKEN;

  if (!bridgeUrl) {
    throw new Error(
      "OPENCLAW_BRIDGE_URL is not configured. Set it in .env or pass bridgeUrl."
    );
  }

  const events = await fetchEventsFromBridge(options.sessionId, bridgeUrl, token);
  if (events.length === 0) {
    return createTraceBase(options.sessionId, "openclaw", [], {
      mode: "openclaw",
      bridgeUrl,
      fetchedEventCount: 0,
      note: "Bridge returned no events yet for this session.",
    });
  }

  const steps = events.map((event, index) => toTraceStep(event, index));
  return createTraceBase(options.sessionId, "openclaw", steps, {
    mode: "openclaw",
    bridgeUrl,
    fetchedEventCount: steps.length,
  });
}

export function stepFromBridgeEvent(event: OpenClawRawEvent, index: number): TraceStep {
  return toTraceStep(event, index);
}
