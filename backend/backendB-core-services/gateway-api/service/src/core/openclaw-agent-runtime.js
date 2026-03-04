import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import net from "node:net";
import { promisify } from "node:util";
import {
  openclawAgentAutoStartGateway,
  openclawAgentDefaultSessionId,
  openclawAgentDefaultThinking,
  openclawAgentDefaultTimeoutSeconds,
  openclawAgentDevProfile,
  openclawAgentEnabled,
  openclawAgentGatewayBind,
  openclawAgentGatewayPort,
  openclawAgentMode,
  openclawAgentRequired,
} from "../config.js";
import { asString } from "../helpers.js";
import { mapleLog } from "../logging.js";

const execFileAsync = promisify(execFile);

const runtimeState = {
  enabled: openclawAgentEnabled,
  mode: openclawAgentMode,
  cliAvailable: false,
  bootstrapped: false,
  ready: false,
  gatewayAutoStarted: false,
  lastError: "",
  lastCheckAt: "",
};

let gatewayProcess;
let sessionEventSequence = 0;

const sessionStore = new Map();
const runStore = new Map();
const sessionWatchers = new Map();

function nowIso() {
  return new Date().toISOString();
}

function parseCursorOffset(cursor) {
  const parsed = Number.parseInt(String(cursor ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}

function parseEventCursor(cursor) {
  const parsed = Number.parseInt(String(cursor ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}

function ensureSessionRecord(sessionId) {
  const normalizedSessionId = String(sessionId ?? "").trim();
  if (!normalizedSessionId) {
    throw new Error("sessionId is required.");
  }
  const existing = sessionStore.get(normalizedSessionId);
  if (existing) {
    return existing;
  }
  const created = {
    sessionId: normalizedSessionId,
    status: "idle",
    updatedAt: nowIso(),
    createdAt: nowIso(),
    runIds: [],
    lastRunId: "",
    lastError: "",
    cancelRequested: false,
    events: [],
  };
  sessionStore.set(normalizedSessionId, created);
  return created;
}

function emitSessionEvent(sessionId, eventType, payload = {}) {
  const session = ensureSessionRecord(sessionId);
  const sequence = ++sessionEventSequence;
  const event = {
    id: `evt_${sequence}`,
    sequence,
    cursor: String(sequence),
    sessionId: session.sessionId,
    eventType: String(eventType ?? "event"),
    timestamp: nowIso(),
    payload,
  };
  session.events.push(event);
  if (session.events.length > 500) {
    session.events.splice(0, session.events.length - 500);
  }
  session.updatedAt = event.timestamp;

  const watchers = sessionWatchers.get(session.sessionId);
  if (watchers) {
    for (const callback of watchers) {
      try {
        callback(event);
      } catch {
        // Ignore watcher callback failures.
      }
    }
  }
  return event;
}

function createRunRecord({ type, sessionId, input, parentRunId }) {
  const session = ensureSessionRecord(sessionId);
  const runId = randomUUID();
  const createdAt = nowIso();
  const run = {
    runId,
    type: String(type ?? "turn"),
    sessionId: session.sessionId,
    status: "running",
    createdAt,
    updatedAt: createdAt,
    input,
    output: null,
    error: "",
    artifacts: [],
    parentRunId: parentRunId || null,
    childRunIds: [],
  };
  runStore.set(runId, run);

  if (parentRunId) {
    const parent = runStore.get(parentRunId);
    if (parent) {
      parent.childRunIds.push(runId);
    }
  }

  session.status = "running";
  session.updatedAt = createdAt;
  session.lastRunId = runId;
  session.lastError = "";
  session.cancelRequested = false;
  session.runIds.push(runId);
  emitSessionEvent(session.sessionId, "run_started", {
    runId,
    type: run.type,
    parentRunId: run.parentRunId,
  });
  return run;
}

function extractCostFromOutput(output) {
  if (!output || typeof output !== "object") return null;
  const raw = output.raw ?? output;
  const usage = raw?.usage ?? raw?.result?.usage ?? raw?.response?.usage;
  if (!usage) return null;
  const inputTokens = Number(usage.input_tokens ?? usage.inputTokens ?? usage.prompt_tokens ?? 0);
  const outputTokens = Number(usage.output_tokens ?? usage.outputTokens ?? usage.completion_tokens ?? 0);
  if (!inputTokens && !outputTokens) return null;
  const estimatedCostUsd = (inputTokens * 0.000003) + (outputTokens * 0.000015);
  return { inputTokens, outputTokens, estimatedCostUsd: Math.round(estimatedCostUsd * 1000000) / 1000000 };
}

function completeRunRecord(run, output, artifacts = []) {
  const session = ensureSessionRecord(run.sessionId);
  run.status = session.cancelRequested ? "canceled" : "completed";
  run.output = output;
  run.artifacts = Array.isArray(artifacts) ? artifacts : [];
  run.cost = extractCostFromOutput(output);
  run.updatedAt = nowIso();

  session.status = run.status;
  session.updatedAt = run.updatedAt;
  if (run.status === "canceled") {
    session.lastError = "Run canceled by operator request.";
    emitSessionEvent(session.sessionId, "run_canceled", {
      runId: run.runId,
      type: run.type,
    });
  } else {
    session.lastError = "";
    emitSessionEvent(session.sessionId, "run_completed", {
      runId: run.runId,
      type: run.type,
    });
  }
}

function failRunRecord(run, errorText) {
  const session = ensureSessionRecord(run.sessionId);
  run.status = "failed";
  run.error = String(errorText ?? "Unknown execution error.");
  run.updatedAt = nowIso();

  session.status = "failed";
  session.lastError = run.error;
  session.updatedAt = run.updatedAt;
  emitSessionEvent(session.sessionId, "run_failed", {
    runId: run.runId,
    type: run.type,
    error: run.error,
  });
}

function isSessionCancelRequested(sessionId) {
  const session = sessionStore.get(String(sessionId ?? ""));
  return Boolean(session?.cancelRequested);
}

function clampInt(value, min, max, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

function looksLikeGatewayLocalTarget() {
  if (!openclawAgentDevProfile) {
    return false;
  }
  return openclawAgentGatewayBind === "loopback" || openclawAgentGatewayBind === "auto";
}

function extractLastJson(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    // Ignore full-body parse failures.
  }
  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (!line.startsWith("{") && !line.startsWith("[")) {
      continue;
    }
    try {
      return JSON.parse(line);
    } catch {
      // Continue searching.
    }
  }
  return undefined;
}

function extractReplyFromParsed(parsed) {
  if (!parsed || typeof parsed !== "object") {
    return "";
  }
  const candidatePaths = [
    parsed.reply,
    parsed.output,
    parsed.text,
    parsed.content,
    parsed.response?.text,
    parsed.response?.content,
    parsed.result?.reply,
    parsed.result?.output,
    parsed.result?.text,
    parsed.message?.content,
    parsed.message,
  ];
  for (const candidate of candidatePaths) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  if (Array.isArray(parsed.messages) && parsed.messages.length > 0) {
    const last = parsed.messages[parsed.messages.length - 1];
    if (last && typeof last === "object" && typeof last.content === "string") {
      return String(last.content).trim();
    }
  }
  return "";
}

function extractSessionIdFromParsed(parsed) {
  if (!parsed || typeof parsed !== "object") {
    return "";
  }
  const candidates = [
    parsed.sessionId,
    parsed.session_id,
    parsed.session?.id,
    parsed.result?.sessionId,
    parsed.result?.session_id,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return "";
}

function extractErrorFromParsed(parsed) {
  if (!parsed || typeof parsed !== "object") {
    return "";
  }
  const candidates = [
    parsed.error,
    parsed.errorMessage,
    parsed.message && parsed.ok === false ? parsed.message : "",
    parsed.result?.error,
    parsed.result?.errorMessage,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return "";
}

function extractLikelyErrorFromText(stdout, stderr) {
  const combined = [String(stdout ?? ""), String(stderr ?? "")].filter(Boolean).join("\n");
  if (!combined.trim()) {
    return "";
  }
  const lines = combined
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const patterns = [
    /FailoverError:/i,
    /Gateway call failed:/i,
    /No API key found/i,
    / lane task error:/i,
    /^\s*Error:/i,
  ];
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (patterns.some((pattern) => pattern.test(line))) {
      return line;
    }
  }
  return "";
}

export function parseOpenClawAgentOutput(stdoutRaw, stderrRaw) {
  const stdout = String(stdoutRaw ?? "").trim();
  const stderr = String(stderrRaw ?? "").trim();
  const parsed = extractLastJson(stdout);
  const parsedError = extractErrorFromParsed(parsed);
  const textError = extractLikelyErrorFromText(stdout, stderr);
  const error = parsedError || textError;
  const reply = parsed ? extractReplyFromParsed(parsed) : stdout;
  const sessionId = parsed ? extractSessionIdFromParsed(parsed) : "";
  return {
    ok: error.length === 0,
    error,
    reply,
    sessionId,
    parsed,
    stdout,
    stderr,
  };
}

function looksLikeUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value ?? "").trim()
  );
}

function resolveTargetAgentId(options = {}) {
  const explicitTarget =
    asString(options.targetAgentId) ??
    asString(options.openclawAgentId);
  if (explicitTarget) {
    return explicitTarget;
  }

  // Legacy compatibility: historically `agentId` was forwarded to `--agent`.
  // Skip UUID-shaped IDs so DB record IDs are not treated as OpenClaw agent keys.
  const legacyAgentId = asString(options.agentId);
  if (!legacyAgentId || looksLikeUuid(legacyAgentId)) {
    return "";
  }
  return legacyAgentId;
}

export function buildOpenClawAgentArgs(options = {}) {
  const mode = options.mode === "local" ? "local" : "gateway";
  const devProfile = options.devProfile === true;
  const sessionId = asString(options.sessionId) ?? openclawAgentDefaultSessionId;
  const thinking = asString(options.thinking) ?? openclawAgentDefaultThinking;
  const timeoutSeconds = clampInt(
    options.timeoutSeconds,
    15,
    1200,
    openclawAgentDefaultTimeoutSeconds
  );

  const args = [];
  if (devProfile) {
    args.push("--dev");
  }
  args.push("agent");
  if (mode === "local") {
    args.push("--local");
  }
  args.push("--json");
  if (sessionId) {
    args.push("--session-id", sessionId);
  }
  const targetAgentId = resolveTargetAgentId(options);
  if (targetAgentId) {
    args.push("--agent", targetAgentId);
  }
  if (asString(options.to)) {
    args.push("--to", String(options.to));
  }
  if (options.deliver === true) {
    args.push("--deliver");
  }
  if (thinking) {
    args.push("--thinking", thinking);
  }
  args.push("--timeout", String(timeoutSeconds));
  if (asString(options.message)) {
    args.push("--message", String(options.message));
  }
  return args;
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(500);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, "127.0.0.1");
  });
}

