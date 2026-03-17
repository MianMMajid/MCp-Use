import { requireApiKeyResponse } from "../auth.js";
import { asString } from "../helpers.js";
import { database, server } from "../state.js";
import {
  getCyberDownloadRecordById,
  getCyberPolicies,
  getCyberStatus,
  listCyberDownloads,
  listCyberEvents,
} from "../core/cyber-operations.js";

function parseBoundedInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

server.app.get("/api/cyber/status", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) {
    return unauthorized;
  }
  return c.json(await getCyberStatus({ database }));
});

server.app.get("/api/cyber/policies", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) {
    return unauthorized;
  }
  return c.json(getCyberPolicies());
});

server.app.get("/api/cyber/events", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) {
    return unauthorized;
  }
  const limit = parseBoundedInteger(c.req.query("limit"), 100, 1, 500);
  const offset = parseBoundedInteger(c.req.query("offset"), 0, 0, 1_000_000);
  const status = asString(c.req.query("status"));
  const sourceService = asString(c.req.query("sourceService"));
  const since = asString(c.req.query("since"));
  const until = asString(c.req.query("until"));
  const items = (await listCyberEvents({
    database,
    auditStatus: status || null,
    since: since || undefined,
    until: until || undefined,
    limit: Math.max(limit + offset, 250),
  }))
    .filter((item) => (sourceService ? item.sourceService === sourceService : true));
  const page = items.slice(offset, offset + limit);
  return c.json({
    ok: true,
    items: page,
    total: items.length,
    offset,
    nextOffset: offset + page.length < items.length ? offset + page.length : null,
    limit,
  });
});

server.app.get("/api/cyber/downloads", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) {
    return unauthorized;
  }
  const payload = await listCyberDownloads({
    database,
    limit: parseBoundedInteger(c.req.query("limit"), 50, 1, 200),
    offset: parseBoundedInteger(c.req.query("offset"), 0, 0, 1_000_000),
    status: asString(c.req.query("status")) || undefined,
    verdict: asString(c.req.query("verdict")) || undefined,
    provider: asString(c.req.query("provider")) || undefined,
    source: asString(c.req.query("source")) || undefined,
    traceId: asString(c.req.query("traceId")) || undefined,
    sessionId: asString(c.req.query("sessionId")) || undefined,
    runId: asString(c.req.query("runId")) || undefined,
  });
  return c.json({
    ok: true,
    ...payload,
  });
});

server.app.get("/api/cyber/downloads/:id", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) {
    return unauthorized;
  }
  const id = asString(c.req.param("id"));
  const item = await getCyberDownloadRecordById(id, { database });
  if (!item) {
    return c.json({ ok: false, error: "Cyber download record not found." }, 404);
  }
  return c.json({
    ok: true,
    item,
  });
});

