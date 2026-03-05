import { randomUUID } from "node:crypto";
import { server, database } from "../state.js";
import { requireApiKeyResponse } from "../auth.js";
import { asString, readJsonBody } from "../helpers.js";
import {
  dbFirewallObjectsEnabled,
  dbSkillsCustomEnabled,
  dbChatTranscriptsEnabled,
} from "../config.js";

function nowIso() {
  return new Date().toISOString();
}

function inferRulesCount(text) {
  const lines = String(text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return Math.max(1, lines.length || 1);
}

function classifyBlocked(prompt, policyText) {
  const haystack = `${String(prompt ?? "").toLowerCase()} ${String(policyText ?? "").toLowerCase()}`;
  const risky = ["ssn", "social security", "api key", "secret", "token", "payroll", "internal"];
  return risky.some((token) => haystack.includes(token));
}

const CONTEXT_LEAKAGE_FIREWALL_ID = "context-leakage-global";

function safeTrim(value, fallback = "") {
  const text = asString(value);
  return text ? text.trim() : fallback;
}

function parseRulePolicyText(policyText) {
  const raw = String(policyText ?? "").trim();
  if (!raw) {
    return { condition: "", decision: "review", reason: "", source: "runtime" };
  }
  try {
    const parsed = JSON.parse(raw);
    return {
      condition: safeTrim(parsed.condition, "custom condition"),
      decision: safeTrim(parsed.decision, "review"),
      reason: safeTrim(parsed.reason, ""),
      source: safeTrim(parsed.source, "runtime"),
    };
  } catch {
    return { condition: raw, decision: "review", reason: "", source: "runtime" };
  }
}

function toFirewallRule(object) {
  const rule = parseRulePolicyText(object?.policyText);
  return {
    id: String(object?.id ?? randomUUID()),
    condition: rule.condition || "custom condition",
    decision: rule.decision || "review",
    status: safeTrim(object?.status, "enabled"),
    source: rule.source || "runtime",
    reason: rule.reason || "",
    createdAt: object?.createdAt ?? null,
    createdBy: "gateway",
    scope: safeTrim(object?.scope, "global"),
    firewallObjectId: String(object?.id ?? ""),
  };
}

function buildRulePolicyText(payload) {
  const body = payload && typeof payload === "object" ? payload : {};
  return JSON.stringify({
    condition: safeTrim(body.condition, "custom condition"),
    decision: safeTrim(body.decision, "review"),
    reason: safeTrim(body.reason, ""),
    source: safeTrim(body.source, "runtime"),
  });
}

async function ensureContextLeakageFirewallObject() {
  const existing = await database.findFirewallObject(CONTEXT_LEAKAGE_FIREWALL_ID);
  if (existing) return existing;
  const now = nowIso();
  return database.createFirewallObject({
    id: CONTEXT_LEAKAGE_FIREWALL_ID,
    name: "Context Leakage",
    folder: "context-leakage",
    policyText: "Context leakage intake",
    scope: "global",
    status: "active",
    rulesCount: 1,
    blockedAttempts: 0,
    createdAt: now,
    lastEvaluatedAt: now,
  });
}

async function parseLeakageDocumentsRequest(c) {
  const contentType = String(c.req.header("content-type") ?? "").toLowerCase();
  if (contentType.includes("multipart/form-data")) {
    const form = await c.req.formData();
    const files = form.getAll("documents").filter((entry) => typeof entry === "object" && entry !== null);
    const policyMode = safeTrim(form.get("policyMode"), "strict");
    return { files, policyMode };
  }
  const body = await readJsonBody(c);
  const docs = Array.isArray(body.documents) ? body.documents : [];
  const files = docs
    .map((doc, index) => ({
      name: safeTrim(doc.name, `document-${index + 1}.txt`),
      type: safeTrim(doc.mimeType, "text/plain"),
      size: Number(doc.sizeBytes ?? String(doc.content ?? "").length ?? 0),
      text: async () => String(doc.content ?? ""),
    }));
  const policyMode = safeTrim(body.policyMode, "strict");
  return { files, policyMode };
}

server.app.get("/api/firewalls", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  if (!dbFirewallObjectsEnabled || typeof database.listFirewallObjects !== "function") {
    return c.json({ ok: true, items: [], disabled: true });
  }
  const archived = String(c.req.query("archived") ?? "").toLowerCase() === "true";
  const [items, snippetsByObject, revisionsByObject] = await Promise.all([
    database.listFirewallObjects({ archived }),
    (async () => {
      const out = new Map();
      const objects = await database.listFirewallObjects({ archived });
      for (const object of objects) {
        // eslint-disable-next-line no-await-in-loop
        out.set(object.id, await database.listFirewallSnippets(object.id));
      }
      return out;
    })(),
    (async () => {
      const out = new Map();
      const objects = await database.listFirewallObjects({ archived });
      for (const object of objects) {
        // eslint-disable-next-line no-await-in-loop
        out.set(object.id, await database.listFirewallPolicyRevisions(object.id));
      }
      return out;
    })(),
  ]);
  return c.json({
    ok: true,
    items: items.map((item) => ({
      ...item,
      entries: snippetsByObject.get(item.id) ?? [],
      policyVersions: revisionsByObject.get(item.id) ?? [],
      auditLog: [],
      blockedPackets: [],
    })),
  });
});

