#!/usr/bin/env node

import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const execFileAsync = promisify(execFile);
const BRIDGE_PORT = Number(process.env.OPENCLAW_BRIDGE_PORT ?? 8787);
const BRIDGE_TOKEN =
  process.env.OPENCLAW_BRIDGE_TOKEN && process.env.OPENCLAW_BRIDGE_TOKEN.trim().length > 0
    ? process.env.OPENCLAW_BRIDGE_TOKEN
    : randomBytes(24).toString("hex");
const REQUIRE_AUTH = String(process.env.OPENCLAW_BRIDGE_REQUIRE_AUTH ?? "1") !== "0";
const BRIDGE_MODE = String(process.env.OPENCLAW_BRIDGE_MODE ?? "gateway").trim().toLowerCase();
const GATEWAY_WS_URL = process.env.OPENCLAW_GATEWAY_WS_URL ?? "ws://127.0.0.1:19001";
const GATEWAY_TOKEN =
  process.env.OPENCLAW_GATEWAY_TOKEN && process.env.OPENCLAW_GATEWAY_TOKEN.trim().length > 0
    ? process.env.OPENCLAW_GATEWAY_TOKEN
    : randomBytes(24).toString("hex");
const DEFAULT_GATEWAY_SESSION_KEY =
  process.env.OPENCLAW_GATEWAY_SESSION_KEY ?? "agent:dev:main";
const GATEWAY_HISTORY_LIMIT = Number(process.env.OPENCLAW_GATEWAY_HISTORY_LIMIT ?? 500);
const OPENCLAW_SESSIONS_DIR =
  process.env.OPENCLAW_SESSIONS_DIR ??
  join(homedir(), ".openclaw", "agents", "main", "sessions");

const sessionOverrides = new Map();

