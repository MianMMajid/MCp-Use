import { createHash, randomUUID } from "node:crypto";
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  filesystemMutationAllowedRoots,
  filesystemMutationClassifierRequired,
  filesystemMutationDirectMaxPaths,
  filesystemMutationForksEnabled,
  filesystemMutationGeneratedPatterns,
  filesystemMutationModel,
  filesystemMutationPromotionMaxPaths,
  filesystemMutationProtectedRoots,
  filesystemMutationSensitivePatterns,
} from "../config.js";
import { getCyberObjectStore } from "./cyber-object-store.js";
import { buildFilesystemMutationPlan } from "../../../../shared/packages/maple-security/src/filesystem-mutation-policy.js";
import { generateOpenAI } from "../../../../context-wall/service/src/providers/openai.js";

const MEMORY_STATE = {
  plans: new Map(),
};

let persistenceReady = false;

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

function toInt(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function hasPersistentStore(database) {
  return Boolean(database?.pool && typeof database.pool.query === "function");
}

function requireVerifiedScope(options = {}, operation = "filesystem_intervention") {
  const tenantId = asString(options.tenantId);
  const orgId = asString(options.orgId);
  if (!tenantId || !orgId) {
    throw new Error(`${operation} requires verified tenant and org scope.`);
  }
  return { tenantId, orgId };
}

async function ensurePersistence(database) {
  if (!hasPersistentStore(database) || persistenceReady) {
    return;
  }
  await database.pool.query(`
    CREATE TABLE IF NOT EXISTS filesystem_mutation_plans (
      plan_id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT '',
      org_id TEXT NOT NULL DEFAULT '',
      trace_id TEXT NOT NULL DEFAULT '',
      session_id TEXT NOT NULL DEFAULT '',
      run_id TEXT NOT NULL DEFAULT '',
      source_surface TEXT NOT NULL DEFAULT '',
      source_type TEXT NOT NULL DEFAULT '',
      actor_user_id TEXT NOT NULL DEFAULT '',
      workspace_root TEXT NOT NULL DEFAULT '',
      task_text TEXT NOT NULL DEFAULT '',
      lane TEXT NOT NULL DEFAULT 'none',
      status TEXT NOT NULL DEFAULT 'pending_review',
      plan_json TEXT NOT NULL DEFAULT '{}',
      model_json TEXT NOT NULL DEFAULT '{}',
      validation_json TEXT NOT NULL DEFAULT '{}',
      fork_result_json TEXT NOT NULL DEFAULT '{}',
      promotion_json TEXT NOT NULL DEFAULT '{}',
      evidence_ids_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      decided_at TEXT,
      decided_by TEXT NOT NULL DEFAULT '',
      restored_at TEXT,
      restored_by TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_filesystem_mutation_plans_scope
      ON filesystem_mutation_plans(tenant_id, org_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_filesystem_mutation_plans_status
      ON filesystem_mutation_plans(tenant_id, org_id, status, updated_at DESC);
  `);
  persistenceReady = true;
}

function serializeRecord(record = {}) {
  return {
    ...record,
    plan: asObject(record.plan),
    modelAssessment: asObject(record.modelAssessment),
    validation: asObject(record.validation),
    forkResult: asObject(record.forkResult),
    promotion: asObject(record.promotion),
    evidenceIds: asArray(record.evidenceIds),
  };
}

function rowToRecord(row = {}) {
  return serializeRecord({
    planId: row.plan_id,
    tenantId: row.tenant_id,
    orgId: row.org_id,
    traceId: row.trace_id,
    sessionId: row.session_id,
    runId: row.run_id,
    sourceSurface: row.source_surface,
    sourceType: row.source_type,
    actorUserId: row.actor_user_id,
    workspaceRoot: row.workspace_root,
    taskText: row.task_text,
    lane: row.lane,
    status: row.status,
    plan: JSON.parse(row.plan_json || "{}"),
    modelAssessment: JSON.parse(row.model_json || "{}"),
    validation: JSON.parse(row.validation_json || "{}"),
    forkResult: JSON.parse(row.fork_result_json || "{}"),
    promotion: JSON.parse(row.promotion_json || "{}"),
    evidenceIds: JSON.parse(row.evidence_ids_json || "[]"),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    decidedAt: row.decided_at,
    decidedBy: row.decided_by,
    restoredAt: row.restored_at,
    restoredBy: row.restored_by,
  });
}

async function upsertRecord(record, options = {}) {
  const normalized = serializeRecord(record);
  if (!hasPersistentStore(options.database)) {
    MEMORY_STATE.plans.set(normalized.planId, normalized);
    return normalized;
  }
  await ensurePersistence(options.database);
  await options.database.pool.query(`
    INSERT INTO filesystem_mutation_plans (
      plan_id, tenant_id, org_id, trace_id, session_id, run_id, source_surface, source_type,
      actor_user_id, workspace_root, task_text, lane, status, plan_json, model_json,
      validation_json, fork_result_json, promotion_json, evidence_ids_json, created_at,
      updated_at, decided_at, decided_by, restored_at, restored_by
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25
    )
    ON CONFLICT (plan_id) DO UPDATE SET
      lane = EXCLUDED.lane,
      status = EXCLUDED.status,
      plan_json = EXCLUDED.plan_json,
      model_json = EXCLUDED.model_json,
      validation_json = EXCLUDED.validation_json,
      fork_result_json = EXCLUDED.fork_result_json,
      promotion_json = EXCLUDED.promotion_json,
      evidence_ids_json = EXCLUDED.evidence_ids_json,
      updated_at = EXCLUDED.updated_at,
      decided_at = EXCLUDED.decided_at,
      decided_by = EXCLUDED.decided_by,
      restored_at = EXCLUDED.restored_at,
      restored_by = EXCLUDED.restored_by
  `, [
    normalized.planId,
    normalized.tenantId,
    normalized.orgId,
    normalized.traceId,
    normalized.sessionId,
    normalized.runId,
    normalized.sourceSurface,
    normalized.sourceType,
    normalized.actorUserId,
    normalized.workspaceRoot,
    normalized.taskText,
    normalized.lane,
    normalized.status,
    JSON.stringify(normalized.plan),
    JSON.stringify(normalized.modelAssessment),
    JSON.stringify(normalized.validation),
    JSON.stringify(normalized.forkResult),
    JSON.stringify(normalized.promotion),
    JSON.stringify(normalized.evidenceIds),
    normalized.createdAt,
    normalized.updatedAt,
    normalized.decidedAt ?? null,
    normalized.decidedBy ?? "",
    normalized.restoredAt ?? null,
    normalized.restoredBy ?? "",
  ]);
  return normalized;
}

async function getRecordById(planId, options = {}) {
  if (!hasPersistentStore(options.database)) {
    const record = MEMORY_STATE.plans.get(planId);
    if (!record) return null;
    if (record.tenantId !== options.tenantId || record.orgId !== options.orgId) {
      return null;
    }
    return record;
  }
  await ensurePersistence(options.database);
  const result = await options.database.pool.query(
    `SELECT * FROM filesystem_mutation_plans
      WHERE plan_id = $1 AND tenant_id = $2 AND org_id = $3
      LIMIT 1`,
    [planId, options.tenantId, options.orgId],
  );
  if (result.rows.length === 0) return null;
  return rowToRecord(result.rows[0]);
}

function defaultMutationPolicyOptions(input = {}) {
  const workspaceRoot = asString(input.workspaceRoot || filesystemMutationAllowedRoots[0] || process.cwd());
  const allowedRoots = asArray(input.allowedRoots).length > 0
    ? input.allowedRoots
    : [workspaceRoot, ...filesystemMutationAllowedRoots].filter(Boolean);
  return {
    workspaceRoot,
    allowedRoots,
    protectedRoots: asArray(input.protectedRoots).length > 0 ? input.protectedRoots : filesystemMutationProtectedRoots,
    generatedPathPatterns: asArray(input.generatedPathPatterns).length > 0 ? input.generatedPathPatterns : filesystemMutationGeneratedPatterns,
    sensitivePathPatterns: asArray(input.sensitivePathPatterns).length > 0 ? input.sensitivePathPatterns : filesystemMutationSensitivePatterns,
    directMaxPaths: filesystemMutationDirectMaxPaths,
    promotionMaxPaths: filesystemMutationPromotionMaxPaths,
    agentCreatedPaths: input.agentCreatedPaths ?? [],
  };
}

function modelUnavailableAssessment(reason) {
  return {
    provider: "openai",
    model: filesystemMutationModel,
    available: false,
    confidence: 0,
    recommendedLane: "approval_required",
    intentClass: "unknown",
    taskAlignment: "unknown",
    userAuthoredRisk: "unknown",
    rebuildability: "unknown",
    blastRadiusAssessment: "unknown",
    suspiciousSignals: [reason],
    reason,
    checkedAt: nowIso(),
  };
}

function parseJsonResponse(text, fallback = null) {
  const raw = asString(text);
  if (!raw) {
    return fallback;
  }
  const candidates = [raw];
  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    candidates.push(fencedMatch[1].trim());
  }
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(raw.slice(firstBrace, lastBrace + 1));
  }
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      continue;
    }
  }
  return fallback;
}

