/**
 * org-hierarchy.js
 *
 * Parent/child org nesting with cross-org policy inheritance.
 * Supports multi-level hierarchy: corporate → business unit → department → team.
 * Policy resolution walks the hierarchy upward, merging at each level.
 */
import { randomUUID } from "node:crypto";
import { mapleLog } from "../logging.js";

let _database = null;

const MAX_HIERARCHY_DEPTH = 8;

function hasPool(database) {
  return Boolean(database && typeof database.pool?.query === "function");
}

function nowIso() {
  return new Date().toISOString();
}

/**
 * Configure the org hierarchy module.
 */
export function configureOrgHierarchy(options = {}) {
  if (options.database) {
    _database = options.database;
  }
}

/**
 * Ensure the org hierarchy tables exist.
 */
export async function ensureOrgHierarchyTables(database) {
  const db = database ?? _database;
  if (!hasPool(db)) return;
  await db.pool.query(`
    CREATE TABLE IF NOT EXISTS org_hierarchy (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      org_id TEXT NOT NULL,
      parent_org_id TEXT,
      org_name TEXT NOT NULL DEFAULT '',
      org_type TEXT NOT NULL DEFAULT 'team',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      created_by TEXT NOT NULL DEFAULT 'system',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      UNIQUE (tenant_id, org_id)
    );
    CREATE INDEX IF NOT EXISTS idx_org_hierarchy_parent
      ON org_hierarchy(tenant_id, parent_org_id, status);
    CREATE INDEX IF NOT EXISTS idx_org_hierarchy_type
      ON org_hierarchy(tenant_id, org_type, status);

    CREATE TABLE IF NOT EXISTS org_lifecycle_events (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      org_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      actor_user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      details_json TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_org_lifecycle_org
      ON org_lifecycle_events(tenant_id, org_id, created_at DESC);
  `);
}

/**
 * Register or update an org node in the hierarchy.
 */
export async function upsertOrgNode(input, options = {}) {
  const db = options.database ?? _database;
  const now = nowIso();
  const record = {
    id: input.id ?? `org-${randomUUID()}`,
    tenantId: String(input.tenantId ?? ""),
    orgId: String(input.orgId ?? ""),
    parentOrgId: input.parentOrgId ?? null,
    orgName: String(input.orgName ?? ""),
    orgType: String(input.orgType ?? "team"),
    status: String(input.status ?? "active"),
    createdAt: now,
    updatedAt: now,
    createdBy: String(input.createdBy ?? "system"),
    metadata: input.metadata ?? {},
  };

  if (!record.tenantId || !record.orgId) {
    throw new Error("tenantId and orgId are required.");
  }

  // Validate hierarchy depth
  if (record.parentOrgId) {
    const ancestors = await getAncestorChain(record.tenantId, record.parentOrgId, { database: db });
    if (ancestors.length >= MAX_HIERARCHY_DEPTH) {
      throw new Error(`Org hierarchy depth exceeds maximum of ${MAX_HIERARCHY_DEPTH}.`);
    }
  }

  if (!hasPool(db)) {
    return record;
  }

  await db.pool.query(
    `INSERT INTO org_hierarchy (id, tenant_id, org_id, parent_org_id, org_name, org_type, status, created_at, updated_at, created_by, metadata_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, $9, $10)
     ON CONFLICT (tenant_id, org_id) DO UPDATE SET
       parent_org_id = EXCLUDED.parent_org_id,
       org_name = EXCLUDED.org_name,
       org_type = EXCLUDED.org_type,
       status = EXCLUDED.status,
       updated_at = EXCLUDED.updated_at,
       metadata_json = EXCLUDED.metadata_json`,
    [
      record.id, record.tenantId, record.orgId, record.parentOrgId,
      record.orgName, record.orgType, record.status, now,
      record.createdBy, JSON.stringify(record.metadata),
    ]
  );

  await recordLifecycleEvent(record.tenantId, record.orgId, "upsert", record.createdBy, record, { database: db });

  return record;
}

/**
 * Get an org node by tenantId + orgId.
 */
