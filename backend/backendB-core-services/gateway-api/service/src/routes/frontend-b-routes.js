import { database } from "../state.js";
import { findRequestSession } from "../auth.js";
import { asString, readJsonBody } from "../helpers.js";
import { mapleLog } from "../logging.js";
import { emitAuditEvent } from "../audit-emitter.js";
import { FrontendBStore } from "../core/frontend-b-store.js";
import { ToolGovernanceStore } from "../core/tool-governance-store.js";
import {
  listOpenClawCliTools,
  buildOpenClawCliCommandArgs,
  isSupportedOpenClawCliTool,
} from "../core/openclaw-cli-runtime.js";
import {
  executeOpenClawModifierRequest,
  saveOpenClawModifierPolicyVersion,
} from "../core/openclaw-modifier-runtime.js";
import { runOpenClawLongform } from "../core/openclaw-agent-runtime.js";
import { createOrchestrationExecution } from "../core/orchestration-runtime.js";
import { queryAuditChain } from "../core/audit-integrity.js";
import { parseYaml } from "../core/policy-as-code.js";
import { simulateModifierPolicy } from "../core/policy-simulator.js";
import { ensureExecutionPersistenceWatch } from "./orchestration-routes.js";
import {
  buildCompiledFirewallBundle,
  buildModifierPolicyPayloadFromFirewallBundle,
  compileFrontendBFirewallPolicy,
  resolveCompiledFirewallPolicy,
} from "../core/frontend-b-firewall-policy.js";

const frontendBStore = new FrontendBStore({ database });
const governanceStore = new ToolGovernanceStore({ database });
const SKILL_EXECUTION_SUBCOMMANDS = new Set(["list", "check", "info"]);

function nowIso() {
  return new Date().toISOString();
}

