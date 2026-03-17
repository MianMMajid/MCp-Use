/**
 * Gateway-Native Agent Runtime
 *
 * Calls LLM APIs directly (OpenAI/Anthropic) with MCP tool support.
 * Used for agents with equipped MCP tools. Falls back to OpenClaw for plain agents.
 */

import { randomUUID } from "node:crypto";
import { asString } from "../helpers.js";
import { mapleLog } from "../logging.js";
import { database } from "../state.js";
import { downstreamAppRegistry } from "../config.js";

// ── Config ──────────────────────────────────────────

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const DEFAULT_PROVIDER = (process.env.MAPLE_FIREWALL_CHAT_PRIMARY || "openai").toLowerCase();
const OPENAI_MODEL = process.env.MAPLE_FIREWALL_CHAT_OPENAI_MODEL || "gpt-4o";
const ANTHROPIC_MODEL = process.env.MAPLE_FIREWALL_CHAT_ANTHROPIC_MODEL || "claude-sonnet-4-6";
const MAX_TOOL_ROUNDS = 10;
const DEFAULT_TIMEOUT_MS = 120_000;

// ── Conversation store (in-memory, per session) ─────

const conversationStore = new Map();
const CONVERSATION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

function getConversation(sessionId) {
  const conv = conversationStore.get(sessionId);
  if (conv && Date.now() - conv.updatedAt < CONVERSATION_TTL_MS) {
    conv.updatedAt = Date.now();
    return conv;
  }
  const fresh = { messages: [], updatedAt: Date.now() };
  conversationStore.set(sessionId, fresh);
  return fresh;
}

// Evict stale conversations periodically
setInterval(() => {
  const now = Date.now();
  for (const [id, conv] of conversationStore) {
    if (now - conv.updatedAt > CONVERSATION_TTL_MS) conversationStore.delete(id);
  }
}, 5 * 60_000);

// ── Direct MCP HTTP calls (bypasses cyber-proxy) ────

let _mcpRequestId = 0;

function buildMcpHeaders(app) {
  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
  };
  if (app.headers) {
    for (const [k, v] of Object.entries(app.headers)) {
      if (k && v) headers[k] = v;
    }
  }
  if (app.apiKey && !app.headers?.Authorization && !app.headers?.authorization) {
    const scheme = app.authScheme === "raw" ? "" : "Bearer ";
    headers[app.authHeader || "Authorization"] = `${scheme}${app.apiKey}`;
  }
  return headers;
}

// MCP session tracking per app
const _mcpSessions = new Map();

async function initMcpSession(app) {
  const cached = _mcpSessions.get(app.id);
  if (cached && Date.now() - cached.ts < 5 * 60_000) return cached.sessionId;

  // Send initialize request to get a session ID
  const id = ++_mcpRequestId;
  const body = {
    jsonrpc: "2.0",
    id,
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "maple-gateway", version: "1.0.0" },
    },
  };

  const res = await fetch(app.mcpUrl, {
    method: "POST",
    headers: buildMcpHeaders(app),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(app.timeoutMs || 15_000),
  });

  // Extract session ID from response header
  const sessionId = res.headers.get("mcp-session-id") || "";
  if (sessionId) {
    _mcpSessions.set(app.id, { sessionId, ts: Date.now() });
  }

  // Read body to complete the request
  await res.text().catch(() => {});

  // Send initialized notification
  if (sessionId) {
    await fetch(app.mcpUrl, {
      method: "POST",
      headers: { ...buildMcpHeaders(app), "Mcp-Session-Id": sessionId },
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => {});
  }

  return sessionId;
}

async function mcpRequest(app, method, params = {}) {
  const id = ++_mcpRequestId;
  const body = { jsonrpc: "2.0", id, method, params };
  const url = app.mcpUrl;
  const timeoutMs = app.timeoutMs || 15_000;

  // Get or create MCP session
  const sessionId = await initMcpSession(app);
  const headers = buildMcpHeaders(app);
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  // Update session ID if server sends a new one
  const newSessionId = res.headers.get("mcp-session-id");
  if (newSessionId && newSessionId !== sessionId) {
    _mcpSessions.set(app.id, { sessionId: newSessionId, ts: Date.now() });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`MCP ${method} to ${url} returned ${res.status}: ${text.slice(0, 200)}`);
  }

  const contentType = res.headers.get("content-type") || "";

  // Handle SSE (Streamable HTTP) responses
  if (contentType.includes("text/event-stream")) {
    const text = await res.text();
    // Parse SSE: extract JSON data lines
    const lines = text.split("\n");
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.id === id && data.result) return data.result;
          if (data.result) return data.result;
          if (data.error) throw new Error(`MCP ${method} error: ${data.error.message || JSON.stringify(data.error)}`);
        } catch (e) {
          if (e.message.includes("MCP")) throw e;
          // Not valid JSON, skip
        }
      }
    }
    // Fallback: try to find any result in SSE data
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try { return JSON.parse(line.slice(6)).result || JSON.parse(line.slice(6)); } catch {}
      }
    }
    throw new Error(`MCP ${method}: No valid JSON-RPC result in SSE stream`);
  }

  // Handle regular JSON responses
  const data = await res.json();
  if (data.error) {
    throw new Error(`MCP ${method} error: ${data.error.message || JSON.stringify(data.error)}`);
  }
  return data.result || {};
}

