import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { mapleLog } from "@maple/common";
export class AuditStore {
    events = [];
    maxInMemory = 10000;
    pool = null;
    pgReady = false;
    writeBuffer = [];
    flushTimer = null;
    flushInProgress = false;
    maxBufferSize;
    flushIntervalMs;
    maxWriteBuffer;
    constructor(options = {}) {
        this.maxBufferSize = options.maxBufferSize ?? 100;
        this.flushIntervalMs = options.flushIntervalMs ?? 200;
        this.maxWriteBuffer = options.maxWriteBuffer ?? 10000;
    }
    async initialize(databaseUrl) {
        try {
            this.pool = new Pool({
                connectionString: databaseUrl,
                max: 10,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 5000,
                maxUses: 7500,
                application_name: 'maple-audit-writer',
            });
            this.pool.on('connect', (client) => {
                client.query('SET synchronous_commit = off').catch(() => {});
            });
            // Verify connectivity
            const client = await this.pool.connect();
            try {
                // Create table and indexes
                await client.query(`
          CREATE TABLE IF NOT EXISTS audit_events (
            event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            event_type TEXT NOT NULL,
            timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            source_service TEXT NOT NULL,
            trace_id TEXT,
            session_id TEXT,
            request_id TEXT,
            user_id TEXT,
            key_fingerprint TEXT,
            payload_json JSONB,
            severity TEXT,
            summary TEXT
          );
          CREATE INDEX IF NOT EXISTS idx_audit_trace ON audit_events(trace_id);
          CREATE INDEX IF NOT EXISTS idx_audit_session ON audit_events(session_id);
          DROP INDEX IF EXISTS idx_audit_ts;
          CREATE INDEX IF NOT EXISTS idx_audit_ts_composite ON audit_events(timestamp DESC, event_id DESC);

          CREATE TABLE IF NOT EXISTS audit_dead_letter (
            event_id UUID PRIMARY KEY,
            event_type TEXT NOT NULL,
            timestamp TIMESTAMPTZ NOT NULL,
            source_service TEXT NOT NULL,
            trace_id TEXT,
            session_id TEXT,
            request_id TEXT,
            user_id TEXT,
            key_fingerprint TEXT,
            payload_json JSONB,
            severity TEXT,
            summary TEXT,
            error TEXT NOT NULL,
            attempts INTEGER DEFAULT 1,
            failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_dead_letter_failed ON audit_dead_letter(failed_at);

          CREATE INDEX IF NOT EXISTS idx_audit_ts_brin
            ON audit_events USING BRIN (timestamp) WITH (pages_per_range = 32);
        `);
                // Load recent events into in-memory cache
                const result = await client.query(`SELECT event_id, event_type, timestamp, source_service,
                  trace_id, session_id, request_id, user_id,
                  key_fingerprint, payload_json, severity, summary
           FROM audit_events
           ORDER BY timestamp DESC
           LIMIT 1000`);
                this.events = result.rows.map(rowToAuditEvent).reverse();
                this.pgReady = true;
                mapleLog("info", "audit_store_pg_initialized", {
                    cachedEvents: this.events.length,
                });
            }
            finally {
                client.release();
            }
        }
        catch (err) {
            mapleLog("error", "audit_store_pg_init_failed", {
                error: err.message,
            });
            this.pgReady = false;
            throw err;
        }
    }
    async append(event) {
        if (!this.pgReady || !this.pool) {
            throw new Error("AuditStore PostgreSQL backend is not ready.");
        }
        if (!event.eventId) {
            event.eventId = randomUUID();
        }
        if (!event.timestamp) {
            event.timestamp = new Date().toISOString();
        }
        this.events.push(event);
        if (this.events.length > this.maxInMemory) {
            this.events = this.events.slice(-this.maxInMemory);
        }
        this.bufferEvent(event);
        return event.eventId;
    }
    bufferEvent(event) {
        if (this.writeBuffer.length >= this.maxWriteBuffer) {
            // Drop oldest 10% to amortize the splice cost instead of O(n) shift per event
            const dropCount = Math.max(1, Math.floor(this.maxWriteBuffer * 0.1));
            this.writeBuffer.splice(0, dropCount);
        }
        this.writeBuffer.push(event);
        if (this.writeBuffer.length >= this.maxBufferSize) {
            if (!this.flushInProgress) {
                this.flushBuffer().catch(() => {});
            }
            return;
        }
        if (!this.flushTimer) {
            this.flushTimer = setTimeout(() => {
                if (!this.flushInProgress) {
                    this.flushBuffer().catch(() => {});
                }
            }, this.flushIntervalMs);
        }
    }
    async flushBuffer() {
        if (this.flushInProgress) return;
        this.flushInProgress = true;
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }
        const batch = this.writeBuffer.splice(0, this.writeBuffer.length);
        if (batch.length === 0) {
            this.flushInProgress = false;
            return;
        }
        try {
            await this.insertEventsPgBatch(batch);
        } catch (err) {
            mapleLog("error", "audit_flush_batch_failed", { error: err.message, count: batch.length });
            for (const event of batch) {
                try {
                    await this.insertEventPg(event);
                } catch (insertErr) {
                    await this.insertDeadLetter(event, insertErr.message);
                }
            }
        } finally {
            this.flushInProgress = false;
        }
    }
    async appendBatch(events) {
        if (!events || events.length === 0) return [];
        if (!this.pgReady || !this.pool) {
            throw new Error("AuditStore PostgreSQL backend is not ready.");
        }
        for (const event of events) {
            if (!event.eventId) event.eventId = randomUUID();
            if (!event.timestamp) event.timestamp = new Date().toISOString();
            this.events.push(event);
        }
        if (this.events.length > this.maxInMemory) {
            this.events = this.events.slice(-this.maxInMemory);
        }
        try {
            await this.insertEventsPgBatch(events);
        } catch (err) {
            mapleLog("error", "audit_append_batch_falling_back", { error: err.message, count: events.length });
            for (const event of events) {
                try {
                    await this.insertEventPg(event);
                } catch (insertErr) {
                    await this.insertDeadLetter(event, insertErr.message);
                }
            }
        }
        return events.map((e) => e.eventId);
    }
    async query(filters) {
        if (!this.pgReady || !this.pool) {
            throw new Error("AuditStore PostgreSQL backend is not ready.");
        }
        return this.queryPg(filters);
    }
    getAll() {
        return [...this.events];
    }
    async shutdown() {
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }
        await this.flushBuffer();
        if (this.pool) {
            await this.pool.end();
            this.pool = null;
            this.pgReady = false;
            mapleLog("info", "audit_store_pg_shutdown", {});
        }
    }
    // ── Dead-letter queue ────────────────────────────────────────────
    async insertDeadLetter(event, error) {
        if (!this.pgReady || !this.pool) return;
        try {
            await this.pool.query(
                `INSERT INTO audit_dead_letter
                    (event_id, event_type, timestamp, source_service, trace_id, session_id, request_id, user_id, key_fingerprint, payload_json, severity, summary, error, attempts, failed_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 1, NOW())
                 ON CONFLICT (event_id) DO UPDATE SET
                    attempts = audit_dead_letter.attempts + 1,
                    error = EXCLUDED.error,
                    failed_at = NOW()`,
                [
                    event.eventId,
                    event.eventType,
                    event.timestamp,
                    event.sourceService,
                    event.traceId ?? null,
                    event.sessionId ?? null,
                    event.requestId ?? null,
                    event.userId ?? null,
                    event.keyFingerprint ?? null,
                    event.payload ? JSON.stringify(event.payload) : null,
                    event.severity ?? null,
                    event.summary ?? null,
                    error,
                ]
            );
        } catch (dlqErr) {
            mapleLog("error", "audit_dead_letter_insert_failed", { error: dlqErr.message, originalError: error });
        }
    }

    async replayDeadLetter(eventId) {
        if (!this.pgReady || !this.pool) {
            throw new Error("AuditStore PostgreSQL backend is not ready.");
        }
        const result = await this.pool.query(
            `SELECT event_id, event_type, timestamp, source_service, trace_id, session_id, request_id, user_id, key_fingerprint, payload_json, severity, summary
             FROM audit_dead_letter WHERE event_id = $1`,
            [eventId]
        );
        if (result.rows.length === 0) {
            return { replayed: false, reason: "not_found" };
        }
        const row = result.rows[0];
        const event = {
            eventId: row.event_id,
            eventType: row.event_type,
            timestamp: typeof row.timestamp === "string" ? row.timestamp : new Date(row.timestamp).toISOString(),
            sourceService: row.source_service,
            traceId: row.trace_id ?? undefined,
            sessionId: row.session_id ?? undefined,
            requestId: row.request_id ?? undefined,
            userId: row.user_id ?? undefined,
            keyFingerprint: row.key_fingerprint ?? undefined,
            payload: row.payload_json ? (typeof row.payload_json === "string" ? JSON.parse(row.payload_json) : row.payload_json) : undefined,
            severity: row.severity ?? undefined,
            summary: row.summary ?? undefined,
        };
        await this.insertEventPg(event);
        this.events.push(event);
        if (this.events.length > this.maxInMemory) {
            this.events = this.events.slice(-this.maxInMemory);
        }
        await this.pool.query(`DELETE FROM audit_dead_letter WHERE event_id = $1`, [eventId]);
        return { replayed: true, eventId };
    }

    async listDeadLetter(limit = 50, offset = 0) {
        if (!this.pgReady || !this.pool) {
            throw new Error("AuditStore PostgreSQL backend is not ready.");
        }
        const result = await this.pool.query(
            `SELECT event_id, event_type, timestamp, source_service, trace_id, session_id, severity, summary, error, attempts, failed_at
             FROM audit_dead_letter ORDER BY failed_at DESC LIMIT $1 OFFSET $2`,
            [limit, offset]
        );
        const countResult = await this.pool.query(`SELECT COUNT(*)::int AS total FROM audit_dead_letter`);
        return {
            events: result.rows.map((row) => ({
                eventId: row.event_id,
                eventType: row.event_type,
                timestamp: typeof row.timestamp === "string" ? row.timestamp : new Date(row.timestamp).toISOString(),
                sourceService: row.source_service,
                traceId: row.trace_id,
                sessionId: row.session_id,
                severity: row.severity,
                summary: row.summary,
                error: row.error,
                attempts: row.attempts,
                failedAt: typeof row.failed_at === "string" ? row.failed_at : new Date(row.failed_at).toISOString(),
            })),
            totalCount: countResult.rows[0].total,
        };
    }

    // ── Private helpers ──────────────────────────────────────────────
    async insertEventPg(event) {
        await this.pool.query(`INSERT INTO audit_events
        (event_id, event_type, timestamp, source_service,
         trace_id, session_id, request_id, user_id,
         key_fingerprint, payload_json, severity, summary)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (event_id) DO NOTHING`, [
            event.eventId,
            event.eventType,
            event.timestamp,
            event.sourceService,
            event.traceId ?? null,
            event.sessionId ?? null,
            event.requestId ?? null,
            event.userId ?? null,
            event.keyFingerprint ?? null,
            event.payload ? JSON.stringify(event.payload) : null,
            event.severity ?? null,
            event.summary ?? null,
        ]);
    }
    async insertEventsPgBatch(events) {
        if (events.length === 0) return;
        // UNNEST-based batch insert: fixed 12-param prepared statement regardless
        // of batch size. PostgreSQL expands the arrays row-by-row internally.
        // This avoids generating dynamic placeholders ($1..$N*12) which causes
        // query plan cache misses and string allocation overhead for large batches.
        const eventIds = [];
        const eventTypes = [];
        const timestamps = [];
        const sourceServices = [];
        const traceIds = [];
        const sessionIds = [];
        const requestIds = [];
        const userIds = [];
        const keyFingerprints = [];
        const payloadJsons = [];
        const severities = [];
        const summaries = [];
        for (const e of events) {
            eventIds.push(e.eventId);
            eventTypes.push(e.eventType);
            timestamps.push(e.timestamp);
            sourceServices.push(e.sourceService);
            traceIds.push(e.traceId ?? null);
            sessionIds.push(e.sessionId ?? null);
            requestIds.push(e.requestId ?? null);
            userIds.push(e.userId ?? null);
            keyFingerprints.push(e.keyFingerprint ?? null);
            payloadJsons.push(e.payload ? JSON.stringify(e.payload) : null);
            severities.push(e.severity ?? null);
            summaries.push(e.summary ?? null);
        }
        await this.pool.query(
            `INSERT INTO audit_events
             (event_id, event_type, timestamp, source_service,
              trace_id, session_id, request_id, user_id,
              key_fingerprint, payload_json, severity, summary)
             SELECT * FROM UNNEST(
               $1::uuid[], $2::text[], $3::timestamptz[], $4::text[],
               $5::text[], $6::text[], $7::text[], $8::text[],
               $9::text[], $10::jsonb[], $11::text[], $12::text[]
             )
             ON CONFLICT (event_id) DO NOTHING`,
            [eventIds, eventTypes, timestamps, sourceServices,
             traceIds, sessionIds, requestIds, userIds,
             keyFingerprints, payloadJsons, severities, summaries]
        );
    }
    async queryPg(filters) {
        const conditions = [];
        const params = [];
        let paramIdx = 1;
        if (filters.traceId) {
            conditions.push(`trace_id = $${paramIdx++}`);
            params.push(filters.traceId);
        }
        if (filters.sessionId) {
            conditions.push(`session_id = $${paramIdx++}`);
            params.push(filters.sessionId);
        }
        if (filters.sourceService) {
            conditions.push(`source_service = $${paramIdx++}`);
            params.push(filters.sourceService);
        }
        if (filters.eventTypes && filters.eventTypes.length > 0) {
            conditions.push(`event_type = ANY($${paramIdx++})`);
            params.push(filters.eventTypes);
        }
        if (filters.since) {
            conditions.push(`timestamp >= $${paramIdx++}`);
            params.push(filters.since);
        }
        if (filters.until) {
            conditions.push(`timestamp <= $${paramIdx++}`);
            params.push(filters.until);
        }
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
        // Get total count
        const countResult = await this.pool.query(`SELECT COUNT(*)::int AS total FROM audit_events ${whereClause}`, params);
        const totalCount = countResult.rows[0].total;
        // Apply cursor-based pagination
        const paginationConditions = [...conditions];
        const paginationParams = [...params];
        if (filters.cursor) {
            // Cursor is an event_id — find the timestamp of that event to paginate
            const cursorResult = await this.pool.query(`SELECT timestamp FROM audit_events WHERE event_id = $1`, [filters.cursor]);
            if (cursorResult.rows.length > 0) {
                paginationConditions.push(`(timestamp, event_id) < ($${paramIdx}, $${paramIdx + 1})`);
                paginationParams.push(cursorResult.rows[0].timestamp, filters.cursor);
                paramIdx += 2;
            }
        }
        const paginationWhere = paginationConditions.length > 0
            ? `WHERE ${paginationConditions.join(" AND ")}`
            : "";
        const limit = filters.limit || 100;
        const dataResult = await this.pool.query(`SELECT event_id, event_type, timestamp, source_service,
              trace_id, session_id, request_id, user_id,
              key_fingerprint, payload_json, severity, summary
       FROM audit_events
       ${paginationWhere}
       ORDER BY timestamp DESC, event_id DESC
       LIMIT $${paramIdx}`, [...paginationParams, limit]);
        const events = dataResult.rows.map(rowToAuditEvent);
        const nextCursor = events.length > 0 ? events[events.length - 1].eventId : "";
        return { events, nextCursor, totalCount };
    }
}
function rowToAuditEvent(row) {
    return {
        eventId: row.event_id,
        eventType: row.event_type,
        timestamp: typeof row.timestamp === "string" ? row.timestamp : new Date(row.timestamp).toISOString(),
        sourceService: row.source_service,
        traceId: row.trace_id ?? undefined,
        sessionId: row.session_id ?? undefined,
        requestId: row.request_id ?? undefined,
        userId: row.user_id ?? undefined,
        keyFingerprint: row.key_fingerprint ?? undefined,
        payload: row.payload_json ? (typeof row.payload_json === "string" ? JSON.parse(row.payload_json) : row.payload_json) : undefined,
        severity: row.severity ?? undefined,
        summary: row.summary ?? undefined,
    };
}
//# sourceMappingURL=store.js.map
