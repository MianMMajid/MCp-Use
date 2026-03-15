import { authContextStorage, requireApiKeyResponse } from "../auth.js";
import { asString, readJsonBody } from "../helpers.js";
import {
  executeOpenClawModifierRequest,
  getOpenClawModifierApproval,
  getOpenClawModifierPolicy,
  listOpenClawModifierApprovals,
  submitOpenClawModifierApprovalDecision,
} from "../core/openclaw-modifier-runtime.js";
import { resolveVerifiedTenantScope } from "../core/tenant-claim-resolver.js";
import { hasValidStepUp, consumeStepUpForApproval, verifyStepUpChallenge } from "../core/step-up-auth.js";
import { database, server } from "../state.js";

const CANONICAL_APPROVALS_BASE = "/api/operations/orchestrations/approvals";
const LEGACY_APPROVALS_BASE = "/api/openclaw/modifier/approvals";

function endpointRemoved(c, replacement) {
  return c.json(
    {
      ok: false,
      error: "Endpoint removed",
      replacement,
    },
    410,
  );
}

// A2: Replace raw header trust with verified tenant scope resolution
async function actorFromRequest(c) {
  const authContext = authContextStorage.getStore();
  const scope = await resolveVerifiedTenantScope({
    tenantId: asString(c.req.header("x-tenant-id")) ?? "",
    orgId: asString(c.req.header("x-org-id")) ?? "",
    // Finding 11: Accept both header names for backwards compat, prefer canonical name
    tenantClaimSignature: asString(c.req.header("x-maple-tenant-claim")) ?? asString(c.req.header("x-tenant-claim-signature")) ?? "",
  });
  return {
    userId: asString(authContext?.userId) ?? asString(authContext?.keyFingerprint) ?? "gateway-api",
    tenantId: scope.tenantId,
    orgId: scope.orgId,
    tenantVerified: scope.verified,
    tenantMethod: scope.method,
    deviceId: asString(c.req.header("x-device-id")) ?? asString(c.req.header("user-agent")) ?? "",
    sessionId:
      asString(c.req.header("x-maple-session-id")) ??
      asString(c.req.header("mcp-session-id")) ??
      "",
    traceId:
      asString(c.req.header("x-maple-trace-id")) ??
      asString(c.req.header("x-trace-id")) ??
      "",
  };
}

server.app.get("/api/openclaw/modifier/capabilities", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) {
    return unauthorized;
  }
  return c.json({
    ok: true,
    ...(await getOpenClawModifierPolicy()),
    approvalsApi: {
      list: `${CANONICAL_APPROVALS_BASE}`,
      detail: `${CANONICAL_APPROVALS_BASE}/:approvalId`,
      decision: `${CANONICAL_APPROVALS_BASE}/:approvalId/decision`,
    },
    execApi: "/api/openclaw/modifier/exec",
  });
});

server.app.get("/api/operations/orchestrations/approvals", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) {
    return unauthorized;
  }
  const status = asString(c.req.query("status")) ?? "";
  const requestedBy = asString(c.req.query("requestedBy")) ?? "";
  const actor = await actorFromRequest(c);
  // Reject unverified tenant scope on approval routes to prevent spoofed access
  if (!actor.tenantVerified && actor.tenantId) {
    return c.json({ ok: false, error: "Verified tenant scope required for approval access." }, 403);
  }
  const approvals = await listOpenClawModifierApprovals(
    { status, requestedBy },
    { tenantId: actor.tenantId, orgId: actor.orgId },
  );
  return c.json({
    ok: true,
    count: approvals.length,
    approvals,
  });
});

server.app.get("/api/operations/orchestrations/approvals/:approvalId", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) {
    return unauthorized;
  }
  const approvalId = asString(c.req.param("approvalId"));
  if (!approvalId) {
    return c.json(
      {
        ok: false,
        error: "approvalId is required.",
      },
      400
    );
  }
  const detailActor = await actorFromRequest(c);
  // Reject unverified tenant scope to prevent spoofed approval access
  if (!detailActor.tenantVerified && detailActor.tenantId) {
    return c.json({ ok: false, error: "Verified tenant scope required for approval access." }, 403);
  }
  const approval = await getOpenClawModifierApproval(approvalId, {
    tenantId: detailActor.tenantId,
    orgId: detailActor.orgId,
  });
  if (!approval) {
    return c.json(
      {
        ok: false,
        error: "Approval record not found.",
      },
      404
    );
  }
  return c.json({
    ok: true,
    approval,
  });
});

