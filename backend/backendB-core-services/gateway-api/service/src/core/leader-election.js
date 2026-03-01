/**
 * leader-election.js
 *
 * Generic pg_advisory_lock-based leader election for multi-instance HA.
 * Used by outbox worker, escalation worker, and retention worker.
 */
import { mapleLog } from "../logging.js";

/** Well-known lock IDs for each worker. */
export const LOCK_IDS = {
  OUTBOX_WORKER: 8675309,
  ESCALATION_WORKER: 8675310,
  RETENTION_WORKER: 8675311,
};

function hasPool(database) {
  return Boolean(database && typeof database.pool?.query === "function");
}

/**
 * Try to acquire a session-level advisory lock (non-blocking).
 */
async function tryAdvisoryLock(lockId, database) {
  if (!hasPool(database)) return false;
  const result = await database.pool.query(
    `SELECT pg_try_advisory_lock($1) AS acquired`,
    [lockId]
  );
  return result.rows[0]?.acquired === true;
}

/**
 * Release a session-level advisory lock.
 */
async function releaseAdvisoryLock(lockId, database) {
  if (!hasPool(database)) return;
  await database.pool.query(`SELECT pg_advisory_unlock($1)`, [lockId]).catch(() => {});
}

/**
 * Execute a function under an advisory lock. If the lock is not acquired,
 * the function is skipped and { skipped: true } is returned.
 */
export async function withLeaderLock(lockId, database, fn) {
  if (!hasPool(database)) {
    // No database — run locally (single-instance fallback)
    return await fn();
  }

  const acquired = await tryAdvisoryLock(lockId, database);
  if (!acquired) {
    return { skipped: true, reason: "leader_lock_not_acquired" };
  }

  try {
    return await fn();
  } finally {
    await releaseAdvisoryLock(lockId, database);
  }
}
