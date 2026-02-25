import { execFile, spawn } from "node:child_process";
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
  if (asString(options.agentId)) {
    args.push("--agent", String(options.agentId));
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
  const args = buildOpenClawAgentArgs({
    ...options,
    message,
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
      sessionId: asString(options.sessionId) ?? openclawAgentDefaultSessionId,
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
    mapleLog("info", "openclaw_agent.turn_complete", {
      mode: resolved.mode,
      sessionId: parsed.sessionId || asString(options.sessionId) || openclawAgentDefaultSessionId,
      replyChars: parsed.reply.length,
    });
    return {
      mode: resolved.mode,
      sessionId: parsed.sessionId || asString(options.sessionId) || openclawAgentDefaultSessionId,
      reply: parsed.reply,
      raw: parsed.parsed ?? null,
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
  const turns = [];
  let completed = false;

  let prompt = [
    "You are Maple core backend intelligence for thin-client and longform workflows.",
    `Objective: ${objective}`,
    "Generate a concise execution plan and immediately begin execution.",
    "When fully complete, prefix your final response with TASK_COMPLETE:.",
  ].join("\n");

  for (let turn = 1; turn <= maxTurns; turn += 1) {
    // eslint-disable-next-line no-await-in-loop
    const result = await runOpenClawTurn({
      ...options,
      sessionId,
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

  return {
    sessionId,
    objective,
    completed,
    turns,
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

export async function shutdownOpenClawRuntime() {
  if (gatewayProcess && gatewayProcess.exitCode == null) {
    gatewayProcess.kill("SIGTERM");
  }
  gatewayProcess = undefined;
}
