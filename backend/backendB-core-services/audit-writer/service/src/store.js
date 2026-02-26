import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { mapleLog } from "@maple/common";
export class AuditStore {
    events = [];
    maxInMemory = 10000;
    pool = null;
    pgReady = false;
    async initialize(databaseUrl) {
        try {
            this.pool = new Pool({
                connectionString: databaseUrl,
                max: 10,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 5000,
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
          CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_events(timestamp DESC);
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
        await this.insertEventPg(event);
        return event.eventId;
    }
    async appendBatch(events) {
        const eventIds = [];
        for (const event of events) {
            eventIds.push(await this.append(event));
        }
        return eventIds;
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
        if (this.pool) {
            await this.pool.end();
            this.pool = null;
            this.pgReady = false;
            mapleLog("info", "audit_store_pg_shutdown", {});
        }
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
