/**
 * openclaw-modifier-ops-routes.js
 *
 * Operational control routes for the OpenClaw modifier system:
 * - Tenant binding management
 * - Org hierarchy
 * - Rate limits & quotas
 * - Policy dry-run simulation
 * - Escalation chains
 * - Break-glass emergency override + review
 * - Audit chain integrity + retention
 * - Alert webhook management
 * - Compliance reports
 * - Step-up auth
 */
import { authContextStorage, requireApiKeyResponse } from "../auth.js";
import { asString, readJsonBody } from "../helpers.js";
import { database, server } from "../state.js";

import { resolveVerifiedTenantScope, bindUserToTenant, unbindUserFromTenant, listUserTenantBindings } from "../core/tenant-claim-resolver.js";
import { createStepUpChallenge, verifyStepUpChallenge, hasValidStepUp } from "../core/step-up-auth.js";
import { upsertOrgNode, getOrgNode, getOrgTree, getChildOrgs, getAncestorChain, deactivateOrg, getOrgLifecycleEvents } from "../core/org-hierarchy.js";
import { checkRateLimit, getQuotaConfig, setQuotaConfig } from "../core/rate-limiter.js";
import { simulateModifierPolicy, diffPolicies } from "../core/policy-simulator.js";
import { parsePolicyDocument, validatePolicyDocument, dryRunPolicy, diffBeforeApply } from "../core/policy-as-code.js";
import { saveOpenClawModifierPolicyVersion, listOpenClawModifierPolicyVersions } from "../core/openclaw-modifier-runtime.js";
import { upsertEscalationChain, getEscalationChain, escalateApproval, getEscalationHistory } from "../core/escalation-chain.js";
import { executeBreakGlass, listBreakGlassEvents, reviewBreakGlassEvent } from "../core/escalation-chain.js";
import { verifyAuditChain, queryAuditChain, setRetentionPolicy, getRetentionPolicy, enforceRetention } from "../core/audit-integrity.js";
import { registerAlertWebhook, listAlertWebhooks, deleteAlertWebhook, getAlertDeliveryLog } from "../core/alert-webhook.js";
import { generateComplianceReport, getComplianceSummary } from "../core/compliance-reporter.js";
import { getOpenClawModifierPolicy } from "../core/openclaw-modifier-runtime.js";

function scopeFromHeaders(c) {
  return {
    tenantId: asString(c.req.header("x-tenant-id")) ?? "",
    orgId: asString(c.req.header("x-org-id")) ?? "",
    tenantClaimSignature: asString(c.req.header("x-tenant-claim-signature")) ?? "",
  };
}

function actorUserId() {
  const ctx = authContextStorage.getStore();
  return asString(ctx?.userId) ?? asString(ctx?.keyFingerprint) ?? "gateway-api";
}

// ── Tenant Bindings ───────────────────────────────────────────────────────

server.app.get("/api/openclaw/modifier/ops/tenant-bindings", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  const userId = actorUserId();
  const bindings = await listUserTenantBindings(userId, { database });
  return c.json({ ok: true, bindings });
});

server.app.post("/api/openclaw/modifier/ops/tenant-bindings", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  const body = await readJsonBody(c);
  const binding = await bindUserToTenant(
    actorUserId(),
    asString(body.tenantId) ?? "",
    asString(body.orgId) ?? "",
    { roleId: body.roleId, boundBy: actorUserId(), database }
  );
  return c.json({ ok: true, binding });
});

server.app.delete("/api/openclaw/modifier/ops/tenant-bindings", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  const body = await readJsonBody(c);
  await unbindUserFromTenant(actorUserId(), asString(body.tenantId) ?? "", asString(body.orgId) ?? "", { database });
  return c.json({ ok: true });
});

server.app.get("/api/openclaw/modifier/ops/tenant-scope", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  const scope = await resolveVerifiedTenantScope(scopeFromHeaders(c));
  return c.json({ ok: true, scope });
});

// ── Step-Up Auth ──────────────────────────────────────────────────────────

server.app.post("/api/openclaw/modifier/ops/step-up/challenge", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  const scope = scopeFromHeaders(c);
  const challenge = await createStepUpChallenge(actorUserId(), { tenantId: scope.tenantId, orgId: scope.orgId, database });
  return c.json({ ok: true, ...challenge });
});

