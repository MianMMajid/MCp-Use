import { compress } from "hono/compress";
import { randomUUID } from "node:crypto";
import { isProductionRuntime } from "./config.js";
import {
  mapleLogRequestsEnabled,
  mapleLogIncludeBodies,
  shouldLogLevel,
  shouldLogHttpRequestPath,
  requestBodyPreview,
  requestContextStorage,
  mapleLog,
  type MapleLogLevel,
} from "./logging.js";
import { server } from "./state.js";
import { emitAuditEvent } from "./audit-emitter.js";

const responseCompression = compress();

// ── CORS for ChatGPT Apps domains ───────────────────────────────────────────

const CHATGPT_ALLOWED_ORIGINS = new Set([
  "https://chatgpt.com",
  "https://chat.openai.com",
  "https://platform.openai.com",
]);

server.app.use("*", async (c, next) => {
  const origin = c.req.header("origin");
  if (origin && CHATGPT_ALLOWED_ORIGINS.has(origin)) {
    c.header("Access-Control-Allow-Origin", origin);
    c.header("Access-Control-Allow-Credentials", "true");
    c.header("Access-Control-Allow-Headers", "Authorization, Content-Type, x-api-key, Accept, mcp-protocol-version, mcp-session-id");
    c.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    c.header("Access-Control-Expose-Headers", "mcp-session-id");
    c.header("Access-Control-Max-Age", "86400");
    if (c.req.method === "OPTIONS") {
      return c.body(null, 204);
    }
  }
  await next();
});

// ── Request Logging ─────────────────────────────────────────────────────────

server.app.use("*", async (c, next) => {
  const method = c.req.method;
  const path = c.req.path;
  const requestIdHeader = c.req.header("x-request-id");
  const requestId =
    typeof requestIdHeader === "string" && requestIdHeader.trim().length > 0
      ? requestIdHeader.trim()
      : randomUUID().slice(0, 12);
  const tenantId = c.req.header("x-tenant-id") ?? "";
  const deviceId =
    c.req.header("x-device-id") ??
    c.req.header("user-agent") ??
    "";
  const sessionId =
    c.req.header("x-maple-session-id") ??
    c.req.header("mcp-session-id") ??
    "";
  const traceId =
    c.req.header("x-maple-trace-id") ??
    c.req.header("x-trace-id") ??
    "";
  const forwardedUserId = c.req.header("x-user-id") ?? "";
  const startedAt = Date.now();

  const shouldLogRequest = mapleLogRequestsEnabled && shouldLogHttpRequestPath(path);
  if (shouldLogRequest) {
    const includeBody =
      mapleLogIncludeBodies &&
      (method === "POST" || method === "PUT" || method === "PATCH") &&
      shouldLogLevel("debug");
    const bodyPreview =
      includeBody && c.req.raw ? await requestBodyPreview(c.req.raw) : undefined;
    mapleLog("info", "http.request.start", {
      path,
      method,
      query: c.req.raw.url.includes("?") ? c.req.raw.url.split("?")[1] : "",
      userAgent: c.req.header("user-agent") ?? undefined,
      ...(includeBody ? { body: bodyPreview } : {}),
    });
  }

  // Store context without wrapping next() inside AsyncLocalStorage.run()
  // to avoid hangs in mcp-use production runtime.
  requestContextStorage.enterWith({
    requestId,
    method,
    path,
    tenantId,
    deviceId,
    sessionId,
    traceId,
  });

  if (method !== "OPTIONS" && shouldLogRequest) {
    emitAuditEvent({
      eventType: "AUDIT_EVENT_TYPE_PROXY_REQUEST",
      sourceService: "maple-edge",
      traceId: traceId || undefined,
      sessionId: sessionId || undefined,
      userId: forwardedUserId || undefined,
      summary: `Edge ingress ${method} ${path}`,
      payload: {
        requestId,
        tenantId,
        deviceId,
        origin: c.req.header("origin") ?? "",
      },
    });
  }

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

// ── Compression ─────────────────────────────────────────────────────────────

// Skip compression in production — Cloudflare/Manufact proxy handles it.
if (!isProductionRuntime) {
  server.app.use("*", async (c, next) => {
    if (c.req.path.startsWith("/sse")) {
      await next();
      return;
    }
    await responseCompression(c, next);
  });
}