async function classifyMutationPlan(plan, options = {}) {
  const apiKey = asString(process.env.OPENAI_API_KEY);
  if (!apiKey) {
    return modelUnavailableAssessment("OpenAI API key is not configured.");
  }
  const prompt = [
    "Return strict JSON only.",
    "You are classifying a filesystem mutation plan for Maple.",
    "Do not approve protected paths. Do not downgrade deterministic hard-deny decisions.",
    "Required JSON keys: intentClass, taskAlignment, userAuthoredRisk, rebuildability, blastRadiusAssessment, suspiciousSignals, confidence, recommendedLane.",
    "Allowed recommendedLane values: direct_allow, fork_required, approval_required.",
    JSON.stringify({
      taskText: plan.taskText,
      lane: plan.lane,
      laneMessage: plan.laneMessage,
      candidatePathCount: plan.candidatePathCount,
      recursive: plan.recursive,
      operations: plan.operations,
      pathClassifications: plan.pathClassifications,
      traceId: plan.traceId,
      sessionId: plan.sessionId,
      runId: plan.runId,
      sourceSurface: plan.sourceSurface,
      sourceType: plan.sourceType,
    }, null, 2),
  ].join("\n");

  try {
    const response = await generateOpenAI(apiKey, {
      model: filesystemMutationModel,
      temperature: 0,
      maxTokens: 300,
      timeoutMs: 8_000,
      messages: [
        { role: "system", content: "Classify filesystem mutation risk. Reply with JSON only." },
        { role: "user", content: prompt },
      ],
    });
    const parsed = parseJsonResponse(response.content, null);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return modelUnavailableAssessment("Classifier returned non-JSON content.");
    }
    return {
      provider: "openai",
      model: response.model || filesystemMutationModel,
      available: true,
      confidence: Number(parsed.confidence ?? 0),
      recommendedLane: asString(parsed.recommendedLane, "approval_required"),
      intentClass: asString(parsed.intentClass, "unknown"),
      taskAlignment: asString(parsed.taskAlignment, "unknown"),
      userAuthoredRisk: asString(parsed.userAuthoredRisk, "unknown"),
      rebuildability: asString(parsed.rebuildability, "unknown"),
      blastRadiusAssessment: asString(parsed.blastRadiusAssessment, "unknown"),
      suspiciousSignals: asArray(parsed.suspiciousSignals).map((value) => asString(value)).filter(Boolean),
      checkedAt: nowIso(),
    };
  } catch (error) {
    return modelUnavailableAssessment(error instanceof Error ? error.message : String(error));
  }
}

