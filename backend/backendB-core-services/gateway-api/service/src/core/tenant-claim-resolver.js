/**
 * tenant-claim-resolver.js
 *
 * Resolves and validates tenant/org claims from the authenticated session
 * rather than trusting raw request headers. Provides cryptographic binding
 * between the auth identity and the tenant scope.
 */
import { createHmac, randomUUID } from "node:crypto";
import { authContextStorage } from "../auth.js";
import { asString } from "../helpers.js";
import { mapleLog } from "../logging.js";

let _database = null;
let _claimSigningKey = null;

const TENANT_BINDING_CACHE = new Map();
const CACHE_TTL_MS = 60_000;

function hasPool(database) {
  return Boolean(database && typeof database.pool?.query === "function");
}

function nowIso() {
  return new Date().toISOString();
}

/**
 * Initialize the tenant claim resolver with database and signing key.
 */
export function configureTenantClaimResolver(options = {}) {
  if (options.database) {
    _database = options.database;
  }
  if (!options.signingKey && !process.env.MAPLE_TENANT_CLAIM_SIGNING_KEY) {
    throw new Error("Missing required: MAPLE_TENANT_CLAIM_SIGNING_KEY env var or signingKey option");
  }
  _claimSigningKey = options.signingKey ?? process.env.MAPLE_TENANT_CLAIM_SIGNING_KEY;
}

/**
 * Ensure the tenant bindings table exists.
 */
export async function ensureTenantBindingsTable(database) {
  const db = database ?? _database;
  if (!hasPool(db)) return;
  await db.pool.query(`
    CREATE TABLE IF NOT EXISTS user_tenant_bindings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      org_id TEXT NOT NULL,
      role_id TEXT NOT NULL DEFAULT 'member',
      status TEXT NOT NULL DEFAULT 'active',
      bound_at TEXT NOT NULL,
      unbound_at TEXT,
      bound_by TEXT NOT NULL DEFAULT 'system',
      UNIQUE (user_id, tenant_id, org_id)
    );
    CREATE INDEX IF NOT EXISTS idx_user_tenant_bindings_user
      ON user_tenant_bindings(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_user_tenant_bindings_tenant
      ON user_tenant_bindings(tenant_id, org_id, status);
  `);
}

/**
 * Sign a tenant claim for a user to prevent spoofing.
 */
export function signTenantClaim(userId, tenantId, orgId) {
  const payload = `${userId}:${tenantId}:${orgId}`;
  const hmac = createHmac("sha256", _claimSigningKey ?? "default")
    .update(payload)
    .digest("hex");
  return hmac.slice(0, 32);
}

/**
 * Verify a signed tenant claim.
 */
export function verifyTenantClaimSignature(userId, tenantId, orgId, signature) {
  const expected = signTenantClaim(userId, tenantId, orgId);
  return expected === signature;
}

/**
 * Bind a user to a tenant/org. Returns the binding record.
 */
export async function bindUserToTenant(userId, tenantId, orgId, options = {}) {
  const db = options.database ?? _database;
  if (!hasPool(db)) {
    return {
      id: `bind-${randomUUID()}`,
      userId,
      tenantId,
      orgId,
      roleId: options.roleId ?? "member",
      status: "active",
      boundAt: nowIso(),
      unboundAt: null,
      boundBy: options.boundBy ?? "system",
    };
  }

  const id = `bind-${randomUUID()}`;
  const now = nowIso();
  await db.pool.query(
    `INSERT INTO user_tenant_bindings (id, user_id, tenant_id, org_id, role_id, status, bound_at, bound_by)
     VALUES ($1, $2, $3, $4, $5, 'active', $6, $7)
     ON CONFLICT (user_id, tenant_id, org_id) DO UPDATE SET
       role_id = EXCLUDED.role_id,
       status = 'active',
       bound_at = EXCLUDED.bound_at,
       bound_by = EXCLUDED.bound_by,
       unbound_at = NULL`,
    [id, userId, tenantId, orgId, options.roleId ?? "member", now, options.boundBy ?? "system"]
  );

  TENANT_BINDING_CACHE.delete(`${userId}:${tenantId}:${orgId}`);
  return {
    id,
    userId,
    tenantId,
    orgId,
    roleId: options.roleId ?? "member",
    status: "active",
    boundAt: now,
    unboundAt: null,
    boundBy: options.boundBy ?? "system",
  };
}