async function waitForGatewayPort(port, timeoutMs = 15000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    // eslint-disable-next-line no-await-in-loop
    if (await isPortOpen(port)) {
      return true;
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolveSleep) => setTimeout(resolveSleep, 250));
  }
  return false;
}

function startGatewayProcessIfNeeded() {
  if (!openclawAgentAutoStartGateway || !looksLikeGatewayLocalTarget()) {
    return;
  }
  if (gatewayProcess && gatewayProcess.exitCode == null) {
    return;
  }
  const args = [];
  if (openclawAgentDevProfile) {
    args.push("--dev");
  }
  args.push(
    "gateway",
    "run",
    "--port",
    String(openclawAgentGatewayPort),
    "--bind",
    openclawAgentGatewayBind,
    "--allow-unconfigured",
    "--verbose"
  );
  gatewayProcess = spawn("openclaw", args, {
    stdio: "ignore",
  });
  runtimeState.gatewayAutoStarted = true;
  gatewayProcess.on("exit", (code) => {
    mapleLog("warn", "openclaw_agent.gateway_exit", {
      code: typeof code === "number" ? code : null,
    });
  });
}

async function ensureCliAvailable() {
  await execFileAsync("openclaw", ["--version"], {
    timeout: 4000,
    maxBuffer: 1024 * 1024,
  });
}