server.app.post("/api/firewalls", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  if (!dbFirewallObjectsEnabled || typeof database.createFirewallObject !== "function") {
    return c.json({ ok: false, error: "Firewall persistence disabled" }, 503);
  }

  const body = await readJsonBody(c);
  const name = asString(body.name) ?? "";
  const policyText = asString(body.policyText) ?? "";
  if (!name.trim() || !policyText.trim()) {
    return c.json({ ok: false, error: "name and policyText are required" }, 400);
  }

  const created = await database.createFirewallObject({
    id: asString(body.id) ?? randomUUID(),
    name: name.trim(),
    folder: asString(body.folder) ?? "root",
    policyText: policyText.trim(),
    scope: asString(body.scope) === "agent" ? "agent" : "global",
    assignedAgentId: asString(body.assignedAgentId) ?? null,
    status: asString(body.status) || "active",
    rulesCount: inferRulesCount(policyText),
    blockedAttempts: Number(body.blockedAttempts ?? 0),
    createdAt: nowIso(),
    lastEvaluatedAt: nowIso(),
  });
  await database.createFirewallPolicyRevision({
    firewallObjectId: created.id,
    text: created.policyText,
    actor: "creator",
    createdAt: nowIso(),
  });

  return c.json({ ok: true, object: created }, 201);
});

server.app.patch("/api/firewalls/:id", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  if (!dbFirewallObjectsEnabled || typeof database.updateFirewallObject !== "function") {
    return c.json({ ok: false, error: "Firewall persistence disabled" }, 503);
  }
  const id = asString(c.req.param("id")) ?? "";
  const body = await readJsonBody(c);
  const updated = await database.updateFirewallObject(id, {
    name: body.name,
    folder: body.folder,
    policyText: body.policyText,
    scope: body.scope,
    assignedAgentId: body.assignedAgentId,
    status: body.status,
    rulesCount: body.rulesCount,
    blockedAttempts: body.blockedAttempts,
    archived: body.archived,
    lastEvaluatedAt: body.lastEvaluatedAt,
  });
  if (!updated) {
    return c.json({ ok: false, error: "Firewall object not found" }, 404);
  }
  if (asString(body.policyText)?.trim()) {
    await database.createFirewallPolicyRevision({
      firewallObjectId: id,
      text: asString(body.policyText) ?? "",
      actor: "editor",
      createdAt: nowIso(),
    });
  }
  return c.json({ ok: true, object: updated });
});

server.app.delete("/api/firewalls/:id", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  if (!dbFirewallObjectsEnabled || typeof database.updateFirewallObject !== "function") {
    return c.json({ ok: false, error: "Firewall persistence disabled" }, 503);
  }
  const id = asString(c.req.param("id")) ?? "";
  const archived = await database.updateFirewallObject(id, { archived: true, status: "archived" });
  if (!archived) return c.json({ ok: false, error: "Firewall object not found" }, 404);
  return c.json({ ok: true });
});

