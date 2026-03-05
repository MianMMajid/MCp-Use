// Set required env vars before imports
process.env.MAPLE_LOG_LEVEL = process.env.MAPLE_LOG_LEVEL || "error";
process.env.MAPLE_LOG_REQUESTS = process.env.MAPLE_LOG_REQUESTS || "0";
process.env.MAPLE_LOG_INCLUDE_BODIES = process.env.MAPLE_LOG_INCLUDE_BODIES || "0";
process.env.MAPLE_LOG_BODY_MAX_CHARS = process.env.MAPLE_LOG_BODY_MAX_CHARS || "4000";
process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.MAPLE_FIREWALL_LOG_DIR = process.env.MAPLE_FIREWALL_LOG_DIR || "/tmp/maple-firewall-logs";
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_placeholder";
process.env.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "whsec_test";
process.env.STRIPE_PRICE_PRO = process.env.STRIPE_PRICE_PRO || "price_pro";
process.env.STRIPE_PRICE_TEAM = process.env.STRIPE_PRICE_TEAM || "price_team";
process.env.STRIPE_PRICE_ENTERPRISE = process.env.STRIPE_PRICE_ENTERPRISE || "price_enterprise";
process.env.STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY || "pk_test_placeholder";
process.env.MAPLE_ALLOW_NO_AUTH = process.env.MAPLE_ALLOW_NO_AUTH || "1";
process.env.MAPLE_ALLOW_BRIDGE_OVERRIDE = process.env.MAPLE_ALLOW_BRIDGE_OVERRIDE || "0";
process.env.MAPLE_LOCK_BRIDGE_TARGET = process.env.MAPLE_LOCK_BRIDGE_TARGET || "0";
process.env.OPENCLAW_BRIDGE_URL = process.env.OPENCLAW_BRIDGE_URL || "http://127.0.0.1:8787";
process.env.OPENCLAW_BRIDGE_TOKEN = process.env.OPENCLAW_BRIDGE_TOKEN || "test-token";
process.env.MAPLE_OPENCLAW_AGENT_ENABLED = process.env.MAPLE_OPENCLAW_AGENT_ENABLED || "0";
process.env.MAPLE_OPENCLAW_AGENT_MODE = process.env.MAPLE_OPENCLAW_AGENT_MODE || "gateway";
process.env.MAPLE_OPENCLAW_AGENT_REQUIRED = process.env.MAPLE_OPENCLAW_AGENT_REQUIRED || "0";
process.env.MAPLE_OPENCLAW_AGENT_DEV_PROFILE = process.env.MAPLE_OPENCLAW_AGENT_DEV_PROFILE || "0";
process.env.MAPLE_OPENCLAW_AGENT_AUTOSTART_GATEWAY = process.env.MAPLE_OPENCLAW_AGENT_AUTOSTART_GATEWAY || "0";
process.env.MAPLE_OPENCLAW_AGENT_GATEWAY_PORT = process.env.MAPLE_OPENCLAW_AGENT_GATEWAY_PORT || "19001";
process.env.MAPLE_OPENCLAW_AGENT_GATEWAY_BIND = process.env.MAPLE_OPENCLAW_AGENT_GATEWAY_BIND || "loopback";
process.env.MAPLE_OPENCLAW_AGENT_DEFAULT_SESSION_ID = process.env.MAPLE_OPENCLAW_AGENT_DEFAULT_SESSION_ID || "agent-dev-main";
process.env.MAPLE_OPENCLAW_AGENT_DEFAULT_THINKING = process.env.MAPLE_OPENCLAW_AGENT_DEFAULT_THINKING || "medium";
process.env.MAPLE_OPENCLAW_AGENT_TIMEOUT_SECONDS = process.env.MAPLE_OPENCLAW_AGENT_TIMEOUT_SECONDS || "120";
process.env.MAPLE_OPENCLAW_MODIFIER_ENABLED = process.env.MAPLE_OPENCLAW_MODIFIER_ENABLED || "1";
process.env.MAPLE_OPENCLAW_MODIFIER_ALLOW_DEV_PROFILE = process.env.MAPLE_OPENCLAW_MODIFIER_ALLOW_DEV_PROFILE || "0";
process.env.MAPLE_OPENCLAW_MODIFIER_APPROVAL_TTL_SECONDS = process.env.MAPLE_OPENCLAW_MODIFIER_APPROVAL_TTL_SECONDS || "900";
process.env.MAPLE_OPENCLAW_MODIFIER_MAX_TIMEOUT_SECONDS = process.env.MAPLE_OPENCLAW_MODIFIER_MAX_TIMEOUT_SECONDS || "90";
process.env.MAPLE_OPENCLAW_MODIFIER_MAX_BUFFER_MB = process.env.MAPLE_OPENCLAW_MODIFIER_MAX_BUFFER_MB || "8";
process.env.MAPLE_OPENCLAW_MODIFIER_SOURCE_PROFILE = process.env.MAPLE_OPENCLAW_MODIFIER_SOURCE_PROFILE || "default";
process.env.MAPLE_OPENCLAW_MODIFIER_ALLOWED_TOOLS = process.env.MAPLE_OPENCLAW_MODIFIER_ALLOWED_TOOLS || "agent,agents,message,sessions,status,health,gateway,memory,models,skills,nodes,logs";
process.env.MAPLE_OPENCLAW_MODIFIER_DANGEROUS_TOOLS = process.env.MAPLE_OPENCLAW_MODIFIER_DANGEROUS_TOOLS || "setup,onboard,configure,config,reset,uninstall,update,plugins,webhooks,hooks,pairing,devices,node,sandbox,daemon,voicecall,acp,system,directory,dns,browser,cron";
process.env.MAPLE_OPENCLAW_MODIFIER_BLOCKED_TARGET_PROFILES = process.env.MAPLE_OPENCLAW_MODIFIER_BLOCKED_TARGET_PROFILES || "default,main,primary,root,system";
process.env.MAPLE_OPENCLAW_MODIFIER_REQUIRE_SCOPE = process.env.MAPLE_OPENCLAW_MODIFIER_REQUIRE_SCOPE || "1";
process.env.MAPLE_OPENCLAW_MODIFIER_REQUIRE_ORG_RBAC = process.env.MAPLE_OPENCLAW_MODIFIER_REQUIRE_ORG_RBAC || "1";
process.env.MAPLE_OPENCLAW_MODIFIER_REQUIRE_TENANT_POLICY = process.env.MAPLE_OPENCLAW_MODIFIER_REQUIRE_TENANT_POLICY || "0";
process.env.MAPLE_OPENCLAW_MODIFIER_AUTO_BOOTSTRAP_OWNER = process.env.MAPLE_OPENCLAW_MODIFIER_AUTO_BOOTSTRAP_OWNER || "1";
process.env.MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX = process.env.MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX || "1";
process.env.MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX_INTERVAL_MS = process.env.MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX_INTERVAL_MS || "5000";
process.env.MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX_BATCH_SIZE = process.env.MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX_BATCH_SIZE || "50";
process.env.MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX_MAX_RETRIES = process.env.MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX_MAX_RETRIES || "5";
process.env.MAPLE_STEP_UP_REQUIRED_FOR_APPROVALS = process.env.MAPLE_STEP_UP_REQUIRED_FOR_APPROVALS || "0";
process.env.MAPLE_ESCALATION_CHECK_INTERVAL_MS = process.env.MAPLE_ESCALATION_CHECK_INTERVAL_MS || "30000";
process.env.MAPLE_RETENTION_CHECK_INTERVAL_MS = process.env.MAPLE_RETENTION_CHECK_INTERVAL_MS || "86400000";
process.env.MAPLE_MODIFIER_GOVERNANCE_ENABLED = process.env.MAPLE_MODIFIER_GOVERNANCE_ENABLED || "0";
process.env.MAPLE_LEADER_ELECTION_ENABLED = process.env.MAPLE_LEADER_ELECTION_ENABLED || "0";
process.env.MAPLE_OTLP_ENDPOINT = process.env.MAPLE_OTLP_ENDPOINT || "http://localhost:4318";
process.env.MAPLE_OTLP_SERVICE_NAME = process.env.MAPLE_OTLP_SERVICE_NAME || "gateway-api";
process.env.MAPLE_OTLP_BATCH_SIZE = process.env.MAPLE_OTLP_BATCH_SIZE || "100";
process.env.MAPLE_OTLP_FLUSH_INTERVAL_MS = process.env.MAPLE_OTLP_FLUSH_INTERVAL_MS || "5000";
process.env.MAPLE_OTLP_TIMEOUT_MS = process.env.MAPLE_OTLP_TIMEOUT_MS || "10000";
process.env.MAPLE_EVENT_TRANSPORT_BACKEND = process.env.MAPLE_EVENT_TRANSPORT_BACKEND || "pg";
process.env.MAPLE_REDIS_URL = process.env.MAPLE_REDIS_URL || "redis://localhost:6379";
process.env.MAPLE_FIREWALL_CHAT_PREFER_OPENCLAW = process.env.MAPLE_FIREWALL_CHAT_PREFER_OPENCLAW || "0";
process.env.MAPLE_FIREWALL_CHAT_STRICT_MODE = process.env.MAPLE_FIREWALL_CHAT_STRICT_MODE || "0";
process.env.MAPLE_SESSION_POLL = process.env.MAPLE_SESSION_POLL || "0";
process.env.MAPLE_SESSION_POLL_MS = process.env.MAPLE_SESSION_POLL_MS || "5000";
process.env.MAPLE_MCP_FIREWALL_DEFAULT_APP = process.env.MAPLE_MCP_FIREWALL_DEFAULT_APP || "default";
process.env.MAPLE_MCP_PROXY_ALLOW_DYNAMIC_TARGETS = process.env.MAPLE_MCP_PROXY_ALLOW_DYNAMIC_TARGETS || "0";
process.env.MAPLE_MCP_PROXY_ALLOW_HTTP = process.env.MAPLE_MCP_PROXY_ALLOW_HTTP || "0";
process.env.MAPLE_MCP_PROXY_ALLOW_PRIVATE_TARGETS = process.env.MAPLE_MCP_PROXY_ALLOW_PRIVATE_TARGETS || "0";
process.env.MAPLE_MCP_PROXY_DEFAULT_TARGET_URL = process.env.MAPLE_MCP_PROXY_DEFAULT_TARGET_URL || "http://localhost:3000";
process.env.MAPLE_MCP_PROXY_ALLOWED_HOSTS = process.env.MAPLE_MCP_PROXY_ALLOWED_HOSTS || "localhost";
process.env.MAPLE_MCP_EXECUTION_ORDER = process.env.MAPLE_MCP_EXECUTION_ORDER || "default";
process.env.MAPLE_DOWNSTREAM_TOOLS_CACHE_TTL_MS = process.env.MAPLE_DOWNSTREAM_TOOLS_CACHE_TTL_MS || "15000";
process.env.MAPLE_MCP_ROUTE_LOCK = process.env.MAPLE_MCP_ROUTE_LOCK || "0";
process.env.MAPLE_SESSION_OWNER_SCOPE = process.env.MAPLE_SESSION_OWNER_SCOPE || "auto";
process.env.MAPLE_ENABLE_DEMO_ROUTES = process.env.MAPLE_ENABLE_DEMO_ROUTES || "1";
process.env.MAPLE_ENABLE_JUDGE_UI = process.env.MAPLE_ENABLE_JUDGE_UI || "1";
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || "test-openai-key";
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "test-anthropic-key";
process.env.MAPLE_FIREWALL_CHAT_PRIMARY = process.env.MAPLE_FIREWALL_CHAT_PRIMARY || "openai";
process.env.MAPLE_FIREWALL_CHAT_OPENAI_MODEL = process.env.MAPLE_FIREWALL_CHAT_OPENAI_MODEL || "gpt-4o-mini";
process.env.MAPLE_FIREWALL_CHAT_ANTHROPIC_MODEL = process.env.MAPLE_FIREWALL_CHAT_ANTHROPIC_MODEL || "claude-sonnet-4-6";
process.env.MAPLE_FIREWALL_CHAT_TIMEOUT_MS = process.env.MAPLE_FIREWALL_CHAT_TIMEOUT_MS || "15000";
process.env.MAPLE_SESSION_COOKIE_NAME = process.env.MAPLE_SESSION_COOKIE_NAME || "maple_session";
process.env.MAPLE_SESSION_TTL_SECONDS = process.env.MAPLE_SESSION_TTL_SECONDS || "604800";
process.env.MAPLE_AUTH_ALLOW_SELF_SIGNUP = process.env.MAPLE_AUTH_ALLOW_SELF_SIGNUP || "0";
process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "test-google-client-id";
process.env.MAPLE_GPT_OAUTH_CLIENT_ID = process.env.MAPLE_GPT_OAUTH_CLIENT_ID || "maple-gpt-client";
process.env.MAPLE_GPT_OAUTH_CLIENT_SECRET = process.env.MAPLE_GPT_OAUTH_CLIENT_SECRET || "maple-secret";
process.env.GATEWAY_PORT = process.env.GATEWAY_PORT || "8443";
process.env.GATEWAY_HOST = process.env.GATEWAY_HOST || "0.0.0.0";
process.env.MAPLE_GATEWAY_TLS_CERT = process.env.MAPLE_GATEWAY_TLS_CERT || "/etc/maple/gateway-tls/tls.crt";
process.env.MAPLE_GATEWAY_TLS_KEY = process.env.MAPLE_GATEWAY_TLS_KEY || "/etc/maple/gateway-tls/tls.key";
process.env.MAPLE_GATEWAY_TLS_CA = process.env.MAPLE_GATEWAY_TLS_CA || "/etc/maple/gateway-tls/ca.crt";
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://maple:maple@127.0.0.1:5432/maple_test";
process.env.CONTEXT_WALL_ADDRESS = process.env.CONTEXT_WALL_ADDRESS || "localhost:9000";
process.env.MCP_PROXY_ADDRESS = process.env.MCP_PROXY_ADDRESS || "localhost:9200";
process.env.CYBER_PROXY_ADDRESS = process.env.CYBER_PROXY_ADDRESS || "localhost:8080";
process.env.AUDIT_WRITER_ADDRESS = process.env.AUDIT_WRITER_ADDRESS || "localhost:9400";
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
process.env.MCP_URL = process.env.MCP_URL || "http://localhost:3000";
process.env.DOWNSTREAM_APPS = process.env.DOWNSTREAM_APPS || "";
process.env.MAPLE_SKIP_AUTH_BOOTSTRAP = "1";
process.env.MAPLE_DISABLE_HITL_BROKER = "1";
process.env.MAPLE_TENANT_CLAIM_SIGNING_KEY = process.env.MAPLE_TENANT_CLAIM_SIGNING_KEY || "ci-test-tenant-key";

