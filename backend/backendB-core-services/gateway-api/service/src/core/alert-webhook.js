/**
 * alert-webhook.js
 *
 * Push-based alerting via webhooks for SLO breaches, dangerous approvals,
 * break-glass events, and audit delivery failures.
 */
import { randomUUID } from "node:crypto";
import { mapleLog } from "../logging.js";

let _database = null;

const ALERT_TYPES = [
  "slo_breach",
  "dangerous_approval",
  "break_glass",
  "audit_delivery_failure",
  "rate_limit_exceeded",
  "escalation_triggered",
  "policy_violation",
];

function hasPool(database) {
  return Boolean(database && typeof database.pool?.query === "function");
}

function nowIso() {
  return new Date().toISOString();
}

/**
 * Configure the alert webhook module.
 */
export function configureAlertWebhook(options = {}) {
  if (options.database) {
    _database = options.database;
  }
}

/**
 * Ensure the webhook tables exist.
 */
export async function ensureAlertWebhookTables(database) {
  const db = database ?? _database;
  if (!hasPool(db)) return;
  await db.pool.query(`
    CREATE TABLE IF NOT EXISTS modifier_alert_webhooks (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      org_id TEXT NOT NULL DEFAULT '',
      webhook_url TEXT NOT NULL,
      secret TEXT NOT NULL DEFAULT '',
      alert_types_json TEXT NOT NULL DEFAULT '[]',
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      created_by TEXT NOT NULL DEFAULT 'system'
    );
    CREATE INDEX IF NOT EXISTS idx_alert_webhooks_tenant
      ON modifier_alert_webhooks(tenant_id, org_id, enabled);

    CREATE TABLE IF NOT EXISTS modifier_alert_delivery_log (
      id TEXT PRIMARY KEY,
      webhook_id TEXT NOT NULL,
      alert_type TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending',
      status_code INTEGER,
      response_body TEXT,
      created_at TEXT NOT NULL,
      delivered_at TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_alert_delivery_webhook
      ON modifier_alert_delivery_log(webhook_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_alert_delivery_status
      ON modifier_alert_delivery_log(status, created_at ASC);
  `);
}

/**
 * Register an alert webhook for a tenant/org.
 */
export async function registerAlertWebhook(input, options = {}) {
  const db = options.database ?? _database;
  const id = `awh-${randomUUID()}`;
  const now = nowIso();

  const alertTypes = Array.isArray(input.alertTypes)
    ? input.alertTypes.filter((t) => ALERT_TYPES.includes(t))
    : [...ALERT_TYPES];

  const record = {
    id,
    tenantId: String(input.tenantId ?? ""),
    orgId: String(input.orgId ?? ""),
    webhookUrl: String(input.webhookUrl ?? ""),
    secret: String(input.secret ?? ""),
    alertTypes,
    enabled: input.enabled !== false,
    createdAt: now,
    updatedAt: now,
    createdBy: String(input.createdBy ?? "system"),
  };

  if (!record.webhookUrl) {
    throw new Error("webhookUrl is required.");
  }

  if (hasPool(db)) {
    await db.pool.query(
      `INSERT INTO modifier_alert_webhooks (id, tenant_id, org_id, webhook_url, secret, alert_types_json, enabled, created_at, updated_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, $9)`,
      [id, record.tenantId, record.orgId, record.webhookUrl, record.secret, JSON.stringify(alertTypes), record.enabled, now, record.createdBy]
    );
  }

  return record;
}

/**
 * List webhooks for a tenant.
 */
export async function listAlertWebhooks(tenantId, options = {}) {
  const db = options.database ?? _database;
  if (!hasPool(db)) return [];
  const result = await db.pool.query(
    `SELECT id, tenant_id, org_id, webhook_url, alert_types_json, enabled, created_at, updated_at, created_by
     FROM modifier_alert_webhooks WHERE tenant_id = $1 ORDER BY created_at DESC`,
    [tenantId]
  );
  return result.rows.map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    orgId: row.org_id,
    webhookUrl: row.webhook_url,
    alertTypes: JSON.parse(row.alert_types_json || "[]"),
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
  }));
}

/**
 * Delete a webhook.
 */
export async function deleteAlertWebhook(webhookId, options = {}) {
  const db = options.database ?? _database;
  if (!hasPool(db)) return;
  // Always scope by tenantId to prevent cross-tenant deletion.
  // An empty tenantId matches only webhooks that were created without a tenant.
  const tenantId = options.tenantId ?? "";
  await db.pool.query(
    `DELETE FROM modifier_alert_webhooks WHERE id = $1 AND tenant_id = $2`,
    [webhookId, tenantId]
  );
}