export async function bootstrapOpenClawRuntime() {
  runtimeState.lastCheckAt = new Date().toISOString();
  if (!runtimeState.enabled) {
    runtimeState.bootstrapped = true;
    runtimeState.ready = false;
    runtimeState.lastError = "OpenClaw agent runtime disabled by MAPLE_OPENCLAW_AGENT_ENABLED.";
    return getOpenClawRuntimeStatus();
  }

  try {
    await ensureCliAvailable();
    runtimeState.cliAvailable = true;
    if (runtimeState.mode === "gateway" && openclawAgentAutoStartGateway && looksLikeGatewayLocalTarget()) {
      const alreadyOpen = await isPortOpen(openclawAgentGatewayPort);
      if (!alreadyOpen) {
        startGatewayProcessIfNeeded();
        const opened = await waitForGatewayPort(openclawAgentGatewayPort);
        if (!opened) {
          throw new Error(
            `OpenClaw gateway did not become reachable on 127.0.0.1:${openclawAgentGatewayPort}.`
          );
        }
      }
    }
    runtimeState.ready = true;
    runtimeState.lastError = "";
    runtimeState.bootstrapped = true;
    mapleLog("info", "openclaw_agent.runtime_ready", {
      mode: runtimeState.mode,
      autoStartedGateway: runtimeState.gatewayAutoStarted,
    });
    return getOpenClawRuntimeStatus();
  } catch (error) {
    runtimeState.cliAvailable = false;
    runtimeState.ready = false;
    runtimeState.bootstrapped = true;
    runtimeState.lastError = error instanceof Error ? error.message : String(error);
    mapleLog("warn", "openclaw_agent.runtime_unavailable", {
      error: runtimeState.lastError,
      mode: runtimeState.mode,
    });
    if (openclawAgentRequired) {
      throw new Error(runtimeState.lastError);
    }
    return getOpenClawRuntimeStatus();
  }
}

