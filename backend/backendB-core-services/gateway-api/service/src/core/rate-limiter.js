/**
 * rate-limiter.js
 *
 * Per-tenant rate limiting and execution quota enforcement for modifier operations.
 * Uses a sliding-window counter with Postgres persistence.
 * Supports per-tenant, per-org, and per-user rate limits.
 */
import { mapleLog } from "../logging.js";

let _database = null;

const DEFAULT_RATE_LIMIT_WINDOW_SECONDS = 60;
const DEFAULT_RATE_LIMIT_MAX_REQUESTS = 30;
const DEFAULT_QUOTA_PERIOD_SECONDS = 86_400; // 24 hours
const DEFAULT_QUOTA_MAX_EXECUTIONS = 1000;

// In-memory fallback counters
const _memCounters = new Map();

function hasPool(database) {
  return Boolean(database && typeof database.pool?.query === "function");
}

function nowIso() {
  return new Date().toISOString();
}

/**
 * Configure the rate limiter.
 */
export function configureRateLimiter(options = {}) {
  if (options.database) {
    _database = options.database;
  }
}

/**
 * Ensure the rate limiter tables exist.
 */
export async function ensureRateLimiterTables(database) {
  const db = database ?? _database;
  if (!hasPool(db)) return;
  await db.pool.query(`
    CREATE TABLE IF NOT EXISTS modifier_rate_limits (
      scope_key TEXT NOT NULL,
      window_start TEXT NOT NULL,
      request_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (scope_key, window_start)
    );
    CREATE INDEX IF NOT EXISTS idx_rate_limits_scope
      ON modifier_rate_limits(scope_key, window_start DESC);

    CREATE TABLE IF NOT EXISTS modifier_execution_quotas (
      scope_key TEXT PRIMARY KEY,
      period_start TEXT NOT NULL,
      period_seconds INTEGER NOT NULL,
      execution_count INTEGER NOT NULL DEFAULT 0,
      max_executions INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS modifier_quota_configs (
      tenant_id TEXT NOT NULL,
      org_id TEXT NOT NULL DEFAULT '',
      rate_limit_window_seconds INTEGER NOT NULL DEFAULT ${DEFAULT_RATE_LIMIT_WINDOW_SECONDS},
      rate_limit_max_requests INTEGER NOT NULL DEFAULT ${DEFAULT_RATE_LIMIT_MAX_REQUESTS},
      quota_period_seconds INTEGER NOT NULL DEFAULT ${DEFAULT_QUOTA_PERIOD_SECONDS},
      quota_max_executions INTEGER NOT NULL DEFAULT ${DEFAULT_QUOTA_MAX_EXECUTIONS},
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL DEFAULT 'system',
      PRIMARY KEY (tenant_id, org_id)
    );
  `);
}

/**
 * Get the rate limit configuration for a scope.
 */
export async function getQuotaConfig(tenantId, orgId, options = {}) {
  const db = options.database ?? _database;
  if (!hasPool(db)) {
    return {
      rateLimitWindowSeconds: DEFAULT_RATE_LIMIT_WINDOW_SECONDS,
      rateLimitMaxRequests: DEFAULT_RATE_LIMIT_MAX_REQUESTS,
      quotaPeriodSeconds: DEFAULT_QUOTA_PERIOD_SECONDS,
      quotaMaxExecutions: DEFAULT_QUOTA_MAX_EXECUTIONS,
    };
  }

  // Try org-specific, then tenant-wide
  const result = await db.pool.query(
    `SELECT rate_limit_window_seconds, rate_limit_max_requests, quota_period_seconds, quota_max_executions
     FROM modifier_quota_configs
     WHERE tenant_id = $1 AND (org_id = $2 OR org_id = '')
     ORDER BY CASE WHEN org_id = $2 THEN 0 ELSE 1 END
     LIMIT 1`,
    [tenantId, orgId ?? ""]
  );

  if (result.rows.length === 0) {
    return {
      rateLimitWindowSeconds: DEFAULT_RATE_LIMIT_WINDOW_SECONDS,
      rateLimitMaxRequests: DEFAULT_RATE_LIMIT_MAX_REQUESTS,
      quotaPeriodSeconds: DEFAULT_QUOTA_PERIOD_SECONDS,
      quotaMaxExecutions: DEFAULT_QUOTA_MAX_EXECUTIONS,
    };
  }

  const row = result.rows[0];
  return {
    rateLimitWindowSeconds: Number(row.rate_limit_window_seconds),
    rateLimitMaxRequests: Number(row.rate_limit_max_requests),
    quotaPeriodSeconds: Number(row.quota_period_seconds),
    quotaMaxExecutions: Number(row.quota_max_executions),
  };
}