server.app.post("/api/firewalls/:id/simulate", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  if (!dbFirewallObjectsEnabled || typeof database.findFirewallObject !== "function") {
    return c.json({ ok: false, error: "Firewall persistence disabled" }, 503);
  }
  const id = asString(c.req.param("id")) ?? "";
  const body = await readJsonBody(c);
  const object = await database.findFirewallObject(id);
  if (!object) return c.json({ ok: false, error: "Firewall object not found" }, 404);
  const prompt = asString(body.prompt) ?? "";
  const blocked = classifyBlocked(prompt, object.policyText);
  const nextBlockedAttempts = blocked ? Number(object.blockedAttempts ?? 0) + 1 : Number(object.blockedAttempts ?? 0);
  const status = blocked ? (nextBlockedAttempts >= 3 ? "active_block" : "review_needed") : "monitoring";
  await database.updateFirewallObject(id, {
    blockedAttempts: nextBlockedAttempts,
    status,
    lastEvaluatedAt: nowIso(),
  });
  return c.json({
    ok: true,
    blocked,
    reason: blocked ? "Blocked by active policy rule match" : "No blocking rule matched",
    at: nowIso(),
  });
});

server.app.post("/api/firewalls/:id/snippets", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  if (!dbFirewallObjectsEnabled || typeof database.createFirewallSnippet !== "function") {
    return c.json({ ok: false, error: "Firewall persistence disabled" }, 503);
  }
  const id = asString(c.req.param("id")) ?? "";
  const body = await readJsonBody(c);
  const created = await database.createFirewallSnippet({
    id: asString(body.id) ?? randomUUID(),
    firewallObjectId: id,
    kind: asString(body.kind) || "text",
    name: asString(body.name) || "snippet.txt",
    mimeType: asString(body.mimeType) || "text/plain",
    sizeBytes: Number(body.sizeBytes ?? 0),
    preview: asString(body.preview) || "",
    content: asString(body.content) || "",
    addedAt: nowIso(),
  });
  return c.json({ ok: true, snippet: created }, 201);
});

server.app.get("/api/firewall/rules", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  if (typeof database.listFirewallObjects !== "function") {
    return c.json({ ok: false, error: "Firewall persistence unavailable" }, 503);
  }
  const objects = await database.listFirewallObjects({ archived: false });
  const rules = objects
    .filter((item) => safeTrim(item.folder, "").toLowerCase() !== "context-leakage")
    .map(toFirewallRule);
  return c.json({ ok: true, rules, count: rules.length });
});

server.app.post("/api/firewall/rules", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  if (typeof database.createFirewallObject !== "function" || typeof database.createFirewallPolicyRevision !== "function") {
    return c.json({ ok: false, error: "Firewall persistence unavailable" }, 503);
  }
  const body = await readJsonBody(c);
  const condition = safeTrim(body.condition, "");
  if (!condition) {
    return c.json({ ok: false, error: "condition is required" }, 400);
  }
  const policyText = buildRulePolicyText(body);
  const now = nowIso();
  const created = await database.createFirewallObject({
    id: safeTrim(body.id, randomUUID()),
    name: safeTrim(body.name, condition.slice(0, 96)),
    folder: "rules",
    policyText,
    scope: "global",
    status: safeTrim(body.status, "enabled"),
    rulesCount: 1,
    blockedAttempts: 0,
    createdAt: now,
    lastEvaluatedAt: now,
  });
  await database.createFirewallPolicyRevision({
    firewallObjectId: created.id,
    text: created.policyText,
    actor: safeTrim(body.createdBy, "operator"),
    createdAt: now,
  });
  return c.json({ ok: true, rule: toFirewallRule(created) }, 201);
});

server.app.patch("/api/firewall/rules/:ruleId", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  if (typeof database.findFirewallObject !== "function" || typeof database.updateFirewallObject !== "function") {
    return c.json({ ok: false, error: "Firewall persistence unavailable" }, 503);
  }
  const ruleId = safeTrim(c.req.param("ruleId"), "");
  if (!ruleId) return c.json({ ok: false, error: "ruleId is required" }, 400);
  const current = await database.findFirewallObject(ruleId);
  if (!current || current.archived) {
    return c.json({ ok: false, error: "Rule not found" }, 404);
  }
  const body = await readJsonBody(c);
  const prev = parseRulePolicyText(current.policyText);
  const nextPolicyText = JSON.stringify({
    condition: safeTrim(body.condition, prev.condition || "custom condition"),
    decision: safeTrim(body.decision, prev.decision || "review"),
    reason: safeTrim(body.reason, prev.reason || ""),
    source: safeTrim(body.source, prev.source || "runtime"),
  });
  const updated = await database.updateFirewallObject(ruleId, {
    name: body.name ?? current.name,
    status: body.status ?? current.status,
    policyText: nextPolicyText,
    lastEvaluatedAt: nowIso(),
  });
  if (!updated) return c.json({ ok: false, error: "Rule not found" }, 404);
  if (typeof database.createFirewallPolicyRevision === "function") {
    await database.createFirewallPolicyRevision({
      firewallObjectId: ruleId,
      text: nextPolicyText,
      actor: safeTrim(body.updatedBy, "operator"),
      createdAt: nowIso(),
    });
  }
  return c.json({ ok: true, rule: toFirewallRule(updated) });
});