function assertRuntimeEnabled() {
  if (!runtimeState.enabled) {
    throw new Error("OpenClaw agent runtime is disabled.");
  }
}

function resolveRuntimeOptions(options) {
  return {
    mode: options.mode === "local" ? "local" : runtimeState.mode,
    devProfile:
      typeof options.devProfile === "boolean" ? options.devProfile : openclawAgentDevProfile,
  };
}

export async function runOpenClawTurn(options = {}) {
  assertRuntimeEnabled();
  if (!runtimeState.bootstrapped) {
    await bootstrapOpenClawRuntime();
  }
  if (!runtimeState.cliAvailable) {
    throw new Error(runtimeState.lastError || "OpenClaw CLI is unavailable.");
  }

  const resolved = resolveRuntimeOptions(options);
  const message = asString(options.message);
  if (!message) {
    throw new Error("Missing OpenClaw agent message.");
  }
  const requestedSessionId =
    asString(options.sessionId) ?? openclawAgentDefaultSessionId;
  const run = createRunRecord({
    type: "turn",
    sessionId: requestedSessionId,
    parentRunId: asString(options.parentRunId) || null,
    input: {
      message,
      mode: resolved.mode,
      deliver: options.deliver === true,
      agentId: asString(options.agentId) || null,
    },
  });
  if (isSessionCancelRequested(run.sessionId)) {
    completeRunRecord(run, { canceled: true }, []);
    throw new Error("OpenClaw session was canceled.");
  }
  const args = buildOpenClawAgentArgs({
    ...options,
    message,
    sessionId: run.sessionId,
    mode: resolved.mode,
    devProfile: resolved.devProfile,
  });
  const timeoutSeconds = clampInt(
    options.timeoutSeconds,
    15,
    1200,
    openclawAgentDefaultTimeoutSeconds
  );

  try {
    mapleLog("info", "openclaw_agent.turn_begin", {
      mode: resolved.mode,
      sessionId: run.sessionId,
      deliver: options.deliver === true,
    });
    const { stdout, stderr } = await execFileAsync("openclaw", args, {
      timeout: timeoutSeconds * 1000 + 3000,
      maxBuffer: 8 * 1024 * 1024,
    });
    const parsed = parseOpenClawAgentOutput(stdout, stderr);
    if (!parsed.ok) {
      throw new Error(parsed.error || "OpenClaw agent call returned no usable reply.");
    }
    const resolvedSessionId = run.sessionId;
    const resultPayload = {
      mode: resolved.mode,
      sessionId: resolvedSessionId,
      reply: parsed.reply,
      raw: parsed.parsed ?? null,
    };
    completeRunRecord(run, resultPayload, [
      {
        artifactType: "reply",
        content: parsed.reply,
      },
      {
        artifactType: "raw",
        content: parsed.parsed ?? null,
      },
    ]);
    mapleLog("info", "openclaw_agent.turn_complete", {
      mode: resolved.mode,
      sessionId: resolvedSessionId,
      replyChars: parsed.reply.length,
    });
    return {
      ...resultPayload,
      runId: run.runId,
    };
  } catch (error) {
    const stdout = error && typeof error === "object" ? error.stdout : "";
    const stderr = error && typeof error === "object" ? error.stderr : "";
    const parsed = parseOpenClawAgentOutput(stdout, stderr);
    const messageText =
      parsed.error ||
      (error instanceof Error ? error.message : String(error)) ||
      "Unknown OpenClaw execution failure.";
    mapleLog("warn", "openclaw_agent.turn_failed", {
      mode: resolved.mode,
      error: messageText,
    });
    failRunRecord(run, messageText);
    throw new Error(`OpenClaw agent execution failed: ${messageText}`);
  }
}

