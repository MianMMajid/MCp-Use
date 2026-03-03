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

function scopeFromHeaders(c) {
  return {
    tenantId: asString(c.req.header("x-tenant-id")) ?? "",
    orgId: asString(c.req.header("x-org-id")) ?? "",
  };
}

function actorUserId() {
  const ctx = authContextStorage.getStore();
  return asString(ctx?.userId) ?? asString(ctx?.keyFingerprint) ?? "gateway-api";
}

server.app.get("/api/operations/orchestrations/step-up/status", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;

  const scope = scopeFromHeaders(c);
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
  const headerScope = scopeFromHeaders(c);
  const challenge = await createStepUpChallenge(actorUserId(), {
    tenantId: asString(body.tenantId) ?? headerScope.tenantId,
    orgId: asString(body.orgId) ?? headerScope.orgId,
    database,
  });
  return c.json({ ok: true, ...challenge });
});

server.app.post("/api/operations/orchestrations/step-up/verify", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;

  const body = await readJsonBody(c);
  const result = await verifyStepUpChallenge(
    actorUserId(),
    asString(body.challengeToken) ?? "",
    { database },
  );
  return c.json({ ok: result.verified, ...result });
});

server.app.get("/api/operations/orchestrations/escalation", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;

  const scope = scopeFromHeaders(c);
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

  const scope = scopeFromHeaders(c);
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

  const scope = scopeFromHeaders(c);
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

  const history = await getEscalationHistory(asString(c.req.param("approvalId")) ?? "", { database });
  return c.json({ ok: true, history });
});

server.app.post("/api/operations/orchestrations/break-glass", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;

  const ctx = authContextStorage.getStore();
  if (ctx?.method !== "session") {
    return c.json({ ok: false, error: "Break-glass requires interactive session auth." }, 403);
  }
  const scope = scopeFromHeaders(c);
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

  const scope = scopeFromHeaders(c);
  const events = await listBreakGlassEvents(scope.tenantId, scope.orgId, {
    reviewStatus: asString(c.req.query("reviewStatus")) ?? null,
    database,
  });
  return c.json({ ok: true, events });
});

server.app.post("/api/operations/orchestrations/break-glass/:id/review", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;

  const body = await readJsonBody(c);
  const reviewed = await reviewBreakGlassEvent(
    asString(c.req.param("id")) ?? "",
    {
      approved: body.approved === true,
      reviewedBy: actorUserId(),
      notes: asString(body.notes) ?? "",
    },
    { database },
  );
  return c.json({ ok: true, breakGlass: reviewed });
});
