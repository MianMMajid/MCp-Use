import { ContextLeakageStore } from "@maple/security";
import { authContextStorage, requireApiKeyResponse } from "../auth.js";
import { allowNoAuth } from "../config.js";
import { emitAuditEvent } from "../audit-emitter.js";
import { asString } from "../helpers.js";
import { database } from "../state.js";
import { resolveVerifiedTenantScope } from "../core/tenant-claim-resolver.js";

let leakageStore;

function getLeakageStore() {
  if (!leakageStore) {
    leakageStore = new ContextLeakageStore({ pool: database?.pool });
  }
  return leakageStore;
}

function actorContext() {
  const ctx = authContextStorage.getStore();
  return {
    method: asString(ctx?.method),
    userId: asString(ctx?.userId),
    keyFingerprint: asString(ctx?.keyFingerprint),
    authBypass: ctx?.authBypass === true,
  };
}

async function verifiedScope(c, { allowEmpty = false } = {}) {
  const actor = actorContext();
  const rawTenantId = asString(c.req.header("x-tenant-id"));
  const rawOrgId = asString(c.req.header("x-org-id"));
  if ((actor.authBypass || allowNoAuth) && allowEmpty && !rawTenantId && !rawOrgId) {
    return { error: false, tenantId: "default", orgId: "default" };
  }
  const scope = await resolveVerifiedTenantScope({
    tenantId: rawTenantId,
    orgId: rawOrgId,
    tenantClaimSignature: asString(c.req.header("x-maple-tenant-claim")),
  });
  if (!scope.verified && scope.tenantId) {
    return { error: true, tenantId: "", orgId: "" };
  }
  if (!scope.tenantId && !allowEmpty) {
    return { error: true, tenantId: "", orgId: "" };
  }
  return { error: false, tenantId: scope.tenantId || "default", orgId: scope.orgId || "default" };
}

async function parseUploadedDocuments(c) {
  const contentType = c.req.header("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const formData = await c.req.formData();
    const policyMode = asString(formData.get("policyMode")) || "strict";
    const files = formData.getAll("documents");
    const documents = [];
    for (const file of files) {
      if (file && typeof file === "object" && typeof file.arrayBuffer === "function") {
        const buffer = await file.arrayBuffer();
        documents.push({
          name: file.name || "unnamed.txt",
          size: buffer.byteLength,
          content: Buffer.from(buffer),
          type: file.type || "text/plain",
        });
      }
    }
    const inlineText = asString(formData.get("text"));
    if (inlineText) {
      documents.push({
        name: asString(formData.get("name")) || "inline-policy.txt",
        size: Buffer.byteLength(inlineText, "utf8"),
        content: Buffer.from(inlineText, "utf8"),
        type: "text/plain",
      });
    }
    return { policyMode, documents };
  }

  const body = await c.req.json().catch(() => ({}));
  const policyMode = asString(body.policyMode) || "strict";
  const documents = Array.isArray(body.documents)
    ? body.documents.map((document, index) => ({
        name: asString(document?.name) || `document-${index + 1}.txt`,
        size: Number(document?.size || Buffer.byteLength(String(document?.content || ""), "utf8")),
        content: Buffer.from(String(document?.content || ""), "utf8"),
        type: asString(document?.type) || "text/plain",
      }))
    : [];
  if (!documents.length && asString(body.text)) {
    documents.push({
      name: asString(body.name) || "inline-policy.txt",
      size: Buffer.byteLength(String(body.text), "utf8"),
      content: Buffer.from(String(body.text), "utf8"),
      type: "text/plain",
    });
  }
  return { policyMode, documents };
}

function parseBooleanInput(value) {
  if (typeof value === "boolean") return value;
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return undefined;
}

