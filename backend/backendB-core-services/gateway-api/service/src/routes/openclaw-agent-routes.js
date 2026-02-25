import { requireApiKeyResponse } from "../auth.js";
import { readJsonBody, asString, asBoolean } from "../helpers.js";
import { mapleLog } from "../logging.js";
import { database, server } from "../state.js";
import {
  bootstrapOpenClawRuntime,
  getOpenClawRuntimeStatus,
  runOpenClawLongform,
  runOpenClawTurn,
} from "../core/openclaw-agent-runtime.js";

function asBoundedInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

server.app.get("/api/openclaw/agent/status", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) {
    return unauthorized;
  }
  await bootstrapOpenClawRuntime();
  const status = getOpenClawRuntimeStatus();
  return c.json(
    {
      ok: status.ready,
      ...status,
    },
    status.ready ? 200 : 503
  );
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
