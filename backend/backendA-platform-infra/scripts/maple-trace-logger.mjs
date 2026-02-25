#!/usr/bin/env node

import { randomUUID } from "node:crypto";

const DEFAULT_TIMEOUT_MS = 10_000;

function asNonEmptyString(value) {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeBaseUrl(raw) {
  const input = asNonEmptyString(raw) ?? "http://localhost:3000";
  return input.endsWith("/") ? input.slice(0, -1) : input;
}

async function parseResponseBody(response) {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function errorDetail(body) {
  if (!body || typeof body !== "object") {
    return String(body ?? "");
  }
  if (typeof body.error === "string") {
    return body.error;
  }
  if (typeof body.message === "string") {
    return body.message;
  }
  return JSON.stringify(body);
}

function delay(ms) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MapleTraceLogger {
  constructor(options = {}) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? process.env.MAPLE_DEMO_URL);
    this.apiKey = asNonEmptyString(options.apiKey ?? process.env.MAPLE_API_KEY);
    this.source = asNonEmptyString(options.source) ?? "openclaw";
    this.sessionId =
      asNonEmptyString(options.sessionId ?? process.env.MAPLE_TRACE_SESSION_ID) ?? "maple-live";
    this.traceId = asNonEmptyString(options.traceId);
    this.timeoutMs = Number.isFinite(options.timeoutMs)
      ? Math.max(1_000, Math.min(60_000, Number(options.timeoutMs)))
      : DEFAULT_TIMEOUT_MS;
    this.eventCounter = 0;
  }

  async requestJson(path, { method = "GET", body } = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const headers = {};
    if (this.apiKey) {
      headers["x-api-key"] = this.apiKey;
    }
    if (body !== undefined) {
      headers["content-type"] = "application/json";
    }

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      const parsed = await parseResponseBody(response);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${method} ${path}: ${errorDetail(parsed)}`);
      }
      return parsed;
    } finally {
      clearTimeout(timeout);
    }
  }

  nextEventId(prefix = "evt") {
    this.eventCounter += 1;
    const now = Date.now();
    return `${prefix}-${this.sessionId}-${now}-${this.eventCounter}-${randomUUID().slice(0, 8)}`;
  }

  normalizeEvent(action = {}) {
    const actor = asNonEmptyString(action.actor) ?? "agent";
    const type = asNonEmptyString(action.type) ?? "prompt";
    const prompt =
      asNonEmptyString(action.prompt) ??
      asNonEmptyString(action.message) ??
      asNonEmptyString(action.input);
    const message = asNonEmptyString(action.message) ?? prompt;
    const output =
      asNonEmptyString(action.output) ??
      asNonEmptyString(action.result) ??
      asNonEmptyString(action.response);
    const command = asNonEmptyString(action.command) ?? asNonEmptyString(action.shellCommand);
    const url = asNonEmptyString(action.url) ?? asNonEmptyString(action.externalUrl);
    const toolName = asNonEmptyString(action.toolName) ?? asNonEmptyString(action.tool);
    const timestamp = asNonEmptyString(action.timestamp) ?? new Date().toISOString();
    const eventId = asNonEmptyString(action.eventId) ?? this.nextEventId("agent");

    const event = {
      eventId,
      timestamp,
      actor,
      type,
    };
    if (prompt) {
      event.prompt = prompt;
    }
    if (message) {
      event.message = message;
    }
    if (output) {
      event.output = output;
    }
    if (command) {
      event.command = command;
    }
    if (url) {
      event.url = url;
    }
    if (toolName) {
      event.toolName = toolName;
    }
    if (action.toolInput && typeof action.toolInput === "object") {
      event.toolInput = action.toolInput;
    }
    if (action.toolOutput !== undefined) {
      event.toolOutput = action.toolOutput;
    }
    return event;
  }

  async startRun(options = {}) {
    const sessionId = asNonEmptyString(options.sessionId) ?? this.sessionId;
    const source = asNonEmptyString(options.source) ?? this.source;
    const reuseLatest =
      typeof options.reuseLatest === "boolean" ? options.reuseLatest : true;

    const payload = await this.requestJson("/api/demo/start", {
      method: "POST",
      body: {
        sessionId,
        source,
        reuseLatest,
      },
    });

    const traceId = asNonEmptyString(payload.traceId);
    if (!traceId) {
      throw new Error("Maple demo start did not return traceId.");
    }

    this.traceId = traceId;
    this.sessionId = asNonEmptyString(payload.sessionId) ?? sessionId;
    this.source = asNonEmptyString(payload.source) ?? source;
    return payload;
  }

  async ensureRun() {
    if (this.traceId) {
      return this.traceId;
    }
    const payload = await this.startRun({ reuseLatest: true });
    return payload.traceId;
  }

  async logAction(action = {}) {
    await this.ensureRun();
    const event = this.normalizeEvent(action);

    const payload = await this.requestJson("/api/openclaw/events", {
      method: "POST",
      body: {
        traceId: this.traceId,
        sessionId: this.sessionId,
        source: this.source,
        events: [event],
      },
    });

    const traceId = asNonEmptyString(payload.traceId);
    if (traceId) {
      this.traceId = traceId;
    }
    return {
      ...payload,
      eventId: event.eventId,
      event,
    };
  }

  async logWebGet(options = {}) {
    const url = asNonEmptyString(options.url);
    return this.logAction({
      actor: options.actor ?? "agent",
      type: options.type ?? "network",
      toolName: options.toolName ?? "web_get",
      prompt:
        asNonEmptyString(options.prompt) ??
        asNonEmptyString(options.message) ??
        (url ? `GET ${url}` : "web get"),
      message: asNonEmptyString(options.message) ?? (url ? `GET ${url}` : "web get"),
      command: asNonEmptyString(options.command) ?? (url ? `curl ${url}` : undefined),
      url,
      output: asNonEmptyString(options.output),
      toolInput:
        options.toolInput && typeof options.toolInput === "object"
          ? options.toolInput
          : url
            ? { url }
            : undefined,
      toolOutput: options.toolOutput,
      eventId: options.eventId,
    });
  }

  async previewFirewallDecision(action = {}) {
    await this.ensureRun();
    const event = this.normalizeEvent(action);
    return this.requestJson("/api/firewall/decision", {
      method: "POST",
      body: {
        traceId: this.traceId,
        sessionId: this.sessionId,
        enforce: false,
        actor: event.actor,
        type: event.type,
        prompt: event.prompt,
        command: event.command,
        url: event.url,
        toolName: event.toolName,
        toolInput: event.toolInput,
      },
    });
  }

  async fetchTrace() {
    await this.ensureRun();
    const encoded = encodeURIComponent(this.traceId);
    return this.requestJson(`/api/trace?traceId=${encoded}`);
  }

  async logActions(actions = [], options = {}) {
    const pauseMs = Number.isFinite(options.pauseMs)
      ? Math.max(0, Math.trunc(options.pauseMs))
      : 0;
    const results = [];
    for (const action of actions) {
      results.push(await this.logAction(action));
      if (pauseMs > 0) {
        await delay(pauseMs);
      }
    }
    return results;
  }
}

export function createMapleTraceLogger(options = {}) {
  return new MapleTraceLogger(options);
}
