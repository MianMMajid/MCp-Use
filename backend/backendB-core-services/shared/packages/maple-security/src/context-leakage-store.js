import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { extractLeakageEntitiesFromText } from "./context-leakage.js";

function nowIso() {
  return new Date().toISOString();
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(String(value ?? ""));
  } catch {
    return fallback;
  }
}

function asDocumentRecord(row) {
  return {
    documentId: row.document_id,
    tenantId: row.tenant_id,
    orgId: row.org_id,
    fileName: row.file_name,
    contentType: row.content_type,
    sizeBytes: Number(row.size_bytes || 0),
    contentText: row.content_text || "",
    policyMode: row.policy_mode || "strict",
    isActive: row.is_active !== false,
    createdBy: row.created_by || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function asEntityRecord(row) {
  return {
    entityId: row.entity_id,
    documentId: row.document_id || "",
    tenantId: row.tenant_id,
    orgId: row.org_id,
    category: row.category,
    valueText: row.value_text || "",
    normalizedValue: row.normalized_value || "",
    displayText: row.display_text || "",
    replacementStrategy: row.replacement_strategy || "block",
    replacementValue: row.replacement_value || "",
    action: row.action || "block",
    severity: row.severity || "medium",
    metadata: parseJson(row.metadata_json, {}),
    policyMode: row.policy_mode || "strict",
    isActive: row.is_active !== false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function asEventRecord(row) {
  return {
    eventId: row.event_id,
    tenantId: row.tenant_id,
    orgId: row.org_id,
    sessionId: row.session_id || "",
    runId: row.run_id || "",
    traceId: row.trace_id || "",
    toolName: row.tool_name || "",
    direction: row.direction || "",
    action: row.action || "",
    blocked: row.blocked === true,
    documentId: row.document_id || "",
    entityIds: parseJson(row.entity_ids_json, []),
    originalRedactedText: row.original_redacted_text || "",
    sanitizedText: row.sanitized_text || "",
    reason: row.reason || "",
    confidence: Number(row.confidence || 0),
    createdAt: row.created_at,
  };
}

export class ContextLeakageStore {
  pool = null;
  ownsPool = false;
  initialized = false;

  constructor(options = {}) {
    if (options?.pool) {
      this.pool = options.pool;
      this.ownsPool = false;
    } else if (options?.databaseUrl) {
      this.pool = new Pool({
        connectionString: options.databaseUrl,
        max: 5,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });
      this.ownsPool = true;
    }
  }

  async initialize() {
    if (this.initialized || !this.pool) {
      return;
    }
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS context_leakage_documents (
        document_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL DEFAULT '',
        org_id TEXT NOT NULL DEFAULT '',
        file_name TEXT NOT NULL,
        content_type TEXT NOT NULL DEFAULT 'text/plain',
        size_bytes BIGINT NOT NULL DEFAULT 0,
        content_text TEXT NOT NULL DEFAULT '',
        policy_mode TEXT NOT NULL DEFAULT 'strict',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_by TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_context_leakage_documents_scope
        ON context_leakage_documents(tenant_id, org_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS context_leakage_entities (
        entity_id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL REFERENCES context_leakage_documents(document_id) ON DELETE CASCADE,
        tenant_id TEXT NOT NULL DEFAULT '',
        org_id TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL,
        value_text TEXT NOT NULL,
        normalized_value TEXT NOT NULL,
        display_text TEXT NOT NULL DEFAULT '',
        replacement_strategy TEXT NOT NULL DEFAULT 'block',
        replacement_value TEXT NOT NULL DEFAULT '',
        action TEXT NOT NULL DEFAULT 'block',
        severity TEXT NOT NULL DEFAULT 'medium',
        metadata_json TEXT NOT NULL DEFAULT '{}',
        policy_mode TEXT NOT NULL DEFAULT 'strict',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_context_leakage_entities_scope
        ON context_leakage_entities(tenant_id, org_id, is_active, category, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_context_leakage_entities_document
        ON context_leakage_entities(document_id, updated_at DESC);

      CREATE TABLE IF NOT EXISTS context_leakage_events (
        event_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL DEFAULT '',
        org_id TEXT NOT NULL DEFAULT '',
        session_id TEXT NOT NULL DEFAULT '',
        run_id TEXT NOT NULL DEFAULT '',
        trace_id TEXT NOT NULL DEFAULT '',
        tool_name TEXT NOT NULL DEFAULT '',
        direction TEXT NOT NULL DEFAULT '',
        action TEXT NOT NULL DEFAULT '',
        blocked BOOLEAN NOT NULL DEFAULT FALSE,
        document_id TEXT NOT NULL DEFAULT '',
        entity_ids_json TEXT NOT NULL DEFAULT '[]',
        original_redacted_text TEXT NOT NULL DEFAULT '',
        sanitized_text TEXT NOT NULL DEFAULT '',
        reason TEXT NOT NULL DEFAULT '',
        confidence DOUBLE PRECISION NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_context_leakage_events_scope
        ON context_leakage_events(tenant_id, org_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_context_leakage_events_trace
        ON context_leakage_events(trace_id, session_id, run_id, created_at DESC);
    `);
    this.initialized = true;
  }

  async saveDocuments({ tenantId = "", orgId = "", createdBy = "", policyMode = "strict", documents = [] } = {}) {
    if (!this.pool) {
      throw new Error("ContextLeakageStore is not configured");
    }
    await this.initialize();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const saved = [];
      for (const document of documents) {
        const documentId = `cld-${randomUUID()}`;
        const createdAt = nowIso();
        const contentText = Buffer.isBuffer(document.content)
          ? document.content.toString("utf8")
          : String(document.content ?? "");
        await client.query(`
          INSERT INTO context_leakage_documents (
            document_id, tenant_id, org_id, file_name, content_type, size_bytes, content_text,
            policy_mode, is_active, created_by, created_at, updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE,$9,$10,$10)
        `, [
          documentId,
          tenantId,
          orgId,
          document.name || "unnamed",
          document.type || "text/plain",
          Number(document.size || Buffer.byteLength(contentText, "utf8")),
          contentText,
          policyMode,
          createdBy || "system",
          createdAt,
        ]);

        const entities = extractLeakageEntitiesFromText(contentText, {
          documentId,
          policyMode,
          createdAt,
        });

        for (const entity of entities) {
          await client.query(`
            INSERT INTO context_leakage_entities (
              entity_id, document_id, tenant_id, org_id, category, value_text, normalized_value,
              display_text, replacement_strategy, replacement_value, action, severity, metadata_json,
              policy_mode, is_active, created_at, updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,TRUE,$15,$15)
          `, [
            entity.entityId,
            documentId,
            tenantId,
            orgId,
            entity.category,
            entity.valueText,
            entity.normalizedValue,
            entity.displayText,
            entity.replacementStrategy,
            entity.replacementValue,
            entity.action,
            entity.severity,
            JSON.stringify(entity.metadata ?? {}),
            policyMode,
            createdAt,
          ]);
        }

        saved.push({
          document: {
            documentId,
            tenantId,
            orgId,
            fileName: document.name || "unnamed",
            contentType: document.type || "text/plain",
            sizeBytes: Number(document.size || Buffer.byteLength(contentText, "utf8")),
            policyMode,
            isActive: true,
            createdBy: createdBy || "system",
            createdAt,
            updatedAt: createdAt,
          },
          entities,
        });
      }
      await client.query("COMMIT");
      return saved;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async listDocuments({ tenantId = "", orgId = "" } = {}) {
    if (!this.pool) return [];
    await this.initialize();
    const result = await this.pool.query(`
      SELECT *
        FROM context_leakage_documents
       WHERE tenant_id = $1
         AND org_id = $2
       ORDER BY created_at DESC
    `, [tenantId, orgId]);
    return result.rows.map(asDocumentRecord);
  }

  async getDocument(documentId, { tenantId = "", orgId = "" } = {}) {
    if (!this.pool) return null;
    await this.initialize();
    const result = await this.pool.query(`
      SELECT *
        FROM context_leakage_documents
       WHERE document_id = $1
         AND tenant_id = $2
         AND org_id = $3
       LIMIT 1
    `, [documentId, tenantId, orgId]);
    if (result.rows.length === 0) {
      return null;
    }
    const document = asDocumentRecord(result.rows[0]);
    const entities = await this.listEntities({ tenantId, orgId, documentId });
    return { ...document, entities };
  }

  async deleteDocument(documentId, { tenantId = "", orgId = "" } = {}) {
    if (!this.pool) return false;
    await this.initialize();
    const result = await this.pool.query(`
      DELETE FROM context_leakage_documents
       WHERE document_id = $1
         AND tenant_id = $2
         AND org_id = $3
       RETURNING document_id
    `, [documentId, tenantId, orgId]);
    return result.rows.length > 0;
  }

  async listEntities({ tenantId = "", orgId = "", documentId = "", activeOnly = false } = {}) {
    if (!this.pool) return [];
    await this.initialize();
    const result = await this.pool.query(`
      SELECT *
        FROM context_leakage_entities
       WHERE tenant_id = $1
         AND org_id = $2
         AND ($3 = '' OR document_id = $3)
         AND ($4 = FALSE OR is_active = TRUE)
       ORDER BY updated_at DESC
    `, [tenantId, orgId, documentId, activeOnly === true]);
    return result.rows.map(asEntityRecord);
  }

  async setEntityMode(entityId, { tenantId = "", orgId = "", policyMode = "", isActive } = {}) {
    if (!this.pool) {
      throw new Error("ContextLeakageStore is not configured");
    }
    await this.initialize();
    const updates = [];
    const values = [entityId, tenantId, orgId];
    let index = 4;
    if (policyMode) {
      updates.push(`policy_mode = $${index++}`);
      values.push(policyMode);
    }
    if (typeof isActive === "boolean") {
      updates.push(`is_active = $${index++}`);
      values.push(isActive);
    }
    updates.push(`updated_at = $${index++}`);
    values.push(nowIso());
    const result = await this.pool.query(`
      UPDATE context_leakage_entities
         SET ${updates.join(", ")}
       WHERE entity_id = $1
         AND tenant_id = $2
         AND org_id = $3
       RETURNING *
    `, values);
    return result.rows.length > 0 ? asEntityRecord(result.rows[0]) : null;
  }

  async getActiveEntities({ tenantId = "", orgId = "" } = {}) {
    return this.listEntities({ tenantId, orgId, activeOnly: true });
  }

  async recordEvent(input = {}) {
    if (!this.pool) return null;
    await this.initialize();
    const eventId = input.eventId || `cle-${randomUUID()}`;
    const createdAt = input.createdAt || nowIso();
    await this.pool.query(`
      INSERT INTO context_leakage_events (
        event_id, tenant_id, org_id, session_id, run_id, trace_id, tool_name,
        direction, action, blocked, document_id, entity_ids_json,
        original_redacted_text, sanitized_text, reason, confidence, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
    `, [
      eventId,
      input.tenantId || "",
      input.orgId || "",
      input.sessionId || "",
      input.runId || "",
      input.traceId || "",
      input.toolName || "",
      input.direction || "",
      input.action || "",
      input.blocked === true,
      input.documentId || "",
      JSON.stringify(Array.isArray(input.entityIds) ? input.entityIds : []),
      input.originalRedactedText || "",
      input.sanitizedText || "",
      input.reason || "",
      Number(input.confidence || 0),
      createdAt,
    ]);
    return eventId;
  }

  async listEvents({ tenantId = "", orgId = "", limit = 50 } = {}) {
    if (!this.pool) return [];
    await this.initialize();
    const result = await this.pool.query(`
      SELECT *
        FROM context_leakage_events
       WHERE tenant_id = $1
         AND org_id = $2
       ORDER BY created_at DESC
       LIMIT $3
    `, [tenantId, orgId, Math.max(1, Math.min(Number(limit || 50), 200))]);
    return result.rows.map(asEventRecord);
  }

  async destroy() {
    if (this.pool && this.ownsPool) {
      await this.pool.end();
    }
    if (this.ownsPool) {
      this.pool = null;
    }
    this.initialized = false;
  }
}