function taskShape(task) {
  if (!task) {
    return null;
  }
  return {
    id: task.id,
    title: task.title,
    prompt: task.prompt,
    status: task.status,
    schedule: task.schedule,
    assignment: task.assignment,
    lastRunAt: task.lastRunAt,
    nextRunAt: task.nextRunAt,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

function computeNextRunAt(schedule = {}, completedRuns = 0, floorTime = Date.now()) {
  const startAtMs = new Date(schedule.startAt).getTime();
  const intervalMs = Math.max(1, Number(schedule.intervalMinutes ?? 0)) * 60 * 1000;
  if (!Number.isFinite(startAtMs) || intervalMs <= 0) {
    return null;
  }
  let slot = Math.max(0, Number(completedRuns) || 0);
  let next = startAtMs + slot * intervalMs;
  while (next <= floorTime) {
    slot += 1;
    next = startAtMs + slot * intervalMs;
  }
  const endAtMs = schedule.endAt ? new Date(schedule.endAt).getTime() : NaN;
  if (Number.isFinite(endAtMs) && next > endAtMs) {
    return null;
  }
  return new Date(next).toISOString();
}

function terminalTaskState(task, nextRunAt) {
  const maxRepeats = Math.max(1, Number(task.schedule?.maxRepeats ?? 1));
  if (Number(task.runCount ?? 0) >= maxRepeats) {
    return { completed: true, reason: "maxRepeats" };
  }
  const endAtMs = task.schedule?.endAt ? new Date(task.schedule.endAt).getTime() : NaN;
  if (Number.isFinite(endAtMs) && endAtMs <= Date.now()) {
    return { completed: true, reason: "endAt" };
  }
  if (!nextRunAt) {
    return { completed: true, reason: "schedule_exhausted" };
  }
  return { completed: false, reason: "" };
}

function validateTaskSchedule(schedule = {}, options = {}) {
  const startAt = new Date(schedule.startAt);
  const endAt = schedule.endAt ? new Date(schedule.endAt) : null;
  const timezone = asString(schedule.timezone) ?? "America/Los_Angeles";
  const intervalMinutes = Number(schedule.intervalMinutes);
  const maxRepeats = Number(schedule.maxRepeats);
  if (Number.isNaN(startAt.getTime())) {
    return { error: "schedule.startAt must be a valid datetime." };
  }
  if (!options.allowPastStartAt && startAt.getTime() <= Date.now()) {
    return { error: "schedule.startAt must be in the future." };
  }
  if (endAt && Number.isNaN(endAt.getTime())) {
    return { error: "schedule.endAt must be a valid datetime." };
  }
  if (endAt && endAt.getTime() <= startAt.getTime()) {
    return { error: "schedule.endAt must be after schedule.startAt." };
  }
  if (!Number.isFinite(intervalMinutes) || intervalMinutes <= 0) {
    return { error: "schedule.intervalMinutes must be positive." };
  }
  if (!Number.isFinite(maxRepeats) || maxRepeats < 1) {
    return { error: "schedule.maxRepeats must be at least 1." };
  }
  return {
    schedule: {
      startAt: startAt.toISOString(),
      endAt: endAt ? endAt.toISOString() : null,
      timezone,
      intervalMinutes,
      maxRepeats,
    },
  };
}

async function requireSession(c) {
  const session = await findRequestSession(database, c.req.header("cookie"));
  if (!session) {
    return { error: c.json({ error: "Authentication required." }, 401) };
  }
  return { session };
}

async function requireOwnedAgent(ownerUserId, agentId) {
  const agent = await database.findAgentById(agentId);
  if (!agent || String(agent.ownerId ?? "") !== String(ownerUserId)) {
    return null;
  }
  if (agent.status === "archived") return null;
  return agent;
}

async function requireOwnedOrchestration(ownerUserId, orchestrationId) {
  const orchestration = await database.findOrchestrationById(orchestrationId);
  if (!orchestration || String(orchestration.ownerId ?? "") !== String(ownerUserId)) {
    return null;
  }
  if (orchestration.status === "archived") return null;
  return orchestration;
}

async function resolveTaskOrchestrationRuntime(ownerUserId, orchestrationId) {
  const orchestration = await requireOwnedOrchestration(ownerUserId, orchestrationId);
  if (!orchestration) {
    return null;
  }

  const currentNodes = Array.isArray(orchestration.nodes) ? orchestration.nodes : [];
  const currentEdges = Array.isArray(orchestration.edges) ? orchestration.edges : [];
  if (currentNodes.length > 0 || currentEdges.length > 0) {
    // Use the inline definition but still resolve the version ID so
    // execution records reference the correct version row.
    let versionId = null;
    if (typeof database.findLatestOrchestrationVersion === "function") {
      try {
        const versionRecord = await database.findLatestOrchestrationVersion(orchestration.id);
        if (versionRecord) versionId = versionRecord.id ?? null;
      } catch { /* version lookup is best-effort */ }
    }
    return {
      orchestration: {
        ...orchestration,
        nodes: currentNodes,
        edges: currentEdges,
      },
      versionId,
      definitionVersion: asString(orchestration.updatedAt) ?? "",
    };
  }

  if (typeof database.findLatestOrchestrationVersion !== "function") {
    return {
      orchestration,
      versionId: null,
      definitionVersion: asString(orchestration.updatedAt) ?? "",
    };
  }

  try {
    const versionRecord = await database.findLatestOrchestrationVersion(orchestration.id);
    if (!versionRecord) {
      return {
        orchestration,
        versionId: null,
        definitionVersion: asString(orchestration.updatedAt) ?? "",
      };
    }
    const definition = versionRecord.definition ?? {};
    return {
      orchestration: {
        ...orchestration,
        nodes: Array.isArray(definition.nodes) ? definition.nodes : [],
        edges: Array.isArray(definition.edges) ? definition.edges : [],
      },
      versionId: versionRecord.id ?? null,
      definitionVersion: asString(versionRecord.version) ?? asString(orchestration.updatedAt) ?? "",
    };
  } catch {
    return {
      orchestration,
      versionId: null,
      definitionVersion: asString(orchestration.updatedAt) ?? "",
    };
  }
}

function toolCategory(toolId = "") {
  const id = String(toolId).toLowerCase();
  if (id.includes("slack") || id.includes("email") || id.includes("calendar") || id.includes("message")) {
    return "communication";
  }
  if (id.includes("firewall") || id.includes("policy") || id.includes("risk") || id.includes("trace")) {
    return "security";
  }
  if (id.includes("search") || id.includes("fetch") || id.includes("pdf") || id.includes("image")) {
    return "data";
  }
  if (id.includes("cron") || id.includes("spawn") || id.includes("heartbeat") || id.includes("loop")) {
    return "automation";
  }
  return "engineering";
}

function toolTags(toolId = "", category = "engineering") {
  const tags = new Set([`#${category}`]);
  const id = String(toolId).toLowerCase();
  if (id.includes("github")) tags.add("#github");
  if (id.includes("slack")) tags.add("#messaging");
  if (id.includes("email")) tags.add("#email");
  if (id.includes("calendar")) tags.add("#calendar");
  if (id.includes("trace")) tags.add("#trace");
  if (id.includes("firewall") || id.includes("policy")) tags.add("#safety");
  if (id.includes("cron")) tags.add("#scheduler");
  return [...tags];
}

async function loadNormalizedSkillCatalog() {
  await governanceStore.ensureInitialized();
  const registryItems = await governanceStore.listTools();
  const cliItems = listOpenClawCliTools();
  const byId = new Map();

  for (const item of registryItems) {
    const toolId = String(item.toolId ?? item.name ?? "").trim();
    if (!toolId) continue;
    const category = toolCategory(toolId);
    byId.set(toolId, {
      toolId,
      name: String(item.name ?? toolId),
      description: String(item.description ?? ""),
      category,
      tags: toolTags(toolId, category),
      status: "connected",
      source: "registry",
      schema: item.schema ?? {},
    });
  }

  for (const item of cliItems) {
    const toolId = String(item.tool ?? item.name ?? "").trim();
    if (!toolId || byId.has(toolId)) continue;
    const category = toolCategory(toolId);
    byId.set(toolId, {
      toolId,
      name: toolId,
      description: `OpenClaw CLI tool${item.legacyAlias ? " (legacy alias)" : ""}`,
      category,
      tags: toolTags(toolId, category),
      status: "connected",
      source: "openclaw-cli",
      docsUrl: item.docsUrl,
    });
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function hasPersistentStorage() {
  return Boolean(database && typeof database.pool?.query === "function");
}

function normalizeImportedSkillPayload(body = {}) {
  const toolId = asString(body.toolId) ?? asString(body.name) ?? "";
  if (!toolId || toolId.trim().length === 0) {
    return { error: "toolId is required." };
  }
  if (!/^[a-zA-Z0-9._:-]{1,128}$/.test(toolId)) {
    return { error: "toolId contains unsupported characters." };
  }

  const schema = body.schema ?? {};
  if (schema == null || typeof schema !== "object" || Array.isArray(schema)) {
    return { error: "schema must be a JSON object when provided." };
  }

  return {
    payload: {
      toolId: toolId.trim(),
      name: (asString(body.name) ?? toolId).trim() || toolId.trim(),
      description: (asString(body.description) ?? "").trim(),
      schema,
      source: "manual",
    },
  };
}

async function getStoredSkillRecord(toolId) {
  if (!hasPersistentStorage()) {
    return null;
  }
  const result = await database.pool.query(
    `
      SELECT tool_id, name, description, schema_json, source, created_at, updated_at
      FROM gateway_tool_registry
      WHERE tool_id = $1
      LIMIT 1
    `,
    [toolId]
  );
  const row = result.rows[0];
  if (!row) {
    return null;
  }
  return {
    toolId: String(row.tool_id),
    name: String(row.name ?? ""),
    description: String(row.description ?? ""),
    schemaJson: String(row.schema_json ?? "{}"),
    source: String(row.source ?? "manual"),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

async function waitForSkillAuditEvidence(actor, since) {
  if (!hasPersistentStorage()) {
    return { total: 0, events: [] };
  }

  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const audit = await queryAuditChain(
        {
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          since,
        },
        { database, limit: 20 }
      );
      const events = (audit.events ?? []).filter((event) =>
        [
          "AUDIT_EVENT_TYPE_TOOL_DISPATCHED",
          "AUDIT_EVENT_TYPE_TOOL_COMPLETED",
          "AUDIT_EVENT_TYPE_TOOL_FAILED",
        ].includes(String(event.eventType))
      );
      if (events.length > 0) {
        return {
          total: Number(audit.total ?? events.length),
          events,
        };
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  } catch (error) {
    return {
      total: 0,
      events: [],
      reason: error instanceof Error ? error.message : String(error),
    };
  }

  return { total: 0, events: [] };
}

async function buildSkillExecutionProof(skillId, actor, commandName) {
  const normalizedSkillId = String(skillId ?? "").trim().toLowerCase();
  const subcommand = String(commandName ?? "list").trim().toLowerCase();

  if (!normalizedSkillId) {
    return { error: "skillId is required.", status: 400 };
  }
  if (!SKILL_EXECUTION_SUBCOMMANDS.has(subcommand)) {
    return { error: "command must be one of: list, check, info.", status: 400 };
  }
  if (!isSupportedOpenClawCliTool(normalizedSkillId)) {
    return {
      error: `Skill '${normalizedSkillId}' is not an OpenClaw CLI skill runtime target.`,
      status: 400,
    };
  }

  const proofTarget =
    subcommand === "info"
      ? [subcommand, normalizedSkillId]
      : [subcommand];

  const startedAt = nowIso();
  const proof = {
    toolId: normalizedSkillId,
    command: proofTarget,
    startedAt,
  };
  let execution;
  try {
    execution = await executeOpenClawModifierRequest(
      {
        tool: normalizedSkillId,
        args: proofTarget,
        sourceProfile: "controller_x",
        targetProfile: "worker_skills_proof",
        parseJson: true,
        json: true,
        timeoutSeconds: 30,
        maxBufferMb: 8,
      },
      actor
    );
  } catch (error) {
    return {
      ok: false,
      status: 500,
      type: "execution_error",
      error: error instanceof Error ? error.message : String(error),
      approval: null,
      policy: null,
      result: null,
      proof,
    };
  }

  if (hasPersistentStorage()) {
    proof.storage = {
      persistent: true,
      registryRecord: await getStoredSkillRecord(normalizedSkillId),
    };
    proof.audit = await waitForSkillAuditEvidence(actor, startedAt);
  } else {
    proof.storage = {
      persistent: false,
      reason: "gateway_tool_registry is unavailable because PostgreSQL is not configured.",
      registryRecord: null,
    };
    proof.audit = {
      total: 0,
      events: [],
      reason: "audit_chain is unavailable because PostgreSQL is not configured.",
    };
  }

  return {
    ok: execution.ok,
    status: execution.status,
    type: execution.type,
    error: execution.error ?? "",
    approval: execution.approval ?? null,
    policy: execution.policy ?? null,
    result: execution.result ?? null,
    proof,
  };
}

function stringifySimulationSnippet(requestBody) {
  return JSON.stringify(requestBody ?? {}, null, 2).slice(0, 4000);
}

async function compileAndPersistFirewallVersion(ownerUserId, firewall, version) {
  const compilation = compileFrontendBFirewallPolicy(version?.text ?? "", {
    firewallId: firewall.id,
    firewallName: firewall.name,
    firewallVersionId: version?.id,
    scope: firewall.scope,
    assignedAgentId: firewall.assignedAgentId,
  });
  return frontendBStore.updateFirewallVersionCompilation(ownerUserId, firewall.id, version.id, {
    compileOk: compilation.valid,
    compiledPolicy: compilation.policy,
    compileErrors: compilation.errors,
    compileWarnings: compilation.warnings,
    compiledAt: compilation.compiledAt,
  });
}

async function ensureCompiledFirewallVersion(ownerUserId, firewall, versionId) {
  const version = await frontendBStore.findFirewallVersion(ownerUserId, firewall.id, versionId);
  if (!version) {
    return null;
  }
  if (version.compiled !== null && version.compiled !== undefined) {
    return version;
  }
  return compileAndPersistFirewallVersion(ownerUserId, firewall, version);
}

function compiledFirewallEnvelope(firewall, version, compiledPolicy) {
  return {
    firewallId: firewall.id,
    firewallVersionId: version?.id ?? "",
    scope: firewall.scope,
    assignedAgentId: firewall.assignedAgentId,
    archived: firewall.archived === true,
    policy: compiledPolicy ?? version?.compiledPolicy ?? null,
  };
}

async function listCompiledActiveFirewalls(ownerUserId) {
  const firewalls = await frontendBStore.listActiveFirewalls(ownerUserId);
  const compiled = [];
  const failures = [];
  for (const firewall of firewalls) {
    const activeVersion = (firewall.policyVersions ?? []).find((entry) => entry.active);
    if (!activeVersion) {
      continue;
    }
    const compiledVersion = await ensureCompiledFirewallVersion(ownerUserId, firewall, activeVersion.id);
    if (!compiledVersion?.compiled || !compiledVersion.compiledPolicy) {
      failures.push({
        firewallId: firewall.id,
        firewallName: firewall.name,
        versionId: activeVersion.id,
        errors: compiledVersion?.compileErrors ?? ["Active firewall version is not compilable."],
      });
      continue;
    }
    compiled.push(compiledFirewallEnvelope(firewall, compiledVersion));
  }
  return { compiled, failures };
}

async function activateCompiledFirewallPolicies(ownerUserId) {
  const active = await listCompiledActiveFirewalls(ownerUserId);
  if (active.failures.length > 0) {
    const detail = active.failures
      .map((entry) => `${entry.firewallName || entry.firewallId}: ${(entry.errors ?? []).join("; ")}`)
      .join(" | ");
    throw new Error(`Active firewall bundle contains non-compilable versions. ${detail}`);
  }
  const payload = buildModifierPolicyPayloadFromFirewallBundle(active.compiled);
  await saveOpenClawModifierPolicyVersion(payload, {
    userId: ownerUserId,
    tenantId: `user:${ownerUserId}`,
    orgId: "default",
  });
  return payload;
}

async function buildFirewallBundlePreview(ownerUserId, firewall, candidateVersion, candidatePolicy) {
  const active = await listCompiledActiveFirewalls(ownerUserId);
  const retained = active.compiled.filter((entry) => String(entry.firewallId) !== String(firewall.id));
  if (candidatePolicy) {
    retained.push(compiledFirewallEnvelope(firewall, candidateVersion, candidatePolicy));
  }
  return buildCompiledFirewallBundle(retained);
}

function parseSimulationRequestBody(rawValue) {
  if (rawValue && typeof rawValue === "object") {
    return rawValue;
  }
  return parseYaml(String(rawValue ?? ""));
}

async function createFrontendBNotification(userId, title, body, type = "system_alerts", data = {}) {
  if (typeof database.createNotification !== "function") {
    return null;
  }
  return database.createNotification({
    userId,
    type,
    title,
    body,
    data,
  });
}

function toOpenClawSessionId(value) {
  const normalized = String(value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || `frontend-b-task-${Date.now().toString(36)}`;
}

async function dispatchTask(ownerUserId, task) {
  const assignment = task.assignment ?? {};
  if (assignment.type === "agent" && assignment.agentId) {
    const agent = await requireOwnedAgent(ownerUserId, assignment.agentId);
    if (!agent) {
      throw new Error("Assigned agent not found.");
    }
    const result = await runOpenClawLongform({
      objective: task.prompt || task.title,
      agentId: agent.id,
      sessionId: toOpenClawSessionId(`frontend-b-task-${task.id}`),
    });
    return { kind: "agent", id: result.runId };
  }
  if (assignment.type === "orchestration" && assignment.orchestrationId) {
    const resolved = await resolveTaskOrchestrationRuntime(ownerUserId, assignment.orchestrationId);
    if (!resolved) {
      throw new Error("Assigned orchestration not found.");
    }
    const input = { objective: task.prompt || task.title };
    const context = { source: "frontend-b-task", taskId: task.id };
    const result = createOrchestrationExecution(resolved.orchestration, {
      mode: "live",
      input,
      requestedBy: ownerUserId,
      context,
      definitionVersion: resolved.definitionVersion,
    });
    if (!result?.ok) {
      throw new Error(result?.error || "Execution creation failed.");
    }
    if (typeof database.createOrchestrationExecutionRecord === "function") {
      await database.createOrchestrationExecutionRecord({
        id: result.executionId,
        orchestrationId: resolved.orchestration.id,
        versionId: resolved.versionId,
        status: result.status ?? "queued",
        mode: "live",
        requestedBy: ownerUserId,
        input,
        context,
        runLineage: [],
        createdAt: result.createdAt,
        startedAt: result.startedAt || null,
        completedAt: null,
      });
    }
    await ensureExecutionPersistenceWatch(result.executionId);
    return { kind: "orchestration", id: result.executionId };
  }
  throw new Error("Assigned target is invalid.");
}

export function registerFrontendBRoutes(app) {
  app.get("/api/tasks", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) return auth.error;
    const items = await frontendBStore.listTasks(auth.session.user.id);
    return c.json({ ok: true, items: items.map((task) => taskShape(task)) });
  });

  app.get("/api/tasks/:taskId", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) return auth.error;
    const task = await frontendBStore.findTask(auth.session.user.id, asString(c.req.param("taskId")));
    if (!task) {
      return c.json({ error: "Task not found." }, 404);
    }
    return c.json({ ok: true, task: taskShape(task) });
  });

  app.post("/api/tasks", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) return auth.error;
    const body = await readJsonBody(c);
    const title = asString(body.title);
    if (!title) {
      return c.json({ error: "title is required." }, 400);
    }
    const parsedSchedule = validateTaskSchedule(body.schedule ?? {});
    if (parsedSchedule.error) {
      return c.json({ error: parsedSchedule.error }, 400);
    }
    const agentId = asString(body.assignment?.agentId);
    const orchestrationId = asString(body.assignment?.orchestrationId);
    if ((agentId && orchestrationId) || (!agentId && !orchestrationId)) {
      return c.json({ error: "Provide exactly one assignment target." }, 400);
    }
    if (agentId && !(await requireOwnedAgent(auth.session.user.id, agentId))) {
      return c.json({ error: "Assigned agent not found." }, 404);
    }
    if (orchestrationId && !(await requireOwnedOrchestration(auth.session.user.id, orchestrationId))) {
      return c.json({ error: "Assigned orchestration not found." }, 404);
    }
    const schedule = parsedSchedule.schedule;
    const task = await frontendBStore.createTask(auth.session.user.id, {
      title,
      prompt: asString(body.prompt) ?? "",
      schedule,
      assignment: agentId
        ? { type: "agent", agentId }
        : { type: "orchestration", orchestrationId },
      nextRunAt: schedule.startAt,
      status: "scheduled",
    });
    emitAuditEvent({
      eventType: "AUDIT_EVENT_TYPE_POLICY_EVALUATED",
      sourceService: "gateway-api",
      userId: auth.session.user.id,
      summary: `Frontend B task created: ${task.title}`,
      payload: { ownerUserId: auth.session.user.id, taskId: task.id, schedule },
    });
    await createFrontendBNotification(
      auth.session.user.id,
      "Task scheduled",
      `${task.title} was scheduled.`,
      "system_alerts",
      { taskId: task.id }
    );
    return c.json({ ok: true, task: taskShape(task) }, 201);
  });

  app.patch("/api/tasks/:taskId", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) return auth.error;
    const taskId = asString(c.req.param("taskId"));
    const existing = await frontendBStore.findTask(auth.session.user.id, taskId);
    if (!existing) {
      return c.json({ error: "Task not found." }, 404);
    }
    const body = await readJsonBody(c);
    let schedule = existing.schedule;
    if (body.schedule) {
      const parsedSchedule = validateTaskSchedule(body.schedule, { allowPastStartAt: false });
      if (parsedSchedule.error) {
        return c.json({ error: parsedSchedule.error }, 400);
      }
      schedule = parsedSchedule.schedule;
    }
    const nextRunAt = computeNextRunAt(schedule, existing.runCount, Date.now());
    const updated = await frontendBStore.updateTask(auth.session.user.id, taskId, {
      title: body.title !== undefined ? asString(body.title) ?? existing.title : undefined,
      prompt: body.prompt !== undefined ? asString(body.prompt) ?? "" : undefined,
      schedule: body.schedule ? schedule : undefined,
      nextRunAt: body.schedule ? nextRunAt : undefined,
    });
    return c.json({ ok: true, task: taskShape(updated) });
  });

  app.delete("/api/tasks/:taskId", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) return auth.error;
    const deleted = await frontendBStore.deleteTask(auth.session.user.id, asString(c.req.param("taskId")));
    if (!deleted) {
      return c.json({ error: "Task not found." }, 404);
    }
    return c.json({ ok: true });
  });

  app.post("/api/tasks/:taskId/assign", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) return auth.error;
    const taskId = asString(c.req.param("taskId"));
    const existing = await frontendBStore.findTask(auth.session.user.id, taskId);
    if (!existing) {
      return c.json({ error: "Task not found." }, 404);
    }
    const body = await readJsonBody(c);
    const agentId = asString(body.agentId);
    const orchestrationId = asString(body.orchestrationId);
    if ((agentId && orchestrationId) || (!agentId && !orchestrationId)) {
      return c.json({ error: "Provide exactly one assignment target." }, 400);
    }
    if (agentId && !(await requireOwnedAgent(auth.session.user.id, agentId))) {
      return c.json({ error: "Assigned agent not found." }, 404);
    }
    if (orchestrationId && !(await requireOwnedOrchestration(auth.session.user.id, orchestrationId))) {
      return c.json({ error: "Assigned orchestration not found." }, 404);
    }
    const updated = await frontendBStore.updateTask(auth.session.user.id, taskId, {
      assignment: agentId
        ? { type: "agent", agentId }
        : { type: "orchestration", orchestrationId },
    });
    return c.json({ ok: true, task: taskShape(updated) });
  });

  app.post("/api/tasks/:taskId/pause", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) return auth.error;
    const taskId = asString(c.req.param("taskId"));
    const updated = await frontendBStore.updateTask(auth.session.user.id, taskId, {
      status: "paused",
    });
    if (!updated) {
      return c.json({ error: "Task not found." }, 404);
    }
    await createFrontendBNotification(auth.session.user.id, "Task paused", `${updated.title} was paused.`, "system_alerts", { taskId });
    return c.json({ ok: true, task: taskShape(updated) });
  });

  app.post("/api/tasks/:taskId/resume", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) return auth.error;
    const taskId = asString(c.req.param("taskId"));
    const existing = await frontendBStore.findTask(auth.session.user.id, taskId);
    if (!existing) {
      return c.json({ error: "Task not found." }, 404);
    }
    const nextRunAt = computeNextRunAt(existing.schedule, existing.runCount, Date.now());
    const terminal = terminalTaskState(existing, nextRunAt);
    const updated = await frontendBStore.updateTask(auth.session.user.id, taskId, terminal.completed
      ? {
          status: "completed",
          nextRunAt: null,
          terminalState: "completed",
          terminalReason: terminal.reason,
        }
      : {
          status: "scheduled",
          nextRunAt,
        });
    await createFrontendBNotification(
      auth.session.user.id,
      terminal.completed ? "Task completed" : "Task resumed",
      `${updated.title} ${terminal.completed ? "completed." : "was resumed."}`,
      "system_alerts",
      { taskId }
    );
    return c.json({ ok: true, task: taskShape(updated) });
  });

  app.post("/api/tasks/:taskId/run-now", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) return auth.error;
    const taskId = asString(c.req.param("taskId"));
    const existing = await frontendBStore.findTask(auth.session.user.id, taskId);
    if (!existing) {
      return c.json({ error: "Task not found." }, 404);
    }
    try {
      await frontendBStore.updateTask(auth.session.user.id, taskId, { status: "running" });
      const dispatch = await dispatchTask(auth.session.user.id, existing);
      const nextRunCount = Number(existing.runCount ?? 0) + 1;
      const nextRunAt = computeNextRunAt(existing.schedule, nextRunCount, Date.now());
      const terminal = terminalTaskState({ ...existing, runCount: nextRunCount }, nextRunAt);
      const updated = await frontendBStore.updateTask(auth.session.user.id, taskId, {
        runCount: nextRunCount,
        lastRunAt: nowIso(),
        nextRunAt: terminal.completed ? null : nextRunAt,
        status: existing.status === "paused"
          ? "paused"
          : terminal.completed
            ? "completed"
            : "scheduled",
        terminalState: terminal.completed ? "completed" : "",
        terminalReason: terminal.completed ? terminal.reason : "",
      });
      emitAuditEvent({
        eventType: "AUDIT_EVENT_TYPE_POLICY_EVALUATED",
        sourceService: "gateway-api",
        userId: auth.session.user.id,
        summary: `Frontend B task dispatched: ${updated.title}`,
        payload: { ownerUserId: auth.session.user.id, taskId, dispatch },
      });
      await createFrontendBNotification(
        auth.session.user.id,
        "Task dispatched",
        `${updated.title} was dispatched.`,
        "system_alerts",
        { taskId, dispatch }
      );
      return c.json({ ok: true, task: taskShape(updated), dispatch });
    } catch (error) {
      const failed = await frontendBStore.updateTask(auth.session.user.id, taskId, {
        status: "failed",
        terminalState: "failed",
        terminalReason: error instanceof Error ? error.message : String(error),
      });
      await createFrontendBNotification(
        auth.session.user.id,
        "Task failed",
        `${existing.title} failed to dispatch.`,
        "run_failures",
        { taskId, reason: failed?.terminalReason ?? "" }
      );
      return c.json({ error: failed?.terminalReason || "Task dispatch failed." }, 409);
    }
  });

  app.get("/api/firewalls", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) return auth.error;
    const items = await frontendBStore.listFirewalls(auth.session.user.id);
    return c.json({ ok: true, items });
  });

  app.get("/api/firewalls/:id", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) return auth.error;
    const firewall = await frontendBStore.findFirewall(auth.session.user.id, asString(c.req.param("id")));
    if (!firewall) {
      return c.json({ error: "Firewall not found." }, 404);
    }
    return c.json({ ok: true, firewall });
  });

  // ── POST /api/firewalls/preview — validate policy YAML without persisting ──
  app.post("/api/firewalls/preview", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) return auth.error;
    const body = await readJsonBody(c);
    const policyText = asString(body.policyText) ?? "";
    if (!policyText) {
      return c.json({ ok: false, error: "policyText is required.", valid: false, errors: ["policyText is required."], warnings: [] }, 400);
    }
    const compilation = compileFrontendBFirewallPolicy(policyText, {
      firewallId: "preview",
      firewallName: asString(body.name) ?? "preview",
      firewallVersionId: "preview",
      scope: asString(body.scope) ?? "global",
      assignedAgentId: asString(body.assignedAgentId) ?? null,
    });
    return c.json({
      ok: true,
      valid: compilation.valid,
      errors: compilation.errors,
      warnings: compilation.warnings,
      ruleCount: compilation.policy?.rules?.length ?? 0,
      compiledAt: compilation.compiledAt,
    });
  });

  app.post("/api/firewalls", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) return auth.error;
    const body = await readJsonBody(c);
    const name = asString(body.name);
    const policyText = asString(body.policyText);
    const scope = asString(body.scope) === "agent" ? "agent" : "global";
    const assignedAgentId = scope === "agent" ? asString(body.assignedAgentId) : null;
    if (!name || !policyText) {
      return c.json({ error: "name and policyText are required." }, 400);
    }
    if (name.length > 255) {
      return c.json({ error: "name must be 255 characters or less." }, 400);
    }
    const VALID_ENFORCEMENT_LEVELS = ["hard-mandatory", "soft-mandatory", "advisory"];
    const enforcementLevel = asString(body.enforcementLevel) ?? "hard-mandatory";
    if (!VALID_ENFORCEMENT_LEVELS.includes(enforcementLevel)) {
      return c.json({ error: `enforcementLevel must be one of: ${VALID_ENFORCEMENT_LEVELS.join(", ")}` }, 400);
    }
    if (scope === "agent" && !assignedAgentId) {
      return c.json({ error: "assignedAgentId is required for agent-scoped firewalls." }, 400);
    }
    if (assignedAgentId && !(await requireOwnedAgent(auth.session.user.id, assignedAgentId))) {
      return c.json({ error: "Assigned agent not found." }, 404);
    }
    const firewall = await frontendBStore.createFirewall(auth.session.user.id, {
      name,
      folder: asString(body.folder) ?? "root",
      scope,
      assignedAgentId,
      description: asString(body.description) ?? "",
      enforcementLevel,
      policyText,
      activeVersionId: null,
      createdBy: auth.session.user.username || auth.session.user.id,
    });
    const draftVersion = firewall?.policyVersions?.[0] ?? null;
    let compiledVersion = null;
    if (draftVersion) {
      compiledVersion = await compileAndPersistFirewallVersion(auth.session.user.id, firewall, draftVersion);
      await frontendBStore.appendFirewallEvent(auth.session.user.id, firewall.id, {
        type: compiledVersion.compiled ? "compile_passed" : "compile_failed",
        level: compiledVersion.compiled ? "safe" : "warn",
        message: compiledVersion.compiled
          ? "Firewall revision compiled successfully."
          : "Firewall revision failed YAML compilation.",
        payload: {
          versionId: compiledVersion.id,
          errors: compiledVersion.compileErrors,
          warnings: compiledVersion.compileWarnings,
        },
      });
      if (compiledVersion.compiled) {
        await frontendBStore.updateFirewall(auth.session.user.id, firewall.id, {
          activeVersionId: compiledVersion.id,
        });
        try {
          await activateCompiledFirewallPolicies(auth.session.user.id);
          await frontendBStore.appendFirewallEvent(auth.session.user.id, firewall.id, {
            type: "activated",
            level: "safe",
            message: "Firewall version activated.",
            payload: { versionId: compiledVersion.id },
          });
        } catch (error) {
          await frontendBStore.updateFirewall(auth.session.user.id, firewall.id, {
            activeVersionId: null,
          });
          await frontendBStore.appendFirewallEvent(auth.session.user.id, firewall.id, {
            type: "activation_failed",
            level: "warn",
            message: error instanceof Error ? error.message : String(error),
            payload: { versionId: compiledVersion.id },
          });
        }
      }
    }
    return c.json({
      ok: true,
      firewall: await frontendBStore.findFirewall(auth.session.user.id, firewall.id),
      validation: compiledVersion
        ? {
            valid: Boolean(compiledVersion.compiled),
            errors: compiledVersion.compileErrors,
            warnings: compiledVersion.compileWarnings,
          }
        : null,
    }, 201);
  });

  app.patch("/api/firewalls/:id", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) return auth.error;
    const firewallId = asString(c.req.param("id"));
    const existing = await frontendBStore.findFirewall(auth.session.user.id, firewallId);
    if (!existing) {
      return c.json({ error: "Firewall not found." }, 404);
    }
    const body = await readJsonBody(c);
    const scope = body.scope !== undefined
      ? (asString(body.scope) === "agent" ? "agent" : "global")
      : existing.scope;
    const assignedAgentId = scope === "agent"
      ? (body.assignedAgentId !== undefined ? asString(body.assignedAgentId) : existing.assignedAgentId)
      : null;
    const patchedName = body.name !== undefined ? asString(body.name) ?? existing.name : undefined;
    if (patchedName !== undefined && patchedName.length > 255) {
      return c.json({ error: "name must be 255 characters or less." }, 400);
    }
    const VALID_ENFORCEMENT_LEVELS = ["hard-mandatory", "soft-mandatory", "advisory"];
    const patchedEnforcement = body.enforcementLevel !== undefined ? asString(body.enforcementLevel) ?? "hard-mandatory" : undefined;
    if (patchedEnforcement !== undefined && !VALID_ENFORCEMENT_LEVELS.includes(patchedEnforcement)) {
      return c.json({ error: `enforcementLevel must be one of: ${VALID_ENFORCEMENT_LEVELS.join(", ")}` }, 400);
    }
    if (scope === "agent" && !assignedAgentId) {
      return c.json({ error: "assignedAgentId is required for agent-scoped firewalls." }, 400);
    }
    if (assignedAgentId && !(await requireOwnedAgent(auth.session.user.id, assignedAgentId))) {
      return c.json({ error: "Assigned agent not found." }, 404);
    }
    await frontendBStore.updateFirewall(auth.session.user.id, firewallId, {
      name: patchedName,
      folder: body.folder !== undefined ? asString(body.folder) ?? "root" : undefined,
      scope,
      assignedAgentId,
      description: body.description !== undefined ? asString(body.description) ?? "" : undefined,
      enforcementLevel: patchedEnforcement,
    });
    let activationError = "";
    if (body.policyText !== undefined) {
      const version = await frontendBStore.createFirewallVersion(
        auth.session.user.id,
        firewallId,
        asString(body.policyText) ?? "",
        auth.session.user.username || auth.session.user.id
      );
      await frontendBStore.updateFirewall(auth.session.user.id, firewallId, {
        activeVersionId: version.id,
      });
      await frontendBStore.appendFirewallEvent(auth.session.user.id, firewallId, {
        type: "revision_saved",
        level: "safe",
        message: "Policy revision saved.",
      });
      const compiledVersion = await compileAndPersistFirewallVersion(auth.session.user.id, {
        ...existing,
        scope,
        assignedAgentId,
      }, version);
      await frontendBStore.appendFirewallEvent(auth.session.user.id, firewallId, {
        type: compiledVersion.compiled ? "compile_passed" : "compile_failed",
        level: compiledVersion.compiled ? "safe" : "warn",
        message: compiledVersion.compiled
          ? "Firewall revision compiled successfully."
          : "Firewall revision failed YAML compilation.",
        payload: {
          versionId: compiledVersion.id,
          errors: compiledVersion.compileErrors,
          warnings: compiledVersion.compileWarnings,
        },
      });
      if (compiledVersion.compiled) {
        const priorActiveVersionId = existing.policyVersions?.find((entry) => entry.active)?.id ?? null;
        await frontendBStore.updateFirewall(auth.session.user.id, firewallId, {
          activeVersionId: compiledVersion.id,
        });
        try {
          await activateCompiledFirewallPolicies(auth.session.user.id);
          await frontendBStore.appendFirewallEvent(auth.session.user.id, firewallId, {
            type: "activated",
            level: "safe",
            message: "Firewall version activated.",
            payload: { versionId: compiledVersion.id },
          });
        } catch (error) {
          activationError = error instanceof Error ? error.message : String(error);
          await frontendBStore.updateFirewall(auth.session.user.id, firewallId, {
            activeVersionId: priorActiveVersionId,
          });
          await frontendBStore.appendFirewallEvent(auth.session.user.id, firewallId, {
            type: "activation_failed",
            level: "warn",
            message: activationError,
            payload: { versionId: compiledVersion.id },
          });
        }
      }
    } else if (
      scope !== existing.scope
      || String(assignedAgentId ?? "") !== String(existing.assignedAgentId ?? "")
    ) {
      try {
        await activateCompiledFirewallPolicies(auth.session.user.id);
      } catch (error) {
        activationError = error instanceof Error ? error.message : String(error);
      }
    }
    const firewall = await frontendBStore.findFirewall(auth.session.user.id, firewallId);
    return c.json({
      ok: !activationError,
      firewall,
      error: activationError || undefined,
    }, activationError ? 409 : 200);
  });

  app.post("/api/firewalls/:id/archive", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) return auth.error;
    const firewallId = asString(c.req.param("id"));
    const firewall = await frontendBStore.updateFirewall(auth.session.user.id, firewallId, { archived: true });
    if (!firewall) {
      return c.json({ error: "Firewall not found." }, 404);
    }
    await frontendBStore.appendFirewallEvent(auth.session.user.id, firewallId, {
      type: "archived",
      level: "info",
      message: "Firewall archived.",
    });
    try {
      await activateCompiledFirewallPolicies(auth.session.user.id);
    } catch (error) {
      await frontendBStore.updateFirewall(auth.session.user.id, firewallId, { archived: false });
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 409);
    }
    return c.json({ ok: true, firewall: await frontendBStore.findFirewall(auth.session.user.id, firewallId) });
  });

  app.post("/api/firewalls/:id/restore", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) return auth.error;
    const firewallId = asString(c.req.param("id"));
    const firewall = await frontendBStore.updateFirewall(auth.session.user.id, firewallId, { archived: false });
    if (!firewall) {
      return c.json({ error: "Firewall not found." }, 404);
    }
    await frontendBStore.appendFirewallEvent(auth.session.user.id, firewallId, {
      type: "restored",
      level: "safe",
      message: "Firewall restored.",
    });
    try {
      await activateCompiledFirewallPolicies(auth.session.user.id);
    } catch (error) {
      await frontendBStore.updateFirewall(auth.session.user.id, firewallId, { archived: true });
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 409);
    }
    return c.json({ ok: true, firewall: await frontendBStore.findFirewall(auth.session.user.id, firewallId) });
  });

  app.get("/api/firewalls/:id/versions", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) return auth.error;
    const items = await frontendBStore.listFirewallVersions(auth.session.user.id, asString(c.req.param("id")));
    return c.json({ ok: true, items });
  });

  app.post("/api/firewalls/:id/versions", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) return auth.error;
    const firewallId = asString(c.req.param("id"));
    const firewall = await frontendBStore.findFirewall(auth.session.user.id, firewallId);
    if (!firewall) {
      return c.json({ error: "Firewall not found." }, 404);
    }
    const body = await readJsonBody(c);
    const policyText = asString(body.policyText);
    if (!policyText) {
      return c.json({ error: "policyText is required." }, 400);
    }
    const version = await frontendBStore.createFirewallVersion(
      auth.session.user.id,
      firewallId,
      policyText,
      auth.session.user.username || auth.session.user.id
    );
    const compiledVersion = await compileAndPersistFirewallVersion(auth.session.user.id, firewall, version);
    await frontendBStore.appendFirewallEvent(auth.session.user.id, firewallId, {
      type: "revision_saved",
      level: "safe",
      message: "Policy revision saved.",
    });
    await frontendBStore.appendFirewallEvent(auth.session.user.id, firewallId, {
      type: compiledVersion.compiled ? "compile_passed" : "compile_failed",
      level: compiledVersion.compiled ? "safe" : "warn",
      message: compiledVersion.compiled
        ? "Firewall revision compiled successfully."
        : "Firewall revision failed YAML compilation.",
      payload: {
        versionId: compiledVersion.id,
        errors: compiledVersion.compileErrors,
        warnings: compiledVersion.compileWarnings,
      },
    });
    return c.json({ ok: true, version: compiledVersion }, 201);
  });

  app.post("/api/firewalls/:id/versions/:versionId/activate", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) return auth.error;
    const firewallId = asString(c.req.param("id"));
    const versionId = asString(c.req.param("versionId"));
    const firewall = await frontendBStore.findFirewall(auth.session.user.id, firewallId);
    if (!firewall) {
      return c.json({ error: "Firewall not found." }, 404);
    }
    const version = await ensureCompiledFirewallVersion(auth.session.user.id, firewall, versionId);
    if (!version) {
      return c.json({ error: "Firewall version not found." }, 404);
    }
    if (!version.compiled || !version.compiledPolicy) {
      await frontendBStore.appendFirewallEvent(auth.session.user.id, firewallId, {
        type: "activation_failed",
        level: "warn",
        message: "Firewall version cannot be activated until it compiles successfully.",
        payload: {
          versionId,
          errors: version.compileErrors,
          warnings: version.compileWarnings,
        },
      });
      return c.json({
        error: "Firewall version failed YAML compilation.",
        errors: version.compileErrors,
        warnings: version.compileWarnings,
      }, 400);
    }
    const priorActiveVersionId = firewall.policyVersions?.find((item) => item.active)?.id ?? null;
    await frontendBStore.updateFirewall(auth.session.user.id, firewallId, { activeVersionId: versionId });
    try {
      await activateCompiledFirewallPolicies(auth.session.user.id);
    } catch (error) {
      await frontendBStore.updateFirewall(auth.session.user.id, firewallId, {
        activeVersionId: priorActiveVersionId,
      });
      await frontendBStore.appendFirewallEvent(auth.session.user.id, firewallId, {
        type: "activation_failed",
        level: "warn",
        message: error instanceof Error ? error.message : String(error),
        payload: { versionId },
      });
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 409);
    }
    await frontendBStore.appendFirewallEvent(auth.session.user.id, firewallId, {
      type: "activated",
      level: "safe",
      message: "Firewall version activated.",
      payload: { versionId },
    });
    return c.json({ ok: true, firewall: await frontendBStore.findFirewall(auth.session.user.id, firewallId) });
  });

  app.post("/api/firewalls/:id/validate", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) return auth.error;
    const firewallId = asString(c.req.param("id"));
    const firewall = await frontendBStore.findFirewall(auth.session.user.id, firewallId);
    if (!firewall) {
      return c.json({ error: "Firewall not found." }, 404);
    }
    const body = await readJsonBody(c);
    const selectedVersionId = asString(body.versionId) ?? "";
    const version =
      selectedVersionId
        ? await frontendBStore.findFirewallVersion(auth.session.user.id, firewallId, selectedVersionId)
        : (firewall.policyVersions ?? []).find((entry) => entry.active) ?? firewall.policyVersions?.[0] ?? null;
    if (selectedVersionId && !version) {
      return c.json({ error: "Firewall version not found." }, 404);
    }
    const candidateCompilation = body.policyText !== undefined
      ? compileFrontendBFirewallPolicy(asString(body.policyText) ?? "", {
          firewallId: firewall.id,
          firewallName: firewall.name,
          firewallVersionId: version?.id ?? "",
          scope: firewall.scope,
          assignedAgentId: firewall.assignedAgentId,
        })
      : await ensureCompiledFirewallVersion(auth.session.user.id, firewall, version?.id ?? "");
    if (!candidateCompilation) {
      return c.json({ error: "Firewall version not found." }, 404);
    }
    const compiledPolicy = candidateCompilation.policy ?? candidateCompilation.compiledPolicy ?? null;
    const previewBundle = await buildFirewallBundlePreview(
      auth.session.user.id,
      firewall,
      version,
      compiledPolicy
    );
    const previewAgentId =
      firewall.scope === "agent" ? firewall.assignedAgentId : asString(body.agentId) ?? "";
    const effectivePreview = resolveCompiledFirewallPolicy(previewBundle, previewAgentId);
    await frontendBStore.appendFirewallEvent(auth.session.user.id, firewallId, {
      type: (candidateCompilation.valid ?? candidateCompilation.compiled)
        ? "validate_passed"
        : "validate_blocked",
      level: (candidateCompilation.valid ?? candidateCompilation.compiled) ? "safe" : "warn",
      message: (candidateCompilation.valid ?? candidateCompilation.compiled)
        ? "Policy validation passed."
        : "Policy validation failed.",
      payload: {
        errors: candidateCompilation.errors ?? candidateCompilation.compileErrors ?? [],
        warnings: candidateCompilation.warnings ?? candidateCompilation.compileWarnings ?? [],
        effectiveScope: effectivePreview.scope,
      },
    });
    return c.json({
      ok: Boolean(candidateCompilation.valid ?? candidateCompilation.compiled),
      valid: Boolean(candidateCompilation.valid ?? candidateCompilation.compiled),
      errors: candidateCompilation.errors ?? candidateCompilation.compileErrors ?? [],
      warnings: candidateCompilation.warnings ?? candidateCompilation.compileWarnings ?? [],
      diagnostics: candidateCompilation.diagnostics ?? {
        compiledAt: candidateCompilation.compiledAt ?? candidateCompilation.compiledAt ?? null,
      },
      effectivePolicyPreview: {
        scope: effectivePreview.scope,
        policy: effectivePreview.policy,
      },
    }, (candidateCompilation.valid ?? candidateCompilation.compiled) ? 200 : 400);
  });

  app.post("/api/firewalls/:id/simulate", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) return auth.error;
    const firewallId = asString(c.req.param("id"));
    const firewall = await frontendBStore.findFirewall(auth.session.user.id, firewallId);
    if (!firewall) {
      return c.json({ error: "Firewall not found." }, 404);
    }
    const body = await readJsonBody(c);
    const prompt = body.request ?? asString(body.prompt);
    if (!prompt) {
      return c.json({ error: "prompt is required." }, 400);
    }
    const selectedVersionId = asString(body.versionId) ?? "";
    const version =
      selectedVersionId
        ? await frontendBStore.findFirewallVersion(auth.session.user.id, firewallId, selectedVersionId)
        : (firewall.policyVersions ?? []).find((entry) => entry.active) ?? firewall.policyVersions?.[0] ?? null;
    if (selectedVersionId && !version) {
      return c.json({ error: "Firewall version not found." }, 404);
    }
    const candidateCompilation = body.policyText !== undefined
      ? compileFrontendBFirewallPolicy(asString(body.policyText) ?? "", {
          firewallId: firewall.id,
          firewallName: firewall.name,
          firewallVersionId: version?.id ?? "",
          scope: firewall.scope,
          assignedAgentId: firewall.assignedAgentId,
        })
      : await ensureCompiledFirewallVersion(auth.session.user.id, firewall, version?.id ?? "");
    if (!candidateCompilation) {
      return c.json({ error: "Firewall version not found." }, 404);
    }
    if (!(candidateCompilation.valid ?? candidateCompilation.compiled) || !(candidateCompilation.policy ?? candidateCompilation.compiledPolicy)) {
      const errors = candidateCompilation.errors ?? candidateCompilation.compileErrors ?? [];
      const warnings = candidateCompilation.warnings ?? candidateCompilation.compileWarnings ?? [];
      await frontendBStore.appendFirewallEvent(auth.session.user.id, firewallId, {
        type: "simulate_blocked",
        level: "warn",
        message: "Simulation blocked because the candidate policy failed compilation.",
        payload: {
          reason: errors.join("; ") || "Policy compilation failed.",
          destination: "modifier",
          snippet: String(body.prompt ?? "").slice(0, 4000),
          warnings,
        },
      });
      return c.json({
        error: "Firewall version failed YAML compilation.",
        errors,
        warnings,
      }, 400);
    }
    let requestBody;
    try {
      requestBody = parseSimulationRequestBody(prompt);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 400);
    }
    const bundle = await buildFirewallBundlePreview(
      auth.session.user.id,
      firewall,
      version,
      candidateCompilation.policy ?? candidateCompilation.compiledPolicy
    );
    const requestedAgentId =
      firewall.scope === "agent" ? firewall.assignedAgentId : asString(body.agentId) ?? "";
    const resolved = resolveCompiledFirewallPolicy(bundle, requestedAgentId);
    const result = simulateModifierPolicy(requestBody, resolved.policy);
    await frontendBStore.appendFirewallEvent(auth.session.user.id, firewallId, {
      type: result.blocked ? "simulate_blocked" : "simulate_allowed",
      level: result.blocked ? "warn" : "safe",
      message: result.blocked
        ? "Simulation request blocked by effective modifier policy."
        : "Simulation request allowed by effective modifier policy.",
      payload: {
        reason: result.reasons?.[0] ?? (result.blocked ? "Blocked by policy." : "Allowed by policy."),
        destination: resolved.scope,
        snippet: stringifySimulationSnippet(requestBody),
        warnings: result.warnings,
      },
    });
    return c.json({
      ok: true,
      result: {
        ...result,
        resolvedScope: resolved.scope,
        compiler: {
          errors: candidateCompilation.errors ?? candidateCompilation.compileErrors ?? [],
          warnings: candidateCompilation.warnings ?? candidateCompilation.compileWarnings ?? [],
        },
        at: nowIso(),
      },
    });
  });

  app.post("/api/firewalls/:id/entries/text", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) return auth.error;
    const firewallId = asString(c.req.param("id"));
    const firewall = await frontendBStore.findFirewall(auth.session.user.id, firewallId);
    if (!firewall) {
      return c.json({ error: "Firewall not found." }, 404);
    }
    const body = await readJsonBody(c);
    const preview = asString(body.preview) ?? asString(body.content) ?? "";
    if (!preview.trim()) {
      return c.json({ error: "content is required." }, 400);
    }
    const entry = await frontendBStore.addFirewallEntry(auth.session.user.id, firewallId, {
      kind: "text",
      name: asString(body.name) ?? `policy-context-${Date.now()}.txt`,
      mimeType: "text/plain",
      sizeBytes: preview.length,
      preview: preview.slice(0, 4000),
    });
    await frontendBStore.appendFirewallEvent(auth.session.user.id, firewallId, {
      type: "entry_added",
      level: "safe",
      message: `Policy context snippet "${entry.name}" added.`,
    });
    return c.json({ ok: true, entry }, 201);
  });

  app.post("/api/firewalls/:id/entries/file", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) return auth.error;
    const firewallId = asString(c.req.param("id"));
    const firewall = await frontendBStore.findFirewall(auth.session.user.id, firewallId);
    if (!firewall) {
      return c.json({ error: "Firewall not found." }, 404);
    }
    const form = await c.req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) {
      return c.json({ error: "file is required." }, 400);
    }
    const text = await file.text().catch(() => "");
    const entry = await frontendBStore.addFirewallEntry(auth.session.user.id, firewallId, {
      kind: "file",
      name: file.name || "upload.txt",
      mimeType: file.type || "application/octet-stream",
      sizeBytes: Number(file.size ?? 0),
      preview: text.slice(0, 4000),
    });
    await frontendBStore.appendFirewallEvent(auth.session.user.id, firewallId, {
      type: "entry_added",
      level: "safe",
      message: `Scanned uploaded reference file "${entry.name}".`,
    });
    return c.json({ ok: true, entry }, 201);
  });

  app.delete("/api/firewalls/:id/entries/:entryId", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) return auth.error;
    const deleted = await frontendBStore.deleteFirewallEntry(
      auth.session.user.id,
      asString(c.req.param("id")),
      asString(c.req.param("entryId"))
    );
    if (!deleted) {
      return c.json({ error: "Firewall entry not found." }, 404);
    }
    return c.json({ ok: true });
  });

  app.get("/api/skills", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) return auth.error;
    return c.json({ ok: true, items: await loadNormalizedSkillCatalog() });
  });

  // ── MCP Registry marketplace ─────────────────────────────────────
  const _mcpRegistryCache = { servers: [], ts: 0 };
  const MCP_REGISTRY_TTL = 5 * 60_000; // 5 min cache

  async function fetchMcpRegistry(cursor, limit = 100) {
    const url = new URL("https://registry.modelcontextprotocol.io/v0.1/servers");
    url.searchParams.set("limit", String(limit));
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`MCP Registry ${res.status}`);
    return res.json();
  }

  async function getAllMcpRegistryServers() {
    if (Date.now() - _mcpRegistryCache.ts < MCP_REGISTRY_TTL && _mcpRegistryCache.servers.length > 0) {
      return _mcpRegistryCache.servers;
    }
    const all = [];
    let cursor = undefined;
    for (let page = 0; page < 20; page++) {
      const data = await fetchMcpRegistry(cursor, 100);
      const servers = data.servers || [];
      for (const entry of servers) {
        const srv = entry.server || {};
        const meta = entry._meta || {};
        const remotes = srv.remotes || [];
        const remoteHeaders = remotes[0]?.headers || [];
        const authHeaders = remoteHeaders.filter((h) => h.isSecret || h.isRequired);
        all.push({
          name: srv.name || "",
          title: srv.title || srv.name || "",
          description: srv.description || "",
          version: srv.version || "",
          websiteUrl: srv.websiteUrl || "",
          repository: srv.repository?.url || "",
          icons: srv.icons || [],
          remotes: remotes.map((r) => ({ type: r.type, url: r.url })),
          packages: (srv.packages || []).map((p) => ({
            registryUrl: p.registryUrl || "",
            name: p.name || "",
            version: p.version || "",
            runtime: p.runtime || "",
            packageArguments: p.packageArguments || [],
          })),
          tools: (srv.tools || []).map((t) => ({ name: t.name, description: t.description })),
          official: meta["io.modelcontextprotocol.registry/official"]?.status === "active",
          transport: remotes.length > 0 ? "remote" : srv.packages?.length > 0 ? "package" : "unknown",
          requiresAuth: authHeaders.length > 0,
          authHeaders: authHeaders.map((h) => ({
            name: h.name || "Authorization",
            description: h.description || "",
            isRequired: h.isRequired ?? true,
          })),
        });
      }
      cursor = data.metadata?.nextCursor;
      if (!cursor) break;
    }
    // Dedupe by name (keep latest version)
    const seen = new Map();
    for (const s of all) {
      if (!seen.has(s.name) || s.version > seen.get(s.name).version) {
        seen.set(s.name, s);
      }
    }
    _mcpRegistryCache.servers = [...seen.values()];
    _mcpRegistryCache.ts = Date.now();
    return _mcpRegistryCache.servers;
  }

  app.get("/api/skills/marketplace", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) return auth.error;
    const query = asString(c.req.query("q"))?.toLowerCase() || "";
    const category = asString(c.req.query("category")) || "";
    const transportFilter = asString(c.req.query("transport")) || "";

    try {
      let servers = await getAllMcpRegistryServers();

      if (query) {
        servers = servers.filter((s) =>
          s.name.toLowerCase().includes(query) ||
          s.title.toLowerCase().includes(query) ||
          s.description.toLowerCase().includes(query) ||
          s.tools.some((t) => t.name.toLowerCase().includes(query))
        );
      }
      if (transportFilter) {
        servers = servers.filter((s) => s.transport === transportFilter);
      }

      return c.json({ ok: true, items: servers, total: servers.length });
    } catch (err) {
      return c.json({ ok: false, error: err instanceof Error ? err.message : String(err), items: [] }, 502);
    }
  });

  app.post("/api/skills/marketplace/install", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) return auth.error;
    if (!hasPersistentStorage()) {
      return c.json({ ok: false, error: "Persistent storage required." }, 503);
    }

    const body = await readJsonBody(c);
    const serverName = asString(body.name);
    const apiKey = asString(body.apiKey);
    const customHeaders = body.headers && typeof body.headers === "object" ? body.headers : {};
    if (!serverName) {
      return c.json({ ok: false, error: "Server name is required." }, 400);
    }

    // Find in registry
    let servers;
    try {
      servers = await getAllMcpRegistryServers();
    } catch (err) {
      return c.json({ ok: false, error: "Failed to fetch MCP registry." }, 502);
    }
    const server = servers.find((s) => s.name === serverName);
    if (!server) {
      return c.json({ ok: false, error: `Server "${serverName}" not found in MCP registry.` }, 404);
    }

    // Register as a skill in our governance store
    const toolId = serverName.replace(/[^a-zA-Z0-9._:-]/g, "-").substring(0, 128);
    const tool = await governanceStore.upsertTool({
      toolId,
      name: server.title || serverName,
      description: server.description,
      schema: {
        tools: server.tools,
        _mcp: {
          source: "mcp-registry",
          serverName,
          version: server.version,
          transport: server.transport,
          remotes: server.remotes,
          packages: server.packages,
          websiteUrl: server.websiteUrl,
          repository: server.repository,
          installedAt: new Date().toISOString(),
          apiKey: apiKey || undefined,
          authHeaderName: server.authHeaders?.[0]?.name || undefined,
        },
      },
      source: "mcp-registry",
    });

    // Register as a downstream app if remote URL available
    let downstream = null;
    const remoteUrl = server.remotes?.[0]?.url;
    if (remoteUrl) {
      try {
        const { downstreamAppRegistry } = await import("../config.js");
        const { clearDownstreamToolsCache } = await import("../control/downstream-resolution.js");
        const appId = `mcp-registry:${toolId}`;
        // Build auth headers from API key or custom headers
        const appHeaders = { ...customHeaders };
        if (apiKey) {
          // Determine the right header name from server metadata
          const authHeaderName = server.authHeaders?.[0]?.name || "Authorization";
          if (authHeaderName.toLowerCase() === "authorization") {
            appHeaders[authHeaderName] = `Bearer ${apiKey}`;
          } else {
            appHeaders[authHeaderName] = apiKey;
          }
        }
        const app = {
          id: appId,
          name: server.title || serverName,
          description: `[mcp-registry] ${serverName} - ${server.description || ""}`,
          mcpUrl: remoteUrl,
          enabled: true,
          timeoutMs: 15_000,
          authScheme: "raw",
          headers: Object.keys(appHeaders).length > 0 ? appHeaders : undefined,
        };
        downstreamAppRegistry.set(appId, app);
        clearDownstreamToolsCache(appId);
        downstream = { appId, mcpUrl: remoteUrl, status: "connected" };
      } catch (err) {
        downstream = { error: err instanceof Error ? err.message : String(err), status: "metadata_only" };
      }
    }

    emitAuditEvent({
      eventType: "AUDIT_EVENT_TYPE_TOOL_DISPATCHED",
      sourceService: "gateway-api",
      sessionId: auth.session.id,
      userId: auth.session.user.id,
      summary: `Installed MCP server ${serverName} from registry`,
      payload: {
        tenantId: `user:${auth.session.user.id}`,
        orgId: "default",
        toolId,
        source: "mcp-registry",
        action: "marketplace_install",
        downstream: downstream?.status,
      },
    });

    return c.json({ ok: true, tool, server, downstream }, 201);
  });

  app.post("/api/skills/import", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) return auth.error;
    if (!hasPersistentStorage()) {
      return c.json(
        {
          ok: false,
          error: "Persistent PostgreSQL storage is required for skill import proof.",
        },
        503
      );
    }

    const body = await readJsonBody(c);
    const normalized = normalizeImportedSkillPayload(body);
    if (normalized.error) {
      return c.json({ ok: false, error: normalized.error }, 400);
    }

    const tool = await governanceStore.upsertTool(normalized.payload);
    emitAuditEvent({
      eventType: "AUDIT_EVENT_TYPE_TOOL_DISPATCHED",
      sourceService: "gateway-api",
      sessionId: auth.session.id,
      userId: auth.session.user.id,
      summary: `Frontend B imported skill ${tool.toolId}`,
      payload: {
        tenantId: `user:${auth.session.user.id}`,
        orgId: "default",
        toolId: tool.toolId,
        source: tool.source,
        action: "skills_import",
      },
    });

    return c.json(
      {
        ok: true,
        tool,
        storage: {
          persistent: true,
          registryRecord: await getStoredSkillRecord(tool.toolId),
        },
      },
      201
    );
  });

  // ── Skill ZIP upload ────────────────────────────────────────────
  app.post("/api/skills/upload", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) return auth.error;
    if (!hasPersistentStorage()) {
      return c.json({ ok: false, error: "Persistent storage required for skill upload." }, 503);
    }

    let formData;
    try {
      formData = await c.req.formData();
    } catch {
      return c.json({ ok: false, error: "Expected multipart/form-data with a file field." }, 400);
    }

    const file = formData.get("file");
    if (!file || typeof file === "string") {
      return c.json({ ok: false, error: "Missing file field." }, 400);
    }
    if (!file.name.toLowerCase().endsWith(".zip")) {
      return c.json({ ok: false, error: "Only .zip skill bundles are supported." }, 400);
    }

    const { inflateRawSync } = await import("node:zlib");

    const buffer = Buffer.from(await file.arrayBuffer());

    // Parse zip entries (supports STORE and DEFLATE)
    let manifest = null;
    let metaJson = null;
    let skillMd = null;
    const entries = [];

    let offset = 0;
    while (offset + 30 <= buffer.length) {
      if (buffer.readUInt32LE(offset) !== 0x04034b50) break;
      const compressionMethod = buffer.readUInt16LE(offset + 8);
      const compressedSize = buffer.readUInt32LE(offset + 18);
      const uncompressedSize = buffer.readUInt32LE(offset + 22);
      const nameLen = buffer.readUInt16LE(offset + 26);
      const extraLen = buffer.readUInt16LE(offset + 28);
      const entryName = buffer.toString("utf8", offset + 30, offset + 30 + nameLen);
      const dataOffset = offset + 30 + nameLen + extraLen;
      const dataSize = compressedSize > 0 ? compressedSize : uncompressedSize;

      if (dataOffset + dataSize > buffer.length) break;

      if (!entryName.endsWith("/") && dataSize > 0) {
        let content = null;
        try {
          if (compressionMethod === 0) {
            content = buffer.subarray(dataOffset, dataOffset + dataSize).toString("utf8");
          } else if (compressionMethod === 8) {
            content = inflateRawSync(buffer.subarray(dataOffset, dataOffset + dataSize)).toString("utf8");
          }
        } catch {}

        entries.push({ name: entryName, content });
        const baseName = entryName.split("/").pop();

        if (content && (baseName === "manifest.json" || baseName === "package.json") && !manifest) {
          try { manifest = JSON.parse(content); manifest._sourceFile = baseName; } catch {}
        }
        if (content && baseName === "_meta.json" && !metaJson) {
          try { metaJson = JSON.parse(content); } catch {}
        }
        if (content && baseName === "SKILL.md" && !skillMd) {
          skillMd = content;
        }
      }
      offset = dataOffset + dataSize;
    }

    // Support ClawHub format: _meta.json + SKILL.md with YAML frontmatter
    if (!manifest && (metaJson || skillMd)) {
      manifest = { _sourceFile: "clawhub" };

      if (metaJson) {
        manifest.slug = metaJson.slug;
        manifest.ownerId = metaJson.ownerId;
        manifest.version = metaJson.version;
        manifest.publishedAt = metaJson.publishedAt;
      }

      if (skillMd) {
        // Parse YAML frontmatter from SKILL.md
        const fmMatch = skillMd.match(/^---\n([\s\S]*?)\n---/);
        if (fmMatch) {
          const fmText = fmMatch[1];
          const fmGet = (key) => {
            const m = fmText.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
            return m ? m[1].trim() : "";
          };
          manifest.name = fmGet("name") || metaJson?.slug || "";
          manifest.description = fmGet("description") || "";
          manifest.homepage = fmGet("homepage") || "";
          // Parse metadata JSON block
          const metaLine = fmText.match(/^metadata:\s*(\{[\s\S]*\})\s*$/m);
          if (metaLine) {
            try { manifest.metadata = JSON.parse(metaLine[1]); } catch {}
          }
        }
        manifest._skillMd = skillMd;
      }
    }

    if (!manifest) {
      return c.json({
        ok: false,
        error: "No recognized skill format found. Expected: _meta.json + SKILL.md (ClawHub), or manifest.json / package.json.",
        filesFound: entries.map((e) => e.name),
      }, 400);
    }

    // Extract skill metadata — support both ClawHub and manifest.json formats
    const toolId = asString(manifest.toolId) || asString(manifest.slug) || asString(manifest.name) || file.name.replace(/\.zip$/i, "").replace(/[^a-zA-Z0-9._:-]/g, "-");
    const name = asString(manifest.displayName) || asString(manifest.name) || toolId;
    const description = asString(manifest.description) || `Skill imported from ${file.name}`;
    const schema = manifest.schema || manifest.inputSchema || {};
    const mcpConfig = manifest.mcp || manifest.mcpServer || manifest.metadata?.clawdbot || null;

    // Validate toolId format
    const cleanToolId = toolId.replace(/[^a-zA-Z0-9._:-]/g, "-").substring(0, 128);
    if (!cleanToolId) {
      return c.json({ ok: false, error: "Could not derive a valid toolId from the manifest." }, 400);
    }

    // Register the skill in the governance store
    const tool = await governanceStore.upsertTool({
      toolId: cleanToolId,
      name,
      description,
      schema: {
        ...schema,
        _bundle: {
          fileName: file.name,
          sizeBytes: buffer.length,
          fileCount: entries.length,
          manifestSource: manifest._sourceFile,
          mcpConfig: mcpConfig || undefined,
          uploadedAt: new Date().toISOString(),
        },
      },
      source: "zip-upload",
    });

    emitAuditEvent({
      eventType: "AUDIT_EVENT_TYPE_TOOL_DISPATCHED",
      sourceService: "gateway-api",
      sessionId: auth.session.id,
      userId: auth.session.user.id,
      summary: `Uploaded skill bundle ${cleanToolId} from ${file.name}`,
      payload: {
        tenantId: `user:${auth.session.user.id}`,
        orgId: "default",
        toolId: cleanToolId,
        source: "zip-upload",
        action: "skills_upload",
        fileCount: entries.length,
      },
    });

    return c.json({
      ok: true,
      tool,
      manifest: {
        toolId: cleanToolId,
        name,
        description,
        mcpConfig: mcpConfig || null,
        fileCount: entries.length,
        files: entries.map((e) => e.name),
      },
      storage: {
        persistent: true,
        registryRecord: await getStoredSkillRecord(cleanToolId),
      },
    }, 201);
  });

  app.post("/api/skills/:skillId/smoke-test", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) return auth.error;
    const skillId = asString(c.req.param("skillId"));
    const catalog = await loadNormalizedSkillCatalog();
    const item = catalog.find((tool) => String(tool.toolId) === skillId);
    if (!item) {
      return c.json({ error: "Skill not found." }, 404);
    }
    const logs = [`Resolving skill '${skillId}'...`];
    const checks = [];
    checks.push({ name: "catalog_resolution", passed: true });
    logs.push("Catalog entry resolved.");
    if (item.source === "openclaw-cli") {
      buildOpenClawCliCommandArgs({ tool: item.toolId, help: true });
      checks.push({ name: "cli_help_available", passed: true });
      logs.push("CLI help command generated.");
    } else {
      const schemaAvailable = Boolean(item.schema && typeof item.schema === "object");
      checks.push({ name: "schema_available", passed: schemaAvailable });
      logs.push(schemaAvailable ? "Schema found." : "Schema missing.");
    }
    const passed = checks.every((check) => check.passed);
    return c.json({
      ok: true,
      result: {
        passed,
        logs,
        checkedAt: nowIso(),
        checks,
      },
    });
  });

  app.post("/api/skills/:skillId/governed-execution", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) return auth.error;
    if (!hasPersistentStorage()) {
      return c.json(
        {
          ok: false,
          error: "Persistent PostgreSQL storage is required for governed execution proof.",
        },
        503
      );
    }

    const skillId = asString(c.req.param("skillId"));
    const catalog = await loadNormalizedSkillCatalog();
    const item = catalog.find((tool) => String(tool.toolId) === skillId);
    if (!item) {
      return c.json({ ok: false, error: "Skill not found." }, 404);
    }

    const body = await readJsonBody(c);
    const actor = {
      userId: auth.session.user.id,
      tenantId: `user:${auth.session.user.id}`,
      orgId: "default",
      tenantVerified: true,
      tenantMethod: "session",
      deviceId: asString(c.req.header("user-agent")) ?? "frontend-b",
      sessionId: auth.session.id,
      traceId: `frontend-b-skill-${Date.now()}`,
    };

    const execution = await buildSkillExecutionProof(
      item.toolId,
      actor,
      asString(body.command) ?? "list"
    );
    if (!execution.ok) {
      return c.json(
        {
          ok: false,
          type: execution.type,
          error: execution.error,
          approval: execution.approval ?? null,
          policy: execution.policy ?? null,
          proof: execution.proof ?? null,
        },
        execution.status ?? 502
      );
    }

    return c.json({
      ok: true,
      type: execution.type,
      result: execution.result,
      proof: execution.proof,
    });
  });

  app.get("/api/agents/:agentId/tools", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) return auth.error;
    const agentId = asString(c.req.param("agentId"));
    const agent = await requireOwnedAgent(auth.session.user.id, agentId);
    if (!agent) {
      return c.json({ error: "Agent not found." }, 404);
    }
    const items = await loadNormalizedSkillCatalog();
    const equippedToolIds = Array.isArray(agent.config?.toolbelt?.equippedToolIds)
      ? agent.config.toolbelt.equippedToolIds.map(String)
      : [];
    return c.json({ ok: true, items, equippedToolIds });
  });

  app.patch("/api/agents/:agentId/tools", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) return auth.error;
    const agentId = asString(c.req.param("agentId"));
    const agent = await requireOwnedAgent(auth.session.user.id, agentId);
    if (!agent) {
      return c.json({ error: "Agent not found." }, 404);
    }
    const body = await readJsonBody(c);
    const equippedToolIds = Array.isArray(body.equippedToolIds)
      ? body.equippedToolIds.map((item) => String(item).trim()).filter(Boolean)
      : [];
    const knownIds = new Set((await loadNormalizedSkillCatalog()).map((item) => item.toolId));
    const unknown = equippedToolIds.filter((item) => !knownIds.has(item));
    if (unknown.length > 0) {
      return c.json({ error: `Unknown tool IDs: ${unknown.join(", ")}` }, 400);
    }
    const config = agent.config && typeof agent.config === "object" ? { ...agent.config } : {};
    config.toolbelt = {
      ...(config.toolbelt && typeof config.toolbelt === "object" ? config.toolbelt : {}),
      equippedToolIds,
    };
    const updated = await database.updateAgent(agent.id, {
      config,
      capabilities: equippedToolIds,
    });
    return c.json({ ok: true, equippedToolIds, agent: updated });
  });
}