/**
 * Set quota configuration for a tenant/org.
 */
export async function setQuotaConfig(tenantId, orgId, config, options = {}) {
  const db = options.database ?? _database;
  if (!hasPool(db)) return;
  await db.pool.query(
    `INSERT INTO modifier_quota_configs (tenant_id, org_id, rate_limit_window_seconds, rate_limit_max_requests, quota_period_seconds, quota_max_executions, updated_at, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (tenant_id, org_id) DO UPDATE SET
       rate_limit_window_seconds = EXCLUDED.rate_limit_window_seconds,
       rate_limit_max_requests = EXCLUDED.rate_limit_max_requests,
       quota_period_seconds = EXCLUDED.quota_period_seconds,
       quota_max_executions = EXCLUDED.quota_max_executions,
       updated_at = EXCLUDED.updated_at,
       updated_by = EXCLUDED.updated_by`,
    [
      tenantId,
      orgId ?? "",
      config.rateLimitWindowSeconds ?? DEFAULT_RATE_LIMIT_WINDOW_SECONDS,
      config.rateLimitMaxRequests ?? DEFAULT_RATE_LIMIT_MAX_REQUESTS,
      config.quotaPeriodSeconds ?? DEFAULT_QUOTA_PERIOD_SECONDS,
      config.quotaMaxExecutions ?? DEFAULT_QUOTA_MAX_EXECUTIONS,
      nowIso(),
      options.updatedBy ?? "system",
    ]
  );
}

/**
 * Check rate limit and quota for a modifier execution.
 * Returns { allowed, remaining, limit, resetAt, quotaRemaining, quotaLimit }.
 */
export async function checkRateLimit(tenantId, orgId, options = {}) {
  const db = options.database ?? _database;
  const config = await getQuotaConfig(tenantId, orgId, { database: db });
  const scopeKey = `${tenantId}:${orgId ?? ""}`;

  // Rate limit check
  const rateResult = await checkSlidingWindow(
    scopeKey,
    config.rateLimitWindowSeconds,
    config.rateLimitMaxRequests,
    { database: db }
  );

  // Quota check
  const quotaResult = await checkExecutionQuota(
    scopeKey,
    config.quotaPeriodSeconds,
    config.quotaMaxExecutions,
    { database: db }
  );

  const allowed = rateResult.allowed && quotaResult.allowed;

  if (!allowed) {
    mapleLog("warn", "rate_limiter.throttled", {
      tenantId,
      orgId,
      rateAllowed: rateResult.allowed,
      quotaAllowed: quotaResult.allowed,
      rateCount: rateResult.count,
      quotaCount: quotaResult.count,
    });
  }

  return {
    allowed,
    rate: {
      allowed: rateResult.allowed,
      count: rateResult.count,
      limit: config.rateLimitMaxRequests,
      remaining: Math.max(0, config.rateLimitMaxRequests - rateResult.count),
      windowSeconds: config.rateLimitWindowSeconds,
      resetAt: rateResult.resetAt,
    },
    quota: {
      allowed: quotaResult.allowed,
      count: quotaResult.count,
      limit: config.quotaMaxExecutions,
      remaining: Math.max(0, config.quotaMaxExecutions - quotaResult.count),
      periodSeconds: config.quotaPeriodSeconds,
      resetAt: quotaResult.resetAt,
    },
  };
}

/**
 * Increment the rate counter after a successful execution.
 */
export async function recordExecution(tenantId, orgId, options = {}) {
  const db = options.database ?? _database;
  const config = await getQuotaConfig(tenantId, orgId, { database: db });
  const scopeKey = `${tenantId}:${orgId ?? ""}`;

  await incrementSlidingWindow(scopeKey, config.rateLimitWindowSeconds, { database: db });
  await incrementQuota(scopeKey, config.quotaPeriodSeconds, config.quotaMaxExecutions, { database: db });
}

async function checkSlidingWindow(scopeKey, windowSeconds, maxRequests, options = {}) {
  const db = options.database ?? _database;
  const now = Date.now();
  const windowStart = new Date(now - windowSeconds * 1000).toISOString();
  const resetAt = new Date(now + windowSeconds * 1000).toISOString();

  if (!hasPool(db)) {
    const memKey = `rate:${scopeKey}`;
    const entries = _memCounters.get(memKey) ?? [];
    const recent = entries.filter((ts) => ts > now - windowSeconds * 1000);
    _memCounters.set(memKey, recent);
    return { allowed: recent.length < maxRequests, count: recent.length, resetAt };
  }

  const result = await db.pool.query(
    `SELECT COALESCE(SUM(request_count), 0)::int AS total
     FROM modifier_rate_limits
     WHERE scope_key = $1 AND window_start >= $2`,
    [scopeKey, windowStart]
  );

  const count = Number(result.rows[0]?.total ?? 0);
  return { allowed: count < maxRequests, count, resetAt };
}

