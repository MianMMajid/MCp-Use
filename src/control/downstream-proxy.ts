import { randomUUID } from "node:crypto";

export interface DownstreamAppConfig {
  id: string;
  name: string;
  description?: string;
  mcpUrl: string;
  enabled: boolean;
  timeoutMs: number;
  apiKey?: string;
  authHeader: string;
  authScheme: "raw" | "bearer";
  headers?: Record<string, string>;
  toolAllowlist?: string[];
}

export interface DownstreamAppInfo {
  id: string;
  name: string;
  description?: string;
  mcpUrl: string;
  enabled: boolean;
  timeoutMs: number;
  authHeader: string;
  authScheme: "raw" | "bearer";
  hasApiKey: boolean;
  headerKeys?: string[];
  toolAllowlist?: string[];
}

export interface DownstreamToolInfo {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

export interface DownstreamCallResult {
  appId: string;
  toolName: string;
  requestId: string;
  durationMs: number;
  responseStatus: number;
  result: unknown;
  textPreview: string;
}

export interface DownstreamJsonRpcForwardResult {
  durationMs: number;
  responseStatus: number;
  payload: Record<string, unknown>;
}

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_AUTH_HEADER = "x-api-key";

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const normalized = value
    .map((entry) => asString(entry))
    .filter((entry): entry is string => Boolean(entry));
  return normalized.length > 0 ? normalized : undefined;
}

function asStringRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const normalized: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw !== "string") {
      continue;
    }
    const k = key.trim();
    const v = raw.trim();
    if (!k || !v) {
      continue;
    }
    normalized[k] = v;
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function normalizeAuthScheme(
  rawScheme: unknown,
  authHeader: string
): "raw" | "bearer" {
  const normalized = String(rawScheme ?? "").trim().toLowerCase();
  if (normalized === "bearer") {
    return "bearer";
  }
  if (normalized === "raw") {
    return "raw";
  }
  return authHeader.toLowerCase() === "authorization" ? "bearer" : "raw";
}

function safePreview(value: unknown, maxChars = 1400): string {
  if (typeof value === "string") {
    return value.length <= maxChars ? value : `${value.slice(0, maxChars - 3)}...`;
  }
  try {
    const json = JSON.stringify(value);
    if (!json) {
      return "";
    }
    return json.length <= maxChars ? json : `${json.slice(0, maxChars - 3)}...`;
  } catch {
    return String(value ?? "");
  }
}

function extractTextFromMcpResult(result: unknown): string {
  if (typeof result === "string") {
    return result;
  }
  if (!result || typeof result !== "object") {
    return safePreview(result);
  }

  const raw = result as Record<string, unknown>;
  if (typeof raw.text === "string" && raw.text.trim()) {
    return raw.text;
  }

  const content = Array.isArray(raw.content) ? raw.content : [];
  const contentText = content
    .map((entry) => {
      if (typeof entry === "string") {
        return entry;
      }
      if (!entry || typeof entry !== "object") {
        return "";
      }
      const block = entry as Record<string, unknown>;
      if (typeof block.text === "string") {
        return block.text;
      }
      if (typeof block.content === "string") {
        return block.content;
      }
      if (typeof block.arguments === "string") {
        return block.arguments;
      }
      return "";
    })
    .filter((value) => value.trim().length > 0)
    .join("\n\n")
    .trim();
  if (contentText) {
    return contentText;
  }

  return safePreview(result);
}

function buildAuthHeaderValue(config: DownstreamAppConfig): string | undefined {
  if (!config.apiKey) {
    return undefined;
  }
  if (config.authScheme === "bearer") {
    return `Bearer ${config.apiKey}`;
  }
  return config.apiKey;
}

function normalizeMcpUrl(rawUrl: string): string {
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`Downstream MCP URL must use http/https: ${rawUrl}`);
  }
  return parsed.toString();
}

function parseDownstreamEntry(entry: unknown, index: number): DownstreamAppConfig {
  const raw = asObject(entry);
  const id = asString(raw.id);
  const mcpUrlRaw = asString(raw.mcpUrl) ?? asString(raw.url);
  if (!id) {
    throw new Error(`MAPLE_DOWNSTREAM_APPS[${index}] is missing required field "id".`);
  }
  if (!mcpUrlRaw) {
    throw new Error(`MAPLE_DOWNSTREAM_APPS[${index}] is missing required field "mcpUrl".`);
  }
  const authHeader = asString(raw.authHeader) ?? DEFAULT_AUTH_HEADER;
  return {
    id,
    name: asString(raw.name) ?? id,
    description: asString(raw.description),
    mcpUrl: normalizeMcpUrl(mcpUrlRaw),
    enabled: asBoolean(raw.enabled, true),
    timeoutMs: Math.max(1000, Math.trunc(asNumber(raw.timeoutMs, DEFAULT_TIMEOUT_MS))),
    apiKey: asString(raw.apiKey),
    authHeader,
    authScheme: normalizeAuthScheme(raw.authScheme, authHeader),
    headers: asStringRecord(raw.headers),
    toolAllowlist: asStringArray(raw.toolAllowlist),
  };
}

