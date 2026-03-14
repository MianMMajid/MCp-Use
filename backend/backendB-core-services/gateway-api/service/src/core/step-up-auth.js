/**
 * step-up-auth.js
 *
 * Step-up authentication for high-risk modifier operations.
 * Requires re-authentication (password or challenge token) before
 * allowing dangerous approvals. Verified state has a short TTL.
 */
import { createHash, randomUUID } from "node:crypto";
import { mapleLog } from "../logging.js";

let _database = null;

const STEP_UP_DEFAULT_TTL_SECONDS = 300; // 5 minutes
const STEP_UP_MAX_TTL_SECONDS = 900; // 15 minutes

function hasPool(database) {
  return Boolean(database && typeof database.pool?.query === "function");
}

function nowIso() {
  return new Date().toISOString();
}

/**
 * Configure the step-up auth module with database.
 */
export function configureStepUpAuth(options = {}) {
  if (options.database) {
    _database = options.database;
  }
}

/**
 * Ensure the step-up verification table exists.
 */
export async function ensureStepUpTable(database) {
  const db = database ?? _database;
  if (!hasPool(db)) return;
  await db.pool.query(`
    CREATE TABLE IF NOT EXISTS modifier_step_up_verifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL DEFAULT '',
      org_id TEXT NOT NULL DEFAULT '',
      method TEXT NOT NULL,
      verified_at TEXT,
      expires_at TEXT NOT NULL,
      challenge_hash TEXT,
      used_for_approval_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_step_up_user_expires
      ON modifier_step_up_verifications(user_id, expires_at DESC);
  `);
  // Safely migrate existing schema: allow NULL for verified_at
  try {
    await db.pool.query(`
      ALTER TABLE modifier_step_up_verifications ALTER COLUMN verified_at DROP NOT NULL;
    `);
  } catch (_) {
    // Column may already allow NULL or table may not exist yet; ignore.
  }
}

/**
 * Create a step-up challenge for a user. Returns the challenge token.
 */
export async function createStepUpChallenge(userId, options = {}) {
  const db = options.database ?? _database;
  const challengeToken = randomUUID();
  const challengeHash = createHash("sha256")
    .update(challengeToken)
    .digest("hex");

  const ttlSeconds = Math.max(
    60,
    Math.min(
      STEP_UP_MAX_TTL_SECONDS,
      Number(options.ttlSeconds) || STEP_UP_DEFAULT_TTL_SECONDS
    )
  );
  const now = nowIso();
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  if (hasPool(db)) {
    const id = `stepup-${randomUUID()}`;
    await db.pool.query(
      `INSERT INTO modifier_step_up_verifications
         (id, user_id, tenant_id, org_id, method, verified_at, expires_at, challenge_hash)
       VALUES ($1, $2, $3, $4, 'challenge', NULL, $5, $6)`,
      [
        id,
        userId,
        options.tenantId ?? "",
        options.orgId ?? "",
        expiresAt,
        challengeHash,
      ]
    );
  }

  return {
    challengeToken,
    expiresAt,
    ttlSeconds,
  };
}

/**
 * Verify a step-up challenge token. Returns true if valid.
 */
export async function verifyStepUpChallenge(userId, challengeToken, options = {}) {
  const db = options.database ?? _database;
  const challengeHash = createHash("sha256")
    .update(challengeToken)
    .digest("hex");

  if (!hasPool(db)) {
    return { verified: false, reason: "no_database" };
  }

  // Require tenant/org scope to prevent cross-tenant misuse
  if (!options.tenantId) {
    return { verified: false, reason: "scope_required" };
  }

  const now = nowIso();
  const conditions = [
    "user_id = $1",
    "challenge_hash = $2",
    "expires_at > $3",
    "used_for_approval_id IS NULL",
    "tenant_id = $4",
  ];
  const params = [userId, challengeHash, now, options.tenantId];
  let cursor = 5;

  if (options.orgId) {
    conditions.push(`org_id = $${cursor++}`);
    params.push(options.orgId);
  }

  const result = await db.pool.query(
    `SELECT id, expires_at FROM modifier_step_up_verifications
     WHERE ${conditions.join(" AND ")}
     ORDER BY expires_at DESC LIMIT 1`,
    params
  );

  if (result.rows.length === 0) {
    return { verified: false, reason: "invalid_or_expired" };
  }

  // Atomically verify and reserve for consumption (prevents race condition)
  const updateResult = await db.pool.query(
    `UPDATE modifier_step_up_verifications
     SET verified_at = $2, used_for_approval_id = 'pending'
     WHERE id = $1 AND used_for_approval_id IS NULL`,
    [result.rows[0].id, now]
  );

  if ((updateResult.rowCount ?? 0) === 0) {
    return { verified: false, reason: "already_consumed" };
  }

  return { verified: true, stepUpId: result.rows[0].id };
}