export async function runOpenClawLongform(options = {}) {
  const objective = asString(options.objective);
  if (!objective) {
    throw new Error("Missing longform objective.");
  }
  const maxTurns = clampInt(options.maxTurns, 1, 8, 4);
  const sessionId = asString(options.sessionId) ?? openclawAgentDefaultSessionId;
  const run = createRunRecord({
    type: "longform",
    sessionId,
    parentRunId: asString(options.parentRunId) || null,
    input: {
      objective,
      maxTurns,
      agentId: asString(options.agentId) || null,
    },
  });
  const turns = [];
  let completed = false;

  let prompt = [
    "You are Maple core backend intelligence for thin-client and longform workflows.",
    `Objective: ${objective}`,
    "Generate a concise execution plan and immediately begin execution.",
    "When fully complete, prefix your final response with TASK_COMPLETE:.",
  ].join("\n");

  try {
    for (let turn = 1; turn <= maxTurns; turn += 1) {
      if (isSessionCancelRequested(run.sessionId)) {
        const output = {
          sessionId: run.sessionId,
          objective,
          completed: false,
          turns,
          canceled: true,
        };
        completeRunRecord(run, output, [
          {
            artifactType: "turns",
            content: turns,
          },
        ]);
        return {
          ...output,
          runId: run.runId,
        };
      }
      // eslint-disable-next-line no-await-in-loop
      const result = await runOpenClawTurn({
        ...options,
        sessionId: run.sessionId,
        message: prompt,
      });
      turns.push({ turn, reply: result.reply });
      if (/TASK_COMPLETE:/i.test(result.reply)) {
        completed = true;
        break;
      }
      prompt = [
        `Objective: ${objective}`,
        `Previous response: ${result.reply}`,
        "Continue execution toward completion. Use concrete next actions.",
        "When done, prefix your final response with TASK_COMPLETE:.",
      ].join("\n");
    }

    const output = {
      sessionId: run.sessionId,
      objective,
      completed,
      turns,
    };
    completeRunRecord(run, output, [
      {
        artifactType: "turns",
        content: turns,
      },
    ]);

    return {
      ...output,
      runId: run.runId,
    };
  } catch (error) {
    const errorText = error instanceof Error ? error.message : String(error);
    failRunRecord(run, errorText);
    throw error;
  }
}