// Tool discovery cache (in-memory, per app)
const _toolCache = new Map();
const TOOL_CACHE_TTL = 60_000;

async function listMcpTools(app) {
  const cached = _toolCache.get(app.id);
  if (cached && cached.tools.length > 0 && Date.now() - cached.ts < TOOL_CACHE_TTL) return cached.tools;

  const result = await mcpRequest(app, "tools/list");
  const tools = Array.isArray(result.tools) ? result.tools : [];
  if (tools.length > 0) {
    _toolCache.set(app.id, { tools, ts: Date.now() });
  }
  return tools;
}

async function callMcpTool(app, toolName, args) {
  const result = await mcpRequest(app, "tools/call", { name: toolName, arguments: args });
  // Extract text from MCP result content blocks
  if (Array.isArray(result.content)) {
    return result.content
      .map((b) => (b.type === "text" ? b.text : JSON.stringify(b)))
      .join("\n");
  }
  return typeof result === "string" ? result : JSON.stringify(result);
}

// ── Tool resolution ─────────────────────────────────

async function resolveToolsForAgent(equippedToolIds) {
  const tools = [];
  const toolAppMap = new Map();

  for (const toolId of equippedToolIds) {
    const appId = `mcp-registry:${toolId}`;
    const app = downstreamAppRegistry.get(appId) || downstreamAppRegistry.get(toolId);
    if (!app) {
      mapleLog("warn", "native_agent.tool_app_not_found", { toolId, appId });
      continue;
    }

    try {
      const mcpTools = await listMcpTools(app);
      for (const tool of mcpTools) {
        const name = asString(tool.name);
        if (!name) continue;
        const qualifiedName = `${toolId}::${name}`;
        tools.push({
          name: qualifiedName,
          description: tool.description || "",
          inputSchema: tool.inputSchema || { type: "object", properties: {} },
          _app: app,
          _originalName: name,
        });
        toolAppMap.set(qualifiedName, { app, originalName: name });
      }
    } catch (err) {
      mapleLog("warn", "native_agent.tool_discovery_failed", {
        toolId,
        appId: app.id,
        mcpUrl: app.mcpUrl,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { tools, toolAppMap };
}

/**
 * Convert MCP tools to OpenAI function calling format.
 */
function toOpenAiFunctions(tools) {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name.replace(/[^a-zA-Z0-9_-]/g, "_"),
      description: t.description,
      parameters: t.inputSchema || { type: "object", properties: {} },
    },
    _qualifiedName: t.name,
  }));
}

/**
 * Convert MCP tools to Anthropic tool format.
 */
function toAnthropicTools(tools) {
  return tools.map((t) => ({
    name: t.name.replace(/[^a-zA-Z0-9_-]/g, "_"),
    description: t.description,
    input_schema: t.inputSchema || { type: "object", properties: {} },
    _qualifiedName: t.name,
  }));
}

// ── LLM calling ─────────────────────────────────────