function buildRecordFromPlan(plan, modelAssessment, options = {}) {
  const createdAt = nowIso();
  const lane = asString(plan.lane, "none");
  const status = lane === "hard_deny"
    ? "denied"
    : lane === "direct_allow"
      ? "direct_ready"
      : "pending_review";
  return serializeRecord({
    planId: `fsp-${randomUUID()}`,
    tenantId: asString(options.tenantId),
    orgId: asString(options.orgId),
    traceId: asString(options.traceId || plan.traceId),
    sessionId: asString(options.sessionId || plan.sessionId),
    runId: asString(options.runId || plan.runId),
    sourceSurface: asString(options.sourceSurface || plan.sourceSurface || "firewall"),
    sourceType: asString(options.sourceType || plan.sourceType || "tool_call"),
    actorUserId: asString(options.actorUserId),
    workspaceRoot: asString(plan.workspaceRoot),
    taskText: asString(plan.taskText),
    lane,
    status,
    plan,
    modelAssessment,
    validation: {},
    forkResult: {},
    promotion: {},
    evidenceIds: [],
    createdAt,
    updatedAt: createdAt,
    decidedAt: null,
    decidedBy: "",
    restoredAt: null,
    restoredBy: "",
  });
}

async function pathExists(pathname) {
  try {
    await access(pathname);
    return true;
  } catch {
    return false;
  }
}

