import { randomUUID } from "node:crypto";
import * as grpc from "@grpc/grpc-js";
import { resolve } from "node:path";
import { loadGrpcTlsConfig, loadServiceClientSecure } from "@maple/common";
import { authContextStorage } from "../auth.js";
import { requestContextStorage } from "../logging.js";

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
  annotations?: Record<string, unknown>;
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

interface GatewayRequestContextOverrides {
  requestId?: string;
  sessionId?: string;
  traceId?: string;
  tenantId?: string;
  userId?: string;
  deviceId?: string;
}

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_AUTH_HEADER = "x-api-key";
const PROTO_ROOT = resolve(import.meta.dirname, "../../../../../proto");
const CONTEXT_WALL_ADDRESS = process.env.CONTEXT_WALL_ADDRESS?.trim() || "localhost:9000";
const grpcTlsConfig = loadGrpcTlsConfig();

function loadProtoClient(protoFile: string, servicePath: string, address: string): any {
  return loadServiceClientSecure(
    protoFile,
    servicePath,
    address,
    PROTO_ROOT,
    grpcTlsConfig,
  );
}

function grpcUnary<T>(client: any, method: string, request: any): Promise<T> {
  return new Promise((resolvePromise, rejectPromise) => {
    client[method](request, (err: grpc.ServiceError | null, response: T) => {
      if (err) rejectPromise(err);
      else resolvePromise(response);
    });
  });
}

let contextWallClient: any;

function getContextWallClient(): any {
  if (!contextWallClient) {
    contextWallClient = loadProtoClient(
      "maple/context/v1/context_wall.proto",
      "maple.context.v1.ContextWallService",
      CONTEXT_WALL_ADDRESS,
    );
  }
  return contextWallClient;
}

function buildGatewayRequestContext(
  overrides: GatewayRequestContextOverrides = {},
): Record<string, string> {
  const authContext = authContextStorage.getStore();
  const requestLogContext = requestContextStorage.getStore();
  const derivedTenantId =
    overrides.tenantId ??
    requestLogContext?.tenantId ??
    "default";
  const derivedUserId =
    overrides.userId ??
    authContext?.userId ??
    authContext?.keyFingerprint ??
    "anonymous";
  const derivedDeviceId =
    overrides.deviceId ??
    requestLogContext?.deviceId ??
    "unknown-device";
  return {
    requestId: overrides.requestId ?? requestLogContext?.requestId ?? randomUUID().slice(0, 12),
    sessionId: overrides.sessionId ?? requestLogContext?.sessionId ?? "",
    traceId: overrides.traceId ?? requestLogContext?.traceId ?? "",
    userId: derivedUserId,
    keyFingerprint: authContext?.keyFingerprint ?? "",
    sourceService: "gateway-api",
    tenantId: derivedTenantId,
    deviceId: derivedDeviceId,
  };
}

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
  params: Record<string, unknown>,
  requestContextOverrides: GatewayRequestContextOverrides = {},
): Promise<{
  requestId: string;
  durationMs: number;
  responseStatus: number;
  result: unknown;
}> {
  const requestId = randomUUID();
  const startedAt = Date.now();
  const gatewayRequestContext = buildGatewayRequestContext(requestContextOverrides);

  if (method === "tools/list") {
    const forwardResponse = await grpcUnary<any>(getContextWallClient(), "forwardJsonRpcWithPolicy", {
      context: gatewayRequestContext,
      appId: app.id,
      targetUrl: app.mcpUrl,
      payloadJson: Buffer.from(JSON.stringify({
        jsonrpc: "2.0",
        id: requestId,
        method: "tools/list",
        params,
      })),
    });
    if (forwardResponse?.allowed === false) {
      throw new Error(`Policy blocked ${app.id}.tools/list: ${forwardResponse.blockedReason || "blocked"}`);
    }
    if (!forwardResponse?.success) {
      throw new Error(forwardResponse?.errorMessage || `tools/list failed for ${app.id}`);
    }
    const forwardPayloadRaw = forwardResponse?.responseJson;
    let forwardPayload: Record<string, unknown> = {};
    if (forwardPayloadRaw) {
      const json = typeof forwardPayloadRaw === "string"
        ? forwardPayloadRaw
        : Buffer.from(forwardPayloadRaw).toString("utf-8");
      try {
        forwardPayload = asObject(JSON.parse(json));
      } catch {
        forwardPayload = {};
      }
    }
    const result = asObject(forwardPayload.result);
    const upstreamTools = Array.isArray(result.tools) ? result.tools : [];
    const normalizedTools = upstreamTools.map((tool: any) => {
      let inputSchema: unknown;
      const rawSchema = tool?.inputSchema ?? tool?.input_schema ?? tool?.schema ?? tool?.inputSchemaJson;
      if (rawSchema) {
        try {
          if (typeof rawSchema === "object" && !Array.isArray(rawSchema)) {
            inputSchema = rawSchema;
          } else {
            const json = typeof rawSchema === "string" ? rawSchema : Buffer.from(rawSchema).toString("utf-8");
            inputSchema = JSON.parse(json);
          }
        } catch {
          inputSchema = undefined;
        }
      }
      return {
        name: String(tool?.name || ""),
        description: String(tool?.description || ""),
        ...(inputSchema ? { inputSchema } : {}),
      };
    }).filter((tool: any) => tool.name.length > 0);

    return {
      requestId,
      durationMs: Date.now() - startedAt,
      responseStatus: 200,
      result: { tools: normalizedTools },
    };
  }

  if (method === "tools/call") {
    const toolName = asString(params.name);
    if (!toolName) {
      throw new Error("Downstream tools/call is missing tool name.");
    }
    const toolArgs = asObject(params.arguments);
    const response = await grpcUnary<any>(getContextWallClient(), "executeToolWithPolicy", {
      context: gatewayRequestContext,
      appId: app.id,
      targetUrl: app.mcpUrl,
      toolName,
      argumentsJson: Buffer.from(JSON.stringify(toolArgs)),
      sessionId: gatewayRequestContext.sessionId,
      traceId: gatewayRequestContext.traceId,
    });
    if (response?.allowed === false) {
      throw new Error(`Policy blocked ${app.id}.${toolName}: ${response.blockedReason || "blocked"}`);
    }
    if (!response?.success) {
      throw new Error(response?.errorMessage || `Tool execution failed for ${app.id}.${toolName}`);
    }
    let result: unknown = {};
    const raw = response?.resultJson;
    if (raw) {
      try {
        const json = typeof raw === "string" ? raw : Buffer.from(raw).toString("utf-8");
        result = JSON.parse(json);
      } catch {
        result = {};
      }
    }
    return {
      requestId,
      durationMs: Date.now() - startedAt,
      responseStatus: 200,
      result,
    };
  }

  const forwardResponse = await grpcUnary<any>(getContextWallClient(), "forwardJsonRpcWithPolicy", {
    context: gatewayRequestContext,
    appId: app.id,
    targetUrl: app.mcpUrl,
    payloadJson: Buffer.from(JSON.stringify({
      jsonrpc: "2.0",
      id: requestId,
      method,
      params,
    })),
  });
  if (forwardResponse?.allowed === false) {
    throw new Error(`Policy blocked ${app.id}.${method}: ${forwardResponse.blockedReason || "blocked"}`);
  }
  if (!forwardResponse?.success) {
    throw new Error(forwardResponse?.errorMessage || `JSON-RPC forward failed for ${app.id}.${method}`);
  }
  const forwardPayloadRaw = forwardResponse?.responseJson;
  let forwardPayload: Record<string, unknown> = {};
  if (forwardPayloadRaw) {
    const json = typeof forwardPayloadRaw === "string"
      ? forwardPayloadRaw
      : Buffer.from(forwardPayloadRaw).toString("utf-8");
    try {
      forwardPayload = asObject(JSON.parse(json));
    } catch {
      forwardPayload = {};
    }
  }
  return {
    requestId,
    durationMs: Date.now() - startedAt,
    responseStatus: 200,
    result: "result" in forwardPayload ? forwardPayload.result : forwardPayload,
  };
}