function json(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function gatewayHistoryLimit() {
  if (!Number.isFinite(GATEWAY_HISTORY_LIMIT)) {
    return 500;
  }
  return clamp(Math.trunc(GATEWAY_HISTORY_LIMIT), 1, 1000);
}

function isAuthorized(req) {
  if (!REQUIRE_AUTH) {
    return true;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return false;
  }

  const token = authHeader.slice("Bearer ".length).trim();
  const a = Buffer.from(token);
  const b = Buffer.from(BRIDGE_TOKEN);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2 MB

async function readJson(req) {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    const buf = Buffer.from(chunk);
    totalBytes += buf.length;
    if (totalBytes > MAX_BODY_BYTES) {
      const err = new Error("Request body too large");
      err.statusCode = 413;
      throw err;
    }
    chunks.push(buf);
  }
  if (chunks.length === 0) {
    return {};
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function normalizeEvent(event, sessionId) {
  return {
    eventId:
      typeof event.eventId === "string" && event.eventId.length > 0
        ? event.eventId
        : `${sessionId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp:
      typeof event.timestamp === "string" && event.timestamp.length > 0
        ? event.timestamp
        : new Date().toISOString(),
    actor: typeof event.actor === "string" ? event.actor : "agent",
    type: typeof event.type === "string" ? event.type : "prompt",
    prompt: typeof event.prompt === "string" ? event.prompt : undefined,
    output: typeof event.output === "string" ? event.output : undefined,
    command: typeof event.command === "string" ? event.command : undefined,
    toolName: typeof event.toolName === "string" ? event.toolName : undefined,
    toolInput:
      event.toolInput && typeof event.toolInput === "object"
        ? event.toolInput
        : undefined,
    toolOutput: event.toolOutput,
    url: typeof event.url === "string" ? event.url : undefined,
  };
}

function normalizeSessionOverrideEvent(event, sessionId) {
  return {
    eventId:
      typeof event.eventId === "string" && event.eventId.length > 0
        ? event.eventId
        : `${sessionId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp:
      typeof event.timestamp === "string" && event.timestamp.length > 0
        ? event.timestamp
        : new Date().toISOString(),
    actor: typeof event.actor === "string" ? event.actor : "agent",
    type: typeof event.type === "string" ? event.type : "prompt",
    prompt: typeof event.prompt === "string" ? event.prompt : undefined,
    output: typeof event.output === "string" ? event.output : undefined,
    command: typeof event.command === "string" ? event.command : undefined,
    toolName: typeof event.toolName === "string" ? event.toolName : undefined,
    toolInput:
      event.toolInput && typeof event.toolInput === "object"
        ? event.toolInput
        : undefined,
    toolOutput: event.toolOutput,
    url: typeof event.url === "string" ? event.url : undefined,
  };
}

function normalizedIsoTimestamp(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.valueOf())) {
      return parsed.toISOString();
    }
  }
  return new Date().toISOString();
}

function normalizedRole(value) {
  const role = String(value ?? "").trim().toLowerCase();
  if (
    role === "user" ||
    role === "assistant" ||
    role === "system" ||
    role === "tool" ||
    role === "toolresult" ||
    role === "tool_result" ||
    role === "tool-result"
  ) {
    if (role.startsWith("tool")) {
      return "tool";
    }
    return role;
  }
  return "assistant";
}

function textFromContentBlock(block) {
  if (typeof block === "string") {
    return block.trim();
  }
  if (!block || typeof block !== "object") {
    return "";
  }
  const entry = block;
  if (typeof entry.text === "string") {
    return entry.text.trim();
  }
  if (typeof entry.content === "string") {
    return entry.content.trim();
  }
  if (typeof entry.arguments === "string") {
    return `${entry.name ? `${String(entry.name)} ` : ""}${entry.arguments}`.trim();
  }
  if (typeof entry.thinking === "string") {
    return entry.thinking.trim();
  }
  return "";
}

function textFromHistoryMessage(message) {
  if (!message || typeof message !== "object") {
    return "";
  }
  if (typeof message.text === "string" && message.text.trim()) {
    return message.text.trim();
  }
  if (typeof message.content === "string" && message.content.trim()) {
    return message.content.trim();
  }
  if (Array.isArray(message.content)) {
    return message.content
      .map((item) => textFromContentBlock(item))
      .filter((value) => value.length > 0)
      .join("\n\n")
      .trim();
  }
  return "";
}

function inferEventType(role, message, text) {
  const lowerText = text.toLowerCase();
  if (role === "system") {
    return "system";
  }
  if (role === "tool") {
    return "tool_call";
  }

  const content = Array.isArray(message?.content) ? message.content : [];
  const hasToolBlock = content.some((block) => {
    if (!block || typeof block !== "object") {
      return false;
    }
    const type = String(block.type ?? "").toLowerCase();
    return type.includes("tool");
  });
  if (hasToolBlock) {
    return "tool_call";
  }

  const looksLikeShell =
    /(curl|wget|bash|zsh|python|node|npm|pip|chmod|rm\s+-rf|git)\b/.test(lowerText) &&
    (lowerText.includes("```") || lowerText.includes(" | ") || lowerText.includes(";"));
  if (looksLikeShell) {
    return "shell";
  }

  const hasUrl = /https?:\/\/[^\s)]+/i.test(text);
  if (hasUrl) {
    return "network";
  }

  return "prompt";
}

function extractFirstUrl(text) {
  const match = String(text ?? "").match(/https?:\/\/[^\s)]+/i);
  return match ? match[0] : undefined;
}

function extractLikelyCommand(text) {
  const content = String(text ?? "");
  const fenced = content.match(/```(?:bash|sh|zsh|shell)?\n([\s\S]*?)```/i);
  if (fenced && fenced[1]) {
    const firstLine = fenced[1].split(/\r?\n/).find((line) => line.trim().length > 0);
    if (firstLine) {
      return firstLine.trim();
    }
  }

  const line = content
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) =>
      /^(curl|wget|bash|zsh|python|node|npm|pip|chmod|rm|git)\b/i.test(entry)
    );
  return line;
}

function normalizeBlockType(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_\s-]+/g, "");
}