export function registerFirewallContextLeakageRoutes(app) {
  app.post("/api/firewall/context-leakage/documents", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const scope = await verifiedScope(c, { allowEmpty: true });
    if (scope.error) {
      return c.json({ ok: false, error: "Verified tenant scope required." }, 403);
    }

    let parsed;
    try {
      parsed = await parseUploadedDocuments(c);
    } catch (error) {
      return c.json({ ok: false, error: `Failed to parse upload: ${error instanceof Error ? error.message : String(error)}` }, 400);
    }
    if (!parsed.documents.length) {
      return c.json({ ok: false, error: "No documents provided." }, 400);
    }

    const actor = actorContext();
    const saved = await getLeakageStore().saveDocuments({
      tenantId: scope.tenantId,
      orgId: scope.orgId,
      createdBy: actor.userId || actor.keyFingerprint || "system",
      policyMode: parsed.policyMode,
      documents: parsed.documents,
    });

    await emitAuditEvent({
      eventType: "AUDIT_EVENT_TYPE_POLICY_EVALUATED",
      sourceService: "gateway-api",
      userId: actor.userId,
      severity: "RISK_SEVERITY_MEDIUM",
      summary: `Stored ${saved.length} context leakage document(s)`,
      payload: {
        tenantId: scope.tenantId,
        orgId: scope.orgId,
        policyMode: parsed.policyMode,
        documentIds: saved.map((item) => item.document.documentId),
        entityCount: saved.reduce((sum, item) => sum + item.entities.length, 0),
      },
    });

    return c.json({
      ok: true,
      policyMode: parsed.policyMode,
      documents: saved.map((item) => item.document),
      entities: saved.flatMap((item) => item.entities),
    });
  });

  app.get("/api/firewall/context-leakage/documents", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;
    const scope = await verifiedScope(c, { allowEmpty: true });
    if (scope.error) {
      return c.json({ ok: false, error: "Verified tenant scope required." }, 403);
    }
    const items = await getLeakageStore().listDocuments(scope);
    return c.json({ ok: true, items });
  });

  app.get("/api/firewall/context-leakage/documents/:id", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;
    const scope = await verifiedScope(c, { allowEmpty: true });
    if (scope.error) {
      return c.json({ ok: false, error: "Verified tenant scope required." }, 403);
    }
    const item = await getLeakageStore().getDocument(asString(c.req.param("id")), scope);
    if (!item) {
      return c.json({ ok: false, error: "Document not found." }, 404);
    }
    return c.json({ ok: true, item });
  });

  app.delete("/api/firewall/context-leakage/documents/:id", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;
    const scope = await verifiedScope(c, { allowEmpty: true });
    if (scope.error) {
      return c.json({ ok: false, error: "Verified tenant scope required." }, 403);
    }
    const actor = actorContext();
    const deleted = await getLeakageStore().deleteDocument(asString(c.req.param("id")), scope);
    if (!deleted) {
      return c.json({ ok: false, error: "Document not found." }, 404);
    }
    await emitAuditEvent({
      eventType: "AUDIT_EVENT_TYPE_POLICY_EVALUATED",
      sourceService: "gateway-api",
      userId: actor.userId,
      severity: "RISK_SEVERITY_LOW",
      summary: "Deleted context leakage document",
      payload: {
        tenantId: scope.tenantId,
        orgId: scope.orgId,
        documentId: asString(c.req.param("id")),
      },
    });
    return c.json({ ok: true, deleted: true });
  });

  app.get("/api/firewall/context-leakage/entities", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;
    const scope = await verifiedScope(c, { allowEmpty: true });
    if (scope.error) {
      return c.json({ ok: false, error: "Verified tenant scope required." }, 403);
    }
    const documentId = asString(c.req.query("documentId"));
    const activeOnly = parseBooleanInput(c.req.query("activeOnly")) ?? false;
    const items = await getLeakageStore().listEntities({
      tenantId: scope.tenantId,
      orgId: scope.orgId,
      documentId,
      activeOnly,
    });
    return c.json({ ok: true, items });
  });

  app.post("/api/firewall/context-leakage/entities/:id/mode", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;
    const scope = await verifiedScope(c, { allowEmpty: true });
    if (scope.error) {
      return c.json({ ok: false, error: "Verified tenant scope required." }, 403);
    }
    const body = await c.req.json().catch(() => ({}));
    const policyMode = asString(body.policyMode);
    const isActive = parseBooleanInput(body.isActive);
    if (!policyMode && typeof isActive !== "boolean") {
      return c.json({ ok: false, error: "Provide policyMode and/or isActive." }, 400);
    }
    const updated = await getLeakageStore().setEntityMode(asString(c.req.param("id")), {
      tenantId: scope.tenantId,
      orgId: scope.orgId,
      policyMode,
      isActive,
    });
    if (!updated) {
      return c.json({ ok: false, error: "Entity not found." }, 404);
    }
    return c.json({ ok: true, item: updated });
  });

  app.get("/api/firewall/context-leakage/events", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;
    const scope = await verifiedScope(c, { allowEmpty: true });
    if (scope.error) {
      return c.json({ ok: false, error: "Verified tenant scope required." }, 403);
    }
    const limit = Math.max(1, Math.min(Number.parseInt(asString(c.req.query("limit")) || "100", 10) || 100, 200));
    const items = await getLeakageStore().listEvents({
      tenantId: scope.tenantId,
      orgId: scope.orgId,
      limit,
    });
    return c.json({ ok: true, items });
  });
}