async function snapshotPath(pathname) {
  if (!(await pathExists(pathname))) {
    return { kind: "missing", path: pathname };
  }
  const details = await stat(pathname);
  if (details.isDirectory()) {
    const entries = await readdir(pathname, { withFileTypes: true });
    const children = [];
    for (const entry of entries) {
      children.push(await snapshotPath(join(pathname, entry.name)));
    }
    return {
      kind: "directory",
      path: pathname,
      children,
    };
  }
  return {
    kind: "file",
    path: pathname,
    contentBase64: (await readFile(pathname)).toString("base64"),
  };
}

async function restoreSnapshot(snapshot, targetPath) {
  if (snapshot.kind === "missing") {
    await rm(targetPath, { force: true, recursive: true }).catch(() => {});
    return;
  }
  if (snapshot.kind === "directory") {
    await rm(targetPath, { recursive: true, force: true }).catch(() => {});
    await mkdir(targetPath, { recursive: true });
    for (const child of asArray(snapshot.children)) {
      const name = asString(child.path).split("/").pop();
      await restoreSnapshot(child, join(targetPath, name));
    }
    return;
  }
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, Buffer.from(asString(snapshot.contentBase64), "base64"));
}

function mapWorkspacePath(pathname, workspaceRoot, forkRoot) {
  const normalizedPath = asString(pathname);
  const normalizedRoot = asString(workspaceRoot);
  if (!normalizedPath.startsWith(normalizedRoot)) {
    throw new Error(`Path ${normalizedPath} is outside workspace root ${normalizedRoot}.`);
  }
  const relative = normalizedPath.slice(normalizedRoot.length).replace(/^\/+/, "");
  return join(forkRoot, relative);
}

async function applyOperationsToWorkspace(workspaceRoot, operations, options = {}) {
  const objectStore = options.objectStore;
  const archivedFiles = [];
  const restoreOps = [];
  const evidenceIds = [];
  for (const operation of asArray(operations)) {
    const op = asString(operation.op);
    if (op === "delete") {
      const path = asString(operation.path);
      const snapshot = await snapshotPath(path);
      if (options.archiveSnapshots && snapshot.kind !== "missing") {
        const archive = await archiveSnapshot(snapshot, path, options);
        archivedFiles.push(archive);
        evidenceIds.push(archive.evidenceId);
        restoreOps.push({ op: "restore_snapshot", path, objectRef: archive.objectRef, snapshotType: archive.snapshotType });
      }
      await rm(path, { recursive: Boolean(operation.recursive), force: true });
      continue;
    }
    if (op === "move") {
      const from = asString(operation.from);
      const to = asString(operation.to);
      const sourceSnapshot = await snapshotPath(from);
      const destinationSnapshot = await snapshotPath(to);
      if (options.archiveSnapshots) {
        if (sourceSnapshot.kind !== "missing") {
          const archive = await archiveSnapshot(sourceSnapshot, from, options);
          archivedFiles.push(archive);
          evidenceIds.push(archive.evidenceId);
          restoreOps.push({ op: "restore_snapshot", path: from, objectRef: archive.objectRef, snapshotType: archive.snapshotType });
        }
        if (destinationSnapshot.kind !== "missing") {
          const archive = await archiveSnapshot(destinationSnapshot, to, options);
          archivedFiles.push(archive);
          evidenceIds.push(archive.evidenceId);
          restoreOps.push({ op: "restore_snapshot", path: to, objectRef: archive.objectRef, snapshotType: archive.snapshotType });
        } else {
          restoreOps.push({ op: "delete_path", path: to });
        }
      }
      await mkdir(dirname(to), { recursive: true });
      await rm(to, { force: true, recursive: true }).catch(() => {});
      await writeSnapshotToPath(sourceSnapshot, to);
      await rm(from, { recursive: true, force: true });
      continue;
    }
    if (op === "overwrite" || op === "write") {
      const targetPath = asString(operation.path || operation.to);
      const targetSnapshot = await snapshotPath(targetPath);
      if (options.archiveSnapshots) {
        if (targetSnapshot.kind !== "missing") {
          const archive = await archiveSnapshot(targetSnapshot, targetPath, options);
          archivedFiles.push(archive);
          evidenceIds.push(archive.evidenceId);
          restoreOps.push({ op: "restore_snapshot", path: targetPath, objectRef: archive.objectRef, snapshotType: archive.snapshotType });
        } else {
          restoreOps.push({ op: "delete_path", path: targetPath });
        }
      }
      await mkdir(dirname(targetPath), { recursive: true });
      const content = operation.content !== undefined
        ? Buffer.from(typeof operation.content === "string" ? operation.content : JSON.stringify(operation.content, null, 2))
        : Buffer.from("");
      await writeFile(targetPath, content);
    }
  }

  return {
    archivedFiles,
    restoreOps,
    evidenceIds,
    objectStoreMode: objectStore?.mode ?? "unknown",
  };
}

