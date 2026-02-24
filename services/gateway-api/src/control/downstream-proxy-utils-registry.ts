import {
  asObject,
  asString,
} from "./downstream-proxy-utils-primitives.js";
import type {
  DownstreamAppConfig,
  DownstreamAppInfo,
} from "./downstream-proxy-types.js";

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_AUTH_HEADER = "x-api-key";

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
  authHeader: string,
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
  env: NodeJS.ProcessEnv = process.env,
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
      `Invalid MAPLE_DOWNSTREAM_APPS JSON: ${error instanceof Error ? error.message : "Unknown parse error"}`,
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
  includeDisabled = false,
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
