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

// A2: Replace raw header trust with verified tenant scope resolution
async function actorFromRequest(c) {
  const authContext = authContextStorage.getStore();
  const scope = await resolveVerifiedTenantScope({
    tenantId: asString(c.req.header("x-tenant-id")) ?? "",
    orgId: asString(c.req.header("x-org-id")) ?? "",
    tenantClaimSignature: asString(c.req.header("x-tenant-claim-signature")) ?? "",
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
      list: "/api/openclaw/modifier/approvals",
      detail: "/api/openclaw/modifier/approvals/:approvalId",
      decision: "/api/openclaw/modifier/approvals/:approvalId/decision",
    },
    execApi: "/api/openclaw/modifier/exec",
  });
});

server.app.get("/api/openclaw/modifier/approvals", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) {
    return unauthorized;
  }
  const status = asString(c.req.query("status")) ?? "";
  const requestedBy = asString(c.req.query("requestedBy")) ?? "";
  const approvals = await listOpenClawModifierApprovals({
    status,
    requestedBy,
  });
  return c.json({
    ok: true,
    count: approvals.length,
    approvals,
  });
});

server.app.get("/api/openclaw/modifier/approvals/:approvalId", async (c) => {
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
  const approval = await getOpenClawModifierApproval(approvalId);
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

server.app.post("/api/openclaw/modifier/approvals/:approvalId/decision", async (c) => {
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
  const body = await readJsonBody(c);
  const actor = await actorFromRequest(c);

  // A3: Step-up auth for dangerous approval decisions
  const stepUpRequiredEnv = String(process.env.MAPLE_STEP_UP_REQUIRED_FOR_APPROVALS ?? "0").trim().toLowerCase();
  const stepUpRequired = stepUpRequiredEnv === "1" || stepUpRequiredEnv === "true";
  if (stepUpRequired) {
    const stepUp = await hasValidStepUp(authContext.userId, {
      tenantId: actor.tenantId,
      orgId: actor.orgId,
    });
    if (!stepUp.valid) {
      return c.json({
        ok: false,
        error: "Step-up authentication required for approval decisions. Complete a step-up challenge first.",
        stepUpRequired: true,
        challengeEndpoint: "/api/operations/orchestrations/step-up/challenge",
      }, 403);
    }
    // Consume step-up after successful decision below
    var stepUpId = stepUp.stepUpId;
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
  if (stepUpRequired && stepUpId && approvalId) {
    await consumeStepUpForApproval(stepUpId, approvalId);
  }

  return c.json({
    ok: true,
    approval: result.approval,
  });
});

// Gap #6: Combined step-up challenge verification + approval decision in one request.
// Accepts { approvalId, challengeToken, action, reason } and performs:
// 1. Verify step-up challenge
// 2. Submit approval decision
// 3. Consume step-up verification
server.app.post("/api/openclaw/modifier/approvals/step-up-decide", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  const authContext = authContextStorage.getStore();
  if (authContext?.method !== "session") {
    return c.json({ ok: false, error: "Step-up decisions require interactive session auth." }, 403);
  }

  const body = await readJsonBody(c);
  const approvalId = asString(body.approvalId) ?? "";
  const challengeToken = asString(body.challengeToken) ?? "";
  const action = asString(body.action) ?? "";
  const reason = asString(body.reason) ?? "";

  if (!approvalId) return c.json({ ok: false, error: "approvalId is required." }, 400);
  if (!challengeToken) return c.json({ ok: false, error: "challengeToken is required." }, 400);
  if (!action) return c.json({ ok: false, error: "action is required." }, 400);

  // Step 1: Verify step-up challenge
  const stepUpResult = await verifyStepUpChallenge(authContext.userId, challengeToken);
  if (!stepUpResult.verified) {
    return c.json({
      ok: false,
      error: "Step-up challenge verification failed.",
      reason: stepUpResult.reason,
      stepUpRequired: true,
      challengeEndpoint: "/api/operations/orchestrations/step-up/challenge",
    }, 403);
  }

  // Step 2: Submit approval decision
  const actor = await actorFromRequest(c);
  const result = await submitOpenClawModifierApprovalDecision(approvalId, action, reason, actor);
  if (!result.ok) {
    return c.json({ ok: false, error: result.error, approval: result.approval ?? null }, result.status);
  }

  // Step 3: Consume step-up
  await consumeStepUpForApproval(stepUpResult.stepUpId, approvalId);

  return c.json({ ok: true, approval: result.approval, stepUpConsumed: true });
});

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