async function callOpenAi(messages, tools, timeoutMs) {
  const body = {
    model: OPENAI_MODEL,
    messages,
    max_tokens: 4096,
  };
  if (tools.length > 0) {
    body.tools = toOpenAiFunctions(tools);
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`OpenAI API ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const choice = data.choices?.[0];
  return {
    content: choice?.message?.content || "",
    toolCalls: choice?.message?.tool_calls || [],
    finishReason: choice?.finish_reason || "stop",
    usage: data.usage,
    raw: choice?.message,
  };
}

async function callAnthropic(messages, systemPrompt, tools, timeoutMs) {
  const body = {
    model: ANTHROPIC_MODEL,
    max_tokens: 4096,
    messages,
  };
  if (systemPrompt) body.system = systemPrompt;
  if (tools.length > 0) body.tools = toAnthropicTools(tools);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Anthropic API ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const textBlocks = (data.content || []).filter((b) => b.type === "text");
  const toolBlocks = (data.content || []).filter((b) => b.type === "tool_use");
  return {
    content: textBlocks.map((b) => b.text).join("\n"),
    toolCalls: toolBlocks.map((b) => ({
      id: b.id,
      type: "function",
      function: { name: b.name, arguments: JSON.stringify(b.input) },
    })),
    finishReason: data.stop_reason || "end_turn",
    usage: data.usage,
    raw: data,
  };
}

// ── Tool execution ──────────────────────────────────

async function executeToolCall(toolCall, tools, toolAppMap) {
  // Resolve the function name back to qualified name
  const sanitizedName = toolCall.function?.name || toolCall.name;
  const toolDef = tools.find(
    (t) => t.name.replace(/[^a-zA-Z0-9_-]/g, "_") === sanitizedName
  );
  if (!toolDef) {
    return { error: `Unknown tool: ${sanitizedName}` };
  }

  const mapping = toolAppMap.get(toolDef.name);
  if (!mapping) {
    return { error: `No MCP server found for tool: ${toolDef.name}` };
  }

  let args;
  try {
    args =
      typeof toolCall.function?.arguments === "string"
        ? JSON.parse(toolCall.function.arguments)
        : toolCall.function?.arguments || toolCall.input || {};
  } catch {
    args = {};
  }

  try {
    const start = Date.now();
    const content = await callMcpTool(mapping.app, mapping.originalName, args);
    mapleLog("info", "native_agent.tool_call_ok", {
      tool: toolDef.name,
      appId: mapping.app.id,
      durationMs: Date.now() - start,
    });
    return { content };
  } catch (err) {
    mapleLog("warn", "native_agent.tool_call_failed", {
      tool: toolDef.name,
      error: err instanceof Error ? err.message : String(err),
    });
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Main entry point ────────────────────────────────

/**
 * Run a native agent turn with MCP tool support.
 *
 * @param {object} options
 * @param {string} options.message - User message
 * @param {string} [options.sessionId] - Session for conversation continuity
 * @param {string} [options.agentId] - Agent ID
 * @param {string[]} [options.tools] - Equipped tool IDs
 * @param {string} [options.systemPrompt] - Optional system prompt
 * @param {string} [options.parentRunId] - Parent run for chaining
 * @param {number} [options.timeoutSeconds] - Timeout
 * @returns {{ reply, runId, sessionId, toolCalls, usage }}
 */
export async function runNativeAgentTurn(options = {}) {
  const message = asString(options.message);
  if (!message) throw new Error("Missing agent message.");

  const runId = randomUUID();
  const sessionId = asString(options.sessionId) || `native-${runId}`;
  const equippedToolIds = Array.isArray(options.tools) ? options.tools : [];
  const timeoutMs = (options.timeoutSeconds || 120) * 1000;
  const provider = DEFAULT_PROVIDER;

  mapleLog("info", "native_agent.turn_begin", {
    runId,
    sessionId,
    provider,
    toolCount: equippedToolIds.length,
  });

  // Discover MCP tools from equipped downstream apps
  const { tools, toolAppMap } = await resolveToolsForAgent(equippedToolIds);

  mapleLog("info", "native_agent.tools_resolved", {
    runId,
    equipped: equippedToolIds.length,
    mcpToolsDiscovered: tools.length,
    toolNames: tools.map((t) => t.name),
  });

  // Build system prompt
  const agentName = options.agentName || "Assistant";
  const agentDesc = options.agentDescription || "";
  const systemPrompt = options.systemPrompt || [
    `You are ${agentName}.`,
    agentDesc ? agentDesc : "",
    tools.length > 0
      ? `You have ${tools.length} tools available. Use them when the user's request requires external data or actions.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  // Get or create conversation
  const conv = getConversation(sessionId);

  // Add user message
  conv.messages.push({ role: "user", content: message });

  // Tool call loop
  let allToolCalls = [];
  let totalUsage = { input: 0, output: 0 };

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let llmResult;

    if (provider === "anthropic" && ANTHROPIC_API_KEY) {
      // Anthropic: system prompt is separate
      const msgs = conv.messages.filter((m) => m.role !== "system");
      llmResult = await callAnthropic(msgs, systemPrompt, tools, timeoutMs);
    } else {
      // OpenAI: system prompt as first message
      const msgs = [{ role: "system", content: systemPrompt }, ...conv.messages];
      llmResult = await callOpenAi(msgs, tools, timeoutMs);
    }

    if (llmResult.usage) {
      totalUsage.input += llmResult.usage.input_tokens || llmResult.usage.prompt_tokens || 0;
      totalUsage.output += llmResult.usage.output_tokens || llmResult.usage.completion_tokens || 0;
    }

    // No tool calls — we have the final response
    if (!llmResult.toolCalls || llmResult.toolCalls.length === 0) {
      const reply = llmResult.content || "";
      conv.messages.push({ role: "assistant", content: reply });

      mapleLog("info", "native_agent.turn_complete", {
        runId,
        sessionId,
        rounds: round + 1,
        toolCallsTotal: allToolCalls.length,
        replyChars: reply.length,
      });

      return {
        reply,
        runId,
        sessionId,
        toolCalls: allToolCalls,
        usage: totalUsage,
        provider,
        model: provider === "anthropic" ? ANTHROPIC_MODEL : OPENAI_MODEL,
      };
    }

    // Process tool calls
    // Add assistant message with tool calls to conversation
    if (provider === "anthropic") {
      conv.messages.push({
        role: "assistant",
        content: [
          ...(llmResult.content ? [{ type: "text", text: llmResult.content }] : []),
          ...llmResult.toolCalls.map((tc) => ({
            type: "tool_use",
            id: tc.id,
            name: tc.function?.name || tc.name,
            input: JSON.parse(tc.function?.arguments || "{}"),
          })),
        ],
      });
    } else {
      conv.messages.push({
        role: "assistant",
        content: llmResult.content || null,
        tool_calls: llmResult.toolCalls,
      });
    }

    // Execute each tool call
    for (const tc of llmResult.toolCalls) {
      const result = await executeToolCall(tc, tools, toolAppMap);
      allToolCalls.push({
        name: tc.function?.name || tc.name,
        args: tc.function?.arguments,
        result: result.content || result.error,
        error: result.error ? true : false,
      });

      // Add tool result to conversation
      if (provider === "anthropic") {
        conv.messages.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: tc.id,
              content: result.error || result.content || "",
              is_error: !!result.error,
            },
          ],
        });
      } else {
        conv.messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: result.error || result.content || "",
        });
      }
    }
  }

  // Exceeded max rounds
  const fallback = "I've reached the maximum number of tool call rounds. Here's what I found so far.";
  conv.messages.push({ role: "assistant", content: fallback });

  return {
    reply: fallback,
    runId,
    sessionId,
    toolCalls: allToolCalls,
    usage: totalUsage,
    provider,
    model: provider === "anthropic" ? ANTHROPIC_MODEL : OPENAI_MODEL,
  };
}

