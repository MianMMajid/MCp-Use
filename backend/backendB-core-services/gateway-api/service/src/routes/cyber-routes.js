import { authContextStorage, requireApiKeyResponse } from "../auth.js";
import { asString, readJsonBody } from "../helpers.js";
import { database, server } from "../state.js";
import {
  getCyberPolicies,
  getCyberStatus,
  listCyberEvents,
} from "../core/cyber-operations.js";
import {
  assignSecurityIncident,
  addSecurityIncidentNote,
  createSecuritySuppression,
  getCyberSecurityStatus,
  getSecurityEvidenceById,
  getSecurityIncidentById,
  listSecurityEvidence,
  listSecurityIncidents,
  listSecurityQuarantine,
  listSecuritySuppressions,
  releaseSecurityQuarantine,
  rescanSecurityQuarantine,
  reviewSecurityQuarantine,
  revokeSecuritySuppression,
  updateSecurityIncidentState,
} from "../core/cyber-security-service.js";
import { hasValidStepUp, verifyStepUpChallenge } from "../core/step-up-auth.js";
import { resolveVerifiedTenantScope } from "../core/tenant-claim-resolver.js";

function parseBoundedInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

async function verifiedScope(c, { allowEmpty = true } = {}) {
  const actor = actorContext();
  const rawTenantId = asString(c.req.header("x-tenant-id")) ?? "";
  const rawOrgId = asString(c.req.header("x-org-id")) ?? "";
  if ((actor.authBypass || String(process.env.MAPLE_ALLOW_NO_AUTH ?? "") === "1") && !allowEmpty && !rawTenantId && !rawOrgId) {
    return { error: false, tenantId: "", orgId: "" };
  }
  const scope = await resolveVerifiedTenantScope({
    tenantId: rawTenantId,
    orgId: rawOrgId,
    tenantClaimSignature: asString(c.req.header("x-maple-tenant-claim")) ?? "",
  });
  if (!scope.verified && scope.tenantId) {
    return { error: true, tenantId: "", orgId: "" };
  }
  if (!allowEmpty && !scope.tenantId) {
    return { error: true, tenantId: "", orgId: "" };
  }
  return { error: false, tenantId: scope.tenantId, orgId: scope.orgId };
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

async function enforceSensitiveMutation(c, body, scope) {
  const actor = actorContext();
  if (actor.authBypass || String(process.env.MAPLE_ALLOW_NO_AUTH ?? "") === "1") {
    return null;
  }
  if (actor.method !== "session" || !actor.userId) {
    return c.json({ ok: false, error: "Interactive session auth required for this security operation." }, 403);
  }
  const challengeToken = asString(body.challengeToken);
  const stepUp = challengeToken
    ? await verifyStepUpChallenge(actor.userId, challengeToken, {
        tenantId: scope.tenantId,
        orgId: scope.orgId,
        database,
      })
    : await hasValidStepUp(actor.userId, {
        tenantId: scope.tenantId,
        orgId: scope.orgId,
        database,
      });
  if ((challengeToken && stepUp?.verified !== true) || (!challengeToken && stepUp?.valid !== true)) {
    return c.json({
      ok: false,
      error: "Step-up verification required",
      replacement: "/api/operations/orchestrations/step-up/challenge",
      stepUpStatus: stepUp,
    }, 403);
  }
  return null;
}

function toDownloadResponse(item) {
  return {
    id: item.evidenceId,
    incidentId: item.incidentId,
    source: item.source,
    traceId: item.traceId,
    sessionId: item.sessionId,
    runId: item.runId,
    url: item.url,
    filename: item.filename,
    contentType: item.contentType,
    sizeBytes: item.sizeBytes,
    createdAt: item.createdAt,
    policyReason: item.policyReason,
    scan: item.scan,
    metadata: item.metadata,
    objectRef: item.objectRef,
    storagePath: item.storagePath,
  };
}

server.app.get("/api/cyber/status", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) {
    return unauthorized;
  }
  const scope = await verifiedScope(c, { allowEmpty: true });
  if (scope.error) {
    return c.json({ ok: false, error: "Unverified tenant scope rejected" }, 403);
  }
  const [status, security] = await Promise.all([
    getCyberStatus({ database, tenantId: scope.tenantId }),
    getCyberSecurityStatus({ database, tenantId: scope.tenantId, orgId: scope.orgId }),
  ]);
  return c.json({
    ...status,
    security,
  });
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
  const scope = await verifiedScope(c, { allowEmpty: true });
  if (scope.error) {
    return c.json({ ok: false, error: "Unverified tenant scope rejected" }, 403);
  }
  const limit = parseBoundedInteger(c.req.query("limit"), 100, 1, 500);
  const offset = parseBoundedInteger(c.req.query("offset"), 0, 0, 1_000_000);
  const status = asString(c.req.query("status"));
  const sourceService = asString(c.req.query("sourceService"));
  const since = asString(c.req.query("since"));
  const until = asString(c.req.query("until"));
  const items = (await listCyberEvents({
    database,
    tenantId: scope.tenantId,
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
  const scope = await verifiedScope(c, { allowEmpty: true });
  if (scope.error) {
    return c.json({ ok: false, error: "Unverified tenant scope rejected" }, 403);
  }
  const payload = await listSecurityEvidence({
    tenantId: scope.tenantId,
    orgId: scope.orgId,
    database,
    limit: parseBoundedInteger(c.req.query("limit"), 50, 1, 200),
    offset: parseBoundedInteger(c.req.query("offset"), 0, 0, 1_000_000),
    source: asString(c.req.query("source")) || undefined,
    traceId: asString(c.req.query("traceId")) || undefined,
    sessionId: asString(c.req.query("sessionId")) || undefined,
    runId: asString(c.req.query("runId")) || undefined,
  });
  const statusFilter = asString(c.req.query("status"));
  const verdictFilter = asString(c.req.query("verdict"));
  const providerFilter = asString(c.req.query("provider"));
  const filteredItems = payload.items
    .filter((item) => (statusFilter ? item.scan.status === statusFilter : true))
    .filter((item) => (verdictFilter ? item.scan.verdict === verdictFilter : true))
    .filter((item) => (providerFilter ? item.scan.provider === providerFilter : true))
    .map(toDownloadResponse);
  return c.json({
    ok: true,
    items: filteredItems,
    total: filteredItems.length,
    offset: payload.offset,
    nextOffset: payload.nextOffset,
  });
});

server.app.get("/api/cyber/downloads/:id", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) {
    return unauthorized;
  }
  const scope = await verifiedScope(c, { allowEmpty: true });
  if (scope.error) {
    return c.json({ ok: false, error: "Unverified tenant scope rejected" }, 403);
  }
  const id = asString(c.req.param("id"));
  const item = await getSecurityEvidenceById(id, { database, tenantId: scope.tenantId, orgId: scope.orgId });
  if (!item) {
    return c.json({ ok: false, error: "Cyber download record not found." }, 404);
  }
  return c.json({
    ok: true,
    item: toDownloadResponse(item),
  });
});