/**
 * Verify step-up via password re-entry.
 * Caller must provide the verifyPassword function from auth module.
 */
export async function verifyStepUpPassword(userId, password, options = {}) {
  const db = options.database ?? _database;
  const verifyPassword = options.verifyPassword;

  if (!verifyPassword) {
    return { verified: false, reason: "verify_password_not_configured" };
  }

  if (!hasPool(db)) {
    return { verified: false, reason: "no_database" };
  }

  // Look up user password hash
  const userResult = await db.pool.query(
    `SELECT password_hash FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  );
  if (userResult.rows.length === 0) {
    return { verified: false, reason: "user_not_found" };
  }

  const passwordHash = userResult.rows[0].password_hash;
  let passwordValid;
  try {
    passwordValid = await verifyPassword(password, passwordHash);
  } catch {
    return { verified: false, reason: "verify_failed" };
  }

  if (!passwordValid) {
    return { verified: false, reason: "invalid_password" };
  }

  // Store verified step-up
  const ttlSeconds = Math.max(
    60,
    Math.min(
      STEP_UP_MAX_TTL_SECONDS,
      Number(options.ttlSeconds) || STEP_UP_DEFAULT_TTL_SECONDS
    )
  );
  const now = nowIso();
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  const id = `stepup-${randomUUID()}`;

  await db.pool.query(
    `INSERT INTO modifier_step_up_verifications
       (id, user_id, tenant_id, org_id, method, verified_at, expires_at)
     VALUES ($1, $2, $3, $4, 'password', $5, $6)`,
    [id, userId, options.tenantId ?? "", options.orgId ?? "", now, expiresAt]
  );

  return {
    verified: true,
    stepUpId: id,
    expiresAt,
  };
}

/**
 * Check if a user has a valid (non-expired) step-up verification.
 */
export async function hasValidStepUp(userId, options = {}) {
  const db = options.database ?? _database;
  if (!hasPool(db)) {
    return { valid: false, reason: "no_database" };
  }

  // Require tenant scope to prevent cross-tenant misuse
  if (!options.tenantId) {
    return { valid: false, reason: "scope_required" };
  }

  const now = nowIso();
  const conditions = [
    "user_id = $1",
    "expires_at > $2",
    "(used_for_approval_id IS NULL OR used_for_approval_id = 'pending')",
    "verified_at IS NOT NULL",
    "tenant_id = $3",
  ];
  const params = [userId, now, options.tenantId];
  let cursor = 4;

  if (options.orgId) {
    conditions.push(`org_id = $${cursor++}`);
    params.push(options.orgId);
  }

  const result = await db.pool.query(
    `SELECT id, method, verified_at, expires_at
     FROM modifier_step_up_verifications
     WHERE ${conditions.join(" AND ")}
     ORDER BY verified_at DESC LIMIT 1`,
    params
  );

  if (result.rows.length === 0) {
    return { valid: false, reason: "no_valid_step_up" };
  }

  return {
    valid: true,
    stepUpId: result.rows[0].id,
    method: result.rows[0].method,
    verifiedAt: result.rows[0].verified_at,
    expiresAt: result.rows[0].expires_at,
  };
}

/**
 * Consume a step-up verification for a specific approval.
 */
export async function consumeStepUpForApproval(stepUpId, approvalId, options = {}) {
  const db = options.database ?? _database;
  if (!hasPool(db)) return { consumed: false, reason: "no_database" };
  const result = await db.pool.query(
    `UPDATE modifier_step_up_verifications SET used_for_approval_id = $2 WHERE id = $1 AND used_for_approval_id = 'pending'`,
    [stepUpId, approvalId]
  );
  if ((result.rowCount ?? 0) === 0) {
    return { consumed: false, reason: "already_consumed" };
  }
  return { consumed: true };
}

/**
 * Purge expired step-up verifications.
 */
export async function purgeExpiredStepUps(options = {}) {
  const db = options.database ?? _database;
  if (!hasPool(db)) return 0;
  const result = await db.pool.query(
    `DELETE FROM modifier_step_up_verifications WHERE expires_at < $1`,
    [nowIso()]
  );
  return result.rowCount ?? 0;
}