export async function getOrgNode(tenantId, orgId, options = {}) {
  const db = options.database ?? _database;
  if (!hasPool(db)) return null;
  const result = await db.pool.query(
    `SELECT id, tenant_id, org_id, parent_org_id, org_name, org_type, status, created_at, updated_at, created_by, metadata_json
     FROM org_hierarchy WHERE tenant_id = $1 AND org_id = $2 LIMIT 1`,
    [tenantId, orgId]
  );
  return result.rows[0] ? toOrgRecord(result.rows[0]) : null;
}

/**
 * Find the most recent hierarchy node for an org when tenant context is not known.
 */
export async function findOrgNodeByOrgId(orgId, options = {}) {
  const db = options.database ?? _database;
  if (!hasPool(db)) return null;
  const includeInactive = options.includeInactive === true;
  const result = await db.pool.query(
    `SELECT id, tenant_id, org_id, parent_org_id, org_name, org_type, status, created_at, updated_at, created_by, metadata_json
     FROM org_hierarchy
     WHERE org_id = $1
       AND ($2::boolean OR status = 'active')
     ORDER BY updated_at DESC
     LIMIT 1`,
    [orgId, includeInactive]
  );
  return result.rows[0] ? toOrgRecord(result.rows[0]) : null;
}

/**
 * Get the full ancestor chain for an org (bottom-up).
 * Returns [parent, grandparent, ...] up to root.
 */
export async function getAncestorChain(tenantId, orgId, options = {}) {
  const db = options.database ?? _database;
  if (!hasPool(db)) return [];

  const ancestors = [];
  let currentOrgId = orgId;
  const visited = new Set();

  for (let depth = 0; depth < MAX_HIERARCHY_DEPTH; depth++) {
    if (!currentOrgId || visited.has(currentOrgId)) break;
    visited.add(currentOrgId);

    const node = await getOrgNode(tenantId, currentOrgId, { database: db });
    if (!node) break;
    ancestors.push(node);
    currentOrgId = node.parentOrgId;
  }

  return ancestors;
}

/**
 * Get direct children of an org.
 */
export async function getChildOrgs(tenantId, parentOrgId, options = {}) {
  const db = options.database ?? _database;
  if (!hasPool(db)) return [];
  const result = await db.pool.query(
    `SELECT id, tenant_id, org_id, parent_org_id, org_name, org_type, status, created_at, updated_at, created_by, metadata_json
     FROM org_hierarchy WHERE tenant_id = $1 AND parent_org_id = $2 AND status = 'active'
     ORDER BY org_name ASC`,
    [tenantId, parentOrgId]
  );
  return result.rows.map(toOrgRecord);
}

/**
 * Get the full org tree for a tenant (flat list with parent references).
 */
export async function getOrgTree(tenantId, options = {}) {
  const db = options.database ?? _database;
  if (!hasPool(db)) return [];
  const result = await db.pool.query(
    `SELECT id, tenant_id, org_id, parent_org_id, org_name, org_type, status, created_at, updated_at, created_by, metadata_json
     FROM org_hierarchy WHERE tenant_id = $1 AND status = 'active'
     ORDER BY org_type ASC, org_name ASC`,
    [tenantId]
  );
  return result.rows.map(toOrgRecord);
}

/**
 * Resolve the inherited policy chain for an org.
 * Walks from the org up through ancestors, collecting all policy records.
 * Policies are ordered from most specific (child) to most general (root).
 */
export async function resolveInheritedPolicyChain(tenantId, orgId, getPolicyFn, options = {}) {
  const db = options.database ?? _database;
  const ancestors = await getAncestorChain(tenantId, orgId, { database: db });

  const chain = [];
  for (const node of ancestors) {
    const policy = await getPolicyFn(node.tenantId, node.orgId);
    if (policy) {
      chain.push({
        orgId: node.orgId,
        orgName: node.orgName,
        orgType: node.orgType,
        depth: chain.length,
        policy,
      });
    }
  }

  return chain;
}

/**
 * Merge a policy chain (most specific first) into a single effective policy.
 * Child values override parent values. Arrays are unioned.
 */
