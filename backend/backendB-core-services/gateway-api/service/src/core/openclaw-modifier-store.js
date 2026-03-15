import { randomUUID } from "node:crypto";
import { asString } from "../helpers.js";

const DEFAULT_ROLE_PERMISSIONS = {
  owner: ["modifier:execute", "modifier:approve", "modifier:policy:write", "modifier:policy:read"],
  admin: ["modifier:execute", "modifier:approve", "modifier:policy:write", "modifier:policy:read"],
  operator: ["modifier:execute", "modifier:policy:read"],
  reviewer: ["modifier:approve", "modifier:policy:read"],
  auditor: ["modifier:policy:read"],
};

function hasPool(database) {
  return Boolean(database && typeof database.pool?.query === "function");
}

function nowIso() {
  return new Date().toISOString();
}

function parseJson(rawValue, fallback) {
  try {
    return JSON.parse(String(rawValue ?? ""));
  } catch {
    return fallback;
  }
}

function normalizeScope(input = {}) {
  const tenantId = asString(input.tenantId) ?? "";
  const orgId = asString(input.orgId) ?? "";
  return {
    tenantId,
    orgId,
  };
}

function scopeKey(scope) {
  return `${scope.tenantId}::${scope.orgId}`;
}

function memberKey(scope, userId) {
  return `${scopeKey(scope)}::${String(userId ?? "")}`;
}

function toApprovalRecord(row) {
  if (!row) {
    return null;
  }
  return {
    id: String(row.approval_id),
    traceId: String(row.trace_id ?? ""),
    stepIndex: Number(row.step_index ?? 0),
    status: String(row.status ?? "pending"),
    reason: String(row.reason ?? ""),
    createdAt: String(row.created_at ?? ""),
    expiresAt: String(row.expires_at ?? ""),
    decidedAt: String(row.decided_at ?? ""),
    requestedBy: String(row.requested_by ?? ""),
    decidedBy: String(row.decided_by ?? ""),
    tenantId: String(row.tenant_id ?? ""),
    orgId: String(row.org_id ?? ""),
    deviceId: String(row.device_id ?? ""),
    sessionId: String(row.session_id ?? ""),
    tool: String(row.tool ?? ""),
    targetProfile: String(row.target_profile ?? ""),
    dangerousReasons: parseJson(row.dangerous_reasons_json, []),
    fingerprint: String(row.fingerprint ?? ""),
    command: parseJson(row.command_json, {}),
  };
}

function toPolicyRecord(row) {
  if (!row) {
    return null;
  }
  return {
    tenantId: String(row.tenant_id ?? ""),
    orgId: String(row.org_id ?? ""),
    version: Number(row.version ?? 1),
    isActive: Boolean(row.is_active),
    createdAt: String(row.created_at ?? ""),
    createdBy: String(row.created_by ?? ""),
    activatedAt: String(row.activated_at ?? ""),
    policy: parseJson(row.policy_json, {}),
  };
}

