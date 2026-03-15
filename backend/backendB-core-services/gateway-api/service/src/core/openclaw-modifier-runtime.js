import { createHash, randomUUID } from "node:crypto";
import { authContextStorage } from "../auth.js";
import { emitAuditEvent } from "../audit-emitter.js";
import {
  openclawModifierAllowedTools,
  openclawModifierAllowDevProfile,
  openclawModifierApprovalTtlSeconds,
  openclawModifierAutoBootstrapOwner,
  openclawModifierBlockedTargetProfiles,
  openclawModifierDangerousTools,
  openclawModifierEnabled,
  openclawModifierMaxBufferMb,
  openclawModifierMaxTimeoutSeconds,
  openclawModifierRequireScope,
  openclawModifierRequireScopedOrgRbac,
  openclawModifierRequireTenantPolicy,
  openclawModifierSourceProfile,
} from "../config.js";
import { asBoolean, asNumber, asString } from "../helpers.js";
import { mapleLog } from "../logging.js";
import {
  buildOpenClawCliCommandArgs,
  isSupportedOpenClawCliTool,
  runOpenClawCliTool,
  sanitizeOpenClawCliArgs,
} from "./openclaw-cli-runtime.js";
import { OpenClawModifierStore } from "./openclaw-modifier-store.js";
import { checkRateLimit, recordExecution } from "./rate-limiter.js";
import { resolveInheritedPolicyChain, mergePolicyChain } from "./org-hierarchy.js";
import { dispatchAlert } from "./alert-webhook.js";
import { emitModifierApprovalEvent } from "../modifier-approval-broker.js";

const PROFILE_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{1,63}$/;
const DANGEROUS_ARG_PATTERNS = [
  /^--allow-unconfigured$/i,
  /^--unsafe$/i,
  /^--danger/i,
  /^--no-sandbox$/i,
  /^--bypass/i,
  /^--profile$/i,
  /^--profile=.*/i,
  /^--elevated$/i,
  /^--allowHostControl/i,
  /^--privileged$/i,
  /^--cap-add/i,
  /^--pid=host/i,
  /^--network=host/i,
  /^--bind-mount/i,
  /^--mount/i,
  /^--security-opt/i,
];
const DANGEROUS_SANDBOX_VALUES = new Set(["off", "none", "unsafe", "host", "privileged", "disabled", "bypass"]);
const SENSITIVE_MOUNT_PATHS = ["/", "/etc", "/root", "/proc", "/sys", "/dev", "/var/run/docker.sock"];

const DANGEROUS_SKILL_PERMISSIONS = new Set([
  "host_access", "network_unrestricted", "filesystem_write",
  "process_spawn", "elevated", "root", "sudo",
]);