export async function runDueTasksOnce() {
  const dueTasks = await frontendBStore.listDueTasks();
  for (const task of dueTasks) {
    const ownerUserId = String(task.ownerUserId ?? "");
    if (!ownerUserId) {
      continue;
    }
    try {
      await frontendBStore.updateTask(ownerUserId, task.id, { status: "running" });
      const dispatch = await dispatchTask(ownerUserId, task);
      const nextRunCount = Number(task.runCount ?? 0) + 1;
      const nextRunAt = computeNextRunAt(task.schedule, nextRunCount, Date.now());
      const terminal = terminalTaskState({ ...task, runCount: nextRunCount }, nextRunAt);
      const updated = await frontendBStore.updateTask(ownerUserId, task.id, {
        runCount: nextRunCount,
        lastRunAt: nowIso(),
        nextRunAt: terminal.completed ? null : nextRunAt,
        status: terminal.completed ? "completed" : "scheduled",
        terminalState: terminal.completed ? "completed" : "",
        terminalReason: terminal.completed ? terminal.reason : "",
      });
      emitAuditEvent({
        eventType: "AUDIT_EVENT_TYPE_POLICY_EVALUATED",
        sourceService: "gateway-api",
        userId: ownerUserId,
        summary: `Frontend B task dispatched: ${updated.title}`,
        payload: { ownerUserId, taskId: task.id, dispatch },
      });
      await createFrontendBNotification(
        ownerUserId,
        terminal.completed ? "Task completed" : "Task dispatched",
        `${updated.title} ${terminal.completed ? "completed." : "was dispatched."}`,
        terminal.completed ? "system_alerts" : "system_alerts",
        { taskId: task.id, dispatch }
      );
    } catch (error) {
      const failed = await frontendBStore.updateTask(ownerUserId, task.id, {
        status: "failed",
        terminalState: "failed",
        terminalReason: error instanceof Error ? error.message : String(error),
      });
      mapleLog("warn", "frontend_b.task_dispatch_failed", {
        taskId: task.id,
        ownerUserId,
        error: failed?.terminalReason ?? String(error),
      });
      await createFrontendBNotification(
        ownerUserId,
        "Task failed",
        `${task.title} failed to dispatch.`,
        "run_failures",
        { taskId: task.id, reason: failed?.terminalReason ?? "" }
      );
    }
  }
}