server.app.delete("/api/firewall/rules/:ruleId", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  if (typeof database.updateFirewallObject !== "function") {
    return c.json({ ok: false, error: "Firewall persistence unavailable" }, 503);
  }
  const ruleId = safeTrim(c.req.param("ruleId"), "");
  if (!ruleId) return c.json({ ok: false, error: "ruleId is required" }, 400);
  const archived = await database.updateFirewallObject(ruleId, {
    archived: true,
    status: "archived",
    lastEvaluatedAt: nowIso(),
  });
  if (!archived) return c.json({ ok: false, error: "Rule not found" }, 404);
  return c.json({ ok: true, ruleId });
});

server.app.get("/api/firewall/context-leakage/documents", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  if (typeof database.listFirewallSnippets !== "function" || typeof database.findFirewallObject !== "function") {
    return c.json({ ok: false, error: "Firewall persistence unavailable" }, 503);
  }
  const object = await database.findFirewallObject(CONTEXT_LEAKAGE_FIREWALL_ID);
  if (!object) return c.json({ ok: true, firewallObjectId: CONTEXT_LEAKAGE_FIREWALL_ID, documents: [] });
  const snippets = await database.listFirewallSnippets(object.id);
  const documents = snippets.map((snippet) => ({
    id: snippet.id,
    name: snippet.name,
    mimeType: snippet.mimeType,
    sizeBytes: Number(snippet.sizeBytes ?? 0),
    preview: snippet.preview ?? "",
    uploadedAt: snippet.addedAt ?? nowIso(),
  }));
  return c.json({ ok: true, firewallObjectId: object.id, documents });
});

server.app.post("/api/firewall/context-leakage/documents", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  if (
    typeof database.findFirewallObject !== "function" ||
    typeof database.createFirewallObject !== "function" ||
    typeof database.createFirewallSnippet !== "function" ||
    typeof database.updateFirewallObject !== "function"
  ) {
    return c.json({ ok: false, error: "Firewall persistence unavailable" }, 503);
  }

  const { files, policyMode } = await parseLeakageDocumentsRequest(c);
  if (!Array.isArray(files) || files.length === 0) {
    return c.json({ ok: false, error: "At least one document is required." }, 400);
  }

  const leakageObject = await ensureContextLeakageFirewallObject();
  const now = nowIso();
  const created = [];
  for (const file of files) {
    const fileName = safeTrim(file?.name, "document.txt");
    const mimeType = safeTrim(file?.type, "application/octet-stream");
    const content = typeof file?.text === "function" ? await file.text() : String(file?.content ?? "");
    // Persist a short preview and full content for operator readback.
    const preview = String(content ?? "").slice(0, 300);
    const snippet = await database.createFirewallSnippet({
      id: randomUUID(),
      firewallObjectId: leakageObject.id,
      kind: "document",
      name: fileName,
      mimeType,
      sizeBytes: Number(file?.size ?? content.length ?? 0),
      preview,
      content: String(content ?? ""),
      addedAt: now,
    });
    created.push({
      id: snippet.id,
      name: snippet.name,
      mimeType: snippet.mimeType,
      sizeBytes: Number(snippet.sizeBytes ?? 0),
      preview: snippet.preview ?? "",
      uploadedAt: snippet.addedAt ?? now,
    });
  }

  await database.updateFirewallObject(leakageObject.id, {
    status: policyMode === "strict" ? "active_block" : "active",
    blockedAttempts: Number(leakageObject.blockedAttempts ?? 0),
    lastEvaluatedAt: now,
  });

  return c.json(
    {
      ok: true,
      firewallObjectId: leakageObject.id,
      policyMode,
      documents: created,
    },
    201,
  );
});