server.app.post("/api/openclaw/modifier/ops/step-up/verify", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  const body = await readJsonBody(c);
  const result = await verifyStepUpChallenge(actorUserId(), asString(body.challengeToken) ?? "", { database });
  return c.json({ ok: result.verified, ...result });
});

server.app.get("/api/openclaw/modifier/ops/step-up/status", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  const scope = scopeFromHeaders(c);
  const result = await hasValidStepUp(actorUserId(), { tenantId: scope.tenantId, orgId: scope.orgId, database });
  return c.json({ ok: true, ...result });
});

// ── Org Hierarchy ─────────────────────────────────────────────────────────

server.app.get("/api/openclaw/modifier/ops/org/tree", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  const tenantId = asString(c.req.header("x-tenant-id")) ?? "";
  const tree = await getOrgTree(tenantId, { database });
  return c.json({ ok: true, tree });
});

server.app.get("/api/openclaw/modifier/ops/org/:orgId", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  const tenantId = asString(c.req.header("x-tenant-id")) ?? "";
  const orgId = asString(c.req.param("orgId")) ?? "";
  const [node, children, ancestors] = await Promise.all([
    getOrgNode(tenantId, orgId, { database }),
    getChildOrgs(tenantId, orgId, { database }),
    getAncestorChain(tenantId, orgId, { database }),
  ]);
  return c.json({ ok: true, node, children, ancestors });
});

server.app.post("/api/openclaw/modifier/ops/org", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  const body = await readJsonBody(c);
  const node = await upsertOrgNode({ ...body, createdBy: actorUserId() }, { database });
  return c.json({ ok: true, node });
});

server.app.delete("/api/openclaw/modifier/ops/org/:orgId", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  const tenantId = asString(c.req.header("x-tenant-id")) ?? "";
  const orgId = asString(c.req.param("orgId")) ?? "";
  await deactivateOrg(tenantId, orgId, actorUserId(), { database });
  return c.json({ ok: true });
});

server.app.get("/api/openclaw/modifier/ops/org/:orgId/lifecycle", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  const tenantId = asString(c.req.header("x-tenant-id")) ?? "";
  const orgId = asString(c.req.param("orgId")) ?? "";
  const events = await getOrgLifecycleEvents(tenantId, orgId, { database });
  return c.json({ ok: true, events });
});

// ── Rate Limits & Quotas ──────────────────────────────────────────────────

server.app.get("/api/openclaw/modifier/ops/rate-limit", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  const scope = scopeFromHeaders(c);
  const [status, config] = await Promise.all([
    checkRateLimit(scope.tenantId, scope.orgId, { database }),
    getQuotaConfig(scope.tenantId, scope.orgId, { database }),
  ]);
  return c.json({ ok: true, ...status, config });
});

server.app.post("/api/openclaw/modifier/ops/rate-limit/config", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  const scope = scopeFromHeaders(c);
  const body = await readJsonBody(c);
  await setQuotaConfig(scope.tenantId, scope.orgId, body, { updatedBy: actorUserId(), database });
  return c.json({ ok: true });
});

// ── Policy Dry-Run ────────────────────────────────────────────────────────

server.app.post("/api/openclaw/modifier/ops/policy/simulate", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  const body = await readJsonBody(c);
  const scope = scopeFromHeaders(c);
  const policy = await getOpenClawModifierPolicy(scope);
  const result = simulateModifierPolicy(body.request ?? body, policy);
  return c.json({ ok: true, simulation: result, policyVersion: policy.policyVersion });
});

server.app.post("/api/openclaw/modifier/ops/policy/diff", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  const body = await readJsonBody(c);
  const diffs = diffPolicies(body.policyA ?? {}, body.policyB ?? {});
  return c.json({ ok: true, diffs });
});

// ── Policy-as-Code Apply / Dry-Run / Diff / Rollback ─────────────────────

async function readPolicyBody(c) {
  const contentType = String(c.req.header("content-type") ?? "").toLowerCase();
  if (contentType.includes("text/yaml") || contentType.includes("application/x-yaml") || contentType.includes("application/yaml")) {
    return await c.req.text();
  }
  return await readJsonBody(c);
}

