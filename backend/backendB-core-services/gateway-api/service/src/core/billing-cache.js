/**
 * billing-cache.js
 *
 * In-memory LRU cache for billing read endpoints and a Postgres-backed
 * mutation queue for write endpoints. Provides resilience when business-api
 * is temporarily unavailable.
 */
import { mapleLog } from "../logging.js";
import { withLeaderLock } from "./leader-election.js";

// ── In-memory subscription cache (LRU with TTL) ─────────────────────────

const MAX_CACHE_ENTRIES = 1000;
const _cache = new Map(); // userId → { data, expiresAt }

// Leader election lock ID for billing queue worker
const BILLING_WORKER_LOCK_ID = 8675312;

/**
 * Get a cached subscription for a user.
 * Returns the cached data or null if missing/expired.
 */
export function getCachedSubscription(userId) {
  const entry = _cache.get(userId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    _cache.delete(userId);
    return null;
  }
  return entry.data;
}

/**
 * Store a subscription in the cache with a TTL.
 */
export function setCachedSubscription(userId, data, ttlMs = 300_000) {
  // LRU eviction: if at capacity, delete the oldest entry
  if (_cache.size >= MAX_CACHE_ENTRIES && !_cache.has(userId)) {
    const oldestKey = _cache.keys().next().value;
    _cache.delete(oldestKey);
  }
  _cache.set(userId, { data, expiresAt: Date.now() + ttlMs });
}

// ── Postgres-backed billing mutation queue ───────────────────────────────

let _workerTimer = null;
let _workerDb = null;

/**
 * Ensure the billing_mutation_queue table exists.
 */
async function ensureBillingMutationTable(database) {
  if (!database?.pool) return;
  await database.pool.query(`
    CREATE TABLE IF NOT EXISTS billing_mutation_queue (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      mutation_type TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_billing_mutation_status
      ON billing_mutation_queue(status, created_at ASC);
  `);
}

/**
 * Enqueue a billing mutation for later retry.
 * Uses module-level _workerDb if no database is provided.
 */
export async function enqueueBillingMutation(userId, mutation) {
  const db = _workerDb;
  if (!db?.pool) {
    mapleLog("warn", "billing_cache.enqueue_no_db", { userId, mutation: mutation.type });
    return null;
  }
  const result = await db.pool.query(
    `INSERT INTO billing_mutation_queue (user_id, mutation_type, payload_json, status, attempts)
     VALUES ($1, $2, $3, 'pending', 0)
     RETURNING id`,
    [userId, mutation.type, JSON.stringify(mutation.payload ?? {})]
  );
  return result.rows[0]?.id ?? null;
}

/**
 * Flush pending billing mutations.
 * Previously forwarded to business-api; now billing is handled directly
 * in gateway-api so this is a no-op that marks stale entries as delivered.
 */
export async function flushBillingMutationQueue(database) {
  const db = database ?? _workerDb;
  if (!db?.pool) return { flushed: 0, failed: 0 };

  const result = await db.pool.query(
    `UPDATE billing_mutation_queue
     SET status = 'delivered', updated_at = NOW(), attempts = attempts + 1
     WHERE status = 'pending' AND attempts < 10
     RETURNING id`
  );

  return { flushed: result.rowCount ?? 0, failed: 0 };
}

/**
 * Start the background billing mutation queue worker.
 */
export function startBillingQueueWorker({ database }) {
  if (_workerTimer) return;
  _workerDb = database;

  ensureBillingMutationTable(database).catch((err) => {
    mapleLog("warn", "billing_cache.table_init_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  });

  _workerTimer = setInterval(() => {
    withLeaderLock(BILLING_WORKER_LOCK_ID, database, () =>
      flushBillingMutationQueue(database)
    ).catch((err) => {
      if (err && typeof err === "object" && err.skipped) return; // not leader
      mapleLog("warn", "billing_cache.worker_error", {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }, 30_000);

  if (_workerTimer.unref) {
    _workerTimer.unref();
  }

  mapleLog("info", "billing_cache.worker_started", {});
}

/**
 * Stop the billing queue worker.
 */
export function stopBillingQueueWorker() {
  if (_workerTimer) {
    clearInterval(_workerTimer);
    _workerTimer = null;
  }
}