function parsePossibleJson(value) {
  if (value && typeof value === "object") {
    return value;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const parseCandidate = (candidate) => {
    try {
      return JSON.parse(candidate);
    } catch {
      return undefined;
    }
  };

  const direct = parseCandidate(trimmed);
  if (direct !== undefined) {
    return direct;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) {
    return parseCandidate(fenced[1].trim());
  }

  return undefined;
}

function findUrlInUnknown(value) {
  if (!value) {
    return undefined;
  }
  if (typeof value === "string") {
    return extractFirstUrl(value);
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = findUrlInUnknown(item);
      if (nested) {
        return nested;
      }
    }
    return undefined;
  }
  if (typeof value !== "object") {
    return undefined;
  }

  const record = value;
  const urlKeys = ["url", "finalUrl", "href", "endpoint", "uri", "target"];
  for (const key of urlKeys) {
    if (typeof record[key] === "string") {
      const url = extractFirstUrl(record[key]);
      if (url) {
        return url;
      }
    }
  }

  for (const key of Object.keys(record)) {
    const nested = findUrlInUnknown(record[key]);
    if (nested) {
      return nested;
    }
  }
  return undefined;
}

function findCommandInUnknown(value) {
  if (!value) {
    return undefined;
  }
  if (typeof value === "string") {
    return extractLikelyCommand(value);
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = findCommandInUnknown(item);
      if (nested) {
        return nested;
      }
    }
    return undefined;
  }
  if (typeof value !== "object") {
    return undefined;
  }

  const record = value;
  const commandKeys = ["command", "cmd", "shellCommand", "script"];
  for (const key of commandKeys) {
    if (typeof record[key] === "string" && record[key].trim()) {
      return record[key].trim();
    }
  }
  for (const key of Object.keys(record)) {
    const nested = findCommandInUnknown(record[key]);
    if (nested) {
      return nested;
    }
  }
  return undefined;
}

function toolTypeFromName(name, fallbackText = "") {
  const lower = String(name ?? "").toLowerCase();
  const lowerText = String(fallbackText ?? "").toLowerCase();

  if (/(mail|email|gmail|inbox|imap|smtp)/.test(lower)) {
    return "email";
  }
  if (/(shell|exec|terminal|command|bash|zsh|sh|python|node|npm)/.test(lower)) {
    return "shell";
  }
  if (
    /(web|http|fetch|search|browser|crawl|request|url|network|dns|socket|download|upload)/.test(
      lower
    ) ||
    /https?:\/\//.test(lowerText)
  ) {
    return "network";
  }
  return "tool_call";
}

function parseToolArguments(rawArguments) {
  if (rawArguments && typeof rawArguments === "object") {
    return rawArguments;
  }
  if (typeof rawArguments !== "string") {
    return undefined;
  }
  const parsed = parsePossibleJson(rawArguments);
  if (parsed && typeof parsed === "object") {
    return parsed;
  }
  return { raw: rawArguments };
}

function toolCallsFromMessageContent(message) {
  const content = Array.isArray(message?.content) ? message.content : [];
  const calls = [];
  for (const block of content) {
    if (!block || typeof block !== "object") {
      continue;
    }
    const type = normalizeBlockType(block.type);
    if (type !== "toolcall" && type !== "tooluse") {
      continue;
    }
    const name = typeof block.name === "string" && block.name.trim() ? block.name.trim() : "tool";
    const input = parseToolArguments(block.arguments);
    calls.push({ name, input });
  }
  return calls;
}

function summaryText(value, fallback = "") {
  const text = String(value ?? "").trim();
  if (!text) {
    return fallback;
  }
  return text.length <= 240 ? text : `${text.slice(0, 237)}...`;
}

function stableEventId(sessionKey, index, role, text, message, part = "m0") {
  const seed = JSON.stringify({
    sessionKey,
    index,
    part,
    role,
    text,
    timestamp: message?.timestamp,
    id: message?.id,
  });
  const hash = createHash("sha1").update(seed).digest("hex").slice(0, 12);
  return `${sessionKey}-${index}-${part}-${hash}`;
}