server.app.get("/api/cyber/incidents", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  const scope = await verifiedScope(c, { allowEmpty: true });
  if (scope.error) return c.json({ ok: false, error: "Unverified tenant scope rejected" }, 403);
  const payload = await listSecurityIncidents({
    tenantId: scope.tenantId,
    orgId: scope.orgId,
    state: asString(c.req.query("state")) || undefined,
    ownerId: asString(c.req.query("ownerId")) || undefined,
    limit: parseBoundedInteger(c.req.query("limit"), 50, 1, 200),
    offset: parseBoundedInteger(c.req.query("offset"), 0, 0, 1_000_000),
  }, { database });
  return c.json({ ok: true, ...payload });
});

server.app.get("/api/cyber/incidents/:id", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  const scope = await verifiedScope(c, { allowEmpty: true });
  if (scope.error) return c.json({ ok: false, error: "Unverified tenant scope rejected" }, 403);
  const incident = await getSecurityIncidentById(asString(c.req.param("id")), { database, tenantId: scope.tenantId, orgId: scope.orgId });
  if (!incident) return c.json({ ok: false, error: "Incident not found." }, 404);
  return c.json({ ok: true, incident });
});

server.app.post("/api/cyber/incidents/:id/assign", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  const scope = await verifiedScope(c, { allowEmpty: false });
  if (scope.error) return c.json({ ok: false, error: "Verified tenant scope required." }, 403);
  const body = await readJsonBody(c);
  const actor = actorContext();
  const incident = await assignSecurityIncident(asString(c.req.param("id")), {
    ownerId: asString(body.ownerId),
    actorId: actor.userId || actor.keyFingerprint || "gateway-api",
  }, { database });
  if (!incident) return c.json({ ok: false, error: "Incident not found." }, 404);
  return c.json({ ok: true, incident });
});