export async function forwardJsonRpcToDownstream(
  app: DownstreamAppConfig,
  payload: Record<string, unknown>,
  requestContextOverrides: GatewayRequestContextOverrides = {},
): Promise<DownstreamJsonRpcForwardResult> {
  const startedAt = Date.now();
  const gatewayRequestContext = buildGatewayRequestContext(requestContextOverrides);
  const response = await grpcUnary<any>(getContextWallClient(), "forwardJsonRpcWithPolicy", {
    context: gatewayRequestContext,
    appId: app.id,
    targetUrl: app.mcpUrl,
    payloadJson: Buffer.from(JSON.stringify(payload)),
  });
  const durationMs = Date.now() - startedAt;
  if (response?.allowed === false) {
    throw new Error(`Policy blocked ${app.id} JSON-RPC forward: ${response.blockedReason || "blocked"}`);
  }
  if (!response?.success) {
    throw new Error(response?.errorMessage || `Failed to forward JSON-RPC to ${app.id}`);
  }

  const raw = response?.responseJson;
  let parsed: unknown;
  if (raw) {
    const json = typeof raw === "string" ? raw : Buffer.from(raw).toString("utf-8");
    try {
      parsed = JSON.parse(json);
    } catch {
      parsed = undefined;
    }
  }
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
    responseStatus: 200,
    payload: normalizedPayload,
  };
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
    const annotations = tool.annotations && typeof tool.annotations === "object" && !Array.isArray(tool.annotations)
      ? (tool.annotations as Record<string, unknown>)
      : undefined;
    tools.push({
      name,
      description: asString(tool.description),
      inputSchema: tool.inputSchema,
      ...(annotations ? { annotations } : {}),
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
  toolArgs: Record<string, unknown>,
  requestContextOverrides: GatewayRequestContextOverrides = {},
): Promise<DownstreamCallResult> {
  ensureToolAllowed(app, toolName);
  const response = await mcpJsonRpcRequest(app, "tools/call", {
    name: toolName,
    arguments: toolArgs,
  }, requestContextOverrides);

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