server.app.delete("/api/firewalls/:id/snippets/:snippetId", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  if (!dbFirewallObjectsEnabled || typeof database.deleteFirewallSnippet !== "function") {
    return c.json({ ok: false, error: "Firewall persistence disabled" }, 503);
  }
  const id = asString(c.req.param("id")) ?? "";
  const snippetId = asString(c.req.param("snippetId")) ?? "";
  await database.deleteFirewallSnippet(id, snippetId);
  return c.json({ ok: true });
});

server.app.get("/api/skills/custom", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  if (!dbSkillsCustomEnabled || typeof database.listCustomSkills !== "function") {
    return c.json({ ok: true, items: [], disabled: true });
  }
  const items = await database.listCustomSkills();
  return c.json({ ok: true, items });
});

server.app.post("/api/skills/custom", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  if (!dbSkillsCustomEnabled || typeof database.createCustomSkill !== "function") {
    return c.json({ ok: false, error: "Skills persistence disabled" }, 503);
  }
  const body = await readJsonBody(c);
  const created = await database.createCustomSkill({
    id: asString(body.id) ?? randomUUID(),
    name: asString(body.name) || "Custom Skill",
    description: asString(body.description) || "",
    fileName: asString(body.fileName) || "",
    sizeBytes: Number(body.sizeBytes ?? 0),
    metadata: body.metadata ?? {},
    importedAt: asString(body.importedAt) || nowIso(),
  });
  return c.json({ ok: true, skill: created }, 201);
});

server.app.delete("/api/skills/custom/:id", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  if (!dbSkillsCustomEnabled || typeof database.deleteCustomSkill !== "function") {
    return c.json({ ok: false, error: "Skills persistence disabled" }, 503);
  }
  const id = asString(c.req.param("id")) ?? "";
  await database.deleteCustomSkill(id);
  return c.json({ ok: true });
});

server.app.get("/api/skills/activity", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  if (!dbSkillsCustomEnabled || typeof database.listSkillsActivity !== "function") {
    return c.json({ ok: true, items: [], disabled: true });
  }
  const items = await database.listSkillsActivity(Number(c.req.query("limit") ?? 50));
  return c.json({ ok: true, items });
});

server.app.post("/api/skills/activity", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  if (!dbSkillsCustomEnabled || typeof database.createSkillsActivity !== "function") {
    return c.json({ ok: false, error: "Skills persistence disabled" }, 503);
  }
  const body = await readJsonBody(c);
  const created = await database.createSkillsActivity({
    id: asString(body.id) ?? randomUUID(),
    skillId: asString(body.skillId) || "unknown",
    skillName: asString(body.skillName) || asString(body.skillId) || "unknown",
    status: asString(body.status) || "success",
    timestamp: asString(body.timestamp) || nowIso(),
    metadata: body.metadata ?? {},
  });
  return c.json({ ok: true, item: created }, 201);
});

server.app.get("/api/chat/conversations", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  if (!dbChatTranscriptsEnabled || typeof database.listChatConversations !== "function") {
    return c.json({ ok: true, items: [], disabled: true });
  }
  const items = await database.listChatConversations(Number(c.req.query("limit") ?? 50));
  return c.json({ ok: true, items });
});

server.app.get("/api/chat/conversations/:id/messages", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  if (!dbChatTranscriptsEnabled || typeof database.listChatMessages !== "function") {
    return c.json({ ok: true, items: [], disabled: true });
  }
  const id = asString(c.req.param("id")) ?? "";
  await database.ensureChatConversation(id);
  const items = await database.listChatMessages(id);
  return c.json({ ok: true, items });
});

server.app.post("/api/chat/conversations/:id/messages", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  if (!dbChatTranscriptsEnabled || typeof database.createChatMessage !== "function") {
    return c.json({ ok: false, error: "Chat transcript persistence disabled" }, 503);
  }
  const conversationId = asString(c.req.param("id")) ?? "";
  const body = await readJsonBody(c);
  await database.ensureChatConversation(conversationId, { title: asString(body.title) || "" });
  const message = await database.createChatMessage({
    id: asString(body.id) ?? randomUUID(),
    conversationId,
    role: asString(body.role) || "user",
    content: asString(body.content) || "",
    streamState: asString(body.streamState) || "done",
    metadata: body.metadata ?? {},
    createdAt: asString(body.createdAt) || nowIso(),
  });
  return c.json({ ok: true, message }, 201);
});