export function mergePolicyChain(chain) {
  if (chain.length === 0) return null;
  if (chain.length === 1) return chain[0].policy;

  // Start from the most general (last) and layer on more specific
  const reversed = [...chain].reverse();
  let merged = { ...reversed[0].policy };

  for (let i = 1; i < reversed.length; i++) {
    const childPolicy = reversed[i].policy;

    // Arrays: child overrides if non-empty, otherwise inherits
    if (Array.isArray(childPolicy.allowedTools) && childPolicy.allowedTools.length > 0) {
      merged.allowedTools = [...childPolicy.allowedTools];
    }
    if (Array.isArray(childPolicy.dangerousTools) && childPolicy.dangerousTools.length > 0) {
      merged.dangerousTools = [...childPolicy.dangerousTools];
    }
    if (Array.isArray(childPolicy.blockedTargetProfiles) && childPolicy.blockedTargetProfiles.length > 0) {
      // Blocked profiles are UNIONED (more restrictive)
      merged.blockedTargetProfiles = [
        ...new Set([
          ...(merged.blockedTargetProfiles ?? []),
          ...childPolicy.blockedTargetProfiles,
        ]),
      ];
    }

    // Constraints: child overrides if present, with parent as floor/ceiling
    if (childPolicy.constraints) {
      merged.constraints = {
        ...merged.constraints,
        ...childPolicy.constraints,
        // Parent maxTimeout is a ceiling — child can only reduce
        maxTimeoutSeconds: Math.min(
          merged.constraints?.maxTimeoutSeconds ?? 90,
          childPolicy.constraints.maxTimeoutSeconds ?? 90
        ),
        // Parent maxBuffer is a ceiling
        maxBufferMb: Math.min(
          merged.constraints?.maxBufferMb ?? 8,
          childPolicy.constraints.maxBufferMb ?? 8
        ),
      };
    }

    // Metadata: merge
    merged.metadata = {
      ...(merged.metadata ?? {}),
      ...(childPolicy.metadata ?? {}),
      inheritedFrom: reversed
        .slice(0, i)
        .map((entry) => entry.orgId ?? "unknown"),
    };
  }

  return merged;
}

/**
 * Deactivate an org (soft delete).
 */
export async function deactivateOrg(tenantId, orgId, actorUserId, options = {}) {
  const db = options.database ?? _database;
  if (!hasPool(db)) return;
  await db.pool.query(
    `UPDATE org_hierarchy SET status = 'inactive', updated_at = $3 WHERE tenant_id = $1 AND org_id = $2`,
    [tenantId, orgId, nowIso()]
  );
  await recordLifecycleEvent(tenantId, orgId, "deactivate", actorUserId, {}, { database: db });
}

/**
 * Record an org lifecycle event.
 */
async function recordLifecycleEvent(tenantId, orgId, eventType, actorUserId, details, options = {}) {
  const db = options.database ?? _database;
  if (!hasPool(db)) return;
  await db.pool.query(
    `INSERT INTO org_lifecycle_events (id, tenant_id, org_id, event_type, actor_user_id, created_at, details_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      `olc-${randomUUID()}`,
      tenantId,
      orgId,
      eventType,
      actorUserId ?? "system",
      nowIso(),
      JSON.stringify(details ?? {}),
    ]
  );
}

/**
 * Get lifecycle events for an org.
 */
export async function getOrgLifecycleEvents(tenantId, orgId, options = {}) {
  const db = options.database ?? _database;
  if (!hasPool(db)) return [];
  const limit = Math.max(1, Math.min(200, Number(options.limit) || 50));
  const result = await db.pool.query(
    `SELECT id, tenant_id, org_id, event_type, actor_user_id, created_at, details_json
     FROM org_lifecycle_events WHERE tenant_id = $1 AND org_id = $2
     ORDER BY created_at DESC LIMIT $3`,
    [tenantId, orgId, limit]
  );
  return result.rows.map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    orgId: row.org_id,
    eventType: row.event_type,
    actorUserId: row.actor_user_id,
    createdAt: row.created_at,
    details: JSON.parse(row.details_json || "{}"),
  }));
}

function toOrgRecord(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    orgId: row.org_id,
    parentOrgId: row.parent_org_id ?? null,
    orgName: row.org_name,
    orgType: row.org_type,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    metadata: JSON.parse(row.metadata_json || "{}"),
  };
}