function gatewayMessagesToEvents(sessionKey, messages) {
  if (!Array.isArray(messages)) {
    return [];
  }

  const events = [];

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    const role = normalizedRole(message?.role);
    const text = textFromHistoryMessage(message);
    const actor = role === "assistant" ? "agent" : role === "tool" ? "tool" : role;
    const timestamp = normalizedIsoTimestamp(message?.timestamp);
    const toolCalls = toolCallsFromMessageContent(message);
    const contentBlocks = Array.isArray(message?.content) ? message.content : [];
    let partIndex = 0;
    let emittedForMessage = false;

    const pushEvent = (event) => {
      const part = `p${partIndex}`;
      partIndex += 1;
      events.push({
        ...event,
        eventId: stableEventId(
          sessionKey,
          index,
          role,
          `${event.prompt ?? ""}\n${event.output ?? ""}\n${event.command ?? ""}\n${event.url ?? ""}`,
          message,
          part
        ),
        timestamp,
      });
      emittedForMessage = true;
    };

    if (role === "user") {
      pushEvent({
        actor: "user",
        type: "prompt",
        prompt: text || "(empty user message)",
      });
      continue;
    }

    if (role === "system") {
      pushEvent({
        actor: "system",
        type: "system",
        output: summaryText(text, "System event observed."),
      });
      continue;
    }

    if (role === "assistant") {
      for (const block of contentBlocks) {
        if (!block || typeof block !== "object") {
          continue;
        }
        const blockType = normalizeBlockType(block.type);
        if (blockType === "thinking" && typeof block.thinking === "string" && block.thinking.trim()) {
          pushEvent({
            actor: "agent",
            type: "system",
            output: `Thinking: ${summaryText(block.thinking, "Thinking...")}`,
          });
        }
      }

      for (let callIndex = 0; callIndex < toolCalls.length; callIndex += 1) {
        const call = toolCalls[callIndex];
        const fallbackText = text || "";
        const type = toolTypeFromName(call.name, fallbackText);
        const url = findUrlInUnknown(call.input) ?? extractFirstUrl(fallbackText);
        const command = findCommandInUnknown(call.input) ?? extractLikelyCommand(fallbackText);
        const output = `Tool call: ${call.name}`;

        pushEvent({
          actor: "tool",
          type,
          toolName: call.name,
          toolInput: call.input,
          output,
          ...(url ? { url } : {}),
          ...(command ? { command } : {}),
        });
      }

      const textOnly = contentBlocks
        .filter((block) => block && typeof block === "object" && normalizeBlockType(block.type) === "text")
        .map((block) => (typeof block.text === "string" ? block.text.trim() : ""))
        .filter((value) => value.length > 0)
        .join("\n\n")
        .trim();

      if (textOnly) {
        const type = inferEventType(role, message, textOnly);
        pushEvent({
          actor,
          type,
          output: summaryText(textOnly, "Assistant output observed."),
          ...(type === "network" ? { url: extractFirstUrl(textOnly) } : {}),
          ...(type === "shell" ? { command: extractLikelyCommand(textOnly) } : {}),
        });
      }
    }

    if (role === "tool") {
      const toolName =
        typeof message?.toolName === "string" && message.toolName.trim()
          ? message.toolName.trim()
          : typeof message?.name === "string" && message.name.trim()
            ? message.name.trim()
            : "tool_result";
      const parsedPayload = parsePossibleJson(text);
      const type = toolTypeFromName(toolName, text);
      const url = findUrlInUnknown(parsedPayload) ?? extractFirstUrl(text);
      const command = findCommandInUnknown(parsedPayload) ?? extractLikelyCommand(text);

      pushEvent({
        actor: "tool",
        type,
        toolName,
        toolOutput: parsedPayload ?? (text || undefined),
        output: summaryText(text, `Tool result: ${toolName}`),
        ...(url ? { url } : {}),
        ...(command ? { command } : {}),
      });
    }

    if (!emittedForMessage) {
      const type = inferEventType(role, message, text);
      pushEvent({
        actor,
        type,
        output: summaryText(text, "Assistant output observed."),
        ...(type === "network" ? { url: extractFirstUrl(text) } : {}),
        ...(type === "shell" ? { command: extractLikelyCommand(text) } : {}),
      });
    }
  }

  return events;
}

