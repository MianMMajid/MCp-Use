import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

export type MapleLogLevel = "error" | "warn" | "info" | "debug" | "trace";

interface RequestContext {
  requestId: string;
  method: string;
  path: string;
}

interface HttpApp {
  use: (
    path: string,
    middleware: (c: { req: { method: string; path: string; raw: Request; header: (name: string) => string | undefined }; res: Response }, next: () => Promise<void>) => Promise<void>
  ) => void;
}

const MAPLE_LOG_LEVEL_ORDER: Record<MapleLogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4,
};

export function createHttpLoggingRuntime() {
  const requestContextStorage = new AsyncLocalStorage<RequestContext>();

  const mapleLogLevelRaw = String(process.env.MAPLE_LOG_LEVEL ?? "info").trim().toLowerCase();
  const mapleLogLevel: MapleLogLevel =
    mapleLogLevelRaw === "error" ||
    mapleLogLevelRaw === "warn" ||
    mapleLogLevelRaw === "info" ||
    mapleLogLevelRaw === "debug" ||
    mapleLogLevelRaw === "trace"
      ? mapleLogLevelRaw
      : "info";
  const mapleLogIncludeBodies =
    String(process.env.MAPLE_LOG_INCLUDE_BODIES ?? "0").trim().toLowerCase() === "true" ||
    String(process.env.MAPLE_LOG_INCLUDE_BODIES ?? "0").trim().toLowerCase() === "1";
  const mapleLogRequestsEnabled =
    String(process.env.MAPLE_LOG_REQUESTS ?? "1").trim().toLowerCase() !== "false" &&
    String(process.env.MAPLE_LOG_REQUESTS ?? "1").trim().toLowerCase() !== "0";
  const mapleLogBodyMaxCharsRaw = Number.parseInt(
    String(process.env.MAPLE_LOG_BODY_MAX_CHARS ?? "4000"),
    10
  );
  const mapleLogBodyMaxChars = Number.isFinite(mapleLogBodyMaxCharsRaw)
    ? Math.max(256, Math.min(40_000, mapleLogBodyMaxCharsRaw))
    : 4000;

  function shouldLogLevel(level: MapleLogLevel): boolean {
    return MAPLE_LOG_LEVEL_ORDER[level] <= MAPLE_LOG_LEVEL_ORDER[mapleLogLevel];
  }

  function currentRequestContext(): RequestContext | undefined {
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

  function redactForLogs(value: unknown, depth = 0): unknown {
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
      return "{\"serialization\":\"failed\"}";
    }
  }

  function mapleLog(level: MapleLogLevel, event: string, payload?: Record<string, unknown>): void {
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

  function shouldLogHttpRequestPath(path: string): boolean {
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

  async function requestBodyPreview(raw: Request): Promise<unknown> {
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

  function attachRequestLoggingMiddleware(app: HttpApp): void {
    app.use("*", async (c, next) => {
      const method = c.req.method;
      const path = c.req.path;
      const requestIdHeader = c.req.header("x-request-id");
      const requestId =
        typeof requestIdHeader === "string" && requestIdHeader.trim().length > 0
          ? requestIdHeader.trim()
          : randomUUID().slice(0, 12);
      const startedAt = Date.now();

      const shouldLogRequest = mapleLogRequestsEnabled && shouldLogHttpRequestPath(path);
      if (shouldLogRequest) {
        const includeBody =
          mapleLogIncludeBodies &&
          (method === "POST" || method === "PUT" || method === "PATCH") &&
          shouldLogLevel("debug");
        const bodyPreview = includeBody && c.req.raw ? await requestBodyPreview(c.req.raw) : undefined;
        mapleLog("info", "http.request.start", {
          path,
          method,
          query: c.req.raw.url.includes("?") ? c.req.raw.url.split("?")[1] : "",
          userAgent: c.req.header("user-agent") ?? undefined,
          ...(includeBody ? { body: bodyPreview } : {}),
        });
      }

      requestContextStorage.enterWith({ requestId, method, path });

      try {
        await next();
      } catch (error) {
        mapleLog("error", "http.request.exception", {
          path,
          method,
          durationMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      } finally {
        if (shouldLogRequest) {
          const durationMs = Date.now() - startedAt;
          const status = c.res.status;
          const level: MapleLogLevel =
            status >= 500 ? "error" : status >= 400 ? "warn" : durationMs > 2000 ? "warn" : "info";
          mapleLog(level, "http.request.end", {
            path,
            method,
            status,
            durationMs,
            contentType: c.res.headers.get("content-type") ?? undefined,
          });
        }
      }
    });
  }

  return {
    attachRequestLoggingMiddleware,
    mapleLog,
  };
}
