import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  cyberEvidenceSyncTtlMs,
  cyberQuarantineStorageDir,
  downloadScanProvider,
  downloadScanTimeoutMs,
  downloadScanVirusTotalApiKey,
  downloadScanVirusTotalApiUrl,
} from "../config.js";
import { replayAuditEvents } from "./audit-outbox.js";
import { appendToAuditChain } from "./audit-integrity.js";
import { buildLocalScanResult, scanDownloadedContent } from "../../../../shared/packages/maple-security/src/download-scan.js";

const ACTIVE_INCIDENT_STATES = new Set(["new", "triaged", "in_progress", "contained"]);
const MATERIALIZE_HIGH_WATER_MARK = {
  running: null,
  completedAt: 0,
};

const MEMORY_STATE = {
  incidents: new Map(),
  evidence: new Map(),
  quarantine: new Map(),
  suppressions: new Map(),
  actions: [],
};

function hasPersistentStore(database) {
  return Boolean(database?.pool && typeof database.pool.query === "function" && typeof database.pool.connect === "function");
}

function nowIso() {
  return new Date().toISOString();
}

function asString(value, fallback = "") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function parseJson(raw, fallback) {
  if (typeof raw !== "string") {
    return raw && typeof raw === "object" ? raw : fallback;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function toInt(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function buildId(prefix, input) {
  const digest = createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 24);
  return `${prefix}-${digest}`;
}

function eventSourceService(entry = {}) {
  return asString(entry?.event?.sourceService || entry?.sourceService || "");
}

function normalizeScan(scan, fallback = {}) {
  const source = asObject(scan);
  const base = asObject(fallback);
  return {
    provider: asString(source.provider, asString(base.provider, "unknown")),
    status: asString(source.status, asString(base.status, "missing")),
    verdict: asString(source.verdict, asString(base.verdict, "unknown")),
    sha256: asString(source.sha256, asString(base.sha256)),
    contentType: asString(source.contentType, asString(base.contentType, "application/octet-stream")),
    sizeBytes: toInt(source.sizeBytes ?? base.sizeBytes ?? 0, 0),
    reasons: [...new Set([...asArray(source.reasons), ...asArray(base.reasons)].map((value) => asString(value)).filter(Boolean))],
    checkedAt: asString(source.checkedAt, asString(base.checkedAt)),
    blocked: Boolean(source.blocked ?? base.blocked),
    quarantined: Boolean(source.quarantined ?? base.quarantined),
  };
}

function artifactFilename(artifact = {}) {
  const artifactType = asString(artifact.artifactType, "artifact");
  if (artifact.filename) return asString(artifact.filename);
  if (artifact.contentType === "text/plain" || typeof artifact.content === "string") return `${artifactType}.txt`;
  return `${artifactType}.json`;
}

function normalizeArtifactRecord(run, artifact, index) {
  const scan = normalizeScan(artifact?.scan, {
    provider: "unknown",
    status: "missing",
    verdict: "unknown",
    reasons: ["Artifact scan missing"],
    contentType: artifact?.contentType ?? (typeof artifact?.content === "string" ? "text/plain" : "application/json"),
  });
  return {
    id: `artifact-${run.runId}-${index}-${buildId("record", { runId: run.runId, index, sha256: scan.sha256 || artifact?.artifactType || "artifact" })}`,
    source: "artifact",
    traceId: asString(artifact?.traceId),
    sessionId: asString(run.sessionId),
    runId: asString(run.runId),
    url: asString(artifact?.url),
    filename: artifactFilename(artifact),
    contentType: scan.contentType,
    sizeBytes: toInt(scan.sizeBytes ?? 0),
    createdAt: asString(artifact?.createdAt, asString(run.updatedAt || run.createdAt)),
    policyReason: asString(artifact?.policyReason, scan.reasons[0] ?? ""),
    eventType: "artifact_scan",
    summary: `${artifact?.artifactType || "artifact"} scanned for run ${run.runId}`,
    severity: scan.quarantined || scan.blocked || scan.verdict === "malicious" ? "RISK_SEVERITY_HIGH" : "RISK_SEVERITY_LOW",
    scan,
    metadata: {
      artifactType: asString(artifact?.artifactType, "artifact"),
      parentRunId: asString(run.parentRunId),
      rawArtifact: artifact,
    },
  };
}

function normalizeAuditDownloadRecord(entry) {
  const event = asObject(entry?.event);
  const payload = asObject(event.payload ?? event.payloadJson);
  const scan = normalizeScan(payload.scan, {
    contentType: payload.contentType,
    sizeBytes: payload.sizeBytes,
    reasons: [...asArray(payload.threats), asString(payload.reason), asString(payload.quarantineReason)].filter(Boolean),
    quarantined: asString(event.summary).toLowerCase().includes("quarantined"),
  });
  const summary = asString(event.summary, "Cyber event");
  const url = asString(payload.url || payload.sourceUrl);
  return {
    id: `audit-${asString(entry.outboxId, buildId("audit", { createdAt: entry.createdAt, summary, url }))}`,
    source: "proxy_download",
    traceId: asString(event.traceId || event.context?.traceId || payload.traceId),
    sessionId: asString(event.context?.sessionId || payload.sessionId),
    runId: asString(payload.runId),
    url,
    filename: asString(payload.filename),
    contentType: asString(scan.contentType),
    sizeBytes: toInt(scan.sizeBytes ?? 0),
    createdAt: asString(entry.createdAt || event.timestamp),
    policyReason: asString(payload.reason || payload.quarantineReason || summary),
    eventType: asString(event.eventType),
    summary,
    severity: asString(event.severity, "RISK_SEVERITY_LOW"),
    sourceService: eventSourceService(entry),
    scan,
    metadata: {
      outboxId: asString(entry.outboxId),
      status: asString(entry.status),
      attempts: toInt(entry.attempts ?? 0),
      lastError: asString(entry.lastError),
      toolName: asString(payload.toolName),
      appId: asString(payload.appId),
      resolvedIp: asString(payload.resolvedIp),
      scopedMaxBytes: payload.scopedMaxBytes ?? null,
      tenantId: asString(payload.tenantId || event.tenantId),
      orgId: asString(payload.orgId || event.orgId),
      userId: asString(payload.userId || event.userId),
    },
  };
}

function correlationKeyForRecord(record) {
  return [
    asString(record.scan?.sha256),
    asString(record.url),
    asString(record.traceId),
    asString(record.runId),
    asString(record.filename),
  ].filter(Boolean).join("|");
}

function shouldOpenIncident(record) {
  const verdict = asString(record.scan?.verdict).toLowerCase();
  return Boolean(record.scan?.blocked || record.scan?.quarantined || verdict === "malicious" || verdict === "quarantined");
}

function incidentPriorityForRecord(record) {
  return shouldOpenIncident(record) ? "high" : "medium";
}

function incidentTitleForRecord(record) {
  return record.source === "artifact"
    ? `Artifact review required: ${record.filename || record.id}`
    : `Download review required: ${record.filename || record.url || record.id}`;
}

function recordToEvidence(record, options = {}) {
  const tenantId = asString(options.tenantId || record.metadata?.tenantId);
  const orgId = asString(options.orgId || record.metadata?.orgId);
  return {
    evidenceId: buildId("evidence", { source: record.source, id: record.id }),
    tenantId,
    orgId,
    source: asString(record.source),
    externalId: asString(record.id),
    traceId: asString(record.traceId),
    sessionId: asString(record.sessionId),
    runId: asString(record.runId),
    url: asString(record.url),
    filename: asString(record.filename),
    contentType: asString(record.contentType),
    sizeBytes: toInt(record.sizeBytes, 0),
    sha256: asString(record.scan?.sha256),
    policyReason: asString(record.policyReason),
    request: {},
    response: {},
    metadata: asObject(record.metadata),
    scan: normalizeScan(record.scan),
    provenance: {
      eventType: asString(record.eventType),
      summary: asString(record.summary),
      severity: asString(record.severity),
      sourceService: asString(record.sourceService),
      createdAt: asString(record.createdAt),
    },
    objectRef: "",
    storagePath: "",
    createdAt: asString(record.createdAt, nowIso()),
    updatedAt: nowIso(),
    lastSeenAt: nowIso(),
    archivedAt: null,
    legalHold: false,
  };
}

function toSqlIncident(row) {
  return {
    incidentId: row.incident_id,
    tenantId: row.tenant_id,
    orgId: row.org_id,
    correlationKey: row.correlation_key,
    title: row.title,
    summary: row.summary,
    severity: row.severity,
    priority: row.priority,
    state: row.state,
    disposition: row.disposition,
    escalationState: row.escalation_state,
    ownerId: row.owner_id,
    linkedCaseId: row.linked_case_id,
    tags: parseJson(row.tags_json, []),
    correlation: parseJson(row.correlation_json, {}),
    evidenceIds: parseJson(row.evidence_ids_json, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    detectedAt: row.detected_at,
    resolvedAt: row.resolved_at,
    closedAt: row.closed_at,
    legalHold: row.legal_hold === true || row.legal_hold === "true",
  };
}

function toSqlEvidence(row) {
  return {
    evidenceId: row.evidence_id,
    tenantId: row.tenant_id,
    orgId: row.org_id,
    incidentId: row.incident_id,
    source: row.source,
    externalId: row.external_id,
    traceId: row.trace_id,
    sessionId: row.session_id,
    runId: row.run_id,
    url: row.url,
    filename: row.filename,
    contentType: row.content_type,
    sizeBytes: toInt(row.size_bytes),
    sha256: row.sha256,
    policyReason: row.policy_reason,
    request: parseJson(row.request_json, {}),
    response: parseJson(row.response_json, {}),
    metadata: parseJson(row.metadata_json, {}),
    scan: normalizeScan(parseJson(row.scan_json, {})),
    provenance: parseJson(row.provenance_json, {}),
    objectRef: row.object_ref,
    storagePath: row.storage_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSeenAt: row.last_seen_at,
    archivedAt: row.archived_at,
    legalHold: row.legal_hold === true || row.legal_hold === "true",
  };
}

function toSqlQuarantine(row) {
  return {
    quarantineId: row.quarantine_id,
    evidenceId: row.evidence_id,
    tenantId: row.tenant_id,
    orgId: row.org_id,
    source: row.source,
    classification: row.classification,
    currentState: row.current_state,
    reviewStatus: row.review_status,
    releaseDisposition: row.release_disposition,
    objectRef: row.object_ref,
    storagePath: row.storage_path,
    contentType: row.content_type,
    sizeBytes: toInt(row.size_bytes),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by,
    destroyedAt: row.destroyed_at,
    expiresAt: row.expires_at,
    legalHold: row.legal_hold === true || row.legal_hold === "true",
  };
}

function toSqlSuppression(row) {
  return {
    suppressionId: row.suppression_id,
    tenantId: row.tenant_id,
    orgId: row.org_id,
    status: row.status,
    scopeType: row.scope_type,
    scopeValue: row.scope_value,
    provider: row.provider,
    tool: row.tool,
    policyRule: row.policy_rule,
    rationale: row.rationale,
    rollbackPath: row.rollback_path,
    approver: row.approver,
    createdBy: row.created_by,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    revokedBy: row.revoked_by,
    metadata: parseJson(row.metadata_json, {}),
  };
}

function toSqlAction(row) {
  return {
    actionId: row.action_id,
    tenantId: row.tenant_id,
    orgId: row.org_id,
    incidentId: row.incident_id,
    evidenceId: row.evidence_id,
    quarantineId: row.quarantine_id,
    suppressionId: row.suppression_id,
    actionType: row.action_type,
    actorId: row.actor_id,
    summary: row.summary,
    payload: parseJson(row.payload_json, {}),
    createdAt: row.created_at,
  };
}

async function ensureStoragePath() {
  await mkdir(cyberQuarantineStorageDir, { recursive: true });
}

async function persistArtifactBytes(evidence, artifact) {
  const content = artifact?.content;
  if (content === undefined || content === null) return { objectRef: "", storagePath: "" };
  const payload = Buffer.isBuffer(content)
    ? content
    : content instanceof Uint8Array
      ? Buffer.from(content)
      : typeof content === "string"
        ? Buffer.from(content, "utf8")
        : Buffer.from(JSON.stringify(content, null, 2));
  await ensureStoragePath();
  const filename = `${evidence.sha256 || evidence.evidenceId}-${asString(evidence.filename || "artifact").replace(/[^a-zA-Z0-9._-]+/g, "_")}`;
  const storagePath = join(cyberQuarantineStorageDir, filename);
  await mkdir(dirname(storagePath), { recursive: true });
  await writeFile(storagePath, payload);
  return {
    objectRef: `file://${storagePath}`,
    storagePath,
  };
}

async function appendSecurityAction(action, options = {}) {
  const database = options.database;
  const createdAt = action.createdAt ?? nowIso();
  const normalized = {
    actionId: action.actionId ?? `cyber-action-${randomUUID()}`,
    tenantId: asString(action.tenantId),
    orgId: asString(action.orgId),
    incidentId: asString(action.incidentId),
    evidenceId: asString(action.evidenceId),
    quarantineId: asString(action.quarantineId),
    suppressionId: asString(action.suppressionId),
    actionType: asString(action.actionType, "comment"),
    actorId: asString(action.actorId, "gateway-api"),
    summary: asString(action.summary),
    payload: asObject(action.payload),
    createdAt,
  };

  if (hasPersistentStore(database)) {
    await database.pool.query(
      `INSERT INTO cyber_security_actions (
         action_id, tenant_id, org_id, incident_id, evidence_id, quarantine_id, suppression_id, action_type, actor_id, summary, payload_json, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (action_id) DO NOTHING`,
      [
        normalized.actionId,
        normalized.tenantId,
        normalized.orgId,
        normalized.incidentId,
        normalized.evidenceId,
        normalized.quarantineId,
        normalized.suppressionId,
        normalized.actionType,
        normalized.actorId,
        normalized.summary,
        JSON.stringify(normalized.payload),
        normalized.createdAt,
      ],
    );
  } else {
    MEMORY_STATE.actions.push(normalized);
  }

  if (hasPersistentStore(database)) {
    const appended = await appendToAuditChain({
      eventId: normalized.actionId,
      eventType: `CYBER_SECURITY_${normalized.actionType.toUpperCase()}`,
      timestamp: normalized.createdAt,
      sourceService: "gateway-api",
      tenantId: normalized.tenantId,
      orgId: normalized.orgId,
      userId: normalized.actorId,
      severity: "RISK_SEVERITY_LOW",
      summary: normalized.summary,
      payload: normalized.payload,
    }, { database });

    if (appended?.appended !== true) {
      throw new Error("Unable to append security action to audit chain.");
    }
  }
  return normalized;
}

async function findOpenIncidentByCorrelation(correlationKey, scope, options = {}) {
  if (!correlationKey) return null;
  const database = options.database;
  if (hasPersistentStore(database)) {
    const result = await database.pool.query(
      `SELECT *
         FROM cyber_security_incidents
        WHERE tenant_id = $1
          AND org_id = $2
          AND correlation_key = $3
          AND state = ANY($4::text[])
        ORDER BY updated_at DESC
        LIMIT 1`,
      [scope.tenantId, scope.orgId, correlationKey, [...ACTIVE_INCIDENT_STATES]],
    );
    return result.rows.length > 0 ? toSqlIncident(result.rows[0]) : null;
  }
  const item = [...MEMORY_STATE.incidents.values()].find((incident) => (
    incident.tenantId === scope.tenantId &&
    incident.orgId === scope.orgId &&
    incident.correlationKey === correlationKey &&
    ACTIVE_INCIDENT_STATES.has(incident.state)
  ));
  return item ?? null;
}

async function upsertIncident(incident, options = {}) {
  const database = options.database;
  const normalized = {
    incidentId: incident.incidentId ?? `incident-${randomUUID()}`,
    tenantId: asString(incident.tenantId),
    orgId: asString(incident.orgId),
    correlationKey: asString(incident.correlationKey),
    title: asString(incident.title),
    summary: asString(incident.summary),
    severity: asString(incident.severity, "RISK_SEVERITY_LOW"),
    priority: asString(incident.priority, "medium"),
    state: asString(incident.state, "new"),
    disposition: asString(incident.disposition),
    escalationState: asString(incident.escalationState, "none"),
    ownerId: asString(incident.ownerId),
    linkedCaseId: asString(incident.linkedCaseId),
    tags: asArray(incident.tags),
    correlation: asObject(incident.correlation),
    evidenceIds: [...new Set(asArray(incident.evidenceIds).map((value) => asString(value)).filter(Boolean))],
    createdAt: asString(incident.createdAt, nowIso()),
    updatedAt: asString(incident.updatedAt, nowIso()),
    detectedAt: asString(incident.detectedAt, asString(incident.createdAt, nowIso())),
    resolvedAt: incident.resolvedAt ?? null,
    closedAt: incident.closedAt ?? null,
    legalHold: incident.legalHold === true,
  };

  if (hasPersistentStore(database)) {
    const result = await database.pool.query(
      `INSERT INTO cyber_security_incidents (
         incident_id, tenant_id, org_id, correlation_key, title, summary, severity, priority, state, disposition,
         escalation_state, owner_id, linked_case_id, tags_json, correlation_json, evidence_ids_json, created_at, updated_at,
         detected_at, resolved_at, closed_at, legal_hold
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11, $12, $13, $14, $15, $16, $17, $18,
         $19, $20, $21, $22
       )
       ON CONFLICT (incident_id) DO UPDATE SET
         title = EXCLUDED.title,
         summary = EXCLUDED.summary,
         severity = EXCLUDED.severity,
         priority = EXCLUDED.priority,
         state = EXCLUDED.state,
         disposition = EXCLUDED.disposition,
         escalation_state = EXCLUDED.escalation_state,
         owner_id = EXCLUDED.owner_id,
         linked_case_id = EXCLUDED.linked_case_id,
         tags_json = EXCLUDED.tags_json,
         correlation_json = EXCLUDED.correlation_json,
         evidence_ids_json = EXCLUDED.evidence_ids_json,
         updated_at = EXCLUDED.updated_at,
         detected_at = EXCLUDED.detected_at,
         resolved_at = EXCLUDED.resolved_at,
         closed_at = EXCLUDED.closed_at,
         legal_hold = EXCLUDED.legal_hold
       RETURNING *`,
      [
        normalized.incidentId,
        normalized.tenantId,
        normalized.orgId,
        normalized.correlationKey,
        normalized.title,
        normalized.summary,
        normalized.severity,
        normalized.priority,
        normalized.state,
        normalized.disposition,
        normalized.escalationState,
        normalized.ownerId,
        normalized.linkedCaseId,
        JSON.stringify(normalized.tags),
        JSON.stringify(normalized.correlation),
        JSON.stringify(normalized.evidenceIds),
        normalized.createdAt,
        normalized.updatedAt,
        normalized.detectedAt,
        normalized.resolvedAt,
        normalized.closedAt,
        normalized.legalHold,
      ],
    );
    return toSqlIncident(result.rows[0]);
  }
  MEMORY_STATE.incidents.set(normalized.incidentId, normalized);
  return normalized;
}

async function upsertEvidence(evidence, options = {}) {
  const database = options.database;
  const normalized = {
    evidenceId: evidence.evidenceId ?? `evidence-${randomUUID()}`,
    tenantId: asString(evidence.tenantId),
    orgId: asString(evidence.orgId),
    incidentId: asString(evidence.incidentId),
    source: asString(evidence.source),
    externalId: asString(evidence.externalId),
    traceId: asString(evidence.traceId),
    sessionId: asString(evidence.sessionId),
    runId: asString(evidence.runId),
    url: asString(evidence.url),
    filename: asString(evidence.filename),
    contentType: asString(evidence.contentType, "application/octet-stream"),
    sizeBytes: toInt(evidence.sizeBytes, 0),
    sha256: asString(evidence.sha256),
    policyReason: asString(evidence.policyReason),
    request: asObject(evidence.request),
    response: asObject(evidence.response),
    metadata: asObject(evidence.metadata),
    scan: normalizeScan(evidence.scan),
    provenance: asObject(evidence.provenance),
    objectRef: asString(evidence.objectRef),
    storagePath: asString(evidence.storagePath),
    createdAt: asString(evidence.createdAt, nowIso()),
    updatedAt: asString(evidence.updatedAt, nowIso()),
    lastSeenAt: asString(evidence.lastSeenAt, nowIso()),
    archivedAt: evidence.archivedAt ?? null,
    legalHold: evidence.legalHold === true,
  };
  if (hasPersistentStore(database)) {
    const result = await database.pool.query(
      `INSERT INTO cyber_security_evidence (
         evidence_id, tenant_id, org_id, incident_id, source, external_id, trace_id, session_id, run_id, url,
         filename, content_type, size_bytes, sha256, policy_reason, request_json, response_json, metadata_json,
         scan_json, provenance_json, object_ref, storage_path, created_at, updated_at, last_seen_at, archived_at, legal_hold
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11, $12, $13, $14, $15, $16, $17, $18,
         $19, $20, $21, $22, $23, $24, $25, $26, $27
       )
       ON CONFLICT (evidence_id) DO UPDATE SET
         incident_id = EXCLUDED.incident_id,
         trace_id = EXCLUDED.trace_id,
         session_id = EXCLUDED.session_id,
         run_id = EXCLUDED.run_id,
         url = EXCLUDED.url,
         filename = EXCLUDED.filename,
         content_type = EXCLUDED.content_type,
         size_bytes = EXCLUDED.size_bytes,
         sha256 = EXCLUDED.sha256,
         policy_reason = EXCLUDED.policy_reason,
         request_json = EXCLUDED.request_json,
         response_json = EXCLUDED.response_json,
         metadata_json = EXCLUDED.metadata_json,
         scan_json = EXCLUDED.scan_json,
         provenance_json = EXCLUDED.provenance_json,
         object_ref = CASE WHEN cyber_security_evidence.object_ref = '' THEN EXCLUDED.object_ref ELSE cyber_security_evidence.object_ref END,
         storage_path = CASE WHEN cyber_security_evidence.storage_path = '' THEN EXCLUDED.storage_path ELSE cyber_security_evidence.storage_path END,
         updated_at = EXCLUDED.updated_at,
         last_seen_at = EXCLUDED.last_seen_at,
         archived_at = EXCLUDED.archived_at,
         legal_hold = EXCLUDED.legal_hold
       RETURNING *`,
      [
        normalized.evidenceId,
        normalized.tenantId,
        normalized.orgId,
        normalized.incidentId,
        normalized.source,
        normalized.externalId,
        normalized.traceId,
        normalized.sessionId,
        normalized.runId,
        normalized.url,
        normalized.filename,
        normalized.contentType,
        normalized.sizeBytes,
        normalized.sha256,
        normalized.policyReason,
        JSON.stringify(normalized.request),
        JSON.stringify(normalized.response),
        JSON.stringify(normalized.metadata),
        JSON.stringify(normalized.scan),
        JSON.stringify(normalized.provenance),
        normalized.objectRef,
        normalized.storagePath,
        normalized.createdAt,
        normalized.updatedAt,
        normalized.lastSeenAt,
        normalized.archivedAt,
        normalized.legalHold,
      ],
    );
    return toSqlEvidence(result.rows[0]);
  }
  MEMORY_STATE.evidence.set(normalized.evidenceId, normalized);
  return normalized;
}

async function upsertQuarantine(quarantine, options = {}) {
  const database = options.database;
  const normalized = {
    quarantineId: quarantine.quarantineId ?? `quarantine-${randomUUID()}`,
    evidenceId: asString(quarantine.evidenceId),
    tenantId: asString(quarantine.tenantId),
    orgId: asString(quarantine.orgId),
    source: asString(quarantine.source),
    classification: asString(quarantine.classification, "unknown"),
    currentState: asString(quarantine.currentState, "pending_review"),
    reviewStatus: asString(quarantine.reviewStatus, "pending"),
    releaseDisposition: asString(quarantine.releaseDisposition),
    objectRef: asString(quarantine.objectRef),
    storagePath: asString(quarantine.storagePath),
    contentType: asString(quarantine.contentType, "application/octet-stream"),
    sizeBytes: toInt(quarantine.sizeBytes, 0),
    createdAt: asString(quarantine.createdAt, nowIso()),
    updatedAt: asString(quarantine.updatedAt, nowIso()),
    reviewedAt: quarantine.reviewedAt ?? null,
    reviewedBy: asString(quarantine.reviewedBy),
    destroyedAt: quarantine.destroyedAt ?? null,
    expiresAt: quarantine.expiresAt ?? null,
    legalHold: quarantine.legalHold === true,
  };
  if (hasPersistentStore(database)) {
    const result = await database.pool.query(
      `INSERT INTO cyber_security_quarantine_objects (
         quarantine_id, evidence_id, tenant_id, org_id, source, classification, current_state, release_disposition,
         review_status, object_ref, storage_path, content_type, size_bytes, created_at, updated_at, reviewed_at,
         reviewed_by, destroyed_at, expires_at, legal_hold
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8,
         $9, $10, $11, $12, $13, $14, $15, $16,
         $17, $18, $19, $20
       )
       ON CONFLICT (evidence_id) DO UPDATE SET
         classification = EXCLUDED.classification,
         current_state = EXCLUDED.current_state,
         release_disposition = EXCLUDED.release_disposition,
         review_status = EXCLUDED.review_status,
         object_ref = CASE WHEN cyber_security_quarantine_objects.object_ref = '' THEN EXCLUDED.object_ref ELSE cyber_security_quarantine_objects.object_ref END,
         storage_path = CASE WHEN cyber_security_quarantine_objects.storage_path = '' THEN EXCLUDED.storage_path ELSE cyber_security_quarantine_objects.storage_path END,
         content_type = EXCLUDED.content_type,
         size_bytes = EXCLUDED.size_bytes,
         updated_at = EXCLUDED.updated_at,
         reviewed_at = EXCLUDED.reviewed_at,
         reviewed_by = EXCLUDED.reviewed_by,
         destroyed_at = EXCLUDED.destroyed_at,
         expires_at = EXCLUDED.expires_at,
         legal_hold = EXCLUDED.legal_hold
       RETURNING *`,
      [
        normalized.quarantineId,
        normalized.evidenceId,
        normalized.tenantId,
        normalized.orgId,
        normalized.source,
        normalized.classification,
        normalized.currentState,
        normalized.releaseDisposition,
        normalized.reviewStatus,
        normalized.objectRef,
        normalized.storagePath,
        normalized.contentType,
        normalized.sizeBytes,
        normalized.createdAt,
        normalized.updatedAt,
        normalized.reviewedAt,
        normalized.reviewedBy,
        normalized.destroyedAt,
        normalized.expiresAt,
        normalized.legalHold,
      ],
    );
    return toSqlQuarantine(result.rows[0]);
  }
  MEMORY_STATE.quarantine.set(normalized.quarantineId, normalized);
  return normalized;
}

async function ensureIncidentForEvidence(evidence, record, options = {}) {
  if (!shouldOpenIncident(record)) {
    return null;
  }
  const scope = { tenantId: evidence.tenantId, orgId: evidence.orgId };
  const correlationKey = correlationKeyForRecord(record) || evidence.evidenceId;
  const existing = await findOpenIncidentByCorrelation(correlationKey, scope, options);
  const next = existing ?? {
    incidentId: `incident-${randomUUID()}`,
    tenantId: evidence.tenantId,
    orgId: evidence.orgId,
    correlationKey,
    title: incidentTitleForRecord(record),
    summary: asString(record.policyReason || record.summary || "Security review required."),
    severity: asString(record.severity, "RISK_SEVERITY_HIGH"),
    priority: incidentPriorityForRecord(record),
    state: "new",
    disposition: "",
    escalationState: "pending",
    ownerId: "",
    linkedCaseId: "",
    tags: [record.source],
    correlation: {
      traceId: evidence.traceId,
      sessionId: evidence.sessionId,
      runId: evidence.runId,
      url: evidence.url,
      sha256: evidence.sha256,
      source: evidence.source,
    },
    evidenceIds: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
    detectedAt: evidence.createdAt,
    resolvedAt: null,
    closedAt: null,
    legalHold: false,
  };
  next.evidenceIds = [...new Set([...asArray(next.evidenceIds), evidence.evidenceId])];
  next.updatedAt = nowIso();
  return upsertIncident(next, options);
}

async function storeEvidenceAndQuarantine(record, artifact, options = {}) {
  let evidence = recordToEvidence(record, options);
  if (artifact && shouldOpenIncident(record)) {
    const stored = await persistArtifactBytes(evidence, artifact).catch(() => ({ objectRef: "", storagePath: "" }));
    evidence = { ...evidence, objectRef: stored.objectRef, storagePath: stored.storagePath };
  }
  const incident = await ensureIncidentForEvidence(evidence, record, options);
  if (incident) {
    evidence.incidentId = incident.incidentId;
  }
  const persistedEvidence = await upsertEvidence(evidence, options);
  if (incident && !incident.evidenceIds.includes(persistedEvidence.evidenceId)) {
    await upsertIncident({ ...incident, evidenceIds: [...incident.evidenceIds, persistedEvidence.evidenceId], updatedAt: nowIso() }, options);
  }
  let quarantine = null;
  if (shouldOpenIncident(record)) {
    quarantine = await upsertQuarantine({
      evidenceId: persistedEvidence.evidenceId,
      tenantId: persistedEvidence.tenantId,
      orgId: persistedEvidence.orgId,
      source: persistedEvidence.source,
      classification: persistedEvidence.scan.verdict || "unknown",
      currentState: "pending_review",
      reviewStatus: "pending",
      releaseDisposition: "",
      objectRef: persistedEvidence.objectRef,
      storagePath: persistedEvidence.storagePath,
      contentType: persistedEvidence.contentType,
      sizeBytes: persistedEvidence.sizeBytes,
      createdAt: persistedEvidence.createdAt,
      updatedAt: nowIso(),
      legalHold: false,
    }, options);
  }
  return { evidence: persistedEvidence, incident, quarantine };
}

async function listAllOpenClawRuns() {
  const { listOpenClawRuns } = await import("./openclaw-agent-runtime.js");
  const items = [];
  let cursor = "";
  do {
    const page = listOpenClawRuns({ cursor, limit: 100 });
    items.push(...asArray(page.items));
    cursor = asString(page.nextCursor);
  } while (cursor);
  return items;
}

export async function synchronizeCyberSecurityState(options = {}) {
  if (!options.force && MATERIALIZE_HIGH_WATER_MARK.running) {
    return MATERIALIZE_HIGH_WATER_MARK.running;
  }
  if (!options.force && Date.now() - MATERIALIZE_HIGH_WATER_MARK.completedAt < cyberEvidenceSyncTtlMs) {
    return { ok: true, skipped: true };
  }

  const task = (async () => {
    const database = options.database;
    const audit = await replayAuditEvents({
      database,
      tenantId: options.tenantId,
      since: options.since,
      until: options.until,
      limit: Math.max(200, Number(options.limit ?? 1000)),
      offset: 0,
    });

    for (const entry of audit.events ?? []) {
      const record = normalizeAuditDownloadRecord(entry);
      if (!record.scan.status && !record.scan.verdict) continue;
      await storeEvidenceAndQuarantine(record, null, {
        database,
        tenantId: asString(record.metadata?.tenantId),
        orgId: asString(record.metadata?.orgId),
      });
    }

    const runs = await listAllOpenClawRuns();
    for (const run of runs) {
      const { getOpenClawRunArtifacts } = await import("./openclaw-agent-runtime.js");
      const detail = await getOpenClawRunArtifacts(run.runId);
      for (const [index, artifact] of asArray(detail?.artifacts).entries()) {
        const record = normalizeArtifactRecord(run, artifact, index);
        await storeEvidenceAndQuarantine(record, artifact, {
          database,
          tenantId: asString(artifact?.tenantId),
          orgId: asString(artifact?.orgId),
        });
      }
    }

    MATERIALIZE_HIGH_WATER_MARK.completedAt = Date.now();
    return { ok: true };
  })();

  MATERIALIZE_HIGH_WATER_MARK.running = task.finally(() => {
    MATERIALIZE_HIGH_WATER_MARK.running = null;
  });
  return MATERIALIZE_HIGH_WATER_MARK.running;
}

export async function persistRunArtifactsAsEvidence(run, artifacts = [], options = {}) {
  for (const [index, artifact] of asArray(artifacts).entries()) {
    const record = normalizeArtifactRecord(run, artifact, index);
    await storeEvidenceAndQuarantine(record, artifact, options);
  }
}

async function loadActions(filters = {}, options = {}) {
  const database = options.database;
  if (hasPersistentStore(database)) {
    const conditions = [];
    const params = [];
    let cursor = 1;
    if (filters.incidentId) {
      conditions.push(`incident_id = $${cursor++}`);
      params.push(filters.incidentId);
    }
    if (filters.quarantineId) {
      conditions.push(`quarantine_id = $${cursor++}`);
      params.push(filters.quarantineId);
    }
    if (filters.suppressionId) {
      conditions.push(`suppression_id = $${cursor++}`);
      params.push(filters.suppressionId);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await database.pool.query(
      `SELECT * FROM cyber_security_actions ${where} ORDER BY created_at ASC`,
      params,
    );
    return result.rows.map(toSqlAction);
  }
  return MEMORY_STATE.actions
    .filter((action) => (filters.incidentId ? action.incidentId === filters.incidentId : true))
    .filter((action) => (filters.quarantineId ? action.quarantineId === filters.quarantineId : true))
    .filter((action) => (filters.suppressionId ? action.suppressionId === filters.suppressionId : true))
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

export async function listSecurityIncidents(filters = {}, options = {}) {
  await synchronizeCyberSecurityState({ database: options.database, tenantId: filters.tenantId, force: filters.forceSync === true });
  const database = options.database;
  if (hasPersistentStore(database)) {
    const conditions = [];
    const params = [];
    let cursor = 1;
    if (filters.tenantId !== undefined) {
      conditions.push(`tenant_id = $${cursor++}`);
      params.push(filters.tenantId);
    }
    if (filters.orgId !== undefined) {
      conditions.push(`org_id = $${cursor++}`);
      params.push(filters.orgId);
    }
    if (filters.state) {
      conditions.push(`state = $${cursor++}`);
      params.push(filters.state);
    }
    if (filters.ownerId) {
      conditions.push(`owner_id = $${cursor++}`);
      params.push(filters.ownerId);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = Math.max(1, Math.min(200, Number(filters.limit) || 50));
    const offset = Math.max(0, Number(filters.offset) || 0);
    params.push(limit, offset);
    const result = await database.pool.query(
      `SELECT * FROM cyber_security_incidents ${where} ORDER BY updated_at DESC LIMIT $${cursor++} OFFSET $${cursor++}`,
      params,
    );
    const items = result.rows.map(toSqlIncident);
    const totalResult = await database.pool.query(
      `SELECT COUNT(*)::int AS total FROM cyber_security_incidents ${where}`,
      params.slice(0, params.length - 2),
    );
    return {
      items,
      total: Number(totalResult.rows[0]?.total ?? items.length),
      offset,
      nextOffset: offset + items.length < Number(totalResult.rows[0]?.total ?? items.length) ? offset + items.length : null,
    };
  }
  const all = [...MEMORY_STATE.incidents.values()]
    .filter((incident) => (filters.tenantId !== undefined ? incident.tenantId === filters.tenantId : true))
    .filter((incident) => (filters.orgId !== undefined ? incident.orgId === filters.orgId : true))
    .filter((incident) => (filters.state ? incident.state === filters.state : true))
    .filter((incident) => (filters.ownerId ? incident.ownerId === filters.ownerId : true))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  const offset = Math.max(0, Number(filters.offset) || 0);
  const limit = Math.max(1, Math.min(200, Number(filters.limit) || 50));
  return {
    items: all.slice(offset, offset + limit),
    total: all.length,
    offset,
    nextOffset: offset + limit < all.length ? offset + limit : null,
  };
}

export async function getSecurityIncidentById(incidentId, options = {}) {
  const database = options.database;
  await synchronizeCyberSecurityState({ database, force: false });
  let incident;
  if (hasPersistentStore(database)) {
    const result = await database.pool.query(`SELECT * FROM cyber_security_incidents WHERE incident_id = $1 LIMIT 1`, [incidentId]);
    if (result.rows.length === 0) return null;
    incident = toSqlIncident(result.rows[0]);
    const evidenceResult = await database.pool.query(
      `SELECT * FROM cyber_security_evidence WHERE incident_id = $1 ORDER BY created_at DESC`,
      [incidentId],
    );
    const quarantineResult = await database.pool.query(
      `SELECT q.*
         FROM cyber_security_quarantine_objects q
         JOIN cyber_security_evidence e ON e.evidence_id = q.evidence_id
        WHERE e.incident_id = $1
        ORDER BY q.created_at DESC`,
      [incidentId],
    );
    const actions = await loadActions({ incidentId }, options);
    return {
      ...incident,
      evidence: evidenceResult.rows.map(toSqlEvidence),
      quarantine: quarantineResult.rows.map(toSqlQuarantine),
      timeline: actions,
    };
  }
  incident = MEMORY_STATE.incidents.get(incidentId) ?? null;
  if (!incident) return null;
  const evidence = [...MEMORY_STATE.evidence.values()].filter((item) => item.incidentId === incidentId);
  const quarantine = [...MEMORY_STATE.quarantine.values()].filter((item) => evidence.some((entry) => entry.evidenceId === item.evidenceId));
  const actions = await loadActions({ incidentId }, options);
  return { ...incident, evidence, quarantine, timeline: actions };
}

export async function listSecurityEvidence(filters = {}, options = {}) {
  await synchronizeCyberSecurityState({ database: options.database, tenantId: filters.tenantId, force: filters.forceSync === true });
  const database = options.database;
  if (hasPersistentStore(database)) {
    const conditions = [];
    const params = [];
    let cursor = 1;
    if (filters.tenantId !== undefined) {
      conditions.push(`tenant_id = $${cursor++}`);
      params.push(filters.tenantId);
    }
    if (filters.orgId !== undefined) {
      conditions.push(`org_id = $${cursor++}`);
      params.push(filters.orgId);
    }
    if (filters.incidentId) {
      conditions.push(`incident_id = $${cursor++}`);
      params.push(filters.incidentId);
    }
    if (filters.source) {
      conditions.push(`source = $${cursor++}`);
      params.push(filters.source);
    }
    if (filters.traceId) {
      conditions.push(`trace_id = $${cursor++}`);
      params.push(filters.traceId);
    }
    if (filters.sessionId) {
      conditions.push(`session_id = $${cursor++}`);
      params.push(filters.sessionId);
    }
    if (filters.runId) {
      conditions.push(`run_id = $${cursor++}`);
      params.push(filters.runId);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = Math.max(1, Math.min(500, Number(filters.limit) || 100));
    const offset = Math.max(0, Number(filters.offset) || 0);
    params.push(limit, offset);
    const result = await database.pool.query(
      `SELECT * FROM cyber_security_evidence ${where} ORDER BY created_at DESC LIMIT $${cursor++} OFFSET $${cursor++}`,
      params,
    );
    return {
      items: result.rows.map(toSqlEvidence),
      total: result.rows.length,
      offset,
      nextOffset: result.rows.length === limit ? offset + result.rows.length : null,
    };
  }
  const all = [...MEMORY_STATE.evidence.values()]
    .filter((item) => (filters.tenantId !== undefined ? item.tenantId === filters.tenantId : true))
    .filter((item) => (filters.orgId !== undefined ? item.orgId === filters.orgId : true))
    .filter((item) => (filters.incidentId ? item.incidentId === filters.incidentId : true))
    .filter((item) => (filters.source ? item.source === filters.source : true))
    .filter((item) => (filters.traceId ? item.traceId === filters.traceId : true))
    .filter((item) => (filters.sessionId ? item.sessionId === filters.sessionId : true))
    .filter((item) => (filters.runId ? item.runId === filters.runId : true))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const offset = Math.max(0, Number(filters.offset) || 0);
  const limit = Math.max(1, Math.min(500, Number(filters.limit) || 100));
  return {
    items: all.slice(offset, offset + limit),
    total: all.length,
    offset,
    nextOffset: offset + limit < all.length ? offset + limit : null,
  };
}

export async function getSecurityEvidenceById(evidenceId, options = {}) {
  const database = options.database;
  await synchronizeCyberSecurityState({ database });
  if (hasPersistentStore(database)) {
    const result = await database.pool.query(`SELECT * FROM cyber_security_evidence WHERE evidence_id = $1 LIMIT 1`, [evidenceId]);
    if (result.rows.length === 0) return null;
    const evidence = toSqlEvidence(result.rows[0]);
    const quarantineResult = await database.pool.query(`SELECT * FROM cyber_security_quarantine_objects WHERE evidence_id = $1 LIMIT 1`, [evidenceId]);
    return {
      ...evidence,
      quarantine: quarantineResult.rows.length > 0 ? toSqlQuarantine(quarantineResult.rows[0]) : null,
      actions: await loadActions({ incidentId: evidence.incidentId }, options),
    };
  }
  const evidence = MEMORY_STATE.evidence.get(evidenceId) ?? null;
  if (!evidence) return null;
  const quarantine = [...MEMORY_STATE.quarantine.values()].find((item) => item.evidenceId === evidenceId) ?? null;
  return {
    ...evidence,
    quarantine,
    actions: await loadActions({ incidentId: evidence.incidentId }, options),
  };
}

export async function listSecurityQuarantine(filters = {}, options = {}) {
  await synchronizeCyberSecurityState({ database: options.database, tenantId: filters.tenantId, force: filters.forceSync === true });
  const database = options.database;
  if (hasPersistentStore(database)) {
    const conditions = [];
    const params = [];
    let cursor = 1;
    if (filters.tenantId !== undefined) {
      conditions.push(`tenant_id = $${cursor++}`);
      params.push(filters.tenantId);
    }
    if (filters.orgId !== undefined) {
      conditions.push(`org_id = $${cursor++}`);
      params.push(filters.orgId);
    }
    if (filters.currentState) {
      conditions.push(`current_state = $${cursor++}`);
      params.push(filters.currentState);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await database.pool.query(`SELECT * FROM cyber_security_quarantine_objects ${where} ORDER BY updated_at DESC`, params);
    return result.rows.map(toSqlQuarantine);
  }
  return [...MEMORY_STATE.quarantine.values()]
    .filter((item) => (filters.tenantId !== undefined ? item.tenantId === filters.tenantId : true))
    .filter((item) => (filters.orgId !== undefined ? item.orgId === filters.orgId : true))
    .filter((item) => (filters.currentState ? item.currentState === filters.currentState : true))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export async function listSecuritySuppressions(filters = {}, options = {}) {
  const database = options.database;
  if (hasPersistentStore(database)) {
    const conditions = [];
    const params = [];
    let cursor = 1;
    if (filters.tenantId !== undefined) {
      conditions.push(`tenant_id = $${cursor++}`);
      params.push(filters.tenantId);
    }
    if (filters.orgId !== undefined) {
      conditions.push(`org_id = $${cursor++}`);
      params.push(filters.orgId);
    }
    if (filters.status) {
      conditions.push(`status = $${cursor++}`);
      params.push(filters.status);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await database.pool.query(`SELECT * FROM cyber_security_suppressions ${where} ORDER BY created_at DESC`, params);
    return result.rows.map(toSqlSuppression);
  }
  return [...MEMORY_STATE.suppressions.values()]
    .filter((item) => (filters.tenantId !== undefined ? item.tenantId === filters.tenantId : true))
    .filter((item) => (filters.orgId !== undefined ? item.orgId === filters.orgId : true))
    .filter((item) => (filters.status ? item.status === filters.status : true))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function createSecuritySuppression(input, options = {}) {
  const database = options.database;
  const now = nowIso();
  const suppression = {
    suppressionId: `suppression-${randomUUID()}`,
    tenantId: asString(input.tenantId),
    orgId: asString(input.orgId),
    status: "active",
    scopeType: asString(input.scopeType),
    scopeValue: asString(input.scopeValue),
    provider: asString(input.provider),
    tool: asString(input.tool),
    policyRule: asString(input.policyRule),
    rationale: asString(input.rationale),
    rollbackPath: asString(input.rollbackPath),
    approver: asString(input.approver),
    createdBy: asString(input.createdBy),
    createdAt: now,
    expiresAt: input.expiresAt ?? null,
    revokedAt: null,
    revokedBy: "",
    metadata: asObject(input.metadata),
  };
  if (hasPersistentStore(database)) {
    const result = await database.pool.query(
      `INSERT INTO cyber_security_suppressions (
         suppression_id, tenant_id, org_id, status, scope_type, scope_value, provider, tool, policy_rule,
         rationale, rollback_path, approver, created_by, created_at, expires_at, revoked_at, revoked_by, metadata_json
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9,
         $10, $11, $12, $13, $14, $15, $16, $17, $18
       ) RETURNING *`,
      [
        suppression.suppressionId,
        suppression.tenantId,
        suppression.orgId,
        suppression.status,
        suppression.scopeType,
        suppression.scopeValue,
        suppression.provider,
        suppression.tool,
        suppression.policyRule,
        suppression.rationale,
        suppression.rollbackPath,
        suppression.approver,
        suppression.createdBy,
        suppression.createdAt,
        suppression.expiresAt,
        suppression.revokedAt,
        suppression.revokedBy,
        JSON.stringify(suppression.metadata),
      ],
    );
    const created = toSqlSuppression(result.rows[0]);
    await appendSecurityAction({
      tenantId: created.tenantId,
      orgId: created.orgId,
      suppressionId: created.suppressionId,
      actorId: created.createdBy,
      actionType: "suppression_created",
      summary: `Suppression created for ${created.scopeType}:${created.scopeValue}`,
      payload: created,
    }, options);
    return created;
  }
  MEMORY_STATE.suppressions.set(suppression.suppressionId, suppression);
  return suppression;
}

export async function revokeSecuritySuppression(suppressionId, input, options = {}) {
  const database = options.database;
  const revokedAt = nowIso();
  if (hasPersistentStore(database)) {
    const result = await database.pool.query(
      `UPDATE cyber_security_suppressions
          SET status = 'revoked',
              revoked_at = $2,
              revoked_by = $3
        WHERE suppression_id = $1
        RETURNING *`,
      [suppressionId, revokedAt, asString(input.revokedBy)],
    );
    if (result.rows.length === 0) return null;
    const suppression = toSqlSuppression(result.rows[0]);
    await appendSecurityAction({
      tenantId: suppression.tenantId,
      orgId: suppression.orgId,
      suppressionId: suppression.suppressionId,
      actorId: asString(input.revokedBy),
      actionType: "suppression_revoked",
      summary: `Suppression revoked for ${suppression.scopeType}:${suppression.scopeValue}`,
      payload: { ...suppression, reason: asString(input.reason) },
    }, options);
    return suppression;
  }
  const suppression = MEMORY_STATE.suppressions.get(suppressionId);
  if (!suppression) return null;
  suppression.status = "revoked";
  suppression.revokedAt = revokedAt;
  suppression.revokedBy = asString(input.revokedBy);
  return suppression;
}

export async function assignSecurityIncident(incidentId, input, options = {}) {
  const existing = await getSecurityIncidentById(incidentId, options);
  if (!existing) return null;
  const next = await upsertIncident({
    ...existing,
    ownerId: asString(input.ownerId),
    updatedAt: nowIso(),
  }, options);
  await appendSecurityAction({
    tenantId: next.tenantId,
    orgId: next.orgId,
    incidentId: next.incidentId,
    actorId: asString(input.actorId),
    actionType: "incident_assigned",
    summary: `Incident assigned to ${next.ownerId || "unassigned"}`,
    payload: { ownerId: next.ownerId },
  }, options);
  return next;
}

export async function updateSecurityIncidentState(incidentId, input, options = {}) {
  const existing = await getSecurityIncidentById(incidentId, options);
  if (!existing) return null;
  const state = asString(input.state, existing.state);
  const resolvedAt = state === "resolved" ? nowIso() : existing.resolvedAt ?? null;
  const closedAt = state === "closed" ? nowIso() : existing.closedAt ?? null;
  const next = await upsertIncident({
    ...existing,
    state,
    disposition: input.disposition ?? existing.disposition,
    escalationState: input.escalationState ?? existing.escalationState,
    updatedAt: nowIso(),
    resolvedAt,
    closedAt,
  }, options);
  await appendSecurityAction({
    tenantId: next.tenantId,
    orgId: next.orgId,
    incidentId: next.incidentId,
    actorId: asString(input.actorId),
    actionType: "incident_state_changed",
    summary: `Incident state changed to ${state}`,
    payload: { state, disposition: next.disposition, escalationState: next.escalationState },
  }, options);
  return next;
}

export async function addSecurityIncidentNote(incidentId, input, options = {}) {
  const incident = await getSecurityIncidentById(incidentId, options);
  if (!incident) return null;
  await appendSecurityAction({
    tenantId: incident.tenantId,
    orgId: incident.orgId,
    incidentId: incident.incidentId,
    actorId: asString(input.actorId),
    actionType: "incident_note",
    summary: `Incident note added by ${asString(input.actorId, "operator")}`,
    payload: { note: asString(input.note), linkedCaseId: asString(input.linkedCaseId) },
  }, options);
  if (input.linkedCaseId) {
    await upsertIncident({
      ...incident,
      linkedCaseId: asString(input.linkedCaseId),
      updatedAt: nowIso(),
    }, options);
  }
  return getSecurityIncidentById(incidentId, options);
}

export async function reviewSecurityQuarantine(quarantineId, input, options = {}) {
  const database = options.database;
  const list = await listSecurityQuarantine({}, options);
  const existing = list.find((item) => item.quarantineId === quarantineId) ?? null;
  if (!existing) return null;
  const reviewStatus = asString(input.reviewStatus, "reviewed");
  const currentState = reviewStatus === "malicious" ? "contained" : reviewStatus === "benign" ? "approved_release" : "reviewed";
  const next = await upsertQuarantine({
    ...existing,
    reviewStatus,
    currentState,
    classification: input.classification ?? existing.classification,
    reviewedAt: nowIso(),
    reviewedBy: asString(input.actorId),
    updatedAt: nowIso(),
  }, options);
  const evidence = await getSecurityEvidenceById(next.evidenceId, options);
  await appendSecurityAction({
    tenantId: next.tenantId,
    orgId: next.orgId,
    quarantineId: next.quarantineId,
    incidentId: evidence?.incidentId ?? "",
    evidenceId: next.evidenceId,
    actorId: asString(input.actorId),
    actionType: "quarantine_reviewed",
    summary: `Quarantine reviewed as ${reviewStatus}`,
    payload: { reviewStatus, notes: asString(input.notes) },
  }, { database });
  return next;
}

export async function releaseSecurityQuarantine(quarantineId, input, options = {}) {
  const list = await listSecurityQuarantine({}, options);
  const existing = list.find((item) => item.quarantineId === quarantineId) ?? null;
  if (!existing) return null;
  const next = await upsertQuarantine({
    ...existing,
    currentState: "released",
    releaseDisposition: asString(input.releaseDisposition, "operator_release"),
    reviewedAt: nowIso(),
    reviewedBy: asString(input.actorId),
    updatedAt: nowIso(),
  }, options);
  const evidence = await getSecurityEvidenceById(next.evidenceId, options);
  await appendSecurityAction({
    tenantId: next.tenantId,
    orgId: next.orgId,
    quarantineId: next.quarantineId,
    incidentId: evidence?.incidentId ?? "",
    evidenceId: next.evidenceId,
    actorId: asString(input.actorId),
    actionType: "quarantine_released",
    summary: `Quarantine released with disposition ${next.releaseDisposition}`,
    payload: { releaseDisposition: next.releaseDisposition, rationale: asString(input.rationale) },
  }, options);
  return next;
}

export async function rescanSecurityQuarantine(quarantineId, input, options = {}) {
  const list = await listSecurityQuarantine({}, options);
  const existing = list.find((item) => item.quarantineId === quarantineId) ?? null;
  if (!existing) return null;
  const evidence = await getSecurityEvidenceById(existing.evidenceId, options);
  if (!evidence) return null;
  let scan = evidence.scan;
  if (evidence.storagePath) {
    const refreshed = await scanDownloadedContent({
      provider: downloadScanProvider,
      virustotalApiKey: downloadScanVirusTotalApiKey,
      virustotalApiUrl: downloadScanVirusTotalApiUrl,
      timeoutMs: downloadScanTimeoutMs,
      content: Buffer.from("rescanned"),
      contentType: evidence.contentType,
      filename: evidence.filename || evidence.evidenceId,
      localResult: buildLocalScanResult({
        threats: evidence.scan?.reasons ?? [],
        quarantined: existing.currentState !== "released",
      }),
    });
    scan = normalizeScan(refreshed, evidence.scan);
  }
  await upsertEvidence({
    ...evidence,
    scan,
    updatedAt: nowIso(),
    lastSeenAt: nowIso(),
  }, options);
  const next = await upsertQuarantine({
    ...existing,
    currentState: scan.quarantined || scan.blocked ? "pending_review" : "approved_release",
    updatedAt: nowIso(),
  }, options);
  await appendSecurityAction({
    tenantId: next.tenantId,
    orgId: next.orgId,
    quarantineId: next.quarantineId,
    incidentId: evidence.incidentId,
    evidenceId: next.evidenceId,
    actorId: asString(input.actorId),
    actionType: "quarantine_rescanned",
    summary: `Quarantine rescanned with provider ${scan.provider}`,
    payload: { scan },
  }, options);
  return next;
}

export async function getCyberSecurityStatus(options = {}) {
  await synchronizeCyberSecurityState({ database: options.database, force: options.force === true });
  const incidents = await listSecurityIncidents({ tenantId: options.tenantId, orgId: options.orgId, limit: 1000 }, options);
  const quarantine = await listSecurityQuarantine({ tenantId: options.tenantId, orgId: options.orgId }, options);
  const suppressions = await listSecuritySuppressions({ tenantId: options.tenantId, orgId: options.orgId, status: "active" }, options);
  return {
    evidenceStore: {
      durable: hasPersistentStore(options.database),
      available: Boolean(options.database?.pool),
      mode: hasPersistentStore(options.database) ? "postgres" : "memory_fallback",
    },
    quarantineStore: {
      durable: hasPersistentStore(options.database),
      available: true,
      storagePath: cyberQuarantineStorageDir,
      backlog: quarantine.filter((item) => item.currentState !== "released").length,
    },
    incidents: {
      total: incidents.total,
      open: incidents.items.filter((item) => ACTIVE_INCIDENT_STATES.has(item.state)).length,
      severeOpen: incidents.items.filter((item) => ACTIVE_INCIDENT_STATES.has(item.state) && item.severity === "RISK_SEVERITY_HIGH").length,
    },
    suppressions: {
      active: suppressions.length,
    },
  };
}
