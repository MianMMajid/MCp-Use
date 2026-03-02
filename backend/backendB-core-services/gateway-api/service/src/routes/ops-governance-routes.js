import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { asBoolean, asString, readJsonBody } from "../helpers.js";
import { requireApiKeyResponse } from "../auth.js";
import { database, buildRuntimeStatus } from "../state.js";
import {
  listTracesForCurrentOwner,
  getTraceForCurrentOwner,
} from "../trace-helpers.js";
import { toTraceSummary } from "../core/presenters.js";
import {
  getOpenClawRun,
  getOpenClawRunTimeline,
  getOpenClawRunChildren,
  listOpenClawRuns,
} from "../core/openclaw-agent-runtime.js";
import { ToolGovernanceStore } from "../core/tool-governance-store.js";
import { evaluateGatewayRuntimeDependencies } from "../core/runtime-dependencies.js";
import { downstreamAppRegistry } from "../config.js";
import { listDownstreamApps } from "../control/downstream-proxy.js";
import {
  listToolsFromDownstreamCached,
  resolveDownstreamApp,
} from "../firewall-proxy.js";

const governanceStore = new ToolGovernanceStore({ database });

function parseLimit(rawValue, fallback = 20, max = 200) {
  const parsed = Number.parseInt(String(rawValue ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(1, Math.min(parsed, max));
}

function parseOffset(rawValue) {
  const parsed = Number.parseInt(String(rawValue ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}

function jsonlEncode(items) {
  return items.map((item) => JSON.stringify(item)).join("\n");
}

function parseSchemaBytes(value) {
  if (!value) {
    return {};
  }
  try {
    const raw = Buffer.from(value).toString("utf8").trim();
    if (!raw) {
      return {};
    }
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function collectToolExecutions() {
  const traces = listTracesForCurrentOwner(2000);
  const items = [];
  for (const trace of traces) {
    for (const step of trace.steps ?? []) {
      if (!step?.toolCall?.name) {
        continue;
      }
      const executionId = `${trace.id}:${step.index}`;
      const toolName = String(step.toolCall.name);
      const status =
        step.guardStatus === "block"
          ? "blocked"
          : step.toolCall.output
            ? "completed"
            : "pending";
      items.push({
        executionId,
        traceId: trace.id,
        sessionId: trace.sessionId,
        toolName,
        appId: toolName.includes(".") ? toolName.split(".")[0] : "",
        status,
        createdAt: String(step.timestamp ?? trace.updatedAt),
        updatedAt: String(step.timestamp ?? trace.updatedAt),
        outputPreview:
          typeof step.toolCall.output === "string"
            ? step.toolCall.output.slice(0, 400)
            : "",
      });
    }
  }
  items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return items;
}

function redactLogLine(line) {
  return String(line ?? "")
    .replace(/(authorization|token|secret|password|api[_-]?key)\s*[:=]\s*[^,\s]+/gi, "$1=[redacted]")
    .replace(/bearer\s+[a-z0-9._-]+/gi, "bearer [redacted]");
}

function resolveLogFilePath() {
  const candidates = [
    asString(process.env.MAPLE_STREAM_LOG_FILE),
    resolve(process.cwd(), "backend/backendA-platform-infra/logs/frontend-backend-stream.log"),
    resolve(import.meta.dirname, "../../../../../backendA-platform-infra/logs/frontend-backend-stream.log"),
    resolve(import.meta.dirname, "../../../../backendA-platform-infra/logs/frontend-backend-stream.log"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      return candidate;
    }
  }
  return "";
}

function parseSchemaPayload(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  return parseSchemaBytes(value);
}

async function hydrateToolRegistryFromContextWall() {
  const configuredApps = listDownstreamApps(downstreamAppRegistry, false);
  for (const appInfo of configuredApps) {
    let downstreamApp;
    try {
      downstreamApp = resolveDownstreamApp(appInfo.id);
    } catch {
      continue;
    }
    let listed;
    try {
      listed = await listToolsFromDownstreamCached(downstreamApp, {
        forceRefresh: true,
      });
    } catch {
      continue;
    }
    const tools = Array.isArray(listed?.tools) ? listed.tools : [];
    for (const tool of tools) {
      const name = asString(tool.name);
      if (!name) {
        continue;
      }
      const resolvedAppId = asString(tool.appId) ?? downstreamApp.id;
      const toolId = resolvedAppId ? `${resolvedAppId}.${name}` : name;
      await governanceStore.upsertTool({
        toolId,
        name,
        description: asString(tool.description) ?? "",
        schema: parseSchemaPayload(tool.inputSchema ?? tool.inputSchemaJson),
        source: "context-wall",
      });
    }
  }
}

export function registerOpsGovernanceRoutes(app) {
  app.get("/api/traces/search", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) {
      return unauthorized;
    }
    const q = (asString(c.req.query("q")) ?? "").toLowerCase();
    const limit = parseLimit(c.req.query("limit"), 20, 200);
    const cursor = parseOffset(c.req.query("cursor"));
    const all = listTracesForCurrentOwner(1000).map((trace) => toTraceSummary(trace));
    const filtered = q
      ? all.filter((trace) => JSON.stringify(trace).toLowerCase().includes(q))
      : all;
    const items = filtered.slice(cursor, cursor + limit);
    const nextCursor = cursor + limit < filtered.length ? String(cursor + limit) : "";
    return c.json({ ok: true, items, nextCursor, totalCount: filtered.length });
  });

  app.post("/api/traces/export", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) {
      return unauthorized;
    }
    const body = await readJsonBody(c);
    const format = String(body.format ?? "json").trim().toLowerCase();
    const traceIds = Array.isArray(body.traceIds)
      ? body.traceIds.map((traceId) => String(traceId))
      : [];
    const traces =
      traceIds.length > 0
        ? traceIds.map((traceId) => getTraceForCurrentOwner(traceId)).filter(Boolean)
        : listTracesForCurrentOwner(1000);
    if (format === "jsonl") {
      return c.text(jsonlEncode(traces), 200, {
        "content-type": "application/x-ndjson",
      });
    }
    return c.json({ ok: true, items: traces, count: traces.length });
  });

  app.get("/api/runs", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) {
      return unauthorized;
    }
    const limit = parseLimit(c.req.query("limit"), 20, 100);
    const cursor = asString(c.req.query("cursor")) ?? "";
    const listed = listOpenClawRuns({ limit, cursor });
    return c.json({ ok: true, items: listed.items, nextCursor: listed.nextCursor });
  });

  app.get("/api/runs/:runId", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) {
      return unauthorized;
    }
    const run = getOpenClawRun(c.req.param("runId"));
    if (!run) {
      return c.json({ error: "Run not found." }, 404);
    }
    return c.json({ ok: true, run });
  });

  app.get("/api/runs/:runId/timeline", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) {
      return unauthorized;
    }
    const timeline = getOpenClawRunTimeline(c.req.param("runId"));
    if (!timeline) {
      return c.json({ error: "Run not found." }, 404);
    }
    return c.json({ ok: true, ...timeline });
  });

  app.get("/api/runs/:runId/children", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) {
      return unauthorized;
    }
    const result = getOpenClawRunChildren(c.req.param("runId"));
    if (!result) {
      return c.json({ error: "Run not found." }, 404);
    }
    return c.json({ ok: true, ...result });
  });

  app.get("/api/runtime/dependencies", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) {
      return unauthorized;
    }
    const report = await evaluateGatewayRuntimeDependencies({ force: true });
    const dependencyMap = Object.fromEntries(
      report.checks.map((check) => [check.id, check.ok])
    );
    return c.json({
      ok: report.ready,
      strict: report.strict,
      generatedAt: report.generatedAt,
      ready: report.ready,
      dependencies: dependencyMap,
      checks: report.checks,
    });
  });

  app.get("/api/runtime/diag", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) {
      return unauthorized;
    }
    return c.json({
      ok: true,
      diag: {
        uptimeSeconds: Math.round(process.uptime()),
        nodeVersion: process.version,
        memoryUsage: process.memoryUsage(),
        runtimeStatus: buildRuntimeStatus(),
      },
    });
  });

  app.get("/api/runtime/logs", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) {
      return unauthorized;
    }
    const limit = parseLimit(c.req.query("limit"), 200, 2000);
    const path = resolveLogFilePath();
    if (!path) {
      return c.json({
        ok: true,
        logs: [],
        source: "",
      });
    }
    const content = readFileSync(path, "utf8");
    const lines = content
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .slice(-limit)
      .map((line) => redactLogLine(line));
    return c.json({
      ok: true,
      source: path,
      logs: lines,
    });
  });

  app.get("/api/tools/registry", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) {
      return unauthorized;
    }
    await governanceStore.ensureInitialized();
    let items = await governanceStore.listTools();
    if (items.length === 0) {
      await hydrateToolRegistryFromContextWall();
      items = await governanceStore.listTools();
    }
    return c.json({
      ok: true,
      items,
    });
  });

  app.get("/api/tools/registry/:toolId", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) {
      return unauthorized;
    }
    const toolId = String(c.req.param("toolId") ?? "").trim();
    const tool = await governanceStore.getTool(toolId);
    if (!tool) {
      return c.json({ error: "Tool not found." }, 404);
    }
    return c.json({ ok: true, tool });
  });

  app.post("/api/tools/registry", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) {
      return unauthorized;
    }
    const body = await readJsonBody(c);
    const toolId = asString(body.toolId) ?? asString(body.name);
    if (!toolId) {
      return c.json({ error: "toolId is required." }, 400);
    }
    const tool = await governanceStore.upsertTool({
      toolId,
      name: asString(body.name) ?? toolId,
      description: asString(body.description) ?? "",
      schema: body.schema ?? {},
      source: "manual",
    });
    return c.json({ ok: true, tool }, 201);
  });

  app.patch("/api/tools/registry/:toolId", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) {
      return unauthorized;
    }
    const toolId = String(c.req.param("toolId") ?? "").trim();
    const existing = await governanceStore.getTool(toolId);
    if (!existing) {
      return c.json({ error: "Tool not found." }, 404);
    }
    const body = await readJsonBody(c);
    const tool = await governanceStore.upsertTool({
      toolId,
      name: asString(body.name) ?? existing.name,
      description: asString(body.description) ?? existing.description,
      schema: body.schema ?? existing.schema,
      source: existing.source,
    });
    return c.json({ ok: true, tool });
  });

  app.get("/api/tools/policies", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) {
      return unauthorized;
    }
    const items = await governanceStore.listPolicies();
    return c.json({ ok: true, items });
  });

  app.post("/api/tools/policies/validate", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) {
      return unauthorized;
    }
    const body = await readJsonBody(c);
    const policy = body.policy ?? {};
    const errors = [];
    const warnings = [];
    const policyId = asString(policy.policyId);
    const mode = asString(policy.mode);
    const rules = Array.isArray(policy.rules) ? policy.rules : [];
    if (!policy || typeof policy !== "object") {
      errors.push("policy must be an object.");
    }
    if (!policyId) {
      errors.push("policyId is required.");
    }
    if (mode && mode !== "allowlist" && mode !== "denylist") {
      errors.push("mode must be allowlist or denylist.");
    }
    if (rules.length === 0) {
      warnings.push("No rules supplied.");
    }
    const knownTools = new Set((await governanceStore.listTools()).map((tool) => tool.toolId));
    for (let i = 0; i < rules.length; i += 1) {
      const rule = rules[i];
      if (!rule || typeof rule !== "object") {
        errors.push(`rule ${i} must be an object.`);
        continue;
      }
      const ruleToolId = asString(rule.toolId);
      if (ruleToolId && !knownTools.has(ruleToolId)) {
        warnings.push(`rule ${i} references unknown toolId ${ruleToolId}`);
      }
    }

    let persisted = false;
    if (errors.length === 0 && asBoolean(body.persist, false)) {
      await governanceStore.savePolicy({
        policyId,
        mode: mode ?? "allowlist",
        description: asString(policy.description) ?? "",
        rules,
      });
      persisted = true;
    }

    return c.json(
      {
        ok: errors.length === 0,
        valid: errors.length === 0,
        errors,
        warnings,
        persisted,
      },
      errors.length === 0 ? 200 : 400
    );
  });

  app.get("/api/tools/executions", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) {
      return unauthorized;
    }
    const limit = parseLimit(c.req.query("limit"), 50, 500);
    const cursor = parseOffset(c.req.query("cursor"));
    const all = collectToolExecutions();
    const items = all.slice(cursor, cursor + limit);
    const nextCursor = cursor + limit < all.length ? String(cursor + limit) : "";
    return c.json({ ok: true, items, nextCursor, totalCount: all.length });
  });

  app.get("/api/tools/executions/:executionId", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) {
      return unauthorized;
    }
    const executionId = String(c.req.param("executionId") ?? "").trim();
    const execution = collectToolExecutions().find(
      (candidate) => candidate.executionId === executionId
    );
    if (!execution) {
      return c.json({ error: "Execution not found." }, 404);
    }
    return c.json({ ok: true, execution });
  });
}
