import type { MapleLogLevel } from "./logging-types.js";

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

export function shouldLogLevel(level: MapleLogLevel): boolean {
  return MAPLE_LOG_LEVEL_ORDER[level] <= MAPLE_LOG_LEVEL_ORDER[mapleLogLevel];
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
