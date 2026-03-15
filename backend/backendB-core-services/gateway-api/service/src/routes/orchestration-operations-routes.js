import { authContextStorage, requireApiKeyResponse } from "../auth.js";
import { asString, readJsonBody } from "../helpers.js";
import { database, server } from "../state.js";
import { createStepUpChallenge, hasValidStepUp, verifyStepUpChallenge } from "../core/step-up-auth.js";
import {
  escalateApproval,
  executeBreakGlass,
  getEscalationChain,
  getEscalationHistory,
  listBreakGlassEvents,
  reviewBreakGlassEvent,
  upsertEscalationChain,
} from "../core/escalation-chain.js";
import { resolveVerifiedTenantScope } from "../core/tenant-claim-resolver.js";

// Fix 6: Replace raw header scope with verified tenant claim resolution
async function verifiedScope(c) {
  const scope = await resolveVerifiedTenantScope({
    tenantId: asString(c.req.header("x-tenant-id")) ?? "",
    orgId: asString(c.req.header("x-org-id")) ?? "",
    tenantClaimSignature: asString(c.req.header("x-maple-tenant-claim")) ?? "",
  });
  if (!scope.verified && scope.tenantId) {
    return { error: true, tenantId: "", orgId: "" };
  }
  return { error: false, tenantId: scope.tenantId, orgId: scope.orgId };
}

function actorUserId() {
  const ctx = authContextStorage.getStore();
  return asString(ctx?.userId) ?? asString(ctx?.keyFingerprint) ?? "gateway-api";
}

server.app.get("/api/operations/orchestrations/step-up/status", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;

  const scope = await verifiedScope(c);
  if (scope.error) return c.json({ ok: false, error: "Unverified tenant scope rejected" }, 403);
  const result = await hasValidStepUp(actorUserId(), {
    tenantId: scope.tenantId,
    orgId: scope.orgId,
    database,
  });
  return c.json({ ok: true, ...result });
});

server.app.post("/api/operations/orchestrations/step-up/challenge", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;

  const body = await readJsonBody(c);
  const headerScope = await verifiedScope(c);
  if (headerScope.error) return c.json({ ok: false, error: "Unverified tenant scope rejected" }, 403);
  const challenge = await createStepUpChallenge(actorUserId(), {
    tenantId: headerScope.tenantId,
    orgId: headerScope.orgId,
    database,
  });
  return c.json({ ok: true, ...challenge });
});

server.app.post("/api/operations/orchestrations/step-up/verify", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;

  const body = await readJsonBody(c);
  // Fix 5: Include tenant/org scope in step-up verification
  const stepUpScope = await verifiedScope(c);
  if (stepUpScope.error) return c.json({ ok: false, error: "Unverified tenant scope rejected" }, 403);
  const result = await verifyStepUpChallenge(
    actorUserId(),
    asString(body.challengeToken) ?? "",
    {
      tenantId: stepUpScope.tenantId,
      orgId: stepUpScope.orgId,
      database,
    },
  );
  return c.json({ ok: result.verified, ...result });
});

server.app.get("/api/operations/orchestrations/escalation", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;

  const scope = await verifiedScope(c);
  if (scope.error) return c.json({ ok: false, error: "Unverified tenant scope rejected" }, 403);
  const chain = await getEscalationChain(
    scope.tenantId,
    scope.orgId,
    asString(c.req.query("chainName")) ?? "default",
    { database },
  );
  return c.json({ ok: true, chain });
});

server.app.post("/api/operations/orchestrations/escalation", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;

  const scope = await verifiedScope(c);
  if (scope.error) return c.json({ ok: false, error: "Unverified tenant scope rejected" }, 403);
  const body = await readJsonBody(c);
  const chain = await upsertEscalationChain(scope.tenantId, scope.orgId, body, {
    createdBy: actorUserId(),
    database,
  });
  return c.json({ ok: true, chain });
});

server.app.post("/api/operations/orchestrations/escalation/escalate", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;

  const scope = await verifiedScope(c);
  if (scope.error) return c.json({ ok: false, error: "Unverified tenant scope rejected" }, 403);
  const body = await readJsonBody(c);
  const result = await escalateApproval(
    asString(body.approvalId) ?? "",
    scope.tenantId,
    scope.orgId,
    { database },
  );
  return c.json({ ok: true, ...result });
});

server.app.get("/api/operations/orchestrations/escalation/:approvalId/history", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;

  // Finding 2: Scope escalation history by verified tenant
  const histScope = await verifiedScope(c);
  if (histScope.error) return c.json({ ok: false, error: "Unverified tenant scope rejected" }, 403);
  const history = await getEscalationHistory(asString(c.req.param("approvalId")) ?? "", {
    tenantId: histScope.tenantId,
    orgId: histScope.orgId,
    database,
  });
  return c.json({ ok: true, history });
});

server.app.post("/api/operations/orchestrations/break-glass", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;

  const ctx = authContextStorage.getStore();
  if (ctx?.method !== "session") {
    return c.json({ ok: false, error: "Break-glass requires interactive session auth." }, 403);
  }
  const scope = await verifiedScope(c);
  if (scope.error) return c.json({ ok: false, error: "Unverified tenant scope rejected" }, 403);
  const body = await readJsonBody(c);
  try {
    const record = await executeBreakGlass(
      {
        tenantId: scope.tenantId,
        orgId: scope.orgId,
        userId: actorUserId(),
        ...body,
      },
      { database },
    );
    return c.json({ ok: true, breakGlass: record });
  } catch (error) {
    return c.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      400,
    );
  }
});

server.app.get("/api/operations/orchestrations/break-glass", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;

  const scope = await verifiedScope(c);
  if (scope.error) return c.json({ ok: false, error: "Unverified tenant scope rejected" }, 403);
  const events = await listBreakGlassEvents(scope.tenantId, scope.orgId, {
    reviewStatus: asString(c.req.query("reviewStatus")) ?? null,
    database,
  });
  return c.json({ ok: true, events });
});

server.app.post("/api/operations/orchestrations/break-glass/:id/review", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;

  // Finding 1: Require session auth and verified scope for break-glass reviews
  const ctx = authContextStorage.getStore();
  if (ctx?.method !== "session") {
    return c.json({ ok: false, error: "Break-glass review requires interactive session auth." }, 403);
  }
  const reviewScope = await verifiedScope(c);
  if (reviewScope.error) return c.json({ ok: false, error: "Unverified tenant scope rejected" }, 403);

  const body = await readJsonBody(c);
  try {
    const reviewed = await reviewBreakGlassEvent(
      asString(c.req.param("id")) ?? "",
      {
        approved: body.approved === true,
        reviewedBy: actorUserId(),
        notes: asString(body.notes) ?? "",
      },
      {
        tenantId: reviewScope.tenantId,
        orgId: reviewScope.orgId,
        database,
      },
    );
    if (!reviewed) {
      return c.json({ ok: false, error: "Break-glass event not found or not in your tenant scope." }, 404);
    }
    return c.json({ ok: true, breakGlass: reviewed });
  } catch (error) {
    return c.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      403,
    );
  }
});