async function writeSnapshotToPath(snapshot, targetPath) {
  if (snapshot.kind === "missing") {
    return;
  }
  if (snapshot.kind === "directory") {
    await mkdir(targetPath, { recursive: true });
    for (const child of asArray(snapshot.children)) {
      const name = asString(child.path).split("/").pop();
      await writeSnapshotToPath(child, join(targetPath, name));
    }
    return;
  }
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, Buffer.from(asString(snapshot.contentBase64), "base64"));
}

async function archiveSnapshot(snapshot, originalPath, options = {}) {
  const objectStore = options.objectStore ?? getCyberObjectStore();
  const evidenceId = `evidence-fsm-${createHash("sha256").update(`${options.planId}:${originalPath}`).digest("hex").slice(0, 24)}`;
  const evidence = {
    evidenceId,
    incidentId: "",
    tenantId: asString(options.tenantId),
    orgId: asString(options.orgId),
    source: "filesystem_mutation",
    filename: asString(originalPath).split("/").pop(),
    sha256: createHash("sha256").update(JSON.stringify(snapshot)).digest("hex"),
  };
  const payload = Buffer.from(JSON.stringify(snapshot, null, 2));
  const objectResult = await objectStore.putImmutableObject({
    evidence,
    content: payload,
    contentType: "application/json",
  });
  if (hasPersistentStore(options.database)) {
    await options.database.pool.query(`
      INSERT INTO cyber_security_evidence (
        evidence_id, tenant_id, org_id, incident_id, source, external_id, trace_id, session_id, run_id, url,
        filename, content_type, size_bytes, sha256, policy_reason, request_json, response_json, metadata_json,
        scan_json, provenance_json, object_ref, storage_path, created_at, updated_at, last_seen_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
        $11,$12,$13,$14,$15,$16,$17,$18,
        $19,$20,$21,$22,$23,$24,$25
      )
      ON CONFLICT (evidence_id) DO UPDATE SET
        object_ref = EXCLUDED.object_ref,
        storage_path = EXCLUDED.storage_path,
        updated_at = EXCLUDED.updated_at,
        last_seen_at = EXCLUDED.last_seen_at
    `, [
      evidenceId,
      asString(options.tenantId),
      asString(options.orgId),
      "",
      "filesystem_mutation",
      `${options.planId}:${originalPath}`,
      asString(options.traceId),
      asString(options.sessionId),
      asString(options.runId),
      "",
      evidence.filename,
      "application/json",
      payload.byteLength,
      evidence.sha256,
      `Archived original bytes for ${originalPath}`,
      "{}",
      "{}",
      JSON.stringify({ originalPath, snapshotType: snapshot.kind }),
      JSON.stringify({ provider: "filesystem_guard", status: "completed", verdict: "archived" }),
      JSON.stringify({ sourceService: "gateway-api", summary: "Filesystem mutation archive", createdAt: nowIso() }),
      objectResult.objectRef,
      objectResult.storagePath,
      nowIso(),
      nowIso(),
      nowIso(),
    ]);
  }
  return {
    evidenceId,
    originalPath,
    objectRef: objectResult.objectRef,
    storagePath: objectResult.storagePath,
    snapshotType: snapshot.kind,
  };
}

async function readArchivedSnapshot(archive, options = {}) {
  const objectStore = options.objectStore ?? getCyberObjectStore();
  const raw = await objectStore.readImmutableObject(archive.objectRef);
  return JSON.parse(Buffer.from(raw).toString("utf8"));
}