function toMemberRecord(row) {
  if (!row) {
    return null;
  }
  return {
    tenantId: String(row.tenant_id ?? ""),
    orgId: String(row.org_id ?? ""),
    userId: String(row.user_id ?? ""),
    roleId: String(row.role_id ?? "member"),
    permissions: parseJson(row.permissions_json, []),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

function normalizePolicyPayload(input = {}) {
  const normalizeSingle = (value = {}) => {
    const allowedTools = Array.isArray(value.allowedTools)
      ? [...new Set(value.allowedTools.map((entry) => String(entry).trim().toLowerCase()).filter(Boolean))]
      : [];
    const dangerousTools = Array.isArray(value.dangerousTools)
      ? [...new Set(value.dangerousTools.map((entry) => String(entry).trim().toLowerCase()).filter(Boolean))]
      : [];
    const blockedTargetProfiles = Array.isArray(value.blockedTargetProfiles)
      ? [
          ...new Set(
            value.blockedTargetProfiles
              .map((entry) => String(entry).trim().toLowerCase())
              .filter(Boolean)
          ),
        ]
      : [];
    const constraints =
      value.constraints && typeof value.constraints === "object" ? value.constraints : {};
    return {
      allowedTools,
      dangerousTools,
      blockedTargetProfiles,
      constraints: {
        allowDevProfile: Boolean(constraints.allowDevProfile),
        maxTimeoutSeconds: Number(constraints.maxTimeoutSeconds ?? 90),
        maxBufferMb: Number(constraints.maxBufferMb ?? 8),
        approvalTtlSeconds: Number(constraints.approvalTtlSeconds ?? 900),
      },
      metadata: value.metadata && typeof value.metadata === "object" ? value.metadata : {},
    };
  };

  const allowedTools = Array.isArray(input.allowedTools)
    ? [...new Set(input.allowedTools.map((entry) => String(entry).trim().toLowerCase()).filter(Boolean))]
    : [];
  const dangerousTools = Array.isArray(input.dangerousTools)
    ? [...new Set(input.dangerousTools.map((entry) => String(entry).trim().toLowerCase()).filter(Boolean))]
    : [];
  const blockedTargetProfiles = Array.isArray(input.blockedTargetProfiles)
    ? [
        ...new Set(
          input.blockedTargetProfiles
            .map((entry) => String(entry).trim().toLowerCase())
            .filter(Boolean)
        ),
      ]
    : [];
  const constraints =
    input.constraints && typeof input.constraints === "object" ? input.constraints : {};
  const agentPolicies =
    input.agentPolicies && typeof input.agentPolicies === "object"
      ? Object.fromEntries(
          Object.entries(input.agentPolicies)
            .map(([agentId, value]) => [String(agentId).trim(), normalizeSingle(value)])
            .filter(([agentId]) => Boolean(agentId))
        )
      : {};
  return {
    allowedTools,
    dangerousTools,
    blockedTargetProfiles,
    constraints: {
      allowDevProfile: Boolean(constraints.allowDevProfile),
      maxTimeoutSeconds: Number(constraints.maxTimeoutSeconds ?? 90),
      maxBufferMb: Number(constraints.maxBufferMb ?? 8),
      approvalTtlSeconds: Number(constraints.approvalTtlSeconds ?? 900),
    },
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
    agentPolicies,
  };
}

function resolveRolePermissions(roleId, customPermissions) {
  if (Array.isArray(customPermissions) && customPermissions.length > 0) {
    return [...new Set(customPermissions.map((entry) => String(entry).trim()).filter(Boolean))];
  }
  return [...(DEFAULT_ROLE_PERMISSIONS[String(roleId ?? "").trim()] ?? [])];
}

export class OpenClawModifierStore {
  constructor(options = {}) {
    this.database = options.database;
    this.initialized = false;
    this.memory = {
      approvals: new Map(),
      members: new Map(),
      policies: new Map(),
      agentBaselines: new Map(),
    };
  }

  async ensureInitialized() {
    if (this.initialized) {
      return;
    }
    if (hasPool(this.database)) {
      await this.database.pool.query(`
        CREATE TABLE IF NOT EXISTS gateway_modifier_approvals (
          approval_id TEXT PRIMARY KEY,
          trace_id TEXT NOT NULL,
          step_index INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL,
          reason TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          decided_at TEXT,
          requested_by TEXT NOT NULL,
          decided_by TEXT NOT NULL DEFAULT '',
          tenant_id TEXT NOT NULL,
          org_id TEXT NOT NULL,
          device_id TEXT NOT NULL DEFAULT '',
          session_id TEXT NOT NULL DEFAULT '',
          tool TEXT NOT NULL,
          target_profile TEXT NOT NULL,
          dangerous_reasons_json TEXT NOT NULL DEFAULT '[]',
          fingerprint TEXT NOT NULL,
          command_json TEXT NOT NULL DEFAULT '{}'
        );
        CREATE TABLE IF NOT EXISTS gateway_modifier_org_members (
          tenant_id TEXT NOT NULL,
          org_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          role_id TEXT NOT NULL,
          permissions_json TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (tenant_id, org_id, user_id)
        );
        CREATE TABLE IF NOT EXISTS gateway_modifier_tenant_policies (
          tenant_id TEXT NOT NULL,
          org_id TEXT NOT NULL,
          version INTEGER NOT NULL,
          is_active BOOLEAN NOT NULL DEFAULT FALSE,
          policy_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          created_by TEXT NOT NULL,
          activated_at TEXT,
          PRIMARY KEY (tenant_id, org_id, version)
        );
        CREATE INDEX IF NOT EXISTS idx_tenant_policies_active
          ON gateway_modifier_tenant_policies (tenant_id, org_id)
          WHERE is_active = TRUE;
        CREATE TABLE IF NOT EXISTS gateway_agent_baselines (
          agent_id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          org_id TEXT NOT NULL,
          embedding_json TEXT NOT NULL,
          step_count INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL
        );
      `);
    }
    this.initialized = true;
  }

  async upsertOrgMember(scopeInput, userId, roleId, options = {}) {
    await this.ensureInitialized();
    const scope = normalizeScope(scopeInput);
    const normalizedUserId = String(userId ?? "").trim();
    const normalizedRoleId = String(roleId ?? "").trim() || "operator";
    if (!scope.tenantId || !scope.orgId || !normalizedUserId) {
      throw new Error("tenantId, orgId, and userId are required.");
    }
    const permissions = resolveRolePermissions(normalizedRoleId, options.permissions);
    const timestamp = nowIso();

    if (!hasPool(this.database)) {
      const key = memberKey(scope, normalizedUserId);
      const existing = this.memory.members.get(key);
      const record = {
        tenantId: scope.tenantId,
        orgId: scope.orgId,
        userId: normalizedUserId,
        roleId: normalizedRoleId,
        permissions,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      };
      this.memory.members.set(key, record);
      return record;
    }

    await this.database.pool.query(
      `
        INSERT INTO gateway_modifier_org_members (
          tenant_id, org_id, user_id, role_id, permissions_json, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $6)
        ON CONFLICT (tenant_id, org_id, user_id) DO UPDATE SET
          role_id = EXCLUDED.role_id,
          permissions_json = EXCLUDED.permissions_json,
          updated_at = EXCLUDED.updated_at
      `,
      [
        scope.tenantId,
        scope.orgId,
        normalizedUserId,
        normalizedRoleId,
        JSON.stringify(permissions),
        timestamp,
      ]
    );

    return this.getOrgMember(scope, normalizedUserId);
  }

  async getOrgMember(scopeInput, userId) {
    await this.ensureInitialized();
    const scope = normalizeScope(scopeInput);
    const normalizedUserId = String(userId ?? "").trim();
    if (!scope.tenantId || !scope.orgId || !normalizedUserId) {
      return null;
    }
    if (!hasPool(this.database)) {
      return this.memory.members.get(memberKey(scope, normalizedUserId)) ?? null;
    }
    const result = await this.database.pool.query(
      `
        SELECT tenant_id, org_id, user_id, role_id, permissions_json, created_at, updated_at
        FROM gateway_modifier_org_members
        WHERE tenant_id = $1 AND org_id = $2 AND user_id = $3
        LIMIT 1
      `,
      [scope.tenantId, scope.orgId, normalizedUserId]
    );
    return toMemberRecord(result.rows[0]);
  }

  async listOrgMembers(scopeInput) {
    await this.ensureInitialized();
    const scope = normalizeScope(scopeInput);
    if (!scope.tenantId || !scope.orgId) {
      return [];
    }
    if (!hasPool(this.database)) {
      return [...this.memory.members.values()].filter(
        (member) => member.tenantId === scope.tenantId && member.orgId === scope.orgId
      );
    }
    const result = await this.database.pool.query(
      `
        SELECT tenant_id, org_id, user_id, role_id, permissions_json, created_at, updated_at
        FROM gateway_modifier_org_members
        WHERE tenant_id = $1 AND org_id = $2
        ORDER BY updated_at DESC
      `,
      [scope.tenantId, scope.orgId]
    );
    return result.rows.map((row) => toMemberRecord(row));
  }

  async resolvePermissions(scopeInput, userId) {
    const member = await this.getOrgMember(scopeInput, userId);
    return member ? [...new Set(member.permissions.map((entry) => String(entry)))] : [];
  }

  async createPolicyVersion(scopeInput, actorUserId, policyInput, options = {}) {
    await this.ensureInitialized();
    const scope = normalizeScope(scopeInput);
    const actorId = String(actorUserId ?? "").trim() || "system";
    if (!scope.tenantId || !scope.orgId) {
      throw new Error("tenantId and orgId are required.");
    }
    const timestamp = nowIso();
    const normalizedPolicy = normalizePolicyPayload(policyInput);
    const activate = options.activate !== false;

    if (!hasPool(this.database)) {
      const key = scopeKey(scope);
      const history = this.memory.policies.get(key) ?? [];
      const version = history.length > 0 ? history[history.length - 1].version + 1 : 1;
      const record = {
        tenantId: scope.tenantId,
        orgId: scope.orgId,
        version,
        isActive: activate,
        createdAt: timestamp,
        createdBy: actorId,
        activatedAt: activate ? timestamp : "",
        policy: normalizedPolicy,
      };
      const nextHistory = activate
        ? [...history.map((entry) => ({ ...entry, isActive: false })), record]
        : [...history, record];
      this.memory.policies.set(key, nextHistory);
      return record;
    }

    const versionResult = await this.database.pool.query(
      `
        SELECT COALESCE(MAX(version), 0)::int AS current_version
        FROM gateway_modifier_tenant_policies
        WHERE tenant_id = $1 AND org_id = $2
      `,
      [scope.tenantId, scope.orgId]
    );
    const version = Number(versionResult.rows[0]?.current_version ?? 0) + 1;
    if (activate) {
      await this.database.pool.query(
        `
          UPDATE gateway_modifier_tenant_policies
          SET is_active = FALSE, activated_at = NULL
          WHERE tenant_id = $1 AND org_id = $2 AND is_active = TRUE
        `,
        [scope.tenantId, scope.orgId]
      );
    }
    await this.database.pool.query(
      `
        INSERT INTO gateway_modifier_tenant_policies (
          tenant_id, org_id, version, is_active, policy_json, created_at, created_by, activated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        scope.tenantId,
        scope.orgId,
        version,
        activate,
        JSON.stringify(normalizedPolicy),
        timestamp,
        actorId,
        activate ? timestamp : null,
      ]
    );
    return this.getPolicyVersion(scope, version);
  }

  async getActivePolicy(scopeInput) {
    await this.ensureInitialized();
    const scope = normalizeScope(scopeInput);
    if (!scope.tenantId || !scope.orgId) {
      return null;
    }
    if (!hasPool(this.database)) {
      const history = this.memory.policies.get(scopeKey(scope)) ?? [];
      return history.find((entry) => entry.isActive) ?? history[history.length - 1] ?? null;
    }
    const result = await this.database.pool.query(
      `
        SELECT tenant_id, org_id, version, is_active, policy_json, created_at, created_by, activated_at
        FROM gateway_modifier_tenant_policies
        WHERE tenant_id = $1 AND org_id = $2 AND is_active = TRUE
        ORDER BY version DESC
        LIMIT 1
      `,
      [scope.tenantId, scope.orgId]
    );
    return toPolicyRecord(result.rows[0]);
  }

  async getPolicyVersion(scopeInput, version) {
    await this.ensureInitialized();
    const scope = normalizeScope(scopeInput);
    if (!scope.tenantId || !scope.orgId) {
      return null;
    }
    if (!hasPool(this.database)) {
      const history = this.memory.policies.get(scopeKey(scope)) ?? [];
      return history.find((entry) => entry.version === Number(version)) ?? null;
    }
    const result = await this.database.pool.query(
      `
        SELECT tenant_id, org_id, version, is_active, policy_json, created_at, created_by, activated_at
        FROM gateway_modifier_tenant_policies
        WHERE tenant_id = $1 AND org_id = $2 AND version = $3
        LIMIT 1
      `,
      [scope.tenantId, scope.orgId, Number(version)]
    );
    return toPolicyRecord(result.rows[0]);
  }

  async listPolicyVersions(scopeInput, limit = 20) {
    await this.ensureInitialized();
    const scope = normalizeScope(scopeInput);
    const normalizedLimit = Number.isFinite(Number(limit))
      ? Math.max(1, Math.min(200, Number(limit)))
      : 20;
    if (!scope.tenantId || !scope.orgId) {
      return [];
    }
    if (!hasPool(this.database)) {
      return [...(this.memory.policies.get(scopeKey(scope)) ?? [])]
        .sort((a, b) => b.version - a.version)
        .slice(0, normalizedLimit);
    }
    const result = await this.database.pool.query(
      `
        SELECT tenant_id, org_id, version, is_active, policy_json, created_at, created_by, activated_at
        FROM gateway_modifier_tenant_policies
        WHERE tenant_id = $1 AND org_id = $2
        ORDER BY version DESC
        LIMIT $3
      `,
      [scope.tenantId, scope.orgId, normalizedLimit]
    );
    return result.rows.map((row) => toPolicyRecord(row));
  }

  async ensurePolicy(scopeInput, actorUserId, policyInput) {
    const active = await this.getActivePolicy(scopeInput);
    if (active) {
      return active;
    }
    return this.createPolicyVersion(scopeInput, actorUserId, policyInput, { activate: true });
  }

  async createApproval(input) {
    await this.ensureInitialized();
    const scope = normalizeScope(input);
    if (!scope.tenantId || !scope.orgId) {
      throw new Error("tenantId and orgId are required.");
    }
    const id = asString(input.id) ?? `ocmod-${randomUUID()}`;
    const timestamp = nowIso();
    const record = {
      id,
      traceId: String(input.traceId ?? ""),
      stepIndex: Number(input.stepIndex ?? 0),
      status: String(input.status ?? "pending"),
      reason: String(input.reason ?? ""),
      createdAt: String(input.createdAt ?? timestamp),
      expiresAt: String(input.expiresAt ?? timestamp),
      decidedAt: String(input.decidedAt ?? ""),
      requestedBy: String(input.requestedBy ?? ""),
      decidedBy: String(input.decidedBy ?? ""),
      tenantId: scope.tenantId,
      orgId: scope.orgId,
      deviceId: String(input.deviceId ?? ""),
      sessionId: String(input.sessionId ?? ""),
      tool: String(input.tool ?? ""),
      targetProfile: String(input.targetProfile ?? ""),
      dangerousReasons: Array.isArray(input.dangerousReasons) ? input.dangerousReasons : [],
      fingerprint: String(input.fingerprint ?? ""),
      command: input.command && typeof input.command === "object" ? input.command : {},
    };

    if (!hasPool(this.database)) {
      this.memory.approvals.set(record.id, record);
      return record;
    }

    await this.database.pool.query(
      `
        INSERT INTO gateway_modifier_approvals (
          approval_id, trace_id, step_index, status, reason, created_at, expires_at, decided_at,
          requested_by, decided_by, tenant_id, org_id, device_id, session_id, tool, target_profile,
          dangerous_reasons_json, fingerprint, command_json
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14, $15, $16,
          $17, $18, $19
        )
      `,
      [
        record.id,
        record.traceId,
        record.stepIndex,
        record.status,
        record.reason,
        record.createdAt,
        record.expiresAt,
        record.decidedAt || null,
        record.requestedBy,
        record.decidedBy,
        record.tenantId,
        record.orgId,
        record.deviceId,
        record.sessionId,
        record.tool,
        record.targetProfile,
        JSON.stringify(record.dangerousReasons),
        record.fingerprint,
        JSON.stringify(record.command),
      ]
    );
    return this.getApproval(record.id);
  }

  async getApproval(approvalId) {
    await this.ensureInitialized();
    const normalizedId = String(approvalId ?? "").trim();
    if (!normalizedId) {
      return null;
    }
    if (!hasPool(this.database)) {
      return this.memory.approvals.get(normalizedId) ?? null;
    }
    const result = await this.database.pool.query(
      `
        SELECT approval_id, trace_id, step_index, status, reason, created_at, expires_at, decided_at,
               requested_by, decided_by, tenant_id, org_id, device_id, session_id, tool, target_profile,
               dangerous_reasons_json, fingerprint, command_json
        FROM gateway_modifier_approvals
        WHERE approval_id = $1
        LIMIT 1
      `,
      [normalizedId]
    );
    return toApprovalRecord(result.rows[0]);
  }

  async listApprovals(filters = {}) {
    await this.ensureInitialized();
    const scope = normalizeScope(filters);
    const status = String(filters.status ?? "").trim().toLowerCase();
    const requestedBy = String(filters.requestedBy ?? "").trim();
    const limit = Number.isFinite(Number(filters.limit))
      ? Math.max(1, Math.min(500, Number(filters.limit)))
      : 200;

    if (!hasPool(this.database)) {
      return [...this.memory.approvals.values()]
        .filter((record) => {
          if (scope.tenantId && record.tenantId !== scope.tenantId) {
            return false;
          }
          if (scope.orgId && record.orgId !== scope.orgId) {
            return false;
          }
          if (status && record.status !== status) {
            return false;
          }
          if (requestedBy && record.requestedBy !== requestedBy) {
            return false;
          }
          return true;
        })
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .slice(0, limit);
    }

    const conditions = [];
    const params = [];
    let cursor = 1;
    if (scope.tenantId) {
      conditions.push(`tenant_id = $${cursor++}`);
      params.push(scope.tenantId);
    }
    if (scope.orgId) {
      conditions.push(`org_id = $${cursor++}`);
      params.push(scope.orgId);
    }
    if (status) {
      conditions.push(`status = $${cursor++}`);
      params.push(status);
    }
    if (requestedBy) {
      conditions.push(`requested_by = $${cursor++}`);
      params.push(requestedBy);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(limit);
    const result = await this.database.pool.query(
      `
        SELECT approval_id, trace_id, step_index, status, reason, created_at, expires_at, decided_at,
               requested_by, decided_by, tenant_id, org_id, device_id, session_id, tool, target_profile,
               dangerous_reasons_json, fingerprint, command_json
        FROM gateway_modifier_approvals
        ${where}
        ORDER BY created_at DESC
        LIMIT $${cursor}
      `,
      params
    );
    return result.rows.map((row) => toApprovalRecord(row));
  }

  async updateApprovalDecision(approvalId, input = {}) {
    await this.ensureInitialized();
    const record = await this.getApproval(approvalId);
    if (!record) {
      return null;
    }
    if (record.status !== "pending") {
      return record;
    }
    const updated = {
      ...record,
      status: String(input.status ?? record.status),
      reason: String(input.reason ?? record.reason ?? ""),
      decidedBy: String(input.decidedBy ?? ""),
      decidedAt: String(input.decidedAt ?? nowIso()),
    };
    if (!hasPool(this.database)) {
      this.memory.approvals.set(record.id, updated);
      return updated;
    }
    await this.database.pool.query(
      `
        UPDATE gateway_modifier_approvals
        SET status = $2, reason = $3, decided_by = $4, decided_at = $5
        WHERE approval_id = $1 AND status = 'pending'
      `,
      [record.id, updated.status, updated.reason, updated.decidedBy, updated.decidedAt]
    );
    return this.getApproval(record.id);
  }

  async pruneExpiredApprovals(limit = 500) {
    await this.ensureInitialized();
    const now = nowIso();
    if (!hasPool(this.database)) {
      for (const [id, record] of this.memory.approvals.entries()) {
        if (record.status === "pending" && String(record.expiresAt).localeCompare(now) < 0) {
          this.memory.approvals.set(id, {
            ...record,
            status: "expired",
            reason: record.reason || "Approval expired.",
            decidedAt: now,
          });
        }
      }
      return;
    }
    await this.database.pool.query(
      `
        UPDATE gateway_modifier_approvals
        SET status = 'expired',
            reason = CASE WHEN reason = '' THEN 'Approval expired.' ELSE reason END,
            decided_at = COALESCE(decided_at, $1)
        WHERE approval_id IN (
          SELECT approval_id
          FROM gateway_modifier_approvals
          WHERE status = 'pending' AND expires_at < $1
          ORDER BY created_at ASC
          LIMIT $2
        )
      `,
      [now, Math.max(1, Math.min(5000, Number(limit) || 500))]
    );
  }

  async upsertAgentBaseline(agentId, tenantId, orgId, embedding, stepCount) {
    await this.ensureInitialized();
    const normalizedAgentId = String(agentId ?? "").trim();
    if (!normalizedAgentId) return null;
    const timestamp = nowIso();
    const record = {
      agentId: normalizedAgentId,
      tenantId: String(tenantId ?? ""),
      orgId: String(orgId ?? ""),
      embedding,
      stepCount: Number(stepCount ?? 0),
      updatedAt: timestamp,
    };

    if (!hasPool(this.database)) {
      this.memory.agentBaselines.set(normalizedAgentId, record);
      return record;
    }

    await this.database.pool.query(
      `
        INSERT INTO gateway_agent_baselines (agent_id, tenant_id, org_id, embedding_json, step_count, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (agent_id) DO UPDATE SET
          embedding_json = EXCLUDED.embedding_json,
          step_count = EXCLUDED.step_count,
          updated_at = EXCLUDED.updated_at
      `,
      [normalizedAgentId, record.tenantId, record.orgId, JSON.stringify(embedding), record.stepCount, timestamp]
    );
    return record;
  }

  async getAgentBaseline(agentId) {
    await this.ensureInitialized();
    const normalizedAgentId = String(agentId ?? "").trim();
    if (!normalizedAgentId) return null;

    if (!hasPool(this.database)) {
      return this.memory.agentBaselines.get(normalizedAgentId) ?? null;
    }

    const result = await this.database.pool.query(
      `SELECT agent_id, tenant_id, org_id, embedding_json, step_count, updated_at
       FROM gateway_agent_baselines WHERE agent_id = $1 LIMIT 1`,
      [normalizedAgentId]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      agentId: String(row.agent_id),
      tenantId: String(row.tenant_id ?? ""),
      orgId: String(row.org_id ?? ""),
      embedding: parseJson(row.embedding_json, []),
      stepCount: Number(row.step_count ?? 0),
      updatedAt: String(row.updated_at ?? ""),
    };
  }

  async listAgentBaselines(scopeInput) {
    await this.ensureInitialized();
    const scope = normalizeScope(scopeInput);

    if (!hasPool(this.database)) {
      return [...this.memory.agentBaselines.values()].filter(
        (b) => (!scope.tenantId || b.tenantId === scope.tenantId) &&
               (!scope.orgId || b.orgId === scope.orgId)
      );
    }

    const conditions = [];
    const params = [];
    let cursor = 1;
    if (scope.tenantId) {
      conditions.push(`tenant_id = $${cursor++}`);
      params.push(scope.tenantId);
    }
    if (scope.orgId) {
      conditions.push(`org_id = $${cursor++}`);
      params.push(scope.orgId);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await this.database.pool.query(
      `SELECT agent_id, tenant_id, org_id, embedding_json, step_count, updated_at
       FROM gateway_agent_baselines ${where} ORDER BY updated_at DESC LIMIT 200`,
      params
    );
    return result.rows.map((row) => ({
      agentId: String(row.agent_id),
      tenantId: String(row.tenant_id ?? ""),
      orgId: String(row.org_id ?? ""),
      embedding: parseJson(row.embedding_json, []),
      stepCount: Number(row.step_count ?? 0),
      updatedAt: String(row.updated_at ?? ""),
    }));
  }
}