server.app.post("/api/operations/orchestrations/approvals/:approvalId/decision", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) {
    return unauthorized;
  }
  const authContext = authContextStorage.getStore();
  if (authContext?.method !== "session") {
    return c.json(
      {
        ok: false,
        error:
          "Modifier approval decisions require interactive session auth (human-in-the-loop).",
      },
      403
    );
  }
  const body = await readJsonBody(c);
  const approvalId = asString(c.req.param("approvalId")) ?? asString(body.approvalId);
  if (!approvalId || approvalId.trim().length === 0) {
    return c.json(
      {
        ok: false,
        error: "approvalId is required.",
      },
      400
    );
  }
  const challengeToken = asString(body.challengeToken) ?? "";
  const actor = await actorFromRequest(c);

  // Reject unverified tenant scope to prevent spoofed approval decisions
  if (!actor.tenantVerified && actor.tenantId) {
    return c.json({ ok: false, error: "Verified tenant scope required for approval decisions." }, 403);
  }

  // A3: Step-up auth for dangerous approval decisions
  const stepUpRequiredEnv = String(process.env.MAPLE_STEP_UP_REQUIRED_FOR_APPROVALS ?? "0").trim().toLowerCase();
  const stepUpRequired = stepUpRequiredEnv === "1" || stepUpRequiredEnv === "true";
  let stepUpId = "";
  if (stepUpRequired) {
    if (challengeToken) {
      // Fix 5: Include tenant/org scope in step-up verification
      const stepUp = await verifyStepUpChallenge(actor.userId, challengeToken, {
        tenantId: actor.tenantId,
        orgId: actor.orgId,
        database,
      });
      if (!stepUp.verified) {
        return c.json(
          {
            ok: false,
            error: "Step-up challenge verification failed.",
            reason: stepUp.reason,
            stepUpRequired: true,
            challengeEndpoint: "/api/operations/orchestrations/step-up/challenge",
          },
          403,
        );
      }
      stepUpId = stepUp.stepUpId;
    } else {
      const stepUp = await hasValidStepUp(actor.userId, {
        tenantId: actor.tenantId,
        orgId: actor.orgId,
        database,
      });
      if (!stepUp.valid) {
        return c.json({
          ok: false,
          error: "Step-up authentication required for approval decisions. Complete a step-up challenge first.",
          stepUpRequired: true,
          challengeEndpoint: "/api/operations/orchestrations/step-up/challenge",
        }, 403);
      }
      stepUpId = stepUp.stepUpId ?? "";
    }
  }

  const action = asString(body.action) ?? "";
  const reason = asString(body.reason) ?? "";
  const result = await submitOpenClawModifierApprovalDecision(approvalId, action, reason, actor);
  if (!result.ok) {
    return c.json(
      {
        ok: false,
        error: result.error,
        approval: result.approval ?? null,
      },
      result.status
    );
  }

  // A3: Consume step-up verification after successful decision
  if (stepUpRequired && stepUpId) {
    await consumeStepUpForApproval(stepUpId, approvalId);
  }

  return c.json({
    ok: true,
    approval: result.approval,
  });
});

server.app.get(LEGACY_APPROVALS_BASE, async (c) =>
  endpointRemoved(c, CANONICAL_APPROVALS_BASE),
);
server.app.get(`${LEGACY_APPROVALS_BASE}/:approvalId`, async (c) =>
  endpointRemoved(c, `${CANONICAL_APPROVALS_BASE}/:approvalId`),
);
server.app.post(`${LEGACY_APPROVALS_BASE}/:approvalId/decision`, async (c) =>
  endpointRemoved(c, `${CANONICAL_APPROVALS_BASE}/:approvalId/decision`),
);
server.app.post(`${LEGACY_APPROVALS_BASE}/step-up-decide`, async (c) =>
  endpointRemoved(c, `${CANONICAL_APPROVALS_BASE}/:approvalId/decision`),
);

server.app.post("/api/openclaw/modifier/exec", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) {
    return unauthorized;
  }
  const body = await readJsonBody(c);
  const actor = await actorFromRequest(c);
  try {
    const response = await executeOpenClawModifierRequest(body, actor);
    if (!response.ok) {
      return c.json(
        {
          ok: false,
          type: response.type,
          error: response.error,
          approval: response.approval ?? null,
          policy: response.policy ?? null,
        },
        response.status
      );
    }
    return c.json(
      {
        ok: true,
        type: response.type,
        ...response.result,
      },
      response.status
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json(
      {
        ok: false,
        error: message,
      },
      400
    );
  }
});
