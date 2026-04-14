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
    pollIntervalMs = 250;
    pool;
    initialized = false;
    constructor(options = {}) {
        const connectionString = typeof options === "string" ? options : options.databaseUrl;
        if (connectionString) {
            this.pool = new Pool({ connectionString });
        }
        if (Number.isFinite(options.pollIntervalMs)) {
            this.pollIntervalMs = Math.max(50, Number(options.pollIntervalMs));
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
        this.resolved.delete(this.key(traceId, stepIndex));
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
    addWaiter(k, waiter) {
        const existing = this.waiters.get(k);
        if (existing) {
            existing.add(waiter);
            return existing;
        }
        const waiters = new Set([waiter]);
        this.waiters.set(k, waiters);
        return waiters;
    }
    removeWaiter(k, waiter) {
        const waiters = this.waiters.get(k);
        if (!waiters) {
            return;
        }
        waiters.delete(waiter);
        if (waiters.size === 0) {
            this.waiters.delete(k);
        }
    }
    cacheResolution(k, result) {
        if (this.resolved.size >= this.maxResolvedSize) {
            const oldestKey = this.resolved.keys().next().value;
            this.resolved.delete(oldestKey);
        }
        this.resolved.set(k, result);
    }
    settleWaiters(k, result) {
        const waiters = this.waiters.get(k);
        if (!waiters || waiters.size === 0) {
            return false;
        }
        this.waiters.delete(k);
        for (const waiter of waiters) {
            try {
                waiter.finish(result);
            }
            catch {
                // best effort
            }
        }
        return true;
    }
    parseStep(row) {
        try {
            return JSON.parse(String(row?.step_json || "{}"));
        }
        catch {
            return {};
        }
    }
    toResolutionRecord(row) {
        if (!row || row.status !== "resolved") {
            return null;
        }
        return {
            action: String(row.action || ""),
            reason: String(row.reason || ""),
            approverId: String(row.approver_id || row.approverId || ""),
            resolvedAt: String(row.resolved_at || row.resolvedAt || ""),
        };
    }
    async readRecord(traceId, stepIndex) {
        const k = this.key(traceId, stepIndex);
        if (!this.pool) {
            const pending = this.pending.get(k);
            if (pending) {
                return { ...pending, status: "pending" };
            }
            const resolved = this.resolved.get(k);
            if (resolved) {
                return {
                    traceId,
                    stepIndex,
                    status: "resolved",
                    action: resolved.action,
                    reason: resolved.reason,
                    approver_id: resolved.approverId,
                    resolved_at: resolved.resolvedAt,
                };
            }
            return null;
        }
        await this.initialize();
        const result = await this.pool.query(`
      SELECT approval_id, trace_id, step_index, status, requested_at, resolved_at,
             expires_at, action, reason, approver_id, step_json
        FROM context_wall_approvals
       WHERE trace_id = $1
         AND step_index = $2
       LIMIT 1
    `, [traceId, stepIndex]);
        if (result.rows.length === 0) {
            return null;
        }
        const row = result.rows[0];
        return {
            approvalId: row.approval_id,
            traceId: row.trace_id,
            stepIndex: Number(row.step_index),
            status: row.status,
            requestedAt: row.requested_at,
            resolvedAt: row.resolved_at,
            expiresAt: row.expires_at,
            action: row.action,
            reason: row.reason,
            approver_id: row.approver_id,
            step: this.parseStep(row),
        };
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
            if (!accepted) {
                const existing = await this.readRecord(traceId, stepIndex);
                if (existing?.status === "resolved") {
                    const normalized = this.toResolutionRecord(existing);
                    return normalized ?? null;
                }
                return null;
            }
        }
        else {
            accepted = this.pending.has(k) || this.waiters.has(k);
        }
        if (!accepted)
            return null;
        this.pending.delete(k);
        if (!this.settleWaiters(k, result)) {
            this.cacheResolution(k, result);
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
        const initialRecord = await this.readRecord(traceId, stepIndex);
        if (!initialRecord) {
            return null;
        }
        if (initialRecord.status === "resolved") {
            return this.toResolutionRecord(initialRecord);
        }
        if (initialRecord.status !== "pending") {
            return null;
        }
        return new Promise((resolve) => {
            let settled = false;
            const finish = (value) => {
                if (settled) {
                    return;
                }
                settled = true;
                clearTimeout(timeoutTimer);
                clearInterval(pollTimer);
                this.removeWaiter(k, waiter);
                resolve(value);
            };
            const poll = async () => {
                if (settled) {
                    return;
                }
                const record = await this.readRecord(traceId, stepIndex).catch(() => null);
                if (!record) {
                    finish(null);
                    return;
                }
                if (record.status === "resolved") {
                    const resolution = this.toResolutionRecord(record);
                    if (resolution) {
                        finish(resolution);
                    }
                    else {
                        finish(null);
                    }
                    return;
                }
                if (record.status !== "pending") {
                    finish(null);
                }
            };
            const timeoutTimer = setTimeout(async () => {
                this.pending.delete(k);
                await this.markTimedOut(traceId, stepIndex).catch(() => {});
                finish(null);
            }, Math.max(1000, timeoutMs));
            const pollTimer = setInterval(() => {
                poll().catch(() => {});
            }, this.pollIntervalMs);
            const waiter = { finish };
            this.addWaiter(k, waiter);
            queueMicrotask(() => {
                poll().catch(() => {});
            });
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
