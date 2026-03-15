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
 * Uses a dedicated client so the lock is bound to the connection session.
 */
async function tryAdvisoryLock(lockId, database) {
  if (!hasPool(database)) return { acquired: false, client: null };
  const client = await database.pool.connect();
  try {
    const result = await client.query(
      `SELECT pg_try_advisory_lock($1) AS acquired`,
      [lockId]
    );
    if (result.rows[0]?.acquired === true) {
      return { acquired: true, client };
    }
    client.release();
    return { acquired: false, client: null };
  } catch {
    client.release();
    return { acquired: false, client: null };
  }
}

/**
 * Release a session-level advisory lock on a dedicated client.
 */
async function releaseAdvisoryLock(lockId, client) {
  if (!client) return;
  try {
    await client.query(`SELECT pg_advisory_unlock($1)`, [lockId]);
  } catch { /* best effort */ }
  client.release();
}

/**
 * Execute a function under an advisory lock. If the lock is not acquired,
 * the function is skipped and { skipped: true } is returned.
 */
export async function withLeaderLock(lockId, database, fn) {
  if (!hasPool(database)) {
    // Finding 12: Without DB there's no coordination — skip the work
    // to prevent all pods from running background jobs simultaneously.
    // Callers that need single-instance fallback should check explicitly.
    mapleLog("debug", "leader_election.no_pool_skipped", { lockId });
    return { skipped: true, reason: "no_database_pool" };
  }

  const { acquired, client } = await tryAdvisoryLock(lockId, database);
  if (!acquired) {
    return { skipped: true, reason: "leader_lock_not_acquired" };
  }

  try {
    return await fn();
  } finally {
    await releaseAdvisoryLock(lockId, client);
  }
}