async function incrementSlidingWindow(scopeKey, windowSeconds, options = {}) {
  const db = options.database ?? _database;
  const now = Date.now();
  const windowKey = new Date(Math.floor(now / (windowSeconds * 1000)) * windowSeconds * 1000).toISOString();

  if (!hasPool(db)) {
    const memKey = `rate:${scopeKey}`;
    const entries = _memCounters.get(memKey) ?? [];
    entries.push(now);
    _memCounters.set(memKey, entries);
    return;
  }

  await db.pool.query(
    `INSERT INTO modifier_rate_limits (scope_key, window_start, request_count)
     VALUES ($1, $2, 1)
     ON CONFLICT (scope_key, window_start) DO UPDATE SET request_count = modifier_rate_limits.request_count + 1`,
    [scopeKey, windowKey]
  );
}

async function checkExecutionQuota(scopeKey, periodSeconds, maxExecutions, options = {}) {
  const db = options.database ?? _database;
  const now = Date.now();
  const periodStart = new Date(Math.floor(now / (periodSeconds * 1000)) * periodSeconds * 1000).toISOString();
  const resetAt = new Date(Math.ceil(now / (periodSeconds * 1000)) * periodSeconds * 1000).toISOString();

  if (!hasPool(db)) {
    const memKey = `quota:${scopeKey}`;
    const counter = _memCounters.get(memKey) ?? { count: 0, periodStart };
    if (counter.periodStart !== periodStart) {
      counter.count = 0;
      counter.periodStart = periodStart;
    }
    _memCounters.set(memKey, counter);
    return { allowed: counter.count < maxExecutions, count: counter.count, resetAt };
  }

  const result = await db.pool.query(
    `SELECT execution_count, period_start FROM modifier_execution_quotas
     WHERE scope_key = $1 LIMIT 1`,
    [scopeKey]
  );

  if (result.rows.length === 0) {
    return { allowed: true, count: 0, resetAt };
  }

  const row = result.rows[0];
  if (row.period_start !== periodStart) {
    return { allowed: true, count: 0, resetAt };
  }

  const count = Number(row.execution_count ?? 0);
  return { allowed: count < maxExecutions, count, resetAt };
}

async function incrementQuota(scopeKey, periodSeconds, maxExecutions, options = {}) {
  const db = options.database ?? _database;
  const now = Date.now();
  const periodStart = new Date(Math.floor(now / (periodSeconds * 1000)) * periodSeconds * 1000).toISOString();

  if (!hasPool(db)) {
    const memKey = `quota:${scopeKey}`;
    const counter = _memCounters.get(memKey) ?? { count: 0, periodStart };
    if (counter.periodStart !== periodStart) {
      counter.count = 0;
      counter.periodStart = periodStart;
    }
    counter.count += 1;
    _memCounters.set(memKey, counter);
    return;
  }

  await db.pool.query(
    `INSERT INTO modifier_execution_quotas (scope_key, period_start, period_seconds, execution_count, max_executions, updated_at)
     VALUES ($1, $2, $3, 1, $4, $5)
     ON CONFLICT (scope_key) DO UPDATE SET
       execution_count = CASE
         WHEN modifier_execution_quotas.period_start = EXCLUDED.period_start
         THEN modifier_execution_quotas.execution_count + 1
         ELSE 1
       END,
       period_start = EXCLUDED.period_start,
       period_seconds = EXCLUDED.period_seconds,
       max_executions = EXCLUDED.max_executions,
       updated_at = EXCLUDED.updated_at`,
    [scopeKey, periodStart, periodSeconds, maxExecutions, nowIso()]
  );
}

/**
 * Clean up old rate limit windows.
 */
export async function pruneOldRateLimitWindows(options = {}) {
  const db = options.database ?? _database;
  if (!hasPool(db)) return 0;
  const cutoff = new Date(Date.now() - 3600_000).toISOString(); // 1 hour ago
  const result = await db.pool.query(
    `DELETE FROM modifier_rate_limits WHERE window_start < $1`,
    [cutoff]
  );
  return result.rowCount ?? 0;
}