/**
 * Unbind a user from a tenant/org.
 */
export async function unbindUserFromTenant(userId, tenantId, orgId, options = {}) {
  const db = options.database ?? _database;
  if (!hasPool(db)) return;
  await db.pool.query(
    `UPDATE user_tenant_bindings SET status = 'inactive', unbound_at = $4
     WHERE user_id = $1 AND tenant_id = $2 AND org_id = $3 AND status = 'active'`,
    [userId, tenantId, orgId, nowIso()]
  );
  TENANT_BINDING_CACHE.delete(`${userId}:${tenantId}:${orgId}`);
}

/**
 * List all active tenant bindings for a user.
 */
export async function listUserTenantBindings(userId, options = {}) {
  const db = options.database ?? _database;
  if (!hasPool(db)) return [];
  const result = await db.pool.query(
    `SELECT id, user_id, tenant_id, org_id, role_id, status, bound_at, unbound_at, bound_by
     FROM user_tenant_bindings
     WHERE user_id = $1 AND status = 'active'
     ORDER BY bound_at DESC`,
    [userId]
  );
  return result.rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    tenantId: row.tenant_id,
    orgId: row.org_id,
    roleId: row.role_id,
    status: row.status,
    boundAt: row.bound_at,
    unboundAt: row.unbound_at,
    boundBy: row.bound_by,
  }));
}

/**
 * Check if a user has an active binding to a specific tenant/org.
 */
async function hasActiveBinding(userId, tenantId, orgId) {
  const db = _database;
  if (!hasPool(db)) return true; // permissive when no DB

  const cacheKey = `${userId}:${tenantId}:${orgId}`;
  const cached = TENANT_BINDING_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.bound;
  }

  const result = await db.pool.query(
    `SELECT 1 FROM user_tenant_bindings
     WHERE user_id = $1 AND tenant_id = $2 AND org_id = $3 AND status = 'active'
     LIMIT 1`,
    [userId, tenantId, orgId]
  );
  const bound = result.rows.length > 0;
  TENANT_BINDING_CACHE.set(cacheKey, { bound, ts: Date.now() });
  return bound;
}

/**
 * Resolve the verified tenant scope for the current request.
 * Uses auth context first, then validates header-provided tenantId against bindings.
 * Returns { tenantId, orgId, userId, verified, method }.
 */
export async function resolveVerifiedTenantScope(headerOverrides = {}) {
  const authContext = authContextStorage.getStore();
  const userId =
    asString(authContext?.userId) ??
    asString(authContext?.keyFingerprint) ??
    "";

  const headerTenantId = asString(headerOverrides.tenantId) ?? "";
  const headerOrgId = asString(headerOverrides.orgId) ?? "";
  const headerSignature = asString(headerOverrides.tenantClaimSignature) ?? "";

  // If signature provided, verify it
  if (headerSignature && headerTenantId && headerOrgId) {
    const valid = verifyTenantClaimSignature(
      userId,
      headerTenantId,
      headerOrgId,
      headerSignature
    );
    if (valid) {
      return {
        tenantId: headerTenantId,
        orgId: headerOrgId,
        userId,
        verified: true,
        method: "signed_claim",
      };
    }
    mapleLog("warn", "tenant_claim.invalid_signature", {
      userId,
      tenantId: headerTenantId,
      orgId: headerOrgId,
    });
  }

  // Check binding in database
  if (headerTenantId && headerOrgId && userId) {
    const bound = await hasActiveBinding(userId, headerTenantId, headerOrgId);
    if (bound) {
      return {
        tenantId: headerTenantId,
        orgId: headerOrgId,
        userId,
        verified: true,
        method: "db_binding",
      };
    }

    mapleLog("warn", "tenant_claim.no_binding", {
      userId,
      tenantId: headerTenantId,
      orgId: headerOrgId,
    });

    return {
      tenantId: headerTenantId,
      orgId: headerOrgId,
      userId,
      verified: false,
      method: "header_unverified",
    };
  }

  // Fallback: header-only (unverified)
  return {
    tenantId: headerTenantId,
    orgId: headerOrgId,
    userId,
    verified: !headerTenantId && !headerOrgId ? true : false,
    method: headerTenantId ? "header_unverified" : "none",
  };
}
