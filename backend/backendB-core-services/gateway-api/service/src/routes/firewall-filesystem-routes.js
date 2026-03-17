import { authContextStorage, requireApiKeyResponse } from "../auth.js";
import { asString, readJsonBody } from "../helpers.js";
import { database, server } from "../state.js";
import { hasValidStepUp, verifyStepUpChallenge } from "../core/step-up-auth.js";
import { resolveVerifiedTenantScope } from "../core/tenant-claim-resolver.js";
import { allowNoAuth } from "../config.js";
import {
  decideFilesystemMutation,
  getFilesystemMutationById,
  getFilesystemMutationStatus,
  listFilesystemMutations,
  preflightFilesystemMutation,
  promoteFilesystemMutation,
  restoreFilesystemMutation,
} from "../core/filesystem-intervention-service.js";

function parseBoundedInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
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

async function enforceSensitiveMutation(c, body, scope) {
  const actor = actorContext();
  if (actor.authBypass || allowNoAuth) {
    return null;
  }
  if (actor.method !== "session" || !actor.userId) {
    return c.json({ ok: false, error: "Interactive session auth required for this filesystem mutation operation." }, 403);
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

function toResponseItem(item) {
  if (!item) return null;
  return {
    planId: item.planId,
    tenantId: item.tenantId,
    orgId: item.orgId,
    traceId: item.traceId,
    sessionId: item.sessionId,
    runId: item.runId,
    sourceSurface: item.sourceSurface,
    sourceType: item.sourceType,
    actorUserId: item.actorUserId,
    workspaceRoot: item.workspaceRoot,
    taskText: item.taskText,
    lane: item.lane,
    status: item.status,
    plan: item.plan,
    modelAssessment: item.modelAssessment,
    validation: item.validation,
    forkResult: item.forkResult,
    promotion: item.promotion,
    evidenceIds: item.evidenceIds,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    decidedAt: item.decidedAt,
    decidedBy: item.decidedBy,
    restoredAt: item.restoredAt,
    restoredBy: item.restoredBy,
  };
}

export function registerFirewallFilesystemRoutes() {
  server.app.post("/api/firewall/filesystem/preflight", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;
    const scope = await verifiedScope(c, { allowEmpty: true });
    if (scope.error) return c.json({ ok: false, error: "Unverified tenant scope rejected" }, 403);
    const body = await readJsonBody(c);
    const actor = actorContext();
    const item = await preflightFilesystemMutation(body, {
      database,
      tenantId: scope.tenantId,
      orgId: scope.orgId,
      traceId: asString(body.traceId),
      sessionId: asString(body.sessionId),
      runId: asString(body.runId),
      sourceSurface: asString(body.sourceSurface, "firewall"),
      sourceType: asString(body.sourceType, body.command ? "shell" : "tool_call"),
      actorUserId: asString(body.actorUserId || actor.userId || actor.keyFingerprint),
    });
    if (!item) {
      return c.json({ ok: false, error: "No filesystem mutation detected in request body." }, 400);
    }
    return c.json({ ok: true, item: toResponseItem(item) }, item.lane === "hard_deny" ? 409 : 201);
  });

  server.app.get("/api/firewall/filesystem/mutations", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;
    const scope = await verifiedScope(c, { allowEmpty: true });
    if (scope.error) return c.json({ ok: false, error: "Unverified tenant scope rejected" }, 403);
    const payload = await listFilesystemMutations({
      status: asString(c.req.query("status")) || undefined,
      lane: asString(c.req.query("lane")) || undefined,
      limit: parseBoundedInteger(c.req.query("limit"), 50, 1, 200),
      offset: parseBoundedInteger(c.req.query("offset"), 0, 0, 1_000_000),
    }, {
      database,
      tenantId: scope.tenantId,
      orgId: scope.orgId,
    });
    return c.json({
      ok: true,
      items: payload.items.map(toResponseItem),
      total: payload.total,
      offset: payload.offset,
      nextOffset: payload.nextOffset,
    });
  });

  server.app.get("/api/firewall/filesystem/mutations/:id", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;
    const scope = await verifiedScope(c, { allowEmpty: true });
    if (scope.error) return c.json({ ok: false, error: "Unverified tenant scope rejected" }, 403);
    const item = await getFilesystemMutationById(asString(c.req.param("id")), {
      database,
      tenantId: scope.tenantId,
      orgId: scope.orgId,
    });
    if (!item) return c.json({ ok: false, error: "Filesystem mutation plan not found." }, 404);
    return c.json({ ok: true, item: toResponseItem(item) });
  });

  server.app.post("/api/firewall/filesystem/mutations/:id/decision", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;
    const scope = await verifiedScope(c, { allowEmpty: true });
    if (scope.error) return c.json({ ok: false, error: "Unverified tenant scope rejected" }, 403);
    const body = await readJsonBody(c);
    const gated = await enforceSensitiveMutation(c, body, scope);
    if (gated) return gated;
    try {
      const actor = actorContext();
      const item = await decideFilesystemMutation(asString(c.req.param("id")), body, {
        database,
        tenantId: scope.tenantId,
        orgId: scope.orgId,
        actorUserId: actor.userId || actor.keyFingerprint,
      });
      return c.json({ ok: true, item: toResponseItem(item) });
    } catch (error) {
      return c.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 400);
    }
  });

  server.app.post("/api/firewall/filesystem/mutations/:id/promote", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;
    const scope = await verifiedScope(c, { allowEmpty: true });
    if (scope.error) return c.json({ ok: false, error: "Unverified tenant scope rejected" }, 403);
    const body = await readJsonBody(c);
    const gated = await enforceSensitiveMutation(c, body, scope);
    if (gated) return gated;
    try {
      const actor = actorContext();
      const item = await promoteFilesystemMutation(asString(c.req.param("id")), body, {
        database,
        tenantId: scope.tenantId,
        orgId: scope.orgId,
        actorUserId: actor.userId || actor.keyFingerprint,
      });
      return c.json({ ok: true, item: toResponseItem(item) });
    } catch (error) {
      return c.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 400);
    }
  });

  server.app.post("/api/firewall/filesystem/mutations/:id/restore", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;
    const scope = await verifiedScope(c, { allowEmpty: true });
    if (scope.error) return c.json({ ok: false, error: "Unverified tenant scope rejected" }, 403);
    const body = await readJsonBody(c);
    const gated = await enforceSensitiveMutation(c, body, scope);
    if (gated) return gated;
    try {
      const actor = actorContext();
      const item = await restoreFilesystemMutation(asString(c.req.param("id")), body, {
        database,
        tenantId: scope.tenantId,
        orgId: scope.orgId,
        actorUserId: actor.userId || actor.keyFingerprint,
      });
      return c.json({ ok: true, item: toResponseItem(item) });
    } catch (error) {
      return c.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 400);
    }
  });

  server.app.get("/api/firewall/filesystem/status", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;
    const scope = await verifiedScope(c, { allowEmpty: true });
    if (scope.error) return c.json({ ok: false, error: "Unverified tenant scope rejected" }, 403);
    const item = await getFilesystemMutationStatus({
      database,
      tenantId: scope.tenantId,
      orgId: scope.orgId,
    });
    return c.json({ ok: true, ...item });
  });
}