/**
 * Check if an agent should use the native runtime.
 * Default: true (native handles everything — LLM calls, MCP tools, works on Railway).
 * Only returns false if the agent explicitly opts into OpenClaw (local dev power users).
 */
export function agentRequiresNativeRuntime(agent) {
  if (!agent) return true; // No agent record → use native (safer default)
  const config = agent.config || {};
  // Explicit OpenClaw opt-in: agent has a configured OpenClaw agent ID
  if (config.useOpenClaw === true) return false;
  if (config.openclawAgentId || config.targetAgentId || config.runtimeAgentId) return false;
  return true;
}

/**
 * Bootstrap: re-register MCP registry skills from Postgres as downstream apps.
 * Called once at startup so installed skills survive gateway restarts.
 */
export async function bootstrapMcpDownstreamApps() {
  try {
    if (!database?.pool) return;

    const result = await database.pool.query(
      `SELECT tool_id, name, description, schema_json FROM gateway_tool_registry WHERE source = 'mcp-registry'`
    );

    let restored = 0;
    for (const row of result.rows) {
      const toolId = row.tool_id;
      let schema;
      try {
        schema = typeof row.schema_json === "string" ? JSON.parse(row.schema_json) : row.schema_json;
      } catch {
        continue;
      }

      const mcpMeta = schema?._mcp;
      if (!mcpMeta) continue;

      const remoteUrl = mcpMeta.remotes?.[0]?.url;
      if (!remoteUrl) continue;

      const appId = `mcp-registry:${toolId}`;
      if (downstreamAppRegistry.has(appId)) continue;

      // Build auth headers from stored API key
      const appHeaders = {};
      if (mcpMeta.apiKey) {
        const headerName = mcpMeta.authHeaderName || "Authorization";
        if (headerName.toLowerCase() === "authorization") {
          appHeaders[headerName] = `Bearer ${mcpMeta.apiKey}`;
        } else {
          appHeaders[headerName] = mcpMeta.apiKey;
        }
      }

      const app = {
        id: appId,
        name: row.name || toolId,
        description: `[mcp-registry] ${mcpMeta.serverName || toolId}`,
        mcpUrl: remoteUrl,
        enabled: true,
        timeoutMs: 15_000,
        authScheme: "raw",
        headers: Object.keys(appHeaders).length > 0 ? appHeaders : undefined,
      };

      downstreamAppRegistry.set(appId, app);
      restored++;
    }

    if (restored > 0) {
      mapleLog("info", "native_agent.bootstrap_complete", { restored, total: result.rows.length });
    }
  } catch (err) {
    mapleLog("warn", "native_agent.bootstrap_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
