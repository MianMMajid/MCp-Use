import pg from "pg";

const { Pool } = pg;

function nowIso() {
    return new Date().toISOString();
}

export class ApprovalQueue {
    pending = new Map();
    waiters = new Map();
    resolved = new Map();
    watchers = new Set();
    maxResolvedSize = 1000;
    pool;
    initialized = false;
    constructor(options = {}) {
        const connectionString = typeof options === "string" ? options : options.databaseUrl;
        if (connectionString) {
            this.pool = new Pool({ connectionString });
        }
    }
    key(traceId, stepIndex) {
        return `${traceId}:${stepIndex}`;
    }
    async initialize() {
        if (this.initialized || !this.pool)
            return;
        await this.pool.query(`
      CREATE TABLE IF NOT EXISTS context_wall_approvals (
        approval_id TEXT PRIMARY KEY,
        trace_id TEXT NOT NULL,
        step_index INTEGER NOT NULL,
        status TEXT NOT NULL,
        requested_at TEXT NOT NULL,
        resolved_at TEXT,
        expires_at TEXT,
        action TEXT NOT NULL DEFAULT '',
        reason TEXT NOT NULL DEFAULT '',
        approver_id TEXT NOT NULL DEFAULT '',
        step_json TEXT NOT NULL DEFAULT '{}',
        UNIQUE(trace_id, step_index)
      );
      CREATE INDEX IF NOT EXISTS idx_context_wall_approvals_pending
        ON context_wall_approvals(status, requested_at DESC);
    `);
        this.initialized = true;
    }
    async enqueue(traceId, stepIndex, step, options = {}) {
        const approval = {
            approvalId: `approval:${traceId}:${stepIndex}`,
            traceId,
            stepIndex,
            step,
            requestedAt: nowIso(),
            expiresAt: Number.isFinite(options.timeoutMs) ? new Date(Date.now() + Math.max(1000, options.timeoutMs)).toISOString() : null,
            status: "pending",
        };
        this.pending.set(this.key(traceId, stepIndex), approval);
        if (this.pool) {
            await this.initialize();
            await this.pool.query(`
        INSERT INTO context_wall_approvals (
          approval_id, trace_id, step_index, status, requested_at, resolved_at, expires_at, action, reason, approver_id, step_json
        ) VALUES ($1, $2, $3, 'pending', $4, NULL, $5, '', '', '', $6)
        ON CONFLICT (trace_id, step_index) DO UPDATE SET
          status = 'pending',
          requested_at = EXCLUDED.requested_at,
          resolved_at = NULL,
          expires_at = EXCLUDED.expires_at,
          action = '',
          reason = '',
          approver_id = '',
          step_json = EXCLUDED.step_json
      `, [approval.approvalId, traceId, stepIndex, approval.requestedAt, approval.expiresAt, JSON.stringify(step ?? {})]);
        }
        for (const watcher of this.watchers) {
            try {
                watcher(approval);
            }
            catch {
                this.watchers.delete(watcher);
            }
        }
        return approval;
    }
    async resolve(traceId, stepIndex, action, reason, approverId) {
        const k = this.key(traceId, stepIndex);
        const result = { action, reason, approverId, resolvedAt: nowIso() };
        let accepted = false;
        if (this.pool) {
            await this.initialize();
            const update = await this.pool.query(`
        UPDATE context_wall_approvals
           SET status = 'resolved',
               resolved_at = $3,
               action = $4,
               reason = $5,
               approver_id = $6
         WHERE trace_id = $1
           AND step_index = $2
           AND status = 'pending'
         RETURNING approval_id
      `, [traceId, stepIndex, result.resolvedAt, action, reason || "", approverId || ""]);
            accepted = update.rows.length > 0;
        }
        else {
            accepted = this.pending.has(k) || this.waiters.has(k);
        }
        if (!accepted)
            return null;
        this.pending.delete(k);
        const waiter = this.waiters.get(k);
        if (waiter) {
            clearTimeout(waiter.timer);
            this.waiters.delete(k);
            waiter.resolve(result);
        }
        else {
            if (this.resolved.size >= this.maxResolvedSize) {
                const oldestKey = this.resolved.keys().next().value;
                this.resolved.delete(oldestKey);
            }
            this.resolved.set(k, result);
        }
        return result;
    }
    async hasPendingRecord(traceId, stepIndex) {
        if (!this.pool) {
            return this.pending.has(this.key(traceId, stepIndex));
        }
        await this.initialize();
        const result = await this.pool.query(`
      SELECT approval_id
        FROM context_wall_approvals
       WHERE trace_id = $1
         AND step_index = $2
         AND status = 'pending'
       LIMIT 1
    `, [traceId, stepIndex]);
        return result.rows.length > 0;
    }
    async markTimedOut(traceId, stepIndex) {
        if (!this.pool)
            return;
        await this.initialize();
        await this.pool.query(`
      UPDATE context_wall_approvals
         SET status = 'timed_out',
             resolved_at = $3
       WHERE trace_id = $1
         AND step_index = $2
         AND status = 'pending'
    `, [traceId, stepIndex, nowIso()]);
    }
    async waitForResolution(traceId, stepIndex, timeoutMs) {
        const k = this.key(traceId, stepIndex);
        const resolved = this.resolved.get(k);
        if (resolved) {
            this.resolved.delete(k);
            return resolved;
        }
        if (!(await this.hasPendingRecord(traceId, stepIndex))) {
            return null;
        }
        return new Promise((resolve) => {
            const timer = setTimeout(async () => {
                this.waiters.delete(k);
                this.pending.delete(k);
                await this.markTimedOut(traceId, stepIndex).catch(() => {});
                resolve(null);
            }, Math.max(1000, timeoutMs));
            const existing = this.waiters.get(k);
            if (existing) {
                clearTimeout(existing.timer);
            }
            this.waiters.set(k, { resolve, timer });
        });
    }
    watch(callback) {
        this.watchers.add(callback);
        Promise.resolve(this.getPending()).then((items) => {
            for (const item of items) {
                try {
                    callback(item);
                }
                catch {
                    this.watchers.delete(callback);
                    return;
                }
            }
        }).catch(() => {});
        return () => this.watchers.delete(callback);
    }
    async getPending() {
        if (this.pool) {
            await this.initialize();
            const result = await this.pool.query(`
        SELECT trace_id, step_index, step_json, requested_at, expires_at
          FROM context_wall_approvals
         WHERE status = 'pending'
         ORDER BY requested_at DESC
      `);
            return result.rows.map((row) => ({
                approvalId: `approval:${row.trace_id}:${row.step_index}`,
                traceId: row.trace_id,
                stepIndex: Number(row.step_index),
                step: JSON.parse(String(row.step_json || "{}")),
                requestedAt: row.requested_at,
                expiresAt: row.expires_at,
                status: "pending",
            }));
        }
        return [...this.pending.values()];
    }
}
