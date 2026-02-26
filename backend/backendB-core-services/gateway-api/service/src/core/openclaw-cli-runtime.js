import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { asString } from "../helpers.js";
import { bootstrapOpenClawRuntime } from "./openclaw-agent-runtime.js";

const execFileAsync = promisify(execFile);

export const OPENCLAW_CLI_TOOL_DEFINITIONS = [
  { tool: "setup", docsPath: "/cli/setup" },
  { tool: "onboard", docsPath: "/cli/onboard" },
  { tool: "configure", docsPath: "/cli/configure" },
  { tool: "config", docsPath: "/cli/config" },
  { tool: "completion", docsPath: "/cli/completion" },
  { tool: "doctor", docsPath: "/cli/doctor" },
  { tool: "dashboard", docsPath: "/cli/dashboard" },
  { tool: "reset", docsPath: "/cli/reset" },
  { tool: "uninstall", docsPath: "/cli/uninstall" },
  { tool: "update", docsPath: "/cli/update" },
  { tool: "message", docsPath: "/cli/message" },
  { tool: "agent", docsPath: "/cli/agent" },
  { tool: "agents", docsPath: "/cli/agents" },
  { tool: "acp", docsPath: "/cli/acp" },
  { tool: "status", docsPath: "/cli/status" },
  { tool: "health", docsPath: "/cli/health" },
  { tool: "sessions", docsPath: "/cli/sessions" },
  { tool: "gateway", docsPath: "/cli/gateway" },
  { tool: "logs", docsPath: "/cli/logs" },
  { tool: "system", docsPath: "/cli/system" },
  { tool: "models", docsPath: "/cli/models" },
  { tool: "memory", docsPath: "/cli/memory" },
  { tool: "directory", docsPath: "/cli/directory" },
  { tool: "skills", docsPath: "/cli/skills" },
  { tool: "nodes", docsPath: "/cli/nodes" },
  { tool: "devices", docsPath: "/cli/devices" },
  { tool: "node", docsPath: "/cli/node" },
  { tool: "approvals", docsPath: "/cli/approvals" },
  { tool: "sandbox", docsPath: "/cli/sandbox" },
  { tool: "tui", docsPath: "/cli/tui" },
  { tool: "browser", docsPath: "/cli/browser" },
  { tool: "cron", docsPath: "/cli/cron" },
  { tool: "dns", docsPath: "/cli/dns" },
  { tool: "docs", docsPath: "/cli/docs" },
  { tool: "hooks", docsPath: "/cli/hooks" },
  { tool: "webhooks", docsPath: "/cli/webhooks" },
  { tool: "pairing", docsPath: "/cli/pairing" },
  { tool: "qr", docsPath: "/cli/qr" },
  { tool: "plugins", docsPath: "/cli/plugins" },
  { tool: "channels", docsPath: "/cli/channels" },
  { tool: "security", docsPath: "/cli/security" },
  { tool: "daemon", docsPath: "/cli/daemon", legacyAlias: true },
  { tool: "clawbot", docsPath: "/cli/clawbot", legacyAlias: true },
  { tool: "voicecall", docsPath: "/cli/voicecall", pluginCommand: true },
];

const OPENCLAW_CLI_TOOL_SET = new Set(
  OPENCLAW_CLI_TOOL_DEFINITIONS.map((entry) => entry.tool)
);

const OPENCLAW_DOCS_BASE_URL = "https://docs.openclaw.ai";

function parseBooleanEnv(rawValue, fallback) {
  const normalized = String(rawValue ?? "")
    .trim()
    .toLowerCase();
  if (!normalized) {
    return fallback;
  }
  if (normalized === "1" || normalized === "true" || normalized === "yes") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no") {
    return false;
  }
  return fallback;
}

const allowUnknownOpenClawTool = parseBooleanEnv(
  process.env.MAPLE_OPENCLAW_CLI_ALLOW_UNKNOWN,
  false
);

function clampTimeoutSeconds(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return 60;
  }
  return Math.max(5, Math.min(parsed, 300));
}

function clampMaxBufferBytes(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return 8 * 1024 * 1024;
  }
  const bytes = parsed * 1024 * 1024;
  return Math.max(1024 * 1024, Math.min(bytes, 32 * 1024 * 1024));
}

function parseJsonOutput(rawStdout) {
  const trimmed = String(rawStdout ?? "").trim();
  if (!trimmed) {
    return null;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
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
        // Continue scanning.
      }
    }
    return null;
  }
}

function sanitizeProfile(value) {
  const profile = asString(value);
  if (!profile) {
    return "";
  }
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(profile)) {
    throw new Error("Invalid profile value.");
  }
  return profile;
}

function sanitizeStdin(value) {
  if (value == null) {
    return "";
  }
  if (typeof value !== "string") {
    throw new Error("stdin must be a string when provided.");
  }
  if (value.length > 128 * 1024) {
    throw new Error("stdin exceeds max size.");
  }
  if (value.includes("\u0000")) {
    throw new Error("stdin contains invalid bytes.");
  }
  return value;
}

export function normalizeOpenClawCliTool(rawTool) {
  const tool = String(rawTool ?? "")
    .trim()
    .toLowerCase();
  if (!tool) {
    return "";
  }
  if (!/^[a-z0-9_-]{1,64}$/.test(tool)) {
    return "";
  }
  return tool;
}

