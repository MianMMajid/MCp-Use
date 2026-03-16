import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { applyGatewayTestEnvDefaults } from "./helpers/gateway-test-env.mjs";

applyGatewayTestEnvDefaults({
  MAPLE_SKIP_AUTH_BOOTSTRAP: "1",
  MAPLE_DISABLE_HITL_BROKER: "1",
  MAPLE_ALLOW_NO_AUTH: "1",
  MAPLE_LEADER_ELECTION_ENABLED: "0",
  MAPLE_OPENCLAW_AGENT_ENABLED: "0",
  MAPLE_OPENCLAW_AGENT_AUTOSTART_GATEWAY: "0",
  MAPLE_SESSION_POLL: "0",
  MAPLE_TENANT_CLAIM_SIGNING_KEY: "ci-test-tenant-key",
});

const { createApp } = await import("../src/app.js");
const { database } = await import("../src/state.js");
const { FrontendBStore } = await import("../src/core/frontend-b-store.js");
const { getOpenClawModifierPolicy } = await import("../src/core/openclaw-modifier-runtime.js");
const { runDueTasksOnce } = await import("../src/routes/frontend-b-routes.js");
const { hashPassword } = await import("@maple/security");

const frontendBStore = new FrontendBStore({ database });
const OPENCLAW_AVAILABLE = spawnSync("openclaw", ["--version"], {
  encoding: "utf8",
}).status === 0;

let appResult = null;
let pgAvailable = false;

test.before(async () => {
  try {
    appResult = await createApp();
    await frontendBStore.ensureInitialized();
    pgAvailable = true;
  } catch (err) {
    if (err?.code === "ECONNREFUSED" || err?.message?.includes("ECONNREFUSED")) {
      console.log("[SKIP] PostgreSQL not reachable — skipping frontend-b platform tests");
    } else {
      throw err;
    }
  }
});

test.after(async () => {
  if (appResult?.shutdown) {
    await appResult.shutdown();
  }
});

async function appFetch(path, options = {}) {
  const req = new Request(`http://localhost${path}`, options);
  return appResult.app.fetch(req);
}