process.env.MAPLE_DB_ORCH_CONVERSATION_ENABLED = "1";
process.env.MAPLE_DB_ORCH_EXEC_TASKS_ENABLED = "1";
process.env.MAPLE_DB_OPENCLAW_DURABILITY_ENABLED = "1";
process.env.MAPLE_DB_FIREWALL_OBJECTS_ENABLED = "1";
process.env.MAPLE_DB_SKILLS_CUSTOM_ENABLED = "1";
process.env.MAPLE_DB_CHAT_TRANSCRIPTS_ENABLED = "1";

import assert from "node:assert/strict";
import test from "node:test";

let appResult;

function unique(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

async function appFetch(path, options = {}) {
  const req = new Request(`http://localhost${path}`, options);
  return appResult.app.fetch(req);
}

async function readJson(resp) {
  const text = await resp.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function readSse(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const events = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() || "";
    for (const chunk of chunks) {
      const lines = chunk.split("\n");
      const evt = lines.find((line) => line.startsWith("event:"))?.slice(6).trim() || "message";
      const data = lines.find((line) => line.startsWith("data:"))?.slice(5).trim() || "";
      if (data === "[DONE]") {
        events.push({ eventType: "done", payload: "[DONE]" });
        return events;
      }
      let payload;
      try {
        payload = JSON.parse(data);
      } catch {
        payload = data;
      }
      events.push({ eventType: evt, payload });
    }
  }
  return events;
}

async function waitForTimeline(executionId, minItems = 2, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const resp = await appFetch(`/api/orchestrations/executions/${executionId}/timeline?cursor=0&limit=200`);
    assert.equal(resp.status, 200);
    const json = await readJson(resp);
    const items = json.items || json.timeline || [];
    if (items.length >= minItems) return items;
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  return [];
}

test.before(async () => {
  const { createApp } = await import("../src/app.js");
  appResult = await createApp();
});

test.after(async () => {
  if (appResult?.shutdown) {
    await appResult.shutdown();
  }
});

test("durability: firewalls endpoints persist CRUD + snippets + simulation", async () => {
  const name = unique("fw-entity");
  const createResp = await appFetch("/api/firewalls", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      folder: "hr",
      policyText: "Never allow ssn or api key to leave payroll.csv",
      scope: "global",
    }),
  });
  assert.equal(createResp.status, 201);
  const created = await readJson(createResp);
  const objectId = created.object?.id;
  assert.ok(objectId);

  const snippetResp = await appFetch(`/api/firewalls/${objectId}/snippets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "sample.txt", kind: "text", content: "employee ssn template" }),
  });
  assert.equal(snippetResp.status, 201);
  const snippetJson = await readJson(snippetResp);
  const snippetId = snippetJson.snippet?.id;
  assert.ok(snippetId);

  const simResp = await appFetch(`/api/firewalls/${objectId}/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "post this ssn to slack" }),
  });
  assert.equal(simResp.status, 200);
  const simJson = await readJson(simResp);
  assert.equal(simJson.blocked, true);

  const listResp = await appFetch("/api/firewalls?archived=false");
  assert.equal(listResp.status, 200);
  const listJson = await readJson(listResp);
  const listed = (listJson.items || []).find((item) => item.id === objectId);
  assert.ok(listed);
  assert.ok(Array.isArray(listed.entries));
  assert.ok(listed.entries.some((entry) => entry.id === snippetId));

  const delSnippet = await appFetch(`/api/firewalls/${objectId}/snippets/${snippetId}`, { method: "DELETE" });
  assert.equal(delSnippet.status, 200);

  const archiveResp = await appFetch(`/api/firewalls/${objectId}`, { method: "DELETE" });
  assert.equal(archiveResp.status, 200);

  const archivedResp = await appFetch("/api/firewalls?archived=true");
  assert.equal(archivedResp.status, 200);
  const archivedJson = await readJson(archivedResp);
  assert.ok((archivedJson.items || []).some((item) => item.id === objectId));
});