server.app.post("/api/cyber/incidents/:id/state", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  const scope = await verifiedScope(c, { allowEmpty: false });
  if (scope.error) return c.json({ ok: false, error: "Verified tenant scope required." }, 403);
  const body = await readJsonBody(c);
  const actor = actorContext();
  const enforced = await enforceSensitiveMutation(c, body, scope);
  if (enforced) return enforced;
  const incident = await updateSecurityIncidentState(asString(c.req.param("id")), {
    state: asString(body.state),
    disposition: asString(body.disposition),
    escalationState: asString(body.escalationState),
    actorId: actor.userId || actor.keyFingerprint || "gateway-api",
  }, { database });
  if (!incident) return c.json({ ok: false, error: "Incident not found." }, 404);
  return c.json({ ok: true, incident });
});

server.app.post("/api/cyber/incidents/:id/note", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  const scope = await verifiedScope(c, { allowEmpty: false });
  if (scope.error) return c.json({ ok: false, error: "Verified tenant scope required." }, 403);
  const body = await readJsonBody(c);
  const actor = actorContext();
  const incident = await addSecurityIncidentNote(asString(c.req.param("id")), {
    note: asString(body.note),
    linkedCaseId: asString(body.linkedCaseId),
    actorId: actor.userId || actor.keyFingerprint || "gateway-api",
  }, { database });
  if (!incident) return c.json({ ok: false, error: "Incident not found." }, 404);
  return c.json({ ok: true, incident });
});

server.app.get("/api/cyber/evidence/:id", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  const scope = await verifiedScope(c, { allowEmpty: true });
  if (scope.error) return c.json({ ok: false, error: "Unverified tenant scope rejected" }, 403);
  const item = await getSecurityEvidenceById(asString(c.req.param("id")), { database, tenantId: scope.tenantId, orgId: scope.orgId });
  if (!item) return c.json({ ok: false, error: "Evidence not found." }, 404);
  return c.json({ ok: true, item });
});

server.app.get("/api/cyber/quarantine", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  const scope = await verifiedScope(c, { allowEmpty: true });
  if (scope.error) return c.json({ ok: false, error: "Unverified tenant scope rejected" }, 403);
  const items = await listSecurityQuarantine({
    tenantId: scope.tenantId,
    orgId: scope.orgId,
    currentState: asString(c.req.query("currentState")) || undefined,
  }, { database });
  return c.json({ ok: true, items });
});

server.app.post("/api/cyber/quarantine/:id/review", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  const scope = await verifiedScope(c, { allowEmpty: false });
  if (scope.error) return c.json({ ok: false, error: "Verified tenant scope required." }, 403);
  const body = await readJsonBody(c);
  const actor = actorContext();
  const enforced = await enforceSensitiveMutation(c, body, scope);
  if (enforced) return enforced;
  const item = await reviewSecurityQuarantine(asString(c.req.param("id")), {
    reviewStatus: asString(body.reviewStatus),
    classification: asString(body.classification),
    notes: asString(body.notes),
    actorId: actor.userId || actor.keyFingerprint || "gateway-api",
  }, { database });
  if (!item) return c.json({ ok: false, error: "Quarantine object not found." }, 404);
  return c.json({ ok: true, item });
});

