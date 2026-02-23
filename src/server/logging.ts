import { AsyncLocalStorage } from "node:async_hooks";
import { asNumber } from "./helpers.js";

export type MapleLogLevel = "error" | "warn" | "info" | "debug" | "trace";

const MAPLE_LOG_LEVEL_ORDER: Record<MapleLogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4,
};

const mapleLogLevelRaw = String(process.env.MAPLE_LOG_LEVEL ?? "info").trim().toLowerCase();
export const mapleLogLevel: MapleLogLevel =
  mapleLogLevelRaw === "error" ||
  mapleLogLevelRaw === "warn" ||
  mapleLogLevelRaw === "info" ||
  mapleLogLevelRaw === "debug" ||
  mapleLogLevelRaw === "trace"
    ? mapleLogLevelRaw
    : "info";

export const mapleLogIncludeBodies =
  String(process.env.MAPLE_LOG_INCLUDE_BODIES ?? "0").trim().toLowerCase() === "true" ||
  String(process.env.MAPLE_LOG_INCLUDE_BODIES ?? "0").trim().toLowerCase() === "1";

export const mapleLogRequestsEnabled =
  String(process.env.MAPLE_LOG_REQUESTS ?? "1").trim().toLowerCase() !== "false" &&
  String(process.env.MAPLE_LOG_REQUESTS ?? "1").trim().toLowerCase() !== "0";

const mapleLogBodyMaxCharsRaw = Number.parseInt(String(process.env.MAPLE_LOG_BODY_MAX_CHARS ?? "4000"), 10);
export const mapleLogBodyMaxChars = Number.isFinite(mapleLogBodyMaxCharsRaw)
  ? Math.max(256, Math.min(40_000, mapleLogBodyMaxCharsRaw))
  : 4000;

export const requestContextStorage = new AsyncLocalStorage<{
  requestId: string;
  method: string;
  path: string;
}>();

export function shouldLogLevel(level: MapleLogLevel): boolean {
  return MAPLE_LOG_LEVEL_ORDER[level] <= MAPLE_LOG_LEVEL_ORDER[mapleLogLevel];
}

export function currentRequestContext():
  | {
      requestId: string;
      method: string;
      path: string;
    }
  | undefined {
  return requestContextStorage.getStore();
}

function isSensitiveKeyName(key: string): boolean {
  const lower = key.toLowerCase();
  return (
    lower.includes("password") ||
    lower.includes("secret") ||
    lower.includes("token") ||
    lower.includes("api_key") ||
    lower === "apikey" ||
    lower.includes("authorization") ||
    lower.includes("cookie")
  );
}

export function redactForLogs(value: unknown, depth = 0): unknown {
  if (depth > 5) {
    return "[truncated-depth]";
  }
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === "string") {
    if (value.length <= mapleLogBodyMaxChars) {
      return value;
    }
    return `${value.slice(0, mapleLogBodyMaxChars)}...<truncated>`;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > 100) {
      const sliced = value.slice(0, 100).map((entry) => redactForLogs(entry, depth + 1));
      sliced.push(`...<truncated ${value.length - 100} items>`);
      return sliced;
    }
    return value.map((entry) => redactForLogs(entry, depth + 1));
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(record)) {
      if (isSensitiveKeyName(key)) {
        out[key] = "[redacted]";
        continue;
      }
      out[key] = redactForLogs(entry, depth + 1);
    }
    return out;
  }
  return String(value);
}

function stringifyLogPayload(payload: unknown): string {
  try {
    const redacted = redactForLogs(payload);
    return JSON.stringify(redacted);
  } catch {
    return '{"serialization":"failed"}';
  }
}

export function mapleLog(level: MapleLogLevel, event: string, payload?: Record<string, unknown>): void {
  if (!shouldLogLevel(level)) {
    return;
  }
  const now = new Date().toISOString();
  const context = currentRequestContext();
  const envelope: Record<string, unknown> = {
    ts: now,
    level,
    event,
    ...(context
      ? {
          requestId: context.requestId,
          requestPath: context.path,
          requestMethod: context.method,
        }
      : {}),
    ...(payload ?? {}),
  };
  const line = `[MAPLE] ${stringifyLogPayload(envelope)}`;
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}

export function shouldLogHttpRequestPath(path: string): boolean {
  if (path.startsWith("/api/")) {
    return true;
  }
  if (path === "/mcp" || path.startsWith("/mcp/")) {
    return true;
  }
  if (path === "/sse" || path.startsWith("/sse/")) {
    return true;
  }
  if (path === "/judge" || path.startsWith("/judge") || path === "/landing" || path === "/") {
    return true;
  }
  return false;
}

export async function requestBodyPreview(raw: Request): Promise<unknown> {
  const contentType = String(raw.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.includes("application/json")) {
    return undefined;
  }
  try {
    const payload = (await raw.clone().json()) as unknown;
    return payload;
  } catch {
    return "[unparseable-json]";
  }
}