async function fetchLocalSessionHistory(sessionId) {
  const fileName = `${sessionId}.jsonl`;
  const filePath = join(OPENCLAW_SESSIONS_DIR, fileName);

  let raw;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return { sessionId, messages: [] };
    }
    throw new Error(`Failed to read session file ${filePath}: ${error.message}`);
  }

  const messages = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let entry;
    try {
      entry = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (entry.type !== "message" || !entry.message) continue;
    messages.push(entry.message);
  }

  return { sessionId, messages };
}

function resolveGatewaySessionKey(sessionId) {
  const normalized = String(sessionId ?? "").trim();
  if (!normalized) {
    return DEFAULT_GATEWAY_SESSION_KEY;
  }
  if (normalized.includes(":")) {
    return normalized;
  }
  if (normalized === "main" || normalized === "default" || normalized.startsWith("yc-demo")) {
    return DEFAULT_GATEWAY_SESSION_KEY;
  }
  return `agent:dev:${normalized}`;
}

async function fetchGatewayHistory(sessionKey) {
  const params = JSON.stringify({
    sessionKey,
    limit: gatewayHistoryLimit(),
  });

  // Use --dev flag to let the CLI authenticate via its own config (device token).
  // Passing --url + --token overrides trigger "requires explicit credentials" errors
  // because the CLI then skips its paired device token.
  const args = [
    "--dev",
    "gateway",
    "call",
    "chat.history",
    "--json",
    "--params",
    params,
  ];

  const { stdout, stderr } = await execFileAsync("openclaw", args, {
    timeout: 10_000,
    maxBuffer: 8 * 1024 * 1024,
  });

  const output = String(stdout ?? "").trim();
  if (!output) {
    throw new Error("Empty response from openclaw gateway.");
  }

  let payload;
  try {
    payload = JSON.parse(output);
  } catch (error) {
    const detail = stderr ? ` stderr=${String(stderr).trim()}` : "";
    throw new Error(
      `Invalid JSON from openclaw gateway call: ${
        error instanceof Error ? error.message : "unknown parse error"
      }.${detail}`
    );
  }

  if (!payload || typeof payload !== "object") {
    throw new Error("Gateway chat.history payload is not an object.");
  }

  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  const sessionId =
    typeof payload.sessionId === "string" && payload.sessionId.trim().length > 0
      ? payload.sessionId
      : undefined;

  return { sessionId, messages };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);

  if (req.method === "GET" && url.pathname === "/health") {
    return json(res, 200, {
      ok: true,
      service: "openclaw-bridge-hardcoded",
      authRequired: REQUIRE_AUTH,
      mode: BRIDGE_MODE,
      sessionCount: sessionOverrides.size,
      bridgePort: BRIDGE_PORT,
      gatewayWsUrl: GATEWAY_WS_URL,
      defaultGatewaySessionKey: DEFAULT_GATEWAY_SESSION_KEY,
    });
  }

  if (req.method === "GET" && url.pathname === "/sessions") {
    if (!isAuthorized(req)) {
      return json(res, 401, {
        error: "Unauthorized",
        hint: "Provide Authorization: Bearer <OPENCLAW_BRIDGE_TOKEN>",
      });
    }
    try {
      const entries = await readdir(OPENCLAW_SESSIONS_DIR);
      const sessions = entries
        .filter((name) => name.endsWith(".jsonl"))
        .map((name) => name.slice(0, -6));
      return json(res, 200, { sessions });
    } catch (error) {
      if (error.code === "ENOENT") {
        return json(res, 200, { sessions: [], error: "sessions dir not found" });
      }
      if (error.code === "EACCES") {
        return json(res, 502, { error: "Permission denied reading sessions dir" });
      }
      return json(res, 502, {
        error: "Failed to list sessions",
        detail: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  const sessionMatch = url.pathname.match(/^\/sessions\/([^/]+)\/events$/);
  if (!sessionMatch) {
    return json(res, 404, {
      error: "Not found",
      hint: "Use GET /health, GET /sessions, or GET/POST /sessions/:sessionId/events",
    });
  }

  if (!isAuthorized(req)) {
    return json(res, 401, {
      error: "Unauthorized",
      hint: "Provide Authorization: Bearer <OPENCLAW_BRIDGE_TOKEN>",
    });
  }

  const sessionId = decodeURIComponent(sessionMatch[1]);

  if (req.method === "GET") {
    const overrideEvents = sessionOverrides.get(sessionId);
    if (Array.isArray(overrideEvents)) {
      return json(res, 200, {
        sessionId,
        source: "override",
        events: overrideEvents,
      });
    }


    if (BRIDGE_MODE === "local") {
      try {
        const history = await fetchLocalSessionHistory(sessionId);
        const events = gatewayMessagesToEvents(sessionId, history.messages);
        return json(res, 200, {
          sessionId,
          source: "local",
          sessionsDir: OPENCLAW_SESSIONS_DIR,
          messageCount: history.messages.length,
          events,
        });
      } catch (error) {
        return json(res, 502, {
          error: "Local session read failed",
          detail: error instanceof Error ? error.message : "Unknown local read error",
        });
      }
    }

    const gatewaySessionKey = resolveGatewaySessionKey(sessionId);
    try {
      const history = await fetchGatewayHistory(gatewaySessionKey);
      const events = gatewayMessagesToEvents(gatewaySessionKey, history.messages);
      return json(res, 200, {
        sessionId,
        source: "gateway",
        gatewaySessionKey,
        gatewaySessionId: history.sessionId,
        messageCount: history.messages.length,
        events,
      });
    } catch (error) {
      return json(res, 502, {
        error: "Gateway fetch failed",
        detail: error instanceof Error ? error.message : "Unknown gateway error",
      });
    }

    /* istanbul ignore next */
    return json(res, 200, {
      sessionId,
      source: "unknown",
      events: [],
    });
  }

  if (req.method === "POST") {
    try {
      const body = await readJson(req);
      if (body.reset === true) {
        sessionOverrides.set(sessionId, []);
        return json(res, 200, {
          ok: true,
          sessionId,
          eventCount: 0,
          reset: true,
        });
      }

      const existing = Array.isArray(sessionOverrides.get(sessionId))
        ? [...sessionOverrides.get(sessionId)]
        : [];
      const incoming = Array.isArray(body.events)
        ? body.events
        : body.event
          ? [body.event]
          : [];

      if (incoming.length === 0) {
        return json(res, 400, {
          error: "No events to append",
          hint: "Provide { event: {...} } or { events: [...] }",
        });
      }

      for (const event of incoming) {
        if (!event || typeof event !== "object") {
          continue;
        }
        existing.push(normalizeSessionOverrideEvent(event, sessionId));
      }

      sessionOverrides.set(sessionId, existing);
      return json(res, 200, {
        ok: true,
        sessionId,
        eventCount: existing.length,
      });
    } catch (error) {
      const status = error?.statusCode === 413 ? 413 : 400;
      return json(res, status, {
        error: status === 413 ? "Payload too large" : "Invalid JSON payload",
        detail: error instanceof Error ? error.message : "Unknown parse error",
      });
    }
  }

  return json(res, 405, {
    error: "Method not allowed",
    allow: ["GET", "POST"],
  });
});

server.listen(BRIDGE_PORT, "127.0.0.1", () => {
  const mode = REQUIRE_AUTH ? "auth required" : "auth disabled";
  console.log(
    `[openclaw-bridge-hardcoded] listening on http://127.0.0.1:${BRIDGE_PORT} (${mode})`
  );
  console.log(
    `[openclaw-bridge-hardcoded] mode=${BRIDGE_MODE} gateway=${GATEWAY_WS_URL} session=${DEFAULT_GATEWAY_SESSION_KEY}`
  );
  if (REQUIRE_AUTH) {
    const tokenFingerprint = createHash("sha256").update(BRIDGE_TOKEN).digest("hex").slice(0, 12);
    console.log(`[openclaw-bridge-hardcoded] auth token fingerprint=${tokenFingerprint}`);
  }
});