async function buildForkResult(record) {
  const forkRoot = await mkdtemp(join(tmpdir(), "maple-fs-fork-"));
  await cp(record.workspaceRoot, forkRoot, { recursive: true });
  const forkOperations = record.plan.operations.map((operation) => ({
    ...operation,
    path: operation.path ? mapWorkspacePath(operation.path, record.workspaceRoot, forkRoot) : "",
    from: operation.from ? mapWorkspacePath(operation.from, record.workspaceRoot, forkRoot) : "",
    to: operation.to ? mapWorkspacePath(operation.to, record.workspaceRoot, forkRoot) : "",
  }));
  await applyOperationsToWorkspace(forkRoot, forkOperations, { archiveSnapshots: false });
  const validation = {
    valid: true,
    checkedAt: nowIso(),
    message: "Forked mutation bundle executed without escaping the approved workspace roots.",
    changedPaths: asArray(record.plan.candidatePaths),
  };
  return {
    forkRoot,
    operations: forkOperations,
    validation,
  };
}

export async function preflightFilesystemMutation(input = {}, options = {}) {
  const scope = requireVerifiedScope(options, "filesystem_preflight");
  const plan = buildFilesystemMutationPlan(input, defaultMutationPolicyOptions(input));
  if (!plan.detected) {
    return null;
  }
  const modelAssessment = await classifyMutationPlan(plan, options);
  if (filesystemMutationClassifierRequired && modelAssessment.available !== true) {
    plan.lane = "approval_required";
    plan.laneMessage = "Model classifier unavailable; escalation required.";
  }
  const record = buildRecordFromPlan(plan, modelAssessment, {
    ...options,
    ...scope,
  });
  return upsertRecord(record, options);
}