async function createSessionUser(label) {
  const suffix = `${label}-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const user = await database.createUser({
    username: `frontendb-${suffix}`,
    email: `frontendb-${suffix}@example.com`,
    passwordHash: hashPassword("password123"),
  });
  const session = await database.createSession(user.id, 3600);
  return {
    user,
    cookie: `maple_session=${session.id}`,
  };
}

async function createOwnedAgent(userId, name = "Ops Agent") {
  return database.createAgent({
    name,
    description: "Test agent",
    ownerId: userId,
    riskTier: "medium",
    status: "active",
    capabilities: [],
    tags: [],
    config: {},
    pinned: false,
  });
}

async function requestJson(path, { method = "GET", cookie, body } = {}) {
  const headers = {};
  if (cookie) {
    headers.cookie = cookie;
  }
  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }
  const response = await appFetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function waitForAuditChainEvent(tenantId, orgId, eventType, timeoutMs = 1000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const result = await database.pool.query(
      `
        SELECT event_id
        FROM audit_chain
        WHERE tenant_id = $1 AND org_id = $2 AND event_type = $3
        ORDER BY sequence_id DESC
        LIMIT 1
      `,
      [tenantId, orgId, eventType]
    );
    if (result.rows[0]) {
      return result.rows[0];
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return null;
}

async function waitForExecutionMetrics(executionId, timeoutMs = 10_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const result = await database.pool.query(
      `
        SELECT
          x.status,
          COALESCE((
            SELECT COUNT(*)::int
            FROM orchestration_execution_nodes n
            WHERE n.execution_id = x.id
          ), 0) AS node_count,
          COALESCE((
            SELECT COUNT(*)::int
            FROM orchestration_execution_edges e
            WHERE e.execution_id = x.id
          ), 0) AS edge_count
        FROM orchestration_executions x
        WHERE x.id = $1
        LIMIT 1
      `,
      [executionId],
    );
    const row = result.rows[0];
    if (row && Number(row.node_count ?? 0) > 0 && Number(row.edge_count ?? 0) > 0) {
      return {
        nodeCount: Number(row.node_count ?? 0),
        edgeCount: Number(row.edge_count ?? 0),
        status: String(row.status ?? ""),
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return null;
}

test("frontend b firewalls reject non-compilable revisions and expose diagnostics", async (t) => {
  if (!pgAvailable) return t.skip("PostgreSQL not reachable");
  const { cookie } = await createSessionUser("firewall-invalid");

  const createResult = await requestJson("/api/firewalls", {
    method: "POST",
    cookie,
    body: {
      name: "Broken policy",
      scope: "global",
      policyText: "block everything forever",
    },
  });

  assert.equal(createResult.response.status, 201);
  assert.equal(createResult.payload.ok, true);
  assert.equal(createResult.payload.validation.valid, false);
  const firewall = createResult.payload.firewall;
  const version = firewall.policyVersions[0];
  assert.equal(version.compiled, false);
  assert.equal(version.active, false);
  assert.ok(version.compileErrors.length > 0);

  const validateResult = await requestJson(`/api/firewalls/${firewall.id}/validate`, {
    method: "POST",
    cookie,
    body: {},
  });
  assert.equal(validateResult.response.status, 400);
  assert.equal(validateResult.payload.valid, false);
  assert.ok(Array.isArray(validateResult.payload.errors));

  const activateResult = await requestJson(
    `/api/firewalls/${firewall.id}/versions/${version.id}/activate`,
    {
      method: "POST",
      cookie,
      body: {},
    }
  );
  assert.equal(activateResult.response.status, 400);
  assert.match(String(activateResult.payload.error ?? ""), /failed YAML compilation/i);
});

test("frontend b firewall activation publishes agentPolicies and simulation uses the composed bundle", async (t) => {
  if (!pgAvailable) return t.skip("PostgreSQL not reachable");
  const owner = await createSessionUser("firewall-valid");
  const other = await createSessionUser("firewall-other");
  const agent = await createOwnedAgent(owner.user.id, "Overlay Agent");

  const globalYaml = [
    "version: 1",
    "rules:",
    "  allowedTools:",
    "    - status",
    "    - skills",
    "  blockedTargetProfiles:",
    "    - root",
    "  constraints:",
    "    allowDevProfile: false",
    "    maxTimeoutSeconds: 30",
    "    maxBufferMb: 4",
  ].join("\n");
  const agentYaml = [
    "version: 1",
    "rules:",
    "  allowedTools:",
    "    - status",
    "  blockedTargetProfiles:",
    "    - worker_x",
    "  constraints:",
    "    allowDevProfile: false",
    "    maxTimeoutSeconds: 20",
    "    maxBufferMb: 2",
  ].join("\n");

  const globalCreate = await requestJson("/api/firewalls", {
    method: "POST",
    cookie: owner.cookie,
    body: {
      name: "Global Guardrail",
      scope: "global",
      policyText: globalYaml,
    },
  });
  assert.equal(globalCreate.response.status, 201);
  assert.equal(globalCreate.payload.validation.valid, true);

  const agentCreate = await requestJson("/api/firewalls", {
    method: "POST",
    cookie: owner.cookie,
    body: {
      name: "Agent Overlay",
      scope: "agent",
      assignedAgentId: agent.id,
      policyText: agentYaml,
    },
  });
  assert.equal(agentCreate.response.status, 201);
  assert.equal(agentCreate.payload.validation.valid, true);
  const firewallId = agentCreate.payload.firewall.id;

  const defaultPolicy = await getOpenClawModifierPolicy({
    userId: owner.user.id,
    tenantId: `user:${owner.user.id}`,
    orgId: "default",
  });
  assert.equal(defaultPolicy.blockedTargetProfiles.includes("root"), true);
  assert.equal(defaultPolicy.blockedTargetProfiles.includes("worker_x"), false);

  const agentPolicy = await getOpenClawModifierPolicy({
    userId: owner.user.id,
    tenantId: `user:${owner.user.id}`,
    orgId: "default",
    agentId: agent.id,
  });
  assert.equal(agentPolicy.allowedTools.includes("status"), true);
  assert.equal(agentPolicy.allowedTools.includes("skills"), false);
  assert.equal(agentPolicy.blockedTargetProfiles.includes("root"), true);
  assert.equal(agentPolicy.blockedTargetProfiles.includes("worker_x"), true);
  assert.equal(agentPolicy.scope.agentId, agent.id);

  const simulateResult = await requestJson(`/api/firewalls/${firewallId}/simulate`, {
    method: "POST",
    cookie: owner.cookie,
    body: {
      prompt: [
        "tool: skills",
        "targetProfile: worker_x",
        "sourceProfile: controller_x",
      ].join("\n"),
    },
  });
  assert.equal(simulateResult.response.status, 200);
  assert.equal(simulateResult.payload.ok, true);
  assert.equal(simulateResult.payload.result.blocked, true);
  assert.equal(simulateResult.payload.result.resolvedScope, `agent:${agent.id}`);
  assert.ok(Array.isArray(simulateResult.payload.result.evaluation));

  const forbiddenRead = await requestJson(`/api/firewalls/${firewallId}`, {
    cookie: other.cookie,
  });
  assert.equal(forbiddenRead.response.status, 404);
});

test("frontend b task routes enforce ownership and the due-task worker marks unrecoverable failures", async (t) => {
  if (!pgAvailable) return t.skip("PostgreSQL not reachable");
  const owner = await createSessionUser("tasks-owner");
  const other = await createSessionUser("tasks-other");
  const agent = await createOwnedAgent(owner.user.id, "Worker Agent");
  const startAt = new Date(Date.now() + 60_000).toISOString();

  const createTask = await requestJson("/api/tasks", {
    method: "POST",
    cookie: owner.cookie,
    body: {
      title: "Nightly job",
      prompt: "Run nightly checks.",
      schedule: {
        startAt,
        endAt: null,
        timezone: "America/Los_Angeles",
        intervalMinutes: 60,
        maxRepeats: 2,
      },
      assignment: {
        agentId: agent.id,
      },
    },
  });

  assert.equal(createTask.response.status, 201);
  const taskId = createTask.payload.task.id;

  const pauseTask = await requestJson(`/api/tasks/${taskId}/pause`, {
    method: "POST",
    cookie: owner.cookie,
    body: {},
  });
  assert.equal(pauseTask.response.status, 200);
  assert.equal(pauseTask.payload.task.status, "paused");

  const resumeTask = await requestJson(`/api/tasks/${taskId}/resume`, {
    method: "POST",
    cookie: owner.cookie,
    body: {},
  });
  assert.equal(resumeTask.response.status, 200);
  assert.equal(resumeTask.payload.task.status, "scheduled");

  const ownerRead = await requestJson(`/api/tasks/${taskId}`, {
    cookie: owner.cookie,
  });
  assert.equal(ownerRead.response.status, 200);

  const otherRead = await requestJson(`/api/tasks/${taskId}`, {
    cookie: other.cookie,
  });
  assert.equal(otherRead.response.status, 404);

  const dueTask = await frontendBStore.createTask(owner.user.id, {
    title: "Broken dispatch",
    prompt: "This dispatch should fail.",
    schedule: {
      startAt: new Date(Date.now() - 3600_000).toISOString(),
      endAt: null,
      timezone: "America/Los_Angeles",
      intervalMinutes: 60,
      maxRepeats: 1,
    },
    assignment: {
      type: "agent",
      agentId: `missing-${randomUUID()}`,
    },
    nextRunAt: new Date(Date.now() - 5_000).toISOString(),
    status: "scheduled",
  });

  await runDueTasksOnce();

  const failedTask = await frontendBStore.findTask(owner.user.id, dueTask.id);
  assert.equal(failedTask.status, "failed");
  assert.match(String(failedTask.terminalReason ?? ""), /not found/i);
});

test(
  "frontend b task run-now dispatches an orchestration with a persisted non-empty graph",
  { skip: !OPENCLAW_AVAILABLE },
  async (t) => {
    if (!pgAvailable) return t.skip("PostgreSQL not reachable");
    const owner = await createSessionUser("task-orchestration-dispatch");
    const agentA = await createOwnedAgent(owner.user.id, "Task Orchestration Worker A");
    const agentB = await createOwnedAgent(owner.user.id, "Task Orchestration Worker B");

    const orchestration = await database.createOrchestration({
      name: "Scheduled orchestration",
      description: "Dispatch through task run-now",
      ownerId: owner.user.id,
      status: "active",
      nodes: [
        {
          id: "node-a",
          label: "Node A",
          agentId: agentA.id,
          status: "pending",
          retryCount: 0,
          maxRetries: 1,
        },
        {
          id: "node-b",
          label: "Node B",
          agentId: agentB.id,
          status: "pending",
          retryCount: 0,
          maxRetries: 1,
        },
      ],
      edges: [
        {
          id: "edge-a-b",
          source: "node-a",
          target: "node-b",
          active: true,
          delegationPolicy: {},
        },
      ],
    });

    const version = await database.createOrchestrationVersion({
      orchestrationId: orchestration.id,
      version: "v1",
      definition: {
        nodes: orchestration.nodes,
        edges: orchestration.edges,
      },
      createdBy: owner.user.id,
    });

    const createTask = await requestJson("/api/tasks", {
      method: "POST",
      cookie: owner.cookie,
      body: {
        title: "Dispatch orchestration now",
        prompt: "Run the scheduled orchestration end to end.",
        schedule: {
          startAt: new Date(Date.now() + 60_000).toISOString(),
          endAt: null,
          timezone: "America/New_York",
          intervalMinutes: 60,
          maxRepeats: 1,
        },
        assignment: {
          orchestrationId: orchestration.id,
        },
      },
    });

    assert.equal(createTask.response.status, 201);

    const runNow = await requestJson(`/api/tasks/${createTask.payload.task.id}/run-now`, {
      method: "POST",
      cookie: owner.cookie,
      body: {},
    });

    assert.equal(runNow.response.status, 200);
    assert.equal(runNow.payload.ok, true);
    assert.equal(runNow.payload.dispatch.kind, "orchestration");
    assert.ok(runNow.payload.dispatch.id);

    const metrics = await waitForExecutionMetrics(runNow.payload.dispatch.id);
    assert.ok(metrics, "expected persisted execution graph metrics");
    assert.equal(metrics.nodeCount, 2);
    assert.equal(metrics.edgeCount, 1);

    const record = await database.pool.query(
      `
        SELECT version_id
        FROM orchestration_executions
        WHERE id = $1
        LIMIT 1
      `,
      [runNow.payload.dispatch.id],
    );
    assert.equal(record.rows[0]?.version_id, version.id);
  },
);

test("frontend b org profile fields persist through get and patch", async (t) => {
  if (!pgAvailable) return t.skip("PostgreSQL not reachable");
  const owner = await createSessionUser("org-profile");

  const orgList = await requestJson("/api/org", {
    cookie: owner.cookie,
  });
  assert.equal(orgList.response.status, 200);
  let items = orgList.payload.items;
  if (!Array.isArray(items) || items.length === 0) {
    const createOrg = await requestJson("/api/org", {
      method: "POST",
      cookie: owner.cookie,
      body: {
        name: "Frontend B Org",
      },
    });
    assert.equal(createOrg.response.status, 201);
    const refreshed = await requestJson("/api/org", {
      cookie: owner.cookie,
    });
    items = refreshed.payload.items;
  }
  assert.ok(Array.isArray(items));
  assert.ok(items.length > 0);

  const orgId = String(items[0].orgId ?? items[0].id);
  const patchResult = await requestJson(`/api/org/${orgId}`, {
    method: "PATCH",
    cookie: owner.cookie,
    body: {
      bio: "Operations profile",
      email: "ops@example.com",
      email_is_public: false,
      currency: "usd",
      address: "77 Firewall Road",
      city: "San Francisco",
      region: "California",
      postal_code: "94105",
      country: "United States",
    },
  });
  assert.equal(patchResult.response.status, 200);

  const updatedList = await requestJson("/api/org", {
    cookie: owner.cookie,
  });
  const updated = updatedList.payload.items.find((item) => String(item.orgId ?? item.id) === orgId);
  assert.equal(updated.bio, "Operations profile");
  assert.equal(updated.email, "ops@example.com");
  assert.equal(updated.email_is_public, false);
  assert.equal(updated.address, "77 Firewall Road");
  assert.equal(updated.city, "San Francisco");
  assert.equal(updated.region, "California");
  assert.equal(updated.postal_code, "94105");
  assert.equal(updated.country, "United States");
});

test(
  "frontend b skills import persists to the registry and governed execution returns proof",
  { skip: !OPENCLAW_AVAILABLE },
  async (t) => {
    if (!pgAvailable) return t.skip("PostgreSQL not reachable");
    const owner = await createSessionUser("skills-proof");
    const tenantId = `user:${owner.user.id}`;

    const importResult = await requestJson("/api/skills/import", {
      method: "POST",
      cookie: owner.cookie,
      body: {
        toolId: "skills",
        name: "skills",
        description: "Registry-backed OpenClaw skills proof target",
        schema: {},
      },
    });

    assert.equal(importResult.response.status, 201);
    assert.equal(importResult.payload.ok, true);
    assert.equal(importResult.payload.tool.toolId, "skills");
    assert.equal(importResult.payload.storage.persistent, true);

    const registryRow = await database.pool.query(
      `
        SELECT tool_id, source
        FROM gateway_tool_registry
        WHERE tool_id = $1
        LIMIT 1
      `,
      ["skills"]
    );
    assert.equal(registryRow.rows[0]?.tool_id, "skills");
    assert.equal(registryRow.rows[0]?.source, "manual");

    const listResult = await requestJson("/api/skills", {
      cookie: owner.cookie,
    });
    assert.equal(listResult.response.status, 200);
    assert.equal(
      listResult.payload.items.some((item) => item.toolId === "skills" && item.source === "registry"),
      true
    );

    const execResult = await requestJson("/api/skills/skills/governed-execution", {
      method: "POST",
      cookie: owner.cookie,
      body: {
        command: "list",
      },
    });

    assert.equal(execResult.response.status, 200);
    assert.equal(execResult.payload.ok, true);
    assert.equal(execResult.payload.result.tool, "skills");
    assert.equal(execResult.payload.proof.storage.persistent, true);
    assert.equal(execResult.payload.proof.storage.registryRecord.toolId, "skills");
    assert.equal(Array.isArray(execResult.payload.proof.audit.events), true);
    assert.equal(execResult.payload.proof.audit.events.length > 0, true);

    const dispatched = await waitForAuditChainEvent(
      tenantId,
      "default",
      "AUDIT_EVENT_TYPE_TOOL_DISPATCHED"
    );
    const completed = await waitForAuditChainEvent(
      tenantId,
      "default",
      "AUDIT_EVENT_TYPE_TOOL_COMPLETED"
    );

    assert.ok(dispatched, "expected a tool dispatched audit event");
    assert.ok(completed, "expected a tool completed audit event");
  }
);