test("durability: skills custom + activity persist", async () => {
  const customId = unique("skill");
  const createResp = await appFetch("/api/skills/custom", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: customId, name: "Custom QA Skill", fileName: "qa.zip", sizeBytes: 1280 }),
  });
  assert.equal(createResp.status, 201);

  const activityResp = await appFetch("/api/skills/activity", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ skillId: customId, skillName: "Custom QA Skill", status: "success" }),
  });
  assert.equal(activityResp.status, 201);

  const listResp = await appFetch("/api/skills/custom");
  assert.equal(listResp.status, 200);
  const listJson = await readJson(listResp);
  assert.ok((listJson.items || []).some((item) => item.id === customId));

  const activityListResp = await appFetch("/api/skills/activity");
  assert.equal(activityListResp.status, 200);
  const activityJson = await readJson(activityListResp);
  assert.ok((activityJson.items || []).some((item) => item.skillId === customId));

  const delResp = await appFetch(`/api/skills/custom/${customId}`, { method: "DELETE" });
  assert.equal(delResp.status, 200);

  const listAfterResp = await appFetch("/api/skills/custom");
  const listAfterJson = await readJson(listAfterResp);
  assert.equal((listAfterJson.items || []).some((item) => item.id === customId), false);
});

test("durability: chat stream write-through persists transcript + events", async () => {
  const conversationId = unique("conv");

  const userMsgResp = await appFetch(`/api/chat/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "user", content: "hello durable stream" }),
  });
  assert.equal(userMsgResp.status, 201);

  const streamResp = await appFetch("/api/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "summarize this", conversationId }),
  });
  assert.equal(streamResp.status, 200, `expected chat stream 200, got ${streamResp.status}`);
  const events = await readSse(streamResp);
  assert.ok(events.length > 0);
  assert.ok(events.some((event) => event.eventType === "done"));

  const messagesResp = await appFetch(`/api/chat/conversations/${conversationId}/messages`);
  assert.equal(messagesResp.status, 200);
  const messagesJson = await readJson(messagesResp);
  const items = messagesJson.items || [];
  assert.ok(items.some((item) => item.role === "user"));
  assert.ok(items.some((item) => item.role === "assistant"));
});

test("durability + replay: orchestration conversation/tasks/reassignments and timeline cursor replay", async () => {
  const orchName = unique("orch");
  const createResp = await appFetch("/api/orchestrations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: orchName, description: "durability test orchestration" }),
  });
  assert.equal(createResp.status, 201);
  const orchestration = await readJson(createResp);
  const orchestrationId = orchestration.id;
  assert.ok(orchestrationId);

  const patchResp = await appFetch(`/api/orchestrations/${orchestrationId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nodes: [
        { id: "node-a", label: "node-a", role: "manager", agentId: "agent-1" },
        { id: "node-b", label: "node-b", role: "worker", agentId: "agent-2" },
      ],
      edges: [{ id: "edge-a-b", source: "node-a", target: "node-b", delegationPolicy: {} }],
    }),
  });
  assert.equal(patchResp.status, 200);

  const convPost = await appFetch(`/api/orchestrations/${orchestrationId}/conversation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "Plan this migration" }),
  });
  assert.equal(convPost.status, 200);

  const convGet = await appFetch(`/api/orchestrations/${orchestrationId}/conversation`);
  assert.equal(convGet.status, 200);
  const convJson = await readJson(convGet);
  assert.ok((convJson.items || []).length >= 2);

  const executeResp = await appFetch(`/api/orchestrations/${orchestrationId}/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "dry_run", objective: "do work" }),
  });
  assert.equal(executeResp.status, 201);
  const executeJson = await readJson(executeResp);
  const executionId = executeJson.executionId;
  assert.ok(executionId);

  const tasksResp = await appFetch(`/api/orchestrations/executions/${executionId}/tasks`);
  assert.equal(tasksResp.status, 200);
  const tasksJson = await readJson(tasksResp);
  const task = (tasksJson.items || [])[0];
  assert.ok(task?.taskId || task?.id);

  const reassignResp = await appFetch(`/api/orchestrations/executions/${executionId}/tasks/${task.taskId || task.id}/reassign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      dueAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      targetRole: "worker",
      repeatIntervalMinutes: 5,
      maxRepeats: 2,
    }),
  });
  assert.equal(reassignResp.status, 200);
  const reassignJson = await readJson(reassignResp);
  const reassignmentId = reassignJson.reassignment?.id || reassignJson.reassignment?.reassignmentId;
  assert.ok(reassignmentId);

  const queueResp = await appFetch(`/api/orchestrations/executions/${executionId}/reassignments`);
  assert.equal(queueResp.status, 200);
  const queueJson = await readJson(queueResp);
  assert.ok((queueJson.items || []).some((item) => (item.id === reassignmentId || item.reassignmentId === reassignmentId)));

  const cancelResp = await appFetch(`/api/orchestrations/executions/${executionId}/reassignments/${reassignmentId}`, {
    method: "DELETE",
  });
  assert.equal(cancelResp.status, 200);

  const timelineItems = await waitForTimeline(executionId, 1, 6000);
  assert.ok(Array.isArray(timelineItems));
  const baselineResp = await appFetch(`/api/orchestrations/executions/${executionId}/timeline?cursor=0&limit=200`);
  assert.equal(baselineResp.status, 200);
  const baselineJson = await readJson(baselineResp);
  assert.ok(typeof String(baselineJson.latestCursor ?? baselineJson.cursor ?? "0") === "string");

  const first = timelineItems[0] ?? { sequence: Number(baselineJson.latestCursor ?? 0) };
  const replayResp = await appFetch(`/api/orchestrations/executions/${executionId}/timeline?cursor=${encodeURIComponent(String(first.sequence ?? 0))}&limit=200`);
  assert.equal(replayResp.status, 200);
  const replayJson = await readJson(replayResp);
  const replayItems = replayJson.items || replayJson.timeline || [];
  if (replayItems.length > 0) {
    assert.ok(replayItems[0].sequence > Number(first.sequence ?? 0));
  }
});

test("regression: legacy orchestration alias route (orch-1) does not 500 and resolves", async () => {
  const createResp = await appFetch("/api/orchestrations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: unique("legacy-alias-orch"), description: "legacy alias route test" }),
  });
  assert.equal(createResp.status, 201);

  const aliasResp = await appFetch("/api/orchestrations/orch-1");
  assert.equal(aliasResp.status, 200);
  const aliasJson = await readJson(aliasResp);
  assert.ok(aliasJson?.id);
  assert.equal(typeof aliasJson.id, "string");

  const missResp = await appFetch("/api/orchestrations/orch-999999");
  assert.equal(missResp.status, 404);
});