const MALICIOUS_SKILL_PATTERNS = [
  /eval\s*\(/i,
  /new\s+Function/i,
  /child_process/i,
  /\bexec\s*\(/i,
  /\bspawn\s*\(/i,
  /keylog/i,
  /atomic[\.\-_]?stealer/i,
  /screen[\.\-_]?capture/i,
  /clipboard[\.\-_]?monitor/i,
  /\\x[0-9a-fA-F]{2}(?:\\x[0-9a-fA-F]{2}){8,}/, // obfuscated hex payloads
  /atob\s*\(\s*['"][A-Za-z0-9+/=]{20,}/i,
];

const SKILL_INSTALL_TOOLS = new Set(["skills", "plugins", "nodes"]);

function validateSkillManifest(requestBody) {
  const issues = [];
  const corpus = JSON.stringify(requestBody ?? {});

  // Check for dangerous permissions
  if (Array.isArray(requestBody?.permissions)) {
    for (const perm of requestBody.permissions) {
      const lower = String(perm ?? "").trim().toLowerCase();
      if (DANGEROUS_SKILL_PERMISSIONS.has(lower)) {
        issues.push(`Skill requests dangerous permission '${lower}'.`);
      }
    }
  }

  // Check for malicious patterns in skill source/manifest
  for (const pattern of MALICIOUS_SKILL_PATTERNS) {
    if (pattern.test(corpus)) {
      issues.push(`Malicious pattern detected: ${pattern.source.slice(0, 60)}`);
    }
  }

  return issues;
}

let runtimeStore = new OpenClawModifierStore();

function nowIso() {
  return new Date().toISOString();
}

function actorFromAuthContext(override = {}) {
  const authContext = authContextStorage.getStore();
  return {
    userId:
      asString(override.userId) ??
      asString(authContext?.userId) ??
      asString(authContext?.keyFingerprint) ??
      "gateway-api",
    // Fix 4: Extract tenant/org from authContext as fallback, not just overrides
    tenantId: asString(override.tenantId) ?? asString(authContext?.tenantId) ?? "",
    orgId: asString(override.orgId) ?? asString(authContext?.orgId) ?? "",
    deviceId: asString(override.deviceId) ?? "",
    sessionId: asString(override.sessionId) ?? "",
    traceId: asString(override.traceId) ?? "",
  };
}

function parseProfileName(rawValue, label) {
  const normalized = asString(rawValue);
  if (!normalized) {
    return "";
  }
  if (!PROFILE_NAME_PATTERN.test(normalized)) {
    throw new Error(`${label} must match ${PROFILE_NAME_PATTERN}`);
  }
  return normalized;
}

function parseTimeoutSeconds(rawValue, maxTimeoutSeconds) {
  const parsed = asNumber(rawValue);
  if (!Number.isFinite(parsed)) {
    return Math.min(60, maxTimeoutSeconds);
  }
  return Math.max(5, Math.min(maxTimeoutSeconds, Math.trunc(parsed)));
}

function parseMaxBufferMb(rawValue, maxBufferMb) {
  const parsed = asNumber(rawValue);
  if (!Number.isFinite(parsed)) {
    return Math.min(8, maxBufferMb);
  }
  return Math.max(1, Math.min(maxBufferMb, Math.trunc(parsed)));
}

function parseArgs(rawValue) {
  const input = rawValue == null ? [] : rawValue;
  const args = sanitizeOpenClawCliArgs(input);
  const unsafe = detectUnsafeArgs(args);
  return {
    args,
    unsafe,
  };
}

/**
 * Extract all path values from a mount specification.
 * Handles both simple paths (/etc) and Docker-style key=value syntax
 * (type=bind,src=/etc,dst=/tmp).
 */
function extractMountPaths(mountSpec) {
  const paths = [];
  if (!mountSpec) return paths;
  // If it starts with "/" or ".", it's a plain path
  if (mountSpec.startsWith("/") || mountSpec.startsWith(".")) {
    // Handle colon-separated source:dest format
    for (const part of mountSpec.split(":")) {
      if (part.startsWith("/") || part.startsWith(".")) {
        paths.push(part);
      }
    }
    if (paths.length === 0) paths.push(mountSpec);
    return paths;
  }
  // Docker-style: type=bind,src=/etc,dst=/tmp or source=/etc,target=/tmp
  const PATH_KEYS = new Set(["src", "source", "dst", "destination", "target"]);
  for (const part of mountSpec.split(",")) {
    const eqIdx = part.indexOf("=");
    if (eqIdx < 0) continue;
    const key = part.slice(0, eqIdx).trim().toLowerCase();
    const val = part.slice(eqIdx + 1).trim();
    if (PATH_KEYS.has(key) && val) {
      paths.push(val);
    }
  }
  return paths;
}

function detectUnsafeArgs(args) {
  const issues = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = String(args[index]).trim();
    if (!arg) {
      continue;
    }
    if (DANGEROUS_ARG_PATTERNS.some((pattern) => pattern.test(arg))) {
      issues.push(`Disallowed argument '${arg}'.`);
      continue;
    }
    if (/^--sandbox=/i.test(arg)) {
      const value = arg.split("=", 2)[1]?.trim().toLowerCase() ?? "";
      if (DANGEROUS_SANDBOX_VALUES.has(value)) {
        issues.push(`Disallowed sandbox mode '${value}'.`);
      }
      continue;
    }
    if (/^--sandbox$/i.test(arg)) {
      const next = String(args[index + 1] ?? "").trim().toLowerCase();
      if (DANGEROUS_SANDBOX_VALUES.has(next)) {
        issues.push(`Disallowed sandbox mode '${next}'.`);
      }
    }
    // Block bind mounts targeting sensitive host paths
    if (/^--bind-mount=/i.test(arg) || /^--mount=/i.test(arg)) {
      const mountValue = arg.slice(arg.indexOf("=") + 1);
      const mountPaths = extractMountPaths(mountValue);
      for (const mountPath of mountPaths) {
        for (const sensitive of SENSITIVE_MOUNT_PATHS) {
          if (mountPath === sensitive || mountPath.startsWith(sensitive + "/")) {
            issues.push(`Disallowed mount targeting sensitive path '${sensitive}'.`);
            break;
          }
        }
      }
    }
    if (/^--bind-mount$/i.test(arg) || /^--mount$/i.test(arg)) {
      const next = String(args[index + 1] ?? "").trim();
      const mountPaths = extractMountPaths(next);
      for (const mountPath of mountPaths) {
        for (const sensitive of SENSITIVE_MOUNT_PATHS) {
          if (mountPath === sensitive || mountPath.startsWith(sensitive + "/")) {
            issues.push(`Disallowed mount targeting sensitive path '${sensitive}'.`);
            break;
          }
        }
      }
    }
  }
  return issues;
}

function summarizeStdout(stdout) {
  const normalized = String(stdout ?? "").trim();
  if (!normalized) {
    return "";
  }
  return normalized.length <= 400 ? normalized : `${normalized.slice(0, 400)}…`;
}

function hashPlanFingerprint(plan) {
  const serialized = JSON.stringify({
    tool: plan.tool,
    args: plan.args,
    targetProfile: plan.targetProfile,
    sourceProfile: plan.sourceProfile,
    timeoutSeconds: plan.timeoutSeconds,
    maxBufferMb: plan.maxBufferMb,
    parseJson: plan.parseJson,
    plain: plan.plain,
    json: plan.json,
  });
  return createHash("sha256").update(serialized).digest("hex");
}

function normalizeModifierAction(rawValue) {
  const normalized = String(rawValue ?? "").trim().toLowerCase();
  if (normalized === "allow" || normalized === "approve") {
    return "approved";
  }
  if (normalized === "block" || normalized === "deny" || normalized === "reject") {
    return "rejected";
  }
  return "";
}

function parseDangerousReasons(tool, forceApproval, policy) {
  const reasons = [];
  if (Array.isArray(policy?.dangerousTools) && policy.dangerousTools.includes(tool)) {
    reasons.push(`Tool '${tool}' requires approval.`);
  }
  if (forceApproval) {
    reasons.push("approvalRequestedByCaller");
  }
  return reasons;
}

function defaultPolicy() {
  return {
    allowedTools: [...openclawModifierAllowedTools],
    dangerousTools: [...openclawModifierDangerousTools],
    blockedTargetProfiles: [...openclawModifierBlockedTargetProfiles],
    constraints: {
      allowDevProfile: openclawModifierAllowDevProfile,
      maxTimeoutSeconds: openclawModifierMaxTimeoutSeconds,
      maxBufferMb: openclawModifierMaxBufferMb,
      approvalTtlSeconds: openclawModifierApprovalTtlSeconds,
    },
    metadata: {
      source: "env-default",
    },
  };
}

export function getDefaultOpenClawModifierPolicy() {
  return defaultPolicy();
}

function selectAgentPolicy(policy, agentId) {
  const normalizedAgentId = asString(agentId) ?? "";
  if (!normalizedAgentId) {
    return policy;
  }
  const candidate = policy?.agentPolicies?.[normalizedAgentId];
  if (candidate && typeof candidate === "object") {
    return candidate;
  }
  return policy;
}

function mergeResolvedPolicy(policy, base) {
  return {
    allowedTools:
      Array.isArray(policy.allowedTools) && policy.allowedTools.length > 0
        ? policy.allowedTools
        : base.allowedTools,
    dangerousTools:
      Array.isArray(policy.dangerousTools) && policy.dangerousTools.length > 0
        ? policy.dangerousTools
        : base.dangerousTools,
    blockedTargetProfiles:
      Array.isArray(policy.blockedTargetProfiles) && policy.blockedTargetProfiles.length > 0
        ? policy.blockedTargetProfiles
        : base.blockedTargetProfiles,
    constraints: {
      allowDevProfile:
        typeof policy.constraints?.allowDevProfile === "boolean"
          ? policy.constraints.allowDevProfile
          : base.constraints.allowDevProfile,
      maxTimeoutSeconds:
        Number.isFinite(Number(policy.constraints?.maxTimeoutSeconds))
          ? Number(policy.constraints.maxTimeoutSeconds)
          : base.constraints.maxTimeoutSeconds,
      maxBufferMb:
        Number.isFinite(Number(policy.constraints?.maxBufferMb))
          ? Number(policy.constraints.maxBufferMb)
          : base.constraints.maxBufferMb,
      approvalTtlSeconds:
        Number.isFinite(Number(policy.constraints?.approvalTtlSeconds))
          ? Number(policy.constraints.approvalTtlSeconds)
          : base.constraints.approvalTtlSeconds,
    },
    metadata: policy.metadata ?? {},
  };
}

function mergePolicy(policyRecord, options = {}) {
  const base = defaultPolicy();
  if (!policyRecord?.policy) {
    return {
      ...base,
      agentPolicies: {},
      version: null,
      createdAt: "",
      createdBy: "",
      activatedAt: "",
    };
  }
  const policy = policyRecord.policy;
  const resolvedPolicy = selectAgentPolicy(policy, options.agentId);
  const mergedPolicy = mergeResolvedPolicy(resolvedPolicy, base);
  const agentPolicies =
    policy.agentPolicies && typeof policy.agentPolicies === "object"
      ? Object.fromEntries(
          Object.entries(policy.agentPolicies)
            .map(([agentId, value]) => [agentId, mergeResolvedPolicy(value, base)])
            .filter(([agentId]) => Boolean(agentId))
        )
      : {};
  return {
    ...mergedPolicy,
    agentPolicies,
    version: policyRecord.version ?? null,
    createdAt: policyRecord.createdAt ?? "",
    createdBy: policyRecord.createdBy ?? "",
    activatedAt: policyRecord.activatedAt ?? "",
  };
}

function requireActorScope(actor) {
  if (!openclawModifierRequireScope) {
    return;
  }
  if (!actor.tenantId || !actor.orgId) {
    throw new Error("tenantId and orgId are required for OpenClaw modifier operations.");
  }
}

async function ensureMemberPermissions(actor, requiredPermission) {
  if (!openclawModifierRequireScopedOrgRbac) {
    return [];
  }
  requireActorScope(actor);
  const member = await runtimeStore.getOrgMember(
    {
      tenantId: actor.tenantId,
      orgId: actor.orgId,
    },
    actor.userId
  );

  if (!member && openclawModifierAutoBootstrapOwner) {
    // Never auto-bootstrap owner in unverified tenant scope — prevents spoofed ownership
    if (actor.tenantVerified === false) {
      throw new Error(
        `RBAC denied: cannot auto-bootstrap owner for unverified tenant scope ${actor.tenantId}/${actor.orgId}.`
      );
    }
    await runtimeStore.upsertOrgMember(
      {
        tenantId: actor.tenantId,
        orgId: actor.orgId,
      },
      actor.userId,
      "owner"
    );
    return [
      "modifier:execute",
      "modifier:approve",
      "modifier:policy:write",
      "modifier:policy:read",
    ];
  }

  const permissions = member?.permissions ?? [];
  if (!permissions.includes(requiredPermission) && !permissions.includes("*")) {
    throw new Error(
      `RBAC denied: '${actor.userId}' is missing permission '${requiredPermission}' for ${actor.tenantId}/${actor.orgId}.`
    );
  }
  return permissions;
}

async function resolveEffectivePolicy(actor, options = {}) {
  const defaults = defaultPolicy();
  if (!openclawModifierRequireTenantPolicy && (!actor.tenantId || !actor.orgId)) {
    return {
      ...defaults,
      agentPolicies: {},
      version: null,
      createdAt: "",
      createdBy: "",
      activatedAt: "",
    };
  }
  requireActorScope(actor);
  const policyRecord = await runtimeStore.ensurePolicy(
    {
      tenantId: actor.tenantId,
      orgId: actor.orgId,
    },
    actor.userId,
    defaults
  );
  if (!policyRecord && openclawModifierRequireTenantPolicy) {
    throw new Error("No active tenant policy found for OpenClaw modifier.");
  }

  if (options.agentId) {
    return mergePolicy(policyRecord, { agentId: options.agentId });
  }

  // A4: Policy inheritance via org hierarchy
  if (actor.orgId) {
    const getPolicyForOrg = async (tenantId, orgId) => {
      const record = await runtimeStore.getActivePolicy({ tenantId, orgId });
      return record ? mergePolicy(record) : null;
    };
    try {
      const chain = await resolveInheritedPolicyChain(actor.tenantId, actor.orgId, getPolicyForOrg);
      if (chain.length > 1) {
        const inherited = mergePolicyChain(chain);
        if (inherited) return inherited;
      }
    } catch {
      // Fall through to standard merge if hierarchy unavailable
    }
  }

  return mergePolicy(policyRecord);
}

function buildModifierPlan(requestBody, policy) {
  if (!openclawModifierEnabled) {
    throw new Error("OpenClaw modifier is disabled.");
  }
  const tool = String(requestBody?.tool ?? "")
    .trim()
    .toLowerCase();
  if (!tool) {
    throw new Error("tool is required.");
  }
  if (!isSupportedOpenClawCliTool(tool)) {
    throw new Error(`Unsupported OpenClaw tool '${tool}'.`);
  }
  if (!policy.allowedTools.includes(tool)) {
    throw new Error(`Tool '${tool}' is not allowlisted for modifier execution.`);
  }

  // PR4: Skill manifest validation for install operations
  if (SKILL_INSTALL_TOOLS.has(tool)) {
    const skillIssues = validateSkillManifest(requestBody);
    if (skillIssues.length > 0) {
      // Attach as dangerous reasons to trigger HITL approval
      const dangerousFromSkill = skillIssues.map((issue) => `Skill manifest: ${issue}`);
      requestBody._skillManifestIssues = dangerousFromSkill;
    }
  }

  const sourceProfile = parseProfileName(
    asString(requestBody?.sourceProfile) ?? openclawModifierSourceProfile,
    "sourceProfile"
  );
  const targetProfile = parseProfileName(
    asString(requestBody?.targetProfile) ?? asString(requestBody?.profile),
    "targetProfile"
  );
  if (!targetProfile) {
    throw new Error("targetProfile is required.");
  }
  if (targetProfile === sourceProfile) {
    throw new Error("targetProfile must be different from sourceProfile.");
  }
  if (policy.blockedTargetProfiles.includes(targetProfile.toLowerCase())) {
    throw new Error(`targetProfile '${targetProfile}' is blocked by policy.`);
  }

  const parsedArgs = parseArgs(requestBody?.args);
  if (parsedArgs.unsafe.length > 0) {
    throw new Error(parsedArgs.unsafe.join(" "));
  }

  const dev = asBoolean(requestBody?.dev, false);
  if (dev && !policy.constraints.allowDevProfile) {
    throw new Error("dev profile execution is not allowed for modifier.");
  }

  const timeoutSeconds = parseTimeoutSeconds(
    requestBody?.timeoutSeconds,
    policy.constraints.maxTimeoutSeconds
  );
  const maxBufferMb = parseMaxBufferMb(requestBody?.maxBufferMb, policy.constraints.maxBufferMb);
  const forceApproval = asBoolean(requestBody?.forceApproval, false);
  const dangerousReasons = parseDangerousReasons(tool, forceApproval, policy);

  // Merge skill manifest issues into dangerous reasons
  if (Array.isArray(requestBody?._skillManifestIssues)) {
    dangerousReasons.push(...requestBody._skillManifestIssues);
  }

  const plan = {
    tool,
    args: parsedArgs.args,
    sourceProfile,
    targetProfile,
    timeoutSeconds,
    maxBufferMb,
    dev: dev && policy.constraints.allowDevProfile,
    noColor: asBoolean(requestBody?.noColor, false),
    json: asBoolean(requestBody?.json, false),
    plain: asBoolean(requestBody?.plain, false),
    parseJson: asBoolean(requestBody?.parseJson, false),
    stdin: asString(requestBody?.stdin) ?? "",
    dangerousReasons,
  };
  plan.fingerprint = hashPlanFingerprint(plan);
  return plan;
}

function buildExecOptionsFromPlan(plan) {
  return {
    tool: plan.tool,
    args: plan.args,
    dev: plan.dev,
    noColor: plan.noColor,
    json: plan.json,
    plain: plan.plain,
    parseJson: plan.parseJson,
    stdin: plan.stdin,
    timeoutSeconds: plan.timeoutSeconds,
    maxBufferMb: plan.maxBufferMb,
    profile: plan.targetProfile,
  };
}

function summarizePlanForAudit(plan) {
  const commandArgs = buildOpenClawCliCommandArgs(buildExecOptionsFromPlan(plan));
  return {
    tool: plan.tool,
    args: [...plan.args],
    profile: plan.targetProfile,
    timeoutSeconds: plan.timeoutSeconds,
    maxBufferMb: plan.maxBufferMb,
    dangerous: plan.dangerousReasons.length > 0,
    dangerousReasons: [...plan.dangerousReasons],
    command: ["openclaw", ...commandArgs].join(" "),
    fingerprint: plan.fingerprint,
  };
}

function toApprovalApi(record) {
  if (!record) {
    return null;
  }
  return {
    id: record.id,
    traceId: record.traceId,
    stepIndex: record.stepIndex,
    status: record.status,
    reason: record.reason,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    decidedAt: record.decidedAt,
    requestedBy: record.requestedBy,
    decidedBy: record.decidedBy,
    tenantId: record.tenantId,
    orgId: record.orgId,
    tool: record.tool,
    targetProfile: record.targetProfile,
    dangerousReasons: record.dangerousReasons,
  };
}

function buildApprovalExpiryIso(policy) {
  const ttlSeconds = Math.max(
    60,
    Math.min(86_400, Number(policy.constraints.approvalTtlSeconds ?? openclawModifierApprovalTtlSeconds))
  );
  return new Date(Date.now() + ttlSeconds * 1000).toISOString();
}

export function configureOpenClawModifierRuntime(options = {}) {
  if (options.store) {
    runtimeStore = options.store;
    return;
  }
  runtimeStore = new OpenClawModifierStore({
    database: options.database,
  });
}

export async function listOpenClawModifierApprovals(filters = {}, actorOverrides = {}) {
  const actor = actorFromAuthContext(actorOverrides);
  // Fix 4: Fail closed — return empty list if tenantId is unresolved
  if (!actor.tenantId) {
    mapleLog("warn", "openclaw_modifier.list_approvals_no_tenant", {
      userId: actor.userId,
    });
    return [];
  }
  await runtimeStore.pruneExpiredApprovals();
  const statusFilter = asString(filters.status)?.toLowerCase();
  const requestedBy = asString(filters.requestedBy);
  const list = await runtimeStore.listApprovals({
    tenantId: actor.tenantId,
    orgId: actor.orgId,
    status: statusFilter,
    requestedBy,
    limit: filters.limit,
  });
  return list.map((record) => toApprovalApi(record));
}

export async function getOpenClawModifierApproval(approvalId, actorOverrides = {}) {
  const actor = actorFromAuthContext(actorOverrides);
  // Finding 3: Fail closed — reject when actor scope is empty
  if (!actor.tenantId) {
    mapleLog("warn", "openclaw_modifier.get_approval_no_tenant", {
      userId: actor.userId,
      approvalId,
    });
    return null;
  }
  await runtimeStore.pruneExpiredApprovals();
  const record = await runtimeStore.getApproval(approvalId);
  if (!record) {
    return null;
  }
  if (record.tenantId !== actor.tenantId) {
    return null;
  }
  if (actor.orgId && record.orgId !== actor.orgId) {
    return null;
  }
  return toApprovalApi(record);
}

export async function submitOpenClawModifierApprovalDecision(
  approvalId,
  action,
  reason,
  actorOverrides = {}
) {
  const actor = actorFromAuthContext(actorOverrides);
  await runtimeStore.pruneExpiredApprovals();
  const record = await runtimeStore.getApproval(approvalId);
  if (!record) {
    return {
      ok: false,
      status: 404,
      error: "Approval record not found.",
    };
  }

  if (record.tenantId !== actor.tenantId || record.orgId !== actor.orgId) {
    return {
      ok: false,
      status: 403,
      error: "Approval record is scoped to a different tenant/org.",
    };
  }

  try {
    await ensureMemberPermissions(actor, "modifier:approve");
  } catch (error) {
    return {
      ok: false,
      status: 403,
      error: error instanceof Error ? error.message : String(error),
      approval: toApprovalApi(record),
    };
  }

  if (record.status !== "pending") {
    return {
      ok: false,
      status: 409,
      error: `Approval already resolved as '${record.status}'.`,
      approval: toApprovalApi(record),
    };
  }

  const normalizedAction = normalizeModifierAction(action);
  if (!normalizedAction) {
    return {
      ok: false,
      status: 400,
      error: "action must be allow or block.",
    };
  }

  const actorId = asString(actor.userId) ?? "gateway-reviewer";
  const updatedRecord = await runtimeStore.updateApprovalDecision(approvalId, {
    status: normalizedAction,
    reason: asString(reason) ?? "",
    decidedBy: actorId,
    decidedAt: nowIso(),
  });

  emitAuditEvent({
    eventType:
      normalizedAction === "approved"
        ? "AUDIT_EVENT_TYPE_HITL_APPROVED"
        : "AUDIT_EVENT_TYPE_HITL_REJECTED",
    sourceService: "gateway-api",
    traceId: updatedRecord?.traceId,
    userId: actorId,
    severity: normalizedAction === "approved" ? "RISK_SEVERITY_LOW" : "RISK_SEVERITY_HIGH",
    summary: `OpenClaw modifier approval ${normalizedAction}`,
    payload: {
      approvalId: updatedRecord?.id,
      traceId: updatedRecord?.traceId,
      stepIndex: updatedRecord?.stepIndex,
      action: normalizedAction,
      reason: updatedRecord?.reason,
      tool: updatedRecord?.tool,
      targetProfile: updatedRecord?.targetProfile,
      requestedBy: updatedRecord?.requestedBy,
      decidedBy: actorId,
      tenantId: updatedRecord?.tenantId,
      orgId: updatedRecord?.orgId,
    },
  });

  // A7: Alert webhook dispatch for dangerous approvals
  if (normalizedAction === "approved" && updatedRecord?.dangerousReasons?.length > 0) {
    dispatchAlert(actor.tenantId, actor.orgId, "dangerous_approval", {
      approvalId, tool: updatedRecord.tool, decidedBy: actorId,
    }).catch(() => {});
  }

  // B3: Emit modifier approval broker event
  emitModifierApprovalEvent("approval_decided", {
    approvalId: updatedRecord?.id,
    action: normalizedAction,
    tool: updatedRecord?.tool,
    tenantId: updatedRecord?.tenantId,
    orgId: updatedRecord?.orgId,
    decidedBy: actorId,
  });

  return {
    ok: true,
    status: 200,
    approval: toApprovalApi(updatedRecord),
  };
}

export async function getOpenClawModifierPolicy(actorOverrides = {}) {
  const actor = actorFromAuthContext(actorOverrides);
  const policy = await resolveEffectivePolicy(actor, {
    agentId: asString(actorOverrides?.agentId) ?? "",
  });
  const pendingApprovals = await runtimeStore.listApprovals({
    tenantId: actor.tenantId,
    orgId: actor.orgId,
    status: "pending",
    limit: 1000,
  });
  return {
    enabled: openclawModifierEnabled,
    sourceProfile: openclawModifierSourceProfile,
    allowedTools: [...policy.allowedTools],
    dangerousTools: [...policy.dangerousTools],
    blockedTargetProfiles: [...policy.blockedTargetProfiles],
    constraints: {
      allowDevProfile: Boolean(policy.constraints.allowDevProfile),
      maxTimeoutSeconds: Number(policy.constraints.maxTimeoutSeconds),
      maxBufferMb: Number(policy.constraints.maxBufferMb),
      approvalTtlSeconds: Number(policy.constraints.approvalTtlSeconds),
    },
    agentPolicies:
      policy.agentPolicies && typeof policy.agentPolicies === "object"
        ? Object.fromEntries(
            Object.entries(policy.agentPolicies).map(([agentId, value]) => [
              agentId,
              {
                allowedTools: [...(value.allowedTools ?? [])],
                dangerousTools: [...(value.dangerousTools ?? [])],
                blockedTargetProfiles: [...(value.blockedTargetProfiles ?? [])],
                constraints: { ...(value.constraints ?? {}) },
                metadata: { ...(value.metadata ?? {}) },
              },
            ])
          )
        : {},
    scope: {
      tenantId: actor.tenantId,
      orgId: actor.orgId,
      agentId: asString(actorOverrides?.agentId) ?? "",
    },
    policyVersion: policy.version,
    policyCreatedAt: policy.createdAt,
    policyCreatedBy: policy.createdBy,
    policyActivatedAt: policy.activatedAt,
    pendingApprovals: pendingApprovals.length,
  };
}

export async function listOpenClawModifierPolicyVersions(actorOverrides = {}, options = {}) {
  const actor = actorFromAuthContext(actorOverrides);
  requireActorScope(actor);
  await ensureMemberPermissions(actor, "modifier:policy:read");
  const records = await runtimeStore.listPolicyVersions(
    {
      tenantId: actor.tenantId,
      orgId: actor.orgId,
    },
    options.limit
  );
  return records.map((record) => ({
    version: record.version,
    isActive: record.isActive,
    createdAt: record.createdAt,
    createdBy: record.createdBy,
    activatedAt: record.activatedAt,
    policy: mergePolicy(record),
  }));
}

export async function saveOpenClawModifierPolicyVersion(policyInput, actorOverrides = {}) {
  const actor = actorFromAuthContext(actorOverrides);
  requireActorScope(actor);
  await ensureMemberPermissions(actor, "modifier:policy:write");
  const created = await runtimeStore.createPolicyVersion(
    {
      tenantId: actor.tenantId,
      orgId: actor.orgId,
    },
    actor.userId,
    policyInput,
    { activate: true }
  );
  const merged = mergePolicy(created);
  emitAuditEvent({
    eventType: "AUDIT_EVENT_TYPE_POLICY_EVALUATED",
    sourceService: "gateway-api",
    traceId: actor.traceId || undefined,
    sessionId: actor.sessionId || undefined,
    userId: actor.userId || undefined,
    severity: "RISK_SEVERITY_LOW",
    summary: `OpenClaw modifier policy version ${created.version} activated`,
    payload: {
      tenantId: actor.tenantId,
      orgId: actor.orgId,
      version: created.version,
      policy: merged,
    },
  });
  return {
    version: created.version,
    isActive: created.isActive,
    createdAt: created.createdAt,
    createdBy: created.createdBy,
    activatedAt: created.activatedAt,
    policy: merged,
  };
}

export async function listOpenClawModifierOrgMembers(actorOverrides = {}) {
  const actor = actorFromAuthContext(actorOverrides);
  requireActorScope(actor);
  await ensureMemberPermissions(actor, "modifier:policy:read");
  return runtimeStore.listOrgMembers({
    tenantId: actor.tenantId,
    orgId: actor.orgId,
  });
}

export async function upsertOpenClawModifierOrgMember(input, actorOverrides = {}) {
  const actor = actorFromAuthContext(actorOverrides);
  requireActorScope(actor);
  await ensureMemberPermissions(actor, "modifier:policy:write");
  const userId = asString(input.userId);
  const roleId = asString(input.roleId) ?? "operator";
  if (!userId) {
    throw new Error("userId is required.");
  }
  return runtimeStore.upsertOrgMember(
    {
      tenantId: actor.tenantId,
      orgId: actor.orgId,
    },
    userId,
    roleId,
    {
      permissions: Array.isArray(input.permissions) ? input.permissions : undefined,
    }
  );
}

function createApprovalTraceId(plan) {
  const fingerprintPrefix = plan.fingerprint.slice(0, 16);
  const id = randomUUID();
  return {
    id: `ocmod-${id}`,
    traceId: `openclaw-modifier-${fingerprintPrefix}-${id.slice(-8)}`,
  };
}

async function resolveApprovalRecord(approvalId, plan, actor) {
  await runtimeStore.pruneExpiredApprovals();
  const record = await runtimeStore.getApproval(approvalId);
  if (!record) {
    return {
      status: "missing",
      message: "Approval record not found. Submit request again to create a new approval.",
    };
  }
  if (record.tenantId !== actor.tenantId || record.orgId !== actor.orgId) {
    return {
      status: "forbidden",
      message: "Approval record belongs to a different tenant/org scope.",
    };
  }
  if (record.fingerprint !== plan.fingerprint) {
    return {
      status: "mismatch",
      message: "Approval record does not match command fingerprint.",
    };
  }
  if (record.requestedBy && record.requestedBy !== actor.userId) {
    return {
      status: "forbidden",
      message: "Approval record belongs to a different requester.",
    };
  }
  if (record.status === "pending") {
    return {
      status: "pending",
      record: toApprovalApi(record),
      message: "Approval is still pending.",
    };
  }
  if (record.status === "rejected") {
    return {
      status: "rejected",
      record: toApprovalApi(record),
      message: record.reason || "Approval was rejected.",
    };
  }
  if (record.status === "expired") {
    return {
      status: "expired",
      record: toApprovalApi(record),
      message: record.reason || "Approval expired.",
    };
  }
  if (record.status === "approved") {
    return {
      status: "approved",
      record: toApprovalApi(record),
      message: "Approval granted.",
    };
  }
  return {
    status: "invalid",
    message: "Approval record is in an unknown state.",
  };
}

export async function executeOpenClawModifierRequest(requestBody, actorOverrides = {}, dependencies = {}) {
  const actor = actorFromAuthContext(actorOverrides);
  const runCli = dependencies.runOpenClawCliTool ?? runOpenClawCliTool;

  await runtimeStore.pruneExpiredApprovals();
  requireActorScope(actor);

  // A2: Reject unverified tenants when scope enforcement is enabled
  if (openclawModifierRequireScope && actor.tenantVerified === false) {
    throw new Error("Verified tenant scope required. Provide a valid tenant binding or signed claim.");
  }

  // A1: Rate limiter enforcement
  const rateLimitResult = await checkRateLimit(actor.tenantId, actor.orgId);
  if (!rateLimitResult.allowed) {
    // A7: Alert on rate limit exceeded
    dispatchAlert(actor.tenantId, actor.orgId, "rate_limit_exceeded", {
      rate: rateLimitResult.rate, quota: rateLimitResult.quota,
    }).catch(() => {});

    return {
      ok: false, type: "rate_limited", status: 429,
      error: "Rate limit exceeded for modifier execution.",
      rate: rateLimitResult.rate, quota: rateLimitResult.quota,
    };
  }

  await ensureMemberPermissions(actor, "modifier:execute");
  const policy = await resolveEffectivePolicy(actor, {
    agentId: asString(requestBody?.agentId) ?? asString(actorOverrides?.agentId) ?? "",
  });
  const plan = buildModifierPlan(requestBody, policy);
  const planAudit = summarizePlanForAudit(plan);

  emitAuditEvent({
    eventType: "AUDIT_EVENT_TYPE_TOOL_DISPATCHED",
    sourceService: "gateway-api",
    traceId: actor.traceId || undefined,
    sessionId: actor.sessionId || undefined,
    userId: actor.userId || undefined,
    summary: `OpenClaw modifier request for ${plan.tool}`,
    payload: {
      ...planAudit,
      tenantId: actor.tenantId,
      orgId: actor.orgId,
      deviceId: actor.deviceId,
    },
  });

  let approval = null;
  if (plan.dangerousReasons.length > 0) {
    const approvalId = asString(requestBody?.approvalId);
    if (!approvalId) {
      const ids = createApprovalTraceId(plan);
      const createdApproval = await runtimeStore.createApproval({
        id: ids.id,
        traceId: ids.traceId,
        stepIndex: 0,
        status: "pending",
        reason: "",
        createdAt: nowIso(),
        expiresAt: buildApprovalExpiryIso(policy),
        decidedAt: "",
        requestedBy: actor.userId,
        decidedBy: "",
        tenantId: actor.tenantId,
        orgId: actor.orgId,
        deviceId: actor.deviceId,
        sessionId: actor.sessionId,
        tool: plan.tool,
        targetProfile: plan.targetProfile,
        dangerousReasons: plan.dangerousReasons,
        fingerprint: plan.fingerprint,
        command: planAudit,
      });
      approval = toApprovalApi(createdApproval);
      emitAuditEvent({
        eventType: "AUDIT_EVENT_TYPE_HITL_REQUESTED",
        sourceService: "gateway-api",
        traceId: createdApproval.traceId,
        sessionId: actor.sessionId || undefined,
        userId: actor.userId || undefined,
        severity: "RISK_SEVERITY_HIGH",
        summary: `OpenClaw modifier HITL requested for ${plan.tool}`,
        payload: {
          approvalId: createdApproval.id,
          traceId: createdApproval.traceId,
          stepIndex: 0,
          tool: plan.tool,
          args: plan.args,
          targetProfile: plan.targetProfile,
          sourceProfile: plan.sourceProfile,
          dangerousReasons: plan.dangerousReasons,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          deviceId: actor.deviceId,
        },
      });
      // B3: Emit modifier approval broker event
      emitModifierApprovalEvent("approval_created", {
        approvalId: createdApproval.id,
        tool: plan.tool,
        tenantId: actor.tenantId,
        orgId: actor.orgId,
        requestedBy: actor.userId,
        dangerousReasons: plan.dangerousReasons,
      });

      return {
        ok: false,
        type: "approval_required",
        status: 409,
        error: "Dangerous modifier command requires human approval.",
        approval,
        policy: await getOpenClawModifierPolicy(actor),
      };
    }

    const resolvedApproval = await resolveApprovalRecord(approvalId, plan, actor);
    if (resolvedApproval.status !== "approved") {
      const statusMap = {
        missing: 404,
        mismatch: 409,
        forbidden: 403,
        pending: 409,
        rejected: 403,
        expired: 409,
        invalid: 409,
      };
      return {
        ok: false,
        type: "approval_unavailable",
        status: statusMap[resolvedApproval.status] ?? 409,
        error: resolvedApproval.message,
        approval: resolvedApproval.record ?? null,
      };
    }
    approval = resolvedApproval.record;
  }

  const execOptions = buildExecOptionsFromPlan(plan);
  const startedAt = Date.now();
  const result = await runCli(execOptions);
  const durationMs = Date.now() - startedAt;

  emitAuditEvent({
    eventType: result.ok ? "AUDIT_EVENT_TYPE_TOOL_COMPLETED" : "AUDIT_EVENT_TYPE_TOOL_FAILED",
    sourceService: "gateway-api",
    traceId: approval?.traceId || actor.traceId || undefined,
    sessionId: actor.sessionId || undefined,
    userId: actor.userId || undefined,
    severity: result.ok ? "RISK_SEVERITY_LOW" : "RISK_SEVERITY_HIGH",
    summary: `OpenClaw modifier ${result.ok ? "completed" : "failed"} for ${plan.tool}`,
    payload: {
      ...planAudit,
      approvalId: approval?.id ?? "",
      exitCode: result.exitCode,
      signal: result.signal,
      ok: result.ok,
      durationMs,
      stderr: summarizeStdout(result.stderr),
      stdoutPreview: summarizeStdout(result.stdout),
      tenantId: actor.tenantId,
      orgId: actor.orgId,
    },
  });

  if (!result.ok) {
    mapleLog("warn", "openclaw_modifier.exec_failed", {
      tool: plan.tool,
      approvalId: approval?.id ?? "",
      error: result.error ?? "",
      exitCode: result.exitCode,
      tenantId: actor.tenantId,
      orgId: actor.orgId,
    });
  }

  // A1: Record execution for rate limiter tracking
  await recordExecution(actor.tenantId, actor.orgId);

  return {
    ok: result.ok,
    type: "executed",
    status: result.ok ? 200 : 502,
    result: {
      ...result,
      profile: plan.targetProfile,
      dangerous: plan.dangerousReasons.length > 0,
      dangerousReasons: plan.dangerousReasons,
      approval,
      durationMs,
      tenantId: actor.tenantId,
      orgId: actor.orgId,
      policyVersion: policy.version,
    },
  };
}

/**
 * B1: Evaluate modifier governance for a tool call (used by MCP proxy path).
 * Returns { allowed, reason, requiresApproval, approvalId? }.
 * When a tool requires approval, creates a HITL approval record and returns
 * it so the MCP proxy can block execution until approved.
 */
export async function evaluateModifierGovernance(toolName, toolArgs, actorOverrides = {}) {
  if (!openclawModifierEnabled) {
    return { allowed: true, reason: "modifier_disabled" };
  }

  try {
    const actor = actorFromAuthContext(actorOverrides);
    const policy = await resolveEffectivePolicy(actor, {
      agentId: asString(toolArgs?.agentId) ?? asString(actorOverrides?.agentId) ?? "",
    });

    const tool = String(toolName ?? "").trim().toLowerCase();
    if (!tool) {
      return { allowed: true, reason: "no_tool_name" };
    }

    // Check if tool is explicitly blocked (not in allowedTools)
    if (policy.allowedTools.length > 0 && !policy.allowedTools.includes(tool)) {
      return { allowed: false, reason: `Tool '${tool}' is not allowlisted by modifier policy.`, requiresApproval: false };
    }

    // Check if tool requires approval — create HITL record
    if (Array.isArray(policy.dangerousTools) && policy.dangerousTools.includes(tool)) {
      // Check if caller provided an existing approval ID
      const existingApprovalId = asString(actorOverrides.approvalId);
      if (existingApprovalId) {
        await runtimeStore.pruneExpiredApprovals();
        const record = await runtimeStore.getApproval(existingApprovalId);
        if (record?.status === "approved") {
          return { allowed: true, reason: "approved_by_hitl", requiresApproval: false, approvalId: existingApprovalId };
        }
        if (record?.status === "pending") {
          return { allowed: false, reason: "Approval is pending human review.", requiresApproval: true, approvalId: existingApprovalId, status: "pending" };
        }
        if (record?.status === "rejected") {
          return { allowed: false, reason: "Approval was rejected.", requiresApproval: false, approvalId: existingApprovalId, status: "rejected" };
        }
      }

      // Create new HITL approval for this MCP tool call
      const ids = createApprovalTraceId({ fingerprint: `mcp-${tool}-${Date.now()}` });
      const dangerousReasons = [`Tool '${tool}' requires human approval via MCP governance.`];
      const createdApproval = await runtimeStore.createApproval({
        id: ids.id,
        traceId: ids.traceId,
        stepIndex: 0,
        status: "pending",
        reason: "",
        createdAt: nowIso(),
        expiresAt: buildApprovalExpiryIso(policy),
        decidedAt: "",
        requestedBy: actor.userId,
        decidedBy: "",
        tenantId: actor.tenantId,
        orgId: actor.orgId,
        deviceId: actor.deviceId ?? "",
        sessionId: actor.sessionId ?? "",
        tool,
        targetProfile: "mcp-proxy",
        dangerousReasons,
        fingerprint: `mcp-${tool}`,
        command: { tool, args: toolArgs },
      });

      emitAuditEvent({
        eventType: "AUDIT_EVENT_TYPE_HITL_REQUESTED",
        sourceService: "gateway-api",
        traceId: ids.traceId,
        userId: actor.userId || undefined,
        severity: "RISK_SEVERITY_HIGH",
        summary: `MCP governance HITL requested for '${tool}'`,
        payload: {
          approvalId: createdApproval.id,
          traceId: ids.traceId,
          tool,
          dangerousReasons,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          source: "mcp_governance",
        },
      });

      emitModifierApprovalEvent("approval_created", {
        approvalId: createdApproval.id,
        tool,
        tenantId: actor.tenantId,
        orgId: actor.orgId,
        requestedBy: actor.userId,
        dangerousReasons,
        source: "mcp_governance",
      });

      return {
        allowed: false,
        reason: `Tool '${tool}' requires human approval. Approval created.`,
        requiresApproval: true,
        approvalId: createdApproval.id,
        status: "pending",
      };
    }

    return { allowed: true, reason: "allowed_by_policy", requiresApproval: false };
  } catch (err) {
    mapleLog("warn", "modifier_governance.eval_error", {
      toolName,
      error: err instanceof Error ? err.message : String(err),
    });
    // Fail open on errors to avoid breaking MCP proxy
    return { allowed: true, reason: "governance_eval_error" };
  }
}