function toPublicSession(session) {
  let lastInputPreview = "";
  if (session.lastRunId) {
    const lastRun = runStore.get(session.lastRunId);
    const msg = lastRun?.input?.message ?? lastRun?.input?.objective ?? "";
    lastInputPreview = msg.length > 80 ? msg.slice(0, 80) + "..." : msg;
  }
  return {
    sessionId: session.sessionId,
    status: session.status,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    lastRunId: session.lastRunId,
    lastError: session.lastError,
    cancelRequested: session.cancelRequested,
    runCount: session.runIds.length,
    lastInputPreview,
  };
}

function toPublicRun(run) {
  return {
    runId: run.runId,
    type: run.type,
    sessionId: run.sessionId,
    status: run.status,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    error: run.error,
    cost: run.cost ?? null,
    parentRunId: run.parentRunId ?? null,
    childRunIds: run.childRunIds ?? [],
  };
}

export function listOpenClawSessions(options = {}) {
  const limit = clampInt(options.limit, 1, 100, 20);
  const offset = parseCursorOffset(options.cursor);
  const all = [...sessionStore.values()].sort((a, b) =>
    String(b.updatedAt).localeCompare(String(a.updatedAt))
  );
  const items = all.slice(offset, offset + limit).map(toPublicSession);
  const nextCursor = offset + limit < all.length ? String(offset + limit) : "";
  return { items, nextCursor };
}

export function getOpenClawSession(sessionId) {
  const session = sessionStore.get(String(sessionId ?? ""));
  if (!session) {
    return null;
  }
  const runs = session.runIds
    .map((runId) => runStore.get(runId))
    .filter(Boolean)
    .map(toPublicRun)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return {
    ...toPublicSession(session),
    runs,
    latestEventCursor:
      session.events.length > 0
        ? session.events[session.events.length - 1].cursor
        : "0",
  };
}

export function cancelOpenClawSession(sessionId) {
  const session = sessionStore.get(String(sessionId ?? ""));
  if (!session) {
    return null;
  }
  session.cancelRequested = true;
  if (session.status === "running") {
    session.status = "cancel_requested";
  } else if (session.status !== "completed") {
    session.status = "canceled";
  }
  session.updatedAt = nowIso();
  emitSessionEvent(session.sessionId, "cancel_requested", {
    sessionId: session.sessionId,
  });
  return toPublicSession(session);
}

export function getOpenClawRunArtifacts(runId) {
  const run = runStore.get(String(runId ?? ""));
  if (!run) {
    return null;
  }
  return {
    ...toPublicRun(run),
    output: run.output,
    artifacts: run.artifacts,
  };
}

export function listOpenClawRuns(options = {}) {
  const limit = clampInt(options.limit, 1, 100, 20);
  const offset = parseCursorOffset(options.cursor);
  const all = [...runStore.values()].sort((a, b) =>
    String(b.updatedAt).localeCompare(String(a.updatedAt))
  );
  const items = all.slice(offset, offset + limit).map(toPublicRun);
  const nextCursor = offset + limit < all.length ? String(offset + limit) : "";
  return { items, nextCursor };
}