server.app.post("/api/openclaw/modifier/ops/policy/apply", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  const body = await readPolicyBody(c);
  const scope = scopeFromHeaders(c);
  try {
    const policy = parsePolicyDocument(body);
    const result = await saveOpenClawModifierPolicyVersion(policy, {
      tenantId: scope.tenantId,
      orgId: scope.orgId,
      userId: actorUserId(),
    });
    return c.json({ ok: true, ...result });
  } catch (err) {
    return c.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 400);
  }
});

server.app.post("/api/openclaw/modifier/ops/policy/dry-run", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  const body = await readPolicyBody(c);
  try {
    const sampleRequest = typeof body === "object" && body !== null ? body.sampleRequest : undefined;
    const policyInput = typeof body === "object" && body !== null ? (body.policy ?? body) : body;
    const result = dryRunPolicy(policyInput, sampleRequest);
    return c.json({ ok: true, ...result });
  } catch (err) {
    return c.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 400);
  }
});

server.app.post("/api/openclaw/modifier/ops/policy/diff-before-apply", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  const body = await readPolicyBody(c);
  const scope = scopeFromHeaders(c);
  try {
    const currentPolicy = await getOpenClawModifierPolicy(scope);
    const policyInput = typeof body === "object" && body !== null ? (body.policy ?? body) : body;
    const result = diffBeforeApply(policyInput, currentPolicy);
    return c.json({ ok: true, ...result });
  } catch (err) {
    return c.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 400);
  }
});

server.app.post("/api/openclaw/modifier/ops/policy/rollback", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  const body = await readJsonBody(c);
  const scope = scopeFromHeaders(c);
  try {
    const targetVersion = Number(body.version);
    if (!Number.isFinite(targetVersion) || targetVersion < 1) {
      return c.json({ ok: false, error: "version must be a positive integer." }, 400);
    }
    const versions = await listOpenClawModifierPolicyVersions(
      { tenantId: scope.tenantId, orgId: scope.orgId, userId: actorUserId() },
      { limit: 1000 }
    );
    const target = versions.find((v) => v.version === targetVersion);
    if (!target) {
      return c.json({ ok: false, error: `Policy version ${targetVersion} not found.` }, 404);
    }
    const result = await saveOpenClawModifierPolicyVersion(target.policy, {
      tenantId: scope.tenantId,
      orgId: scope.orgId,
      userId: actorUserId(),
    });
    return c.json({ ok: true, rolledBackTo: targetVersion, ...result });
  } catch (err) {
    return c.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 400);
  }
});

// ── Escalation Chains ─────────────────────────────────────────────────────

server.app.get("/api/openclaw/modifier/ops/escalation", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  const scope = scopeFromHeaders(c);
  const chain = await getEscalationChain(scope.tenantId, scope.orgId, c.req.query("chainName") ?? "default", { database });
  return c.json({ ok: true, chain });
});

server.app.post("/api/openclaw/modifier/ops/escalation", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  const scope = scopeFromHeaders(c);
  const body = await readJsonBody(c);
  const chain = await upsertEscalationChain(scope.tenantId, scope.orgId, body, { createdBy: actorUserId(), database });
  return c.json({ ok: true, chain });
});

server.app.post("/api/openclaw/modifier/ops/escalation/escalate", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  const body = await readJsonBody(c);
  const scope = scopeFromHeaders(c);
  const result = await escalateApproval(asString(body.approvalId) ?? "", scope.tenantId, scope.orgId, { database });
  return c.json({ ok: true, ...result });
});

server.app.get("/api/openclaw/modifier/ops/escalation/:approvalId/history", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  const history = await getEscalationHistory(asString(c.req.param("approvalId")) ?? "", { database });
  return c.json({ ok: true, history });
});

// ── Break-Glass ───────────────────────────────────────────────────────────

server.app.post("/api/openclaw/modifier/ops/break-glass", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  const ctx = authContextStorage.getStore();
  if (ctx?.method !== "session") {
    return c.json({ ok: false, error: "Break-glass requires interactive session auth." }, 403);
  }
  const body = await readJsonBody(c);
  const scope = scopeFromHeaders(c);
  try {
    const record = await executeBreakGlass({
      tenantId: scope.tenantId,
      orgId: scope.orgId,
      userId: actorUserId(),
      ...body,
    }, { database });
    return c.json({ ok: true, breakGlass: record });
  } catch (err) {
    return c.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 400);
  }
});

