import { requireApiKeyResponse } from "../auth.js";
import { readJsonBody, asString, asBoolean } from "../helpers.js";
import { mapleLog } from "../logging.js";
import { database, server } from "../state.js";
import {
  bootstrapOpenClawRuntime,
  cancelOpenClawSession,
  getOpenClawRunArtifacts,
  getOpenClawSession,
  getOpenClawRuntimeStatus,
  listOpenClawSessionEvents,
  listOpenClawSessions,
  runOpenClawLongform,
  runOpenClawTurn,
  subscribeOpenClawSessionEvents,
} from "../core/openclaw-agent-runtime.js";

function asBoundedInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

function toSseEvent(name, payload) {
  return `event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`;
}

function isTerminalSessionStatus(status) {
  return status === "completed" || status === "failed" || status === "canceled";
}

server.app.get("/api/openclaw/agent/status", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) {
    return unauthorized;
  }
  await bootstrapOpenClawRuntime();
  const status = getOpenClawRuntimeStatus();
  return c.json({
    ok: status.ready,
    ...status,
  });
});

server.app.get("/api/openclaw/agent/sessions", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) {
    return unauthorized;
  }
  const limit = asBoundedInteger(c.req.query("limit"), 20, 1, 100);
  const cursor = asString(c.req.query("cursor")) ?? "";
  const listed = listOpenClawSessions({ limit, cursor });
  return c.json({
    ok: true,
    items: listed.items,
    nextCursor: listed.nextCursor,
  });
});

server.app.get("/api/openclaw/agent/sessions/:sessionId", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) {
    return unauthorized;
  }
  const sessionId = asString(c.req.param("sessionId"));
  if (!sessionId) {
    return c.json({ ok: false, error: "Missing sessionId." }, 400);
  }
  const session = getOpenClawSession(sessionId);
  if (!session) {
    return c.json({ ok: false, error: "Session not found." }, 404);
  }
  return c.json({
    ok: true,
    session,
  });
});

server.app.post("/api/openclaw/agent/sessions/:sessionId/cancel", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) {
    return unauthorized;
  }
  const sessionId = asString(c.req.param("sessionId"));
  if (!sessionId) {
    return c.json({ ok: false, error: "Missing sessionId." }, 400);
  }
  const canceled = cancelOpenClawSession(sessionId);
  if (!canceled) {
    return c.json({ ok: false, error: "Session not found." }, 404);
  }
  return c.json({
    ok: true,
    session: canceled,
  });
});