export function getOpenClawRun(runId) {
  const run = runStore.get(String(runId ?? ""));
  if (!run) {
    return null;
  }
  return {
    ...toPublicRun(run),
    input: run.input,
    output: run.output,
  };
}

export function getOpenClawRunTimeline(runId) {
  const run = runStore.get(String(runId ?? ""));
  if (!run) {
    return null;
  }
  const session = sessionStore.get(run.sessionId);
  const timeline = Array.isArray(session?.events)
    ? session.events
        .filter((event) => String(event.payload?.runId ?? "") === run.runId)
        .map((event) => ({
          id: event.id,
          eventType: event.eventType,
          timestamp: event.timestamp,
          payload: event.payload,
          cursor: event.cursor,
        }))
    : [];
  return {
    run: toPublicRun(run),
    timeline,
  };
}

export function listOpenClawSessionEvents(sessionId, options = {}) {
  const session = sessionStore.get(String(sessionId ?? ""));
  if (!session) {
    return { items: [], latestCursor: "0" };
  }
  const minSequence = parseEventCursor(options.afterCursor);
  const items = session.events.filter((event) => event.sequence > minSequence);
  const latestCursor =
    session.events.length > 0
      ? session.events[session.events.length - 1].cursor
      : String(minSequence);
  return { items, latestCursor };
}

export function subscribeOpenClawSessionEvents(sessionId, callback) {
  const normalizedSessionId = String(sessionId ?? "").trim();
  if (!normalizedSessionId || typeof callback !== "function") {
    return () => {};
  }
  const watchers = sessionWatchers.get(normalizedSessionId) ?? new Set();
  watchers.add(callback);
  sessionWatchers.set(normalizedSessionId, watchers);
  return () => {
    const nextWatchers = sessionWatchers.get(normalizedSessionId);
    if (!nextWatchers) {
      return;
    }
    nextWatchers.delete(callback);
    if (nextWatchers.size === 0) {
      sessionWatchers.delete(normalizedSessionId);
    }
  };
}

export function isOpenClawRuntimeEnabled() {
  return runtimeState.enabled;
}

export function isOpenClawRuntimeReady() {
  return runtimeState.enabled && runtimeState.ready && runtimeState.cliAvailable;
}

export function getOpenClawRuntimeStatus() {
  return {
    enabled: runtimeState.enabled,
    mode: runtimeState.mode,
    bootstrapped: runtimeState.bootstrapped,
    cliAvailable: runtimeState.cliAvailable,
    ready: isOpenClawRuntimeReady(),
    gatewayAutoStarted: runtimeState.gatewayAutoStarted,
    lastError: runtimeState.lastError,
    lastCheckAt: runtimeState.lastCheckAt,
  };
}

export function getOpenClawRunChildren(runId) {
  const parent = runStore.get(String(runId ?? ""));
  if (!parent) {
    return null;
  }
  const children = (parent.childRunIds ?? [])
    .map((childId) => runStore.get(childId))
    .filter(Boolean)
    .map(toPublicRun);
  return { parentRunId: parent.runId, children };
}

export function listSessionsForAgent(agentId) {
  const normalizedAgentId = String(agentId ?? "").trim();
  if (!normalizedAgentId) {
    return [];
  }
  const results = [];
  for (const session of sessionStore.values()) {
    const hasAgentRun = session.runIds.some((runId) => {
      const run = runStore.get(runId);
      return run && String(run.input?.agentId ?? "") === normalizedAgentId;
    });
    if (hasAgentRun) {
      results.push(toPublicSession(session));
    }
  }
  results.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return results;
}

export async function shutdownOpenClawRuntime() {
  if (gatewayProcess && gatewayProcess.exitCode == null) {
    gatewayProcess.kill("SIGTERM");
  }
  gatewayProcess = undefined;
  sessionEventSequence = 0;
  sessionStore.clear();
  runStore.clear();
  sessionWatchers.clear();
}