/**
 * Dispatch an alert to all matching webhooks for a tenant.
 */
export async function dispatchAlert(tenantId, orgId, alertType, payload, options = {}) {
  const db = options.database ?? _database;
  if (!hasPool(db)) {
    mapleLog("warn", "alert_webhook.no_database", { alertType, tenantId });
    return { dispatched: 0 };
  }

  const webhooks = await db.pool.query(
    `SELECT id, webhook_url, secret, alert_types_json
     FROM modifier_alert_webhooks
     WHERE tenant_id = $1 AND enabled = TRUE AND (org_id = '' OR org_id = $2)`,
    [tenantId, orgId ?? ""]
  );

  let dispatched = 0;
  for (const row of webhooks.rows) {
    const types = JSON.parse(row.alert_types_json || "[]");
    if (types.length > 0 && !types.includes(alertType)) continue;

    const deliveryId = `adl-${randomUUID()}`;
    const now = nowIso();
    const alertPayload = {
      alertType,
      tenantId,
      orgId: orgId ?? "",
      timestamp: now,
      ...payload,
    };

    // Record the delivery attempt
    await db.pool.query(
      `INSERT INTO modifier_alert_delivery_log (id, webhook_id, alert_type, payload_json, status, created_at, attempts)
       VALUES ($1, $2, $3, $4, 'pending', $5, 0)`,
      [deliveryId, row.id, alertType, JSON.stringify(alertPayload), now]
    );

    // Fire-and-forget HTTP POST
    deliverWebhook(row.webhook_url, row.secret, alertPayload, deliveryId, db).catch((err) => {
      mapleLog("warn", "alert_webhook.delivery_failed", {
        webhookId: row.id,
        deliveryId,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    dispatched++;
  }

  return { dispatched };
}

async function deliverWebhook(url, secret, payload, deliveryId, db) {
  const headers = {
    "Content-Type": "application/json",
    "X-Maple-Alert-Type": payload.alertType ?? "",
    "X-Maple-Delivery-Id": deliveryId,
    // B2: Trace context propagation for webhook dispatches
    "X-Trace-Id": payload.traceId ?? "",
    "X-Span-Id": payload.spanId ?? "",
  };

  if (secret) {
    const { createHmac } = await import("node:crypto");
    const body = JSON.stringify(payload);
    const sig = createHmac("sha256", secret).update(body).digest("hex");
    headers["X-Maple-Signature"] = sig;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (hasPool(db)) {
      await db.pool.query(
        `UPDATE modifier_alert_delivery_log
         SET status = $2, status_code = $3, delivered_at = $4, attempts = attempts + 1
         WHERE id = $1`,
        [
          deliveryId,
          response.ok ? "delivered" : "failed",
          response.status,
          nowIso(),
        ]
      );
    }
  } catch (err) {
    if (hasPool(db)) {
      await db.pool.query(
        `UPDATE modifier_alert_delivery_log
         SET status = 'failed', last_error = $2, attempts = attempts + 1
         WHERE id = $1`,
        [deliveryId, err instanceof Error ? err.message : String(err)]
      );
    }
    throw err;
  }
}

/**
 * Get alert delivery status for a webhook.
 */
export async function getAlertDeliveryLog(webhookId, options = {}) {
  const db = options.database ?? _database;
  if (!hasPool(db)) return [];

  // Always verify webhook belongs to caller's tenant before returning delivery log.
  const tenantId = options.tenantId ?? "";
  const ownerCheck = await db.pool.query(
    `SELECT 1 FROM modifier_alert_webhooks WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
    [webhookId, tenantId]
  );
  if (ownerCheck.rows.length === 0) return [];

  const limit = Math.max(1, Math.min(200, Number(options.limit) || 50));
  const result = await db.pool.query(
    `SELECT id, webhook_id, alert_type, status, status_code, created_at, delivered_at, attempts, last_error
     FROM modifier_alert_delivery_log WHERE webhook_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [webhookId, limit]
  );
  return result.rows.map((row) => ({
    id: row.id,
    webhookId: row.webhook_id,
    alertType: row.alert_type,
    status: row.status,
    statusCode: row.status_code,
    createdAt: row.created_at,
    deliveredAt: row.delivered_at,
    attempts: Number(row.attempts),
    lastError: row.last_error,
  }));
}