export async function listFilesystemMutations(filters = {}, options = {}) {
  const scope = requireVerifiedScope(options, "filesystem_list");
  if (!hasPersistentStore(options.database)) {
    const items = [...MEMORY_STATE.plans.values()]
      .filter((item) => item.tenantId === scope.tenantId && item.orgId === scope.orgId)
      .filter((item) => (filters.status ? item.status === filters.status : true))
      .filter((item) => (filters.lane ? item.lane === filters.lane : true))
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    return {
      items,
      total: items.length,
      offset: 0,
      nextOffset: null,
    };
  }
  await ensurePersistence(options.database);
  const params = [scope.tenantId, scope.orgId];
  const where = ["tenant_id = $1", "org_id = $2"];
  if (filters.status) {
    params.push(filters.status);
    where.push(`status = $${params.length}`);
  }
  if (filters.lane) {
    params.push(filters.lane);
    where.push(`lane = $${params.length}`);
  }
  const offset = Math.max(0, toInt(filters.offset, 0));
  const limit = Math.max(1, Math.min(200, toInt(filters.limit, 50)));
  const result = await options.database.pool.query(
    `SELECT * FROM filesystem_mutation_plans
      WHERE ${where.join(" AND ")}
      ORDER BY updated_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset],
  );
  const totalResult = await options.database.pool.query(
    `SELECT COUNT(*)::int AS total FROM filesystem_mutation_plans WHERE ${where.join(" AND ")}`,
    params,
  );
  const items = result.rows.map(rowToRecord);
  const total = toInt(totalResult.rows[0]?.total, 0);
  return {
    items,
    total,
    offset,
    nextOffset: offset + items.length < total ? offset + items.length : null,
  };
}

export async function getFilesystemMutationById(planId, options = {}) {
  const scope = requireVerifiedScope(options, "filesystem_get");
  return getRecordById(planId, { ...options, ...scope });
}

export async function decideFilesystemMutation(planId, input = {}, options = {}) {
  const scope = requireVerifiedScope(options, "filesystem_decide");
  const record = await getRecordById(planId, { ...options, ...scope });
  if (!record) {
    throw new Error("Filesystem mutation plan not found.");
  }
  const action = asString(input.action || input.decision).toLowerCase();
  if (action !== "approve" && action !== "deny") {
    throw new Error("action must be approve or deny.");
  }
  if (record.lane === "hard_deny" && action === "approve") {
    throw new Error("Hard-denied mutation plans cannot be approved.");
  }
  const updated = serializeRecord({
    ...record,
    status: action === "approve" ? "approved" : "denied",
    updatedAt: nowIso(),
    decidedAt: nowIso(),
    decidedBy: asString(options.actorUserId),
    validation: {
      ...asObject(record.validation),
      decisionReason: asString(input.reason || input.notes),
    },
  });
  return upsertRecord(updated, options);
}

export async function promoteFilesystemMutation(planId, input = {}, options = {}) {
  const scope = requireVerifiedScope(options, "filesystem_promote");
  const record = await getRecordById(planId, { ...options, ...scope });
  if (!record) {
    throw new Error("Filesystem mutation plan not found.");
  }
  if (record.status !== "approved" && record.status !== "direct_ready") {
    throw new Error(`Filesystem mutation plan is not promotable from status '${record.status}'.`);
  }
  if (record.lane !== "direct_allow" && record.lane !== "fork_required" && record.lane !== "approval_required") {
    throw new Error(`Filesystem mutation lane '${record.lane}' cannot be promoted.`);
  }
  if ((record.lane === "fork_required" || record.lane === "approval_required") && !filesystemMutationForksEnabled) {
    throw new Error("Fork infrastructure unavailable; refusing high-risk promotion.");
  }

  let forkResult = {};
  let validation = asObject(record.validation);
  if (record.lane === "fork_required" || record.lane === "approval_required") {
    forkResult = await buildForkResult(record);
    validation = forkResult.validation;
  }

  const objectStore = getCyberObjectStore();
  const applyResult = await applyOperationsToWorkspace(record.workspaceRoot, record.plan.operations, {
    archiveSnapshots: true,
    objectStore,
    database: options.database,
    tenantId: record.tenantId,
    orgId: record.orgId,
    traceId: record.traceId,
    sessionId: record.sessionId,
    runId: record.runId,
    planId: record.planId,
  });
  const updated = serializeRecord({
    ...record,
    status: "promoted",
    updatedAt: nowIso(),
    validation,
    forkResult: {
      ...forkResult,
      forkRoot: asString(forkResult.forkRoot),
    },
    promotion: {
      promotedAt: nowIso(),
      promotedBy: asString(options.actorUserId),
      archivedFiles: applyResult.archivedFiles,
      restoreOps: applyResult.restoreOps,
      appliedCount: record.plan.operations.length,
    },
    evidenceIds: [...new Set([...(record.evidenceIds ?? []), ...applyResult.evidenceIds])],
  });
  return upsertRecord(updated, options);
}

export async function restoreFilesystemMutation(planId, input = {}, options = {}) {
  const scope = requireVerifiedScope(options, "filesystem_restore");
  const record = await getRecordById(planId, { ...options, ...scope });
  if (!record) {
    throw new Error("Filesystem mutation plan not found.");
  }
  if (record.status !== "promoted") {
    throw new Error(`Filesystem mutation plan is not restorable from status '${record.status}'.`);
  }
  const objectStore = getCyberObjectStore();
  const restoreOps = asArray(record.promotion?.restoreOps);
  for (let index = restoreOps.length - 1; index >= 0; index -= 1) {
    const operation = restoreOps[index];
    if (operation.op === "delete_path") {
      await rm(asString(operation.path), { recursive: true, force: true }).catch(() => {});
      continue;
    }
    if (operation.op === "restore_snapshot") {
      const archive = asArray(record.promotion?.archivedFiles).find((item) => item.objectRef === operation.objectRef);
      if (!archive) {
        throw new Error(`Restore snapshot ${operation.objectRef} missing from promotion bundle.`);
      }
      const snapshot = await readArchivedSnapshot(archive, { objectStore });
      await restoreSnapshot(snapshot, asString(operation.path));
    }
  }
  const updated = serializeRecord({
    ...record,
    status: "restored",
    updatedAt: nowIso(),
    restoredAt: nowIso(),
    restoredBy: asString(options.actorUserId),
    validation: {
      ...asObject(record.validation),
      restoreReason: asString(input.reason),
    },
  });
  return upsertRecord(updated, options);
}

export async function getFilesystemMutationStatus(options = {}) {
  const scope = requireVerifiedScope(options, "filesystem_status");
  const list = await listFilesystemMutations({ limit: 500 }, { ...options, ...scope });
  return {
    guard: {
      available: true,
      mode: filesystemMutationForksEnabled ? "fork-capable" : "direct-only",
    },
    classifier: {
      model: filesystemMutationModel,
      required: filesystemMutationClassifierRequired,
      available: Boolean(asString(process.env.OPENAI_API_KEY)),
    },
    archiveStore: {
      available: true,
      mode: getCyberObjectStore().mode,
    },
    counts: {
      total: list.total,
      pending: list.items.filter((item) => item.status === "pending_review").length,
      approved: list.items.filter((item) => item.status === "approved").length,
      promoted: list.items.filter((item) => item.status === "promoted").length,
      denied: list.items.filter((item) => item.status === "denied").length,
    },
  };
}
