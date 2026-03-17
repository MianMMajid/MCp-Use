/**
 * policy-version-routes.js
 *
 * Phase 6D: Policy version history with diff tracking and rollback.
 * Every policy mutation creates a new version record so operators can
 * audit changes, compare diffs, and rollback to any prior version.
 *
 * GET  /api/policies/versions              — list versions for a policy
 * GET  /api/policies/versions/:versionId   — get specific version
 * POST /api/policies/versions/:versionId/rollback — rollback to version
 */
import { requireApiKeyResponse, getAuthContext } from "../auth-api-key.js";
import { database } from "../state.js";
import { asString, readJsonBody } from "../helpers.js";
import { emitAuditEvent } from "../audit-emitter.js";
import { mapleLog } from "../logging.js";

// ── Table bootstrap ─────────────────────────────────────────────────────────

async function ensurePolicyVersionsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS policy_versions (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
      policy_id TEXT NOT NULL,
      version_number INTEGER NOT NULL,
      policy_json TEXT NOT NULL DEFAULT '{}',
      diff_json TEXT DEFAULT NULL,
      created_by TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (policy_id, version_number)
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_policy_versions_policy_id
      ON policy_versions(policy_id, version_number DESC)
  `);
}

let _tableEnsured = false;

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Compute a simple JSON diff between two policy objects.
 * Returns an object with added, removed, and changed keys.
 */
function computeJsonDiff(prev, next) {
  const prevKeys = new Set(Object.keys(prev));
  const nextKeys = new Set(Object.keys(next));

  const added = {};
  const removed = {};
  const changed = {};

  for (const key of nextKeys) {
    if (!prevKeys.has(key)) {
      added[key] = next[key];
    } else if (JSON.stringify(prev[key]) !== JSON.stringify(next[key])) {
      changed[key] = { from: prev[key], to: next[key] };
    }
  }

  for (const key of prevKeys) {
    if (!nextKeys.has(key)) {
      removed[key] = prev[key];
    }
  }

  return { added, removed, changed };
}

/**
 * Create a new policy version. Call this whenever a policy is mutated.
 * Exported so other route modules can integrate versioning.
 */
export async function createPolicyVersion(pool, { policyId, policyJson, createdBy }) {
  if (!pool) return null;

  try {
    // Get the latest version number
    const latest = await pool.query(
      `SELECT version_number, policy_json FROM policy_versions
       WHERE policy_id = $1
       ORDER BY version_number DESC
       LIMIT 1`,
      [policyId]
    );

    const prevVersion = latest.rows[0]?.version_number ?? 0;
    const newVersion = prevVersion + 1;

    // Compute diff against previous version
    let diffJson = null;
    if (latest.rows.length > 0) {
      try {
        const prevPolicy = JSON.parse(latest.rows[0].policy_json || "{}");
        const nextPolicy = typeof policyJson === "string" ? JSON.parse(policyJson) : policyJson;
        diffJson = JSON.stringify(computeJsonDiff(prevPolicy, nextPolicy));
      } catch {
        diffJson = null;
      }
    }

    const policyStr = typeof policyJson === "string" ? policyJson : JSON.stringify(policyJson);

    const result = await pool.query(
      `INSERT INTO policy_versions (policy_id, version_number, policy_json, diff_json, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [policyId, newVersion, policyStr, diffJson, createdBy || "system"]
    );

    return result.rows[0] || null;
  } catch (err) {
    mapleLog("warn", "policy_versions.create_failed", { policyId, error: err.message });
    return null;
  }
}

// ── Route registration ──────────────────────────────────────────────────────