server.app.get("/api/openclaw/agent/sessions/:sessionId/stream", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) {
    return unauthorized;
  }
  const sessionId = asString(c.req.param("sessionId"));
  if (!sessionId) {
    return c.json({ ok: false, error: "Missing sessionId." }, 400);
  }
  if (!getOpenClawSession(sessionId)) {
    return c.json({ ok: false, error: "Session not found." }, 404);
  }

  const encoder = new TextEncoder();
  const startedCursor = asString(c.req.query("cursor")) ?? "0";
  const timeoutMs = asBoundedInteger(c.req.query("timeoutMs"), 25000, 1000, 120000);

  let closed = false;
  let timeout;
  let unsubscribe = () => {};
  const stream = new ReadableStream({
    start(controller) {
      let cursor = startedCursor;
      closed = false;
      unsubscribe = () => {};
      const writeEvent = (name, payload) => {
        if (closed) {
          return false;
        }
        try {
          controller.enqueue(encoder.encode(toSseEvent(name, payload)));
          return true;
        } catch {
          closed = true;
          return false;
        }
      };
      const closeStream = () => {
        if (closed) {
          return;
        }
        closed = true;
        if (timeout) {
          clearTimeout(timeout);
          timeout = undefined;
        }
        try {
          unsubscribe();
        } catch {
          // best effort
        }
        try {
          controller.close();
        } catch {
          // Ignore closed stream errors.
        }
      };

      const flushBacklog = () => {
        const events = listOpenClawSessionEvents(sessionId, { afterCursor: cursor });
        for (const event of events.items) {
          if (!writeEvent(event.eventType, event)) {
            break;
          }
        }
        cursor = events.latestCursor;
        return events;
      };

      writeEvent("ready", { sessionId, cursor });
      flushBacklog();

      const detail = getOpenClawSession(sessionId);
      if (!detail || isTerminalSessionStatus(detail.status)) {
        writeEvent("done", {
          sessionId,
          status: detail?.status ?? "completed",
          cursor,
        });
        closeStream();
        return;
      }

      unsubscribe = subscribeOpenClawSessionEvents(sessionId, (event) => {
        if (!writeEvent(event.eventType, event)) {
          closeStream();
          return;
        }
        cursor = event.cursor;
        const nextDetail = getOpenClawSession(sessionId);
        if (!nextDetail || isTerminalSessionStatus(nextDetail.status)) {
          writeEvent("done", {
            sessionId,
            status: nextDetail?.status ?? "completed",
            cursor,
          });
          closeStream();
        }
      });

      timeout = setTimeout(() => {
        writeEvent("done", {
          sessionId,
          status: "timeout",
          cursor,
        });
        closeStream();
      }, timeoutMs);
    },
    cancel() {
      closed = true;
      if (timeout) {
        clearTimeout(timeout);
        timeout = undefined;
      }
      try {
        unsubscribe();
      } catch {
        // best effort
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
});

server.app.get("/api/openclaw/agent/runs/:runId/artifacts", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) {
    return unauthorized;
  }
  const runId = asString(c.req.param("runId"));
  if (!runId) {
    return c.json({ ok: false, error: "Missing runId." }, 400);
  }
  const run = getOpenClawRunArtifacts(runId);
  if (!run) {
    return c.json({ ok: false, error: "Run not found." }, 404);
  }
  return c.json({
    ok: true,
    run,
  });
});

server.app.post("/api/openclaw/agent/turn", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) {
    return unauthorized;
  }
  const body = await readJsonBody(c);
  const message = asString(body.message);
  if (!message) {
    return c.json({ ok: false, error: "Missing message." }, 400);
  }

  try {
    const result = await runOpenClawTurn({
      message,
      sessionId: asString(body.sessionId),
      agentId: asString(body.agentId),
      to: asString(body.to),
      thinking: asString(body.thinking),
      timeoutSeconds: asBoundedInteger(body.timeoutSeconds, 120, 15, 1200),
      deliver: asBoolean(body.deliver, false),
      mode: asString(body.mode),
      devProfile:
        typeof body.devProfile === "boolean" ? body.devProfile : undefined,
    });
    return c.json({
      ok: true,
      mode: "openclaw-agent",
      sessionId: result.sessionId,
      runId: result.runId,
      reply: result.reply,
      raw: result.raw,
    });
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    mapleLog("warn", "api.openclaw.agent.turn_failed", { error: messageText });
    return c.json({ ok: false, error: messageText }, 502);
  }
});

server.app.post("/api/openclaw/agent/longform", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) {
    return unauthorized;
  }
  const body = await readJsonBody(c);
  const objective = asString(body.objective);
  if (!objective) {
    return c.json({ ok: false, error: "Missing objective." }, 400);
  }

  try {
    const result = await runOpenClawLongform({
      objective,
      sessionId: asString(body.sessionId),
      agentId: asString(body.agentId),
      to: asString(body.to),
      thinking: asString(body.thinking),
      timeoutSeconds: asBoundedInteger(body.timeoutSeconds, 120, 15, 1200),
      maxTurns: asBoundedInteger(body.maxTurns, 4, 1, 8),
      deliver: asBoolean(body.deliver, false),
      mode: asString(body.mode),
      devProfile:
        typeof body.devProfile === "boolean" ? body.devProfile : undefined,
    });
    return c.json({
      ok: true,
      mode: "openclaw-agent-longform",
      ...result,
    });
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    mapleLog("warn", "api.openclaw.agent.longform_failed", {
      error: messageText,
    });
    return c.json({ ok: false, error: messageText }, 502);
  }
});