server.app.get("/api/openclaw/modifier/ops/break-glass", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  const scope = scopeFromHeaders(c);
  const events = await listBreakGlassEvents(scope.tenantId, scope.orgId, {
    reviewStatus: asString(c.req.query("reviewStatus")) ?? null,
    database,
  });
  return c.json({ ok: true, events });
});

server.app.post("/api/openclaw/modifier/ops/break-glass/:id/review", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  const body = await readJsonBody(c);
  const result = await reviewBreakGlassEvent(asString(c.req.param("id")) ?? "", {
    approved: body.approved === true,
    reviewedBy: actorUserId(),
    notes: asString(body.notes) ?? "",
  }, { database });
  return c.json({ ok: true, breakGlass: result });
});

// ── Audit Chain Integrity ─────────────────────────────────────────────────

server.app.get("/api/openclaw/modifier/ops/audit-chain/verify", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  const result = await verifyAuditChain({ limit: Number(c.req.query("limit")) || 1000, database });
  return c.json({ ok: true, ...result });
});

server.app.get("/api/openclaw/modifier/ops/audit-chain", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  const scope = scopeFromHeaders(c);
  const result = await queryAuditChain({
    tenantId: scope.tenantId,
    orgId: scope.orgId,
    eventType: asString(c.req.query("eventType")) ?? null,
    severity: asString(c.req.query("severity")) ?? null,
    since: asString(c.req.query("since")) ?? null,
    until: asString(c.req.query("until")) ?? null,
  }, { limit: Number(c.req.query("limit")) || 100, offset: Number(c.req.query("offset")) || 0, database });
  return c.json({ ok: true, ...result });
});

// ── Retention Policies ────────────────────────────────────────────────────

server.app.get("/api/openclaw/modifier/ops/retention", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  const tenantId = asString(c.req.header("x-tenant-id")) ?? "";
  const policy = await getRetentionPolicy(tenantId, { database });
  return c.json({ ok: true, ...policy });
});

server.app.post("/api/openclaw/modifier/ops/retention", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  const tenantId = asString(c.req.header("x-tenant-id")) ?? "";
  const body = await readJsonBody(c);
  await setRetentionPolicy(tenantId, body.retentionDays, { updatedBy: actorUserId(), database });
  return c.json({ ok: true });
});

server.app.post("/api/openclaw/modifier/ops/retention/enforce", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  const result = await enforceRetention({ database });
  return c.json({ ok: true, ...result });
});

// ── Alert Webhooks ────────────────────────────────────────────────────────

server.app.get("/api/openclaw/modifier/ops/alert-webhooks", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  const tenantId = asString(c.req.header("x-tenant-id")) ?? "";
  const webhooks = await listAlertWebhooks(tenantId, { database });
  return c.json({ ok: true, webhooks });
});

server.app.post("/api/openclaw/modifier/ops/alert-webhooks", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  const body = await readJsonBody(c);
  const scope = scopeFromHeaders(c);
  try {
    const webhook = await registerAlertWebhook({ ...body, tenantId: scope.tenantId, orgId: scope.orgId, createdBy: actorUserId() }, { database });
    return c.json({ ok: true, webhook });
  } catch (err) {
    return c.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 400);
  }
});

server.app.delete("/api/openclaw/modifier/ops/alert-webhooks/:id", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  await deleteAlertWebhook(asString(c.req.param("id")) ?? "", { database });
  return c.json({ ok: true });
});

server.app.get("/api/openclaw/modifier/ops/alert-webhooks/:id/deliveries", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  const log = await getAlertDeliveryLog(asString(c.req.param("id")) ?? "", { database });
  return c.json({ ok: true, deliveries: log });
});

// ── Compliance Reports ────────────────────────────────────────────────────

server.app.get("/api/openclaw/modifier/ops/compliance/summary", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  const tenantId = asString(c.req.header("x-tenant-id")) ?? "";
  const summary = await getComplianceSummary(tenantId, { database });
  return c.json({ ok: true, ...summary });
});

server.app.post("/api/openclaw/modifier/ops/compliance/report", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  const tenantId = asString(c.req.header("x-tenant-id")) ?? "";
  const body = await readJsonBody(c);
  const report = await generateComplianceReport(tenantId, {
    since: asString(body.since),
    until: asString(body.until),
    framework: asString(body.framework) ?? "SOC2",
    database,
  });
  return c.json({ ok: true, report });
});