export function registerPolicyVersionRoutes(app) {
  // ── List versions for a policy ────────────────────────────────────────
  app.get("/api/policies/versions", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const pool = database?.pool;
    if (!pool) return c.json({ error: "Database unavailable." }, 503);

    if (!_tableEnsured) { await ensurePolicyVersionsTable(pool); _tableEnsured = true; }

    const policyId = c.req.query("policyId");
    if (!policyId) {
      return c.json({ error: "policyId query parameter is required." }, 400);
    }

    const limit = Math.min(Number(c.req.query("limit")) || 50, 200);
    const offset = Number(c.req.query("offset")) || 0;

    try {
      const result = await pool.query(
        `SELECT id, policy_id, version_number, diff_json, created_by, created_at
         FROM policy_versions
         WHERE policy_id = $1
         ORDER BY version_number DESC
         LIMIT $2 OFFSET $3`,
        [policyId, limit, offset]
      );

      const countResult = await pool.query(
        `SELECT COUNT(*)::int AS total FROM policy_versions WHERE policy_id = $1`,
        [policyId]
      );

      const items = result.rows.map((row) => ({
        id: row.id,
        policyId: row.policy_id,
        versionNumber: row.version_number,
        diff: row.diff_json ? JSON.parse(row.diff_json) : null,
        createdBy: row.created_by,
        createdAt: row.created_at,
      }));

      return c.json({
        ok: true,
        policyId,
        items,
        total: countResult.rows[0]?.total ?? 0,
        limit,
        offset,
      });
    } catch (err) {
      mapleLog("error", "policy_versions.list_failed", { policyId, error: err.message });
      return c.json({ error: "Failed to list policy versions", details: err.message }, 500);
    }
  });

  // ── Get specific version ──────────────────────────────────────────────
  app.get("/api/policies/versions/:versionId", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const pool = database?.pool;
    if (!pool) return c.json({ error: "Database unavailable." }, 503);

    if (!_tableEnsured) { await ensurePolicyVersionsTable(pool); _tableEnsured = true; }

    const versionId = asString(c.req.param("versionId"));

    try {
      const result = await pool.query(
        `SELECT * FROM policy_versions WHERE id = $1 LIMIT 1`,
        [versionId]
      );

      if (result.rows.length === 0) {
        return c.json({ error: "Policy version not found." }, 404);
      }

      const row = result.rows[0];
      return c.json({
        ok: true,
        version: {
          id: row.id,
          policyId: row.policy_id,
          versionNumber: row.version_number,
          policy: JSON.parse(row.policy_json || "{}"),
          diff: row.diff_json ? JSON.parse(row.diff_json) : null,
          createdBy: row.created_by,
          createdAt: row.created_at,
        },
      });
    } catch (err) {
      mapleLog("error", "policy_versions.get_failed", { versionId, error: err.message });
      return c.json({ error: "Failed to get policy version", details: err.message }, 500);
    }
  });

  // ── Rollback to a specific version ────────────────────────────────────
  app.post("/api/policies/versions/:versionId/rollback", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const pool = database?.pool;
    if (!pool) return c.json({ error: "Database unavailable." }, 503);

    if (!_tableEnsured) { await ensurePolicyVersionsTable(pool); _tableEnsured = true; }

    const versionId = asString(c.req.param("versionId"));
    const authCtx = getAuthContext(c);

    try {
      // Fetch the target version
      const targetResult = await pool.query(
        `SELECT * FROM policy_versions WHERE id = $1 LIMIT 1`,
        [versionId]
      );

      if (targetResult.rows.length === 0) {
        return c.json({ error: "Policy version not found." }, 404);
      }

      const targetVersion = targetResult.rows[0];
      const policyId = targetVersion.policy_id;
      const restoredPolicy = JSON.parse(targetVersion.policy_json || "{}");

      // Create a new version representing the rollback
      const newVersion = await createPolicyVersion(pool, {
        policyId,
        policyJson: restoredPolicy,
        createdBy: authCtx?.userId || "system",
      });

      // Apply the restored policy to the active policy table if it exists
      await pool.query(
        `UPDATE gateway_modifier_tenant_policies
         SET policy_json = $1, version = $2, activated_at = NOW()
         WHERE tenant_id = $3 AND is_active = TRUE`,
        [
          targetVersion.policy_json,
          newVersion?.version_number ?? 0,
          restoredPolicy.tenantId || "default",
        ]
      ).catch(() => {
        // Policy table may use a different schema — non-fatal
      });

      emitAuditEvent({
        eventType: "AUDIT_EVENT_TYPE_POLICY_ROLLBACK",
        sourceService: "gateway-api",
        userId: authCtx?.userId,
        severity: "RISK_SEVERITY_HIGH",
        summary: `Policy '${policyId}' rolled back to version ${targetVersion.version_number}`,
        payload: {
          policyId,
          rolledBackTo: targetVersion.version_number,
          newVersionId: newVersion?.id,
          newVersionNumber: newVersion?.version_number,
          rolledBackBy: authCtx?.userId,
        },
      });

      mapleLog("warn", "policy_versions.rollback", {
        policyId,
        rolledBackTo: targetVersion.version_number,
        newVersion: newVersion?.version_number,
      });

      return c.json({
        ok: true,
        policyId,
        rolledBackTo: targetVersion.version_number,
        newVersion: newVersion ? {
          id: newVersion.id,
          versionNumber: newVersion.version_number,
          createdAt: newVersion.created_at,
        } : null,
        restoredPolicy,
      });
    } catch (err) {
      mapleLog("error", "policy_versions.rollback_failed", { versionId, error: err.message });
      return c.json({ error: "Failed to rollback policy", details: err.message }, 500);
    }
  });
}