server.app.post("/api/cyber/quarantine/:id/release", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  const scope = await verifiedScope(c, { allowEmpty: false });
  if (scope.error) return c.json({ ok: false, error: "Verified tenant scope required." }, 403);
  const body = await readJsonBody(c);
  const actor = actorContext();
  const enforced = await enforceSensitiveMutation(c, body, scope);
  if (enforced) return enforced;
  const item = await releaseSecurityQuarantine(asString(c.req.param("id")), {
    releaseDisposition: asString(body.releaseDisposition),
    rationale: asString(body.rationale),
    actorId: actor.userId || actor.keyFingerprint || "gateway-api",
  }, { database });
  if (!item) return c.json({ ok: false, error: "Quarantine object not found." }, 404);
  return c.json({ ok: true, item });
});

server.app.post("/api/cyber/quarantine/:id/rescan", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  const scope = await verifiedScope(c, { allowEmpty: false });
  if (scope.error) return c.json({ ok: false, error: "Verified tenant scope required." }, 403);
  const body = await readJsonBody(c);
  const actor = actorContext();
  const enforced = await enforceSensitiveMutation(c, body, scope);
  if (enforced) return enforced;
  const item = await rescanSecurityQuarantine(asString(c.req.param("id")), {
    actorId: actor.userId || actor.keyFingerprint || "gateway-api",
  }, { database });
  if (!item) return c.json({ ok: false, error: "Quarantine object not found." }, 404);
  return c.json({ ok: true, item });
});

server.app.get("/api/cyber/suppressions", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  const scope = await verifiedScope(c, { allowEmpty: true });
  if (scope.error) return c.json({ ok: false, error: "Unverified tenant scope rejected" }, 403);
  const items = await listSecuritySuppressions({
    tenantId: scope.tenantId,
    orgId: scope.orgId,
    status: asString(c.req.query("status")) || undefined,
  }, { database });
  return c.json({ ok: true, items });
});

server.app.post("/api/cyber/suppressions", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  const scope = await verifiedScope(c, { allowEmpty: false });
  if (scope.error) return c.json({ ok: false, error: "Verified tenant scope required." }, 403);
  const body = await readJsonBody(c);
  const actor = actorContext();
  const enforced = await enforceSensitiveMutation(c, body, scope);
  if (enforced) return enforced;
  const item = await createSecuritySuppression({
    tenantId: scope.tenantId,
    orgId: scope.orgId,
    scopeType: asString(body.scopeType),
    scopeValue: asString(body.scopeValue),
    provider: asString(body.provider),
    tool: asString(body.tool),
    policyRule: asString(body.policyRule),
    rationale: asString(body.rationale),
    rollbackPath: asString(body.rollbackPath),
    approver: asString(body.approver, actor.userId || "operator"),
    createdBy: actor.userId || actor.keyFingerprint || "gateway-api",
    expiresAt: asString(body.expiresAt) || null,
    metadata: body.metadata,
  }, { database });
  return c.json({ ok: true, item });
});

server.app.post("/api/cyber/suppressions/:id/revoke", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  const scope = await verifiedScope(c, { allowEmpty: false });
  if (scope.error) return c.json({ ok: false, error: "Verified tenant scope required." }, 403);
  const body = await readJsonBody(c);
  const actor = actorContext();
  const enforced = await enforceSensitiveMutation(c, body, scope);
  if (enforced) return enforced;
  const item = await revokeSecuritySuppression(asString(c.req.param("id")), {
    revokedBy: actor.userId || actor.keyFingerprint || "gateway-api",
    reason: asString(body.reason),
  }, { database });
  if (!item) return c.json({ ok: false, error: "Suppression not found." }, 404);
  return c.json({ ok: true, item });
});