export function isSupportedOpenClawCliTool(rawTool) {
  const tool = normalizeOpenClawCliTool(rawTool);
  if (!tool) {
    return false;
  }
  return OPENCLAW_CLI_TOOL_SET.has(tool);
}

export function listOpenClawCliTools() {
  return OPENCLAW_CLI_TOOL_DEFINITIONS.map((entry) => ({
    ...entry,
    docsUrl: `${OPENCLAW_DOCS_BASE_URL}${entry.docsPath}`,
  }));
}

export function sanitizeOpenClawCliArgs(rawArgs) {
  if (rawArgs == null) {
    return [];
  }
  if (!Array.isArray(rawArgs)) {
    throw new Error("args must be an array of strings.");
  }
  if (rawArgs.length > 128) {
    throw new Error("Too many CLI arguments.");
  }
  const sanitized = [];
  for (const rawValue of rawArgs) {
    if (typeof rawValue !== "string") {
      throw new Error("CLI arguments must be strings.");
    }
    if (rawValue.length === 0) {
      throw new Error("CLI arguments cannot be empty.");
    }
    if (rawValue.length > 4096) {
      throw new Error("CLI argument exceeds max length.");
    }
    if (/[\r\n\0]/.test(rawValue)) {
      throw new Error("CLI argument contains invalid characters.");
    }
    sanitized.push(rawValue);
  }
  return sanitized;
}

function ensureToolAllowed(tool) {
  if (!tool) {
    throw new Error("tool is required.");
  }
  if (OPENCLAW_CLI_TOOL_SET.has(tool)) {
    return;
  }
  if (!allowUnknownOpenClawTool) {
    throw new Error(`Unsupported OpenClaw CLI tool '${tool}'.`);
  }
}

function maybePushFlag(args, flagName) {
  if (!args.includes(flagName)) {
    args.push(flagName);
  }
}

export function buildOpenClawCliCommandArgs(options = {}) {
  const tool = normalizeOpenClawCliTool(options.tool);
  ensureToolAllowed(tool);
  const args = [];
  if (options.dev === true) {
    args.push("--dev");
  }
  const profile = sanitizeProfile(options.profile);
  if (profile) {
    args.push("--profile", profile);
  }
  if (options.noColor === true) {
    maybePushFlag(args, "--no-color");
  }

  args.push(tool);
  const extraArgs = sanitizeOpenClawCliArgs(options.args);
  args.push(...extraArgs);

  if (options.help === true) {
    maybePushFlag(args, "--help");
  }
  if (options.json === true) {
    maybePushFlag(args, "--json");
  }
  if (options.plain === true) {
    maybePushFlag(args, "--plain");
  }
  return args;
}

function normalizeExecError(error) {
  if (!error || typeof error !== "object") {
    return {
      message: String(error ?? "OpenClaw CLI execution failed."),
      code: null,
      signal: null,
      stdout: "",
      stderr: "",
    };
  }
  return {
    message:
      typeof error.message === "string"
        ? error.message
        : "OpenClaw CLI execution failed.",
    code: Number.isFinite(error.code) ? Number(error.code) : null,
    signal: typeof error.signal === "string" ? error.signal : null,
    stdout: typeof error.stdout === "string" ? error.stdout : "",
    stderr: typeof error.stderr === "string" ? error.stderr : "",
  };
}

export async function runOpenClawCliTool(options = {}, dependencies = {}) {
  const execImpl = dependencies.execImpl ?? execFileAsync;
  const bootstrapImpl = dependencies.bootstrapImpl ?? bootstrapOpenClawRuntime;
  const skipBootstrap = options.skipBootstrap === true;

  if (!skipBootstrap) {
    await bootstrapImpl();
  }

  const commandArgs = buildOpenClawCliCommandArgs(options);
  const timeoutSeconds = clampTimeoutSeconds(options.timeoutSeconds);
  const maxBufferBytes = clampMaxBufferBytes(options.maxBufferMb);
  const stdin = sanitizeStdin(options.stdin);
  const shouldParseJson = options.parseJson === true || options.json === true;

  try {
    const { stdout, stderr } = await execImpl("openclaw", commandArgs, {
      timeout: timeoutSeconds * 1000,
      maxBuffer: maxBufferBytes,
      windowsHide: true,
      input: stdin,
    });
    const parsedJson = shouldParseJson ? parseJsonOutput(stdout) : null;
    return {
      ok: true,
      tool: normalizeOpenClawCliTool(options.tool),
      command: "openclaw",
      args: commandArgs,
      timeoutSeconds,
      stdout: String(stdout ?? ""),
      stderr: String(stderr ?? ""),
      parsedJson,
      exitCode: 0,
      signal: null,
    };
  } catch (error) {
    const normalized = normalizeExecError(error);
    const parsedJson = shouldParseJson ? parseJsonOutput(normalized.stdout) : null;
    return {
      ok: false,
      tool: normalizeOpenClawCliTool(options.tool),
      command: "openclaw",
      args: commandArgs,
      timeoutSeconds,
      stdout: normalized.stdout,
      stderr: normalized.stderr,
      parsedJson,
      exitCode: normalized.code,
      signal: normalized.signal,
      error: normalized.message,
    };
  }
}