export function loadDownstreamAppsFromEnv(
  env: NodeJS.ProcessEnv = process.env
): Map<string, DownstreamAppConfig> {
  const raw = env.MAPLE_DOWNSTREAM_APPS;
  if (!raw || raw.trim().length === 0) {
    return new Map();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Invalid MAPLE_DOWNSTREAM_APPS JSON: ${error instanceof Error ? error.message : "Unknown parse error"}`
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error("MAPLE_DOWNSTREAM_APPS must be a JSON array.");
  }

  const registry = new Map<string, DownstreamAppConfig>();
  for (let index = 0; index < parsed.length; index += 1) {
    const config = parseDownstreamEntry(parsed[index], index);
    if (registry.has(config.id)) {
      throw new Error(`Duplicate downstream app id in MAPLE_DOWNSTREAM_APPS: "${config.id}"`);
    }
    registry.set(config.id, config);
  }

  return registry;
}

export function listDownstreamApps(
  registry: Map<string, DownstreamAppConfig>,
  includeDisabled = false
): DownstreamAppInfo[] {
  return [...registry.values()]
    .filter((app) => includeDisabled || app.enabled)
    .map((app) => ({
      id: app.id,
      name: app.name,
      description: app.description,
      mcpUrl: app.mcpUrl,
      enabled: app.enabled,
      timeoutMs: app.timeoutMs,
      authHeader: app.authHeader,
      authScheme: app.authScheme,
      hasApiKey: Boolean(app.apiKey),
      headerKeys: app.headers ? Object.keys(app.headers) : [],
      toolAllowlist: app.toolAllowlist,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function ensureToolAllowed(app: DownstreamAppConfig, toolName: string): void {
  const allowlist = app.toolAllowlist;
  if (!allowlist || allowlist.length === 0) {
    return;
  }
  if (!allowlist.includes(toolName)) {
    throw new Error(
      `Tool "${toolName}" is not allowlisted for downstream app "${app.id}".`
    );
  }
}

async function mcpJsonRpcRequest(
  app: DownstreamAppConfig,
  method: string,
  params: Record<string, unknown>
): Promise<{
  requestId: string;
  durationMs: number;
  responseStatus: number;
  result: unknown;
}> {
  const requestId = randomUUID();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), app.timeoutMs);
  const startedAt = Date.now();

  const authValue = buildAuthHeaderValue(app);
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (app.headers) {
    for (const [key, value] of Object.entries(app.headers)) {
      headers[key] = value;
    }
  }
  if (authValue) {
    headers[app.authHeader] = authValue;
  }

  try {
    const response = await fetch(app.mcpUrl, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: requestId,
        method,
        params,
      }),
    });
    const durationMs = Date.now() - startedAt;
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        `Downstream ${app.id} HTTP ${response.status}: ${safePreview(payload, 600)}`
      );
    }

    const body = asObject(payload);
    if (body.error) {
      throw new Error(`Downstream ${app.id} RPC error: ${safePreview(body.error, 600)}`);
    }

    return {
      requestId,
      durationMs,
      responseStatus: response.status,
      result: body.result,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function forwardJsonRpcToDownstream(
  app: DownstreamAppConfig,
  payload: Record<string, unknown>
): Promise<DownstreamJsonRpcForwardResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), app.timeoutMs);
  const startedAt = Date.now();

  const authValue = buildAuthHeaderValue(app);
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (app.headers) {
    for (const [key, value] of Object.entries(app.headers)) {
      headers[key] = value;
    }
  }
  if (authValue) {
    headers[app.authHeader] = authValue;
  }

  try {
    const response = await fetch(app.mcpUrl, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify(payload),
    });
    const durationMs = Date.now() - startedAt;
    const parsed = await response.json().catch(() => undefined);
    const normalizedPayload: Record<string, unknown> =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {
            jsonrpc: "2.0",
            id: payload.id ?? null,
            error: {
              code: -32603,
              message: `Downstream ${app.id} returned non-JSON-RPC payload.`,
            },
          };

    return {
      durationMs,
      responseStatus: response.status,
      payload: normalizedPayload,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function listToolsFromDownstream(
  app: DownstreamAppConfig
): Promise<{ tools: DownstreamToolInfo[]; requestId: string; durationMs: number }> {
  const response = await mcpJsonRpcRequest(app, "tools/list", {});
  const rawResult = asObject(response.result);
  const toolsRaw = Array.isArray(rawResult.tools) ? rawResult.tools : [];
  const tools: DownstreamToolInfo[] = [];
  for (const entry of toolsRaw) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const tool = entry as Record<string, unknown>;
    const name = asString(tool.name);
    if (!name) {
      continue;
    }
    tools.push({
      name,
      description: asString(tool.description),
      inputSchema: tool.inputSchema,
    });
  }

  return {
    tools,
    requestId: response.requestId,
    durationMs: response.durationMs,
  };
}

export async function dispatchToolToDownstream(
  app: DownstreamAppConfig,
  toolName: string,
  toolArgs: Record<string, unknown>
): Promise<DownstreamCallResult> {
  ensureToolAllowed(app, toolName);
  const response = await mcpJsonRpcRequest(app, "tools/call", {
    name: toolName,
    arguments: toolArgs,
  });

  return {
    appId: app.id,
    toolName,
    requestId: response.requestId,
    durationMs: response.durationMs,
    responseStatus: response.responseStatus,
    result: response.result,
    textPreview: extractTextFromMcpResult(response.result),
  };
}
