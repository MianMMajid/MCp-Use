import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import net from "node:net";
import { promisify } from "node:util";
import {
  downloadScanProvider,
  downloadScanTimeoutMs,
  downloadScanVirusTotalApiKey,
  downloadScanVirusTotalApiUrl,
  downloadScanVirusTotalAnalysisPollAttempts,
  downloadScanVirusTotalAnalysisPollDelayMs,
  downloadScanVirusTotalUploadAllowedDomains,
  downloadScanVirusTotalUploadFallback,
  malwareSandboxApiToken,
  malwareSandboxApiUrl,
  malwareSandboxProvider,
  malwareSandboxRequired,
  malwareSandboxTimeoutMs,
  openclawAgentAutoStartGateway,
  openclawAgentDefaultSessionId,
  openclawAgentDefaultThinking,
  openclawAgentDefaultTimeoutSeconds,
  openclawAgentDevProfile,
  openclawAgentEnabled,
  openclawAgentMediationEnabled,
  openclawAgentRequireVirustotal,
  openclawAgentGatewayBind,
  openclawAgentGatewayPort,
  openclawAgentMode,
  openclawAgentRequired,
  nemoClawEnabled,
  nemoClawSandboxName,
} from "../config.js";
import { asString } from "../helpers.js";
import { emitAuditEvent } from "../audit-emitter.js";
import { currentRequestContext, mapleLog } from "../logging.js";
import { authContextStorage } from "../auth.js";
import { grpcUnary } from "../grpc-clients.js";
import { database, getGrpcClients } from "../state.js";
import { OpenClawModifierStore } from "./openclaw-modifier-store.js";
import { persistRunArtifactsAsEvidence } from "./cyber-security-service.js";
import { dispatchDownstreamChainAndLog, resolveDispatchAppIds } from "../firewall-proxy.js";
import { preflightFilesystemMutation } from "./filesystem-intervention-service.js";
import { buildAgentBaseline } from "../../../../shared/packages/maple-risk-engine/src/ml/cross-agent-detector.js";
import { buildLocalScanResult, scanDownloadedContent } from "../../../../shared/packages/maple-security/src/download-scan.js";

let _agentBaselineStore;
function getAgentBaselineStore() {
  if (!_agentBaselineStore) {
    _agentBaselineStore = new OpenClawModifierStore({ database });
  }
  return _agentBaselineStore;
}

/**
 * Store the current agent's behavioral baseline after trace analysis.
 */
export async function storeAgentBaseline(agentId, tenantId, orgId, steps) {
  if (!agentId || !steps || steps.length === 0) return;
  const baseline = buildAgentBaseline(steps);
  if (!baseline) return;
  try {
    await getAgentBaselineStore().upsertAgentBaseline(
      agentId, tenantId, orgId, baseline.embedding, baseline.stepCount
    );
  } catch (err) {
    mapleLog("warn", "openclaw_agent.baseline_store_failed", {
      agentId, error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Load all agent baselines for a tenant scope, for cross-agent detection.
 */
export async function loadAgentBaselineMap(tenantId, orgId) {
  try {
    const baselines = await getAgentBaselineStore().listAgentBaselines({ tenantId, orgId });
    const map = new Map();
    for (const b of baselines) {
      map.set(b.agentId, { embedding: b.embedding, stepCount: b.stepCount });
    }
    return map;
  } catch (err) {
    mapleLog("warn", "openclaw_agent.baseline_load_failed", {
      tenantId, orgId, error: err instanceof Error ? err.message : String(err),
    });
    return new Map();
  }
}

const execFileAsync = promisify(execFile);

const MAX_SESSIONS = 1000;
const MAX_RUNS = 5000;
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const RUN_TTL_MS = 1 * 60 * 60 * 1000; // 1 hour
const EVICTION_SWEEP_MS = 60_000;

const runtimeState = {
  enabled: openclawAgentEnabled,
  mode: openclawAgentMode,
  cliAvailable: false,
  bootstrapped: false,
  ready: false,
  gatewayAutoStarted: false,
  lastError: "",
  lastCheckAt: "",
};

let gatewayProcess;
let sessionEventSequence = 0;
let openClawPersistenceReady = false;

const sessionStore = new Map();
const runStore = new Map();
const sessionWatchers = new Map();

function hasPersistentDatabase() {
  return Boolean(database?.pool && typeof database.pool.query === "function");
}

async function ensureOpenClawPersistence() {
  if (openClawPersistenceReady || !hasPersistentDatabase()) {
    return;
  }
  await database.pool.query(`
    CREATE TABLE IF NOT EXISTS openclaw_agent_sessions (
      session_id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT '',
      org_id TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'idle',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_run_id TEXT NOT NULL DEFAULT '',
      last_error TEXT NOT NULL DEFAULT '',
      cancel_requested BOOLEAN NOT NULL DEFAULT FALSE,
      run_ids_json TEXT NOT NULL DEFAULT '[]'
    );
    CREATE TABLE IF NOT EXISTS openclaw_agent_runs (
      run_id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT '',
      org_id TEXT NOT NULL DEFAULT '',
      session_id TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      input_json TEXT NOT NULL DEFAULT '{}',
      output_json TEXT NOT NULL DEFAULT 'null',
      error TEXT NOT NULL DEFAULT '',
      cost_json TEXT NOT NULL DEFAULT 'null',
      parent_run_id TEXT,
      child_run_ids_json TEXT NOT NULL DEFAULT '[]'
    );
    CREATE TABLE IF NOT EXISTS openclaw_agent_run_events (
      event_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL DEFAULT '',
      session_id TEXT NOT NULL,
      sequence BIGINT NOT NULL,
      cursor TEXT NOT NULL,
      event_type TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_openclaw_agent_run_events_session
      ON openclaw_agent_run_events(session_id, sequence);
    CREATE TABLE IF NOT EXISTS openclaw_agent_run_artifacts (
      artifact_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      artifact_index INTEGER NOT NULL,
      artifact_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(run_id, artifact_index)
    );
  `);
  openClawPersistenceReady = true;
}

function parseJson(text, fallback) {
  try {
    return JSON.parse(String(text ?? ""));
  } catch {
    return fallback;
  }
}

async function persistSessionRecord(session, scope = {}) {
  if (!hasPersistentDatabase()) return;
  await ensureOpenClawPersistence();
  await database.pool.query(`
    INSERT INTO openclaw_agent_sessions (
      session_id, tenant_id, org_id, status, created_at, updated_at, last_run_id, last_error, cancel_requested, run_ids_json
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    ON CONFLICT (session_id) DO UPDATE SET
      tenant_id = EXCLUDED.tenant_id,
      org_id = EXCLUDED.org_id,
      status = EXCLUDED.status,
      updated_at = EXCLUDED.updated_at,
      last_run_id = EXCLUDED.last_run_id,
      last_error = EXCLUDED.last_error,
      cancel_requested = EXCLUDED.cancel_requested,
      run_ids_json = EXCLUDED.run_ids_json
  `, [
    session.sessionId,
    String(scope.tenantId ?? ""),
    String(scope.orgId ?? ""),
    session.status,
    session.createdAt,
    session.updatedAt,
    session.lastRunId,
    session.lastError,
    session.cancelRequested === true,
    JSON.stringify(session.runIds ?? []),
  ]);
}

async function persistRunRecord(run, scope = {}) {
  if (!hasPersistentDatabase()) return;
  await ensureOpenClawPersistence();
  await database.pool.query(`
    INSERT INTO openclaw_agent_runs (
      run_id, tenant_id, org_id, session_id, type, status, created_at, updated_at, input_json, output_json, error, cost_json, parent_run_id, child_run_ids_json
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    ON CONFLICT (run_id) DO UPDATE SET
      tenant_id = EXCLUDED.tenant_id,
      org_id = EXCLUDED.org_id,
      status = EXCLUDED.status,
      updated_at = EXCLUDED.updated_at,
      input_json = EXCLUDED.input_json,
      output_json = EXCLUDED.output_json,
      error = EXCLUDED.error,
      cost_json = EXCLUDED.cost_json,
      parent_run_id = EXCLUDED.parent_run_id,
      child_run_ids_json = EXCLUDED.child_run_ids_json
  `, [
    run.runId,
    String(scope.tenantId ?? ""),
    String(scope.orgId ?? ""),
    run.sessionId,
    run.type,
    run.status,
    run.createdAt,
    run.updatedAt,
    JSON.stringify(run.input ?? {}),
    JSON.stringify(run.output ?? null),
    run.error ?? "",
    JSON.stringify(run.cost ?? null),
    run.parentRunId ?? null,
    JSON.stringify(run.childRunIds ?? []),
  ]);
}

async function persistRunArtifacts(run, artifacts = []) {
  if (!hasPersistentDatabase()) return;
  await ensureOpenClawPersistence();
  const now = nowIso();
  for (let index = 0; index < artifacts.length; index += 1) {
    await database.pool.query(`
      INSERT INTO openclaw_agent_run_artifacts (
        artifact_id, run_id, artifact_index, artifact_json, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (run_id, artifact_index) DO UPDATE SET
        artifact_json = EXCLUDED.artifact_json,
        updated_at = EXCLUDED.updated_at
    `, [
      `artifact:${run.runId}:${index}`,
      run.runId,
      index,
      JSON.stringify(artifacts[index] ?? {}),
      now,
      now,
    ]);
  }
}

async function persistSessionEvent(event) {
  if (!hasPersistentDatabase()) return;
  await ensureOpenClawPersistence();
  await database.pool.query(`
    INSERT INTO openclaw_agent_run_events (
      event_id, run_id, session_id, sequence, cursor, event_type, timestamp, payload_json
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT (event_id) DO NOTHING
  `, [
    event.id,
    String(event.payload?.runId ?? ""),
    event.sessionId,
    event.sequence,
    event.cursor,
    event.eventType,
    event.timestamp,
    JSON.stringify(event.payload ?? {}),
  ]);
}

function evictOldest(store, maxSize) {
  while (store.size > maxSize) {
    const firstKey = store.keys().next().value;
    store.delete(firstKey);
  }
}

function sweepExpired() {
  const now = Date.now();
  for (const [key, session] of sessionStore) {
    const updatedMs = Date.parse(session.updatedAt);
    if (Number.isFinite(updatedMs) && now - updatedMs > SESSION_TTL_MS) {
      sessionStore.delete(key);
      sessionWatchers.delete(key);
    }
  }
  for (const [key, run] of runStore) {
    const updatedMs = Date.parse(run.updatedAt);
    if (Number.isFinite(updatedMs) && now - updatedMs > RUN_TTL_MS) {
      runStore.delete(key);
    }
  }
}

const _evictionTimer = setInterval(sweepExpired, EVICTION_SWEEP_MS);
if (_evictionTimer.unref) _evictionTimer.unref();

function nowIso() {
  return new Date().toISOString();
}

function parseCursorOffset(cursor) {
  const parsed = Number.parseInt(String(cursor ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}

function parseEventCursor(cursor) {
  const parsed = Number.parseInt(String(cursor ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}

function ensureSessionRecord(sessionId) {
  const normalizedSessionId = String(sessionId ?? "").trim();
  if (!normalizedSessionId) {
    throw new Error("sessionId is required.");
  }
  const existing = sessionStore.get(normalizedSessionId);
  if (existing) {
    return existing;
  }
  const created = {
    sessionId: normalizedSessionId,
    status: "idle",
    updatedAt: nowIso(),
    createdAt: nowIso(),
    runIds: [],
    lastRunId: "",
    lastError: "",
    cancelRequested: false,
    events: [],
  };
  evictOldest(sessionStore, MAX_SESSIONS);
  sessionStore.set(normalizedSessionId, created);
  persistSessionRecord(created).catch(() => {});
  return created;
}

function emitSessionEvent(sessionId, eventType, payload = {}) {
  const session = ensureSessionRecord(sessionId);
  const sequence = ++sessionEventSequence;
  const event = {
    id: `evt_${sequence}`,
    sequence,
    cursor: String(sequence),
    sessionId: session.sessionId,
    eventType: String(eventType ?? "event"),
    timestamp: nowIso(),
    payload,
  };
  session.events.push(event);
  if (session.events.length > 500) {
    session.events.splice(0, session.events.length - 500);
  }
  session.updatedAt = event.timestamp;
  persistSessionRecord(session).catch(() => {});
  persistSessionEvent(event).catch(() => {});

  const watchers = sessionWatchers.get(session.sessionId);
  if (watchers) {
    for (const callback of watchers) {
      try {
        callback(event);
      } catch {
        // Ignore watcher callback failures.
      }
    }
  }
  return event;
}

async function createRunRecord({ runId, type, sessionId, input, parentRunId }) {
  const session = ensureSessionRecord(sessionId);
  const effectiveRunId = asString(runId) || randomUUID();
  const createdAt = nowIso();
  const run = {
    runId: effectiveRunId,
    type: String(type ?? "turn"),
    sessionId: session.sessionId,
    status: "running",
    createdAt,
    updatedAt: createdAt,
    input,
    output: null,
    error: "",
    artifacts: [],
    parentRunId: parentRunId || null,
    childRunIds: [],
  };
  evictOldest(runStore, MAX_RUNS);
  runStore.set(effectiveRunId, run);

  if (parentRunId) {
    const parent = runStore.get(parentRunId);
    if (parent) {
      parent.childRunIds.push(effectiveRunId);
      await persistRunRecord(parent).catch(() => {});
    }
  }

  session.status = "running";
  session.updatedAt = createdAt;
  session.lastRunId = effectiveRunId;
  session.lastError = "";
  session.cancelRequested = false;
  session.runIds.push(effectiveRunId);
  await persistRunRecord(run).catch(() => {});
  await persistSessionRecord(session).catch(() => {});
  emitSessionEvent(session.sessionId, "run_started", {
    runId: effectiveRunId,
    type: run.type,
    parentRunId: run.parentRunId,
  });
  return run;
}

function extractCostFromOutput(output) {
  if (!output || typeof output !== "object") return null;
  const raw = output.raw ?? output;
  const usage = raw?.usage ?? raw?.result?.usage ?? raw?.response?.usage;
  if (!usage) return null;
  const inputTokens = Number(usage.input_tokens ?? usage.inputTokens ?? usage.prompt_tokens ?? 0);
  const outputTokens = Number(usage.output_tokens ?? usage.outputTokens ?? usage.completion_tokens ?? 0);
  if (!inputTokens && !outputTokens) return null;
  const estimatedCostUsd = (inputTokens * 0.000003) + (outputTokens * 0.000015);
  return { inputTokens, outputTokens, estimatedCostUsd: Math.round(estimatedCostUsd * 1000000) / 1000000 };
}

function artifactContentToBuffer(content) {
  if (content === undefined || content === null) return Buffer.alloc(0);
  if (Buffer.isBuffer(content)) return content;
  if (content instanceof Uint8Array) return Buffer.from(content);
  if (typeof content === "string") return Buffer.from(content, "utf8");
  return Buffer.from(JSON.stringify(content));
}

function inferArtifactContentType(artifact = {}) {
  if (artifact.contentType) {
    return String(artifact.contentType);
  }
  return typeof artifact.content === "string" ? "text/plain" : "application/json";
}

async function withArtifactScan(artifact = {}) {
  if (artifact.scan && typeof artifact.scan === "object") {
    return artifact;
  }
  return {
    ...artifact,
    scan: await scanDownloadedContent({
      provider: downloadScanProvider,
      virustotalApiKey: downloadScanVirusTotalApiKey,
      virustotalApiUrl: downloadScanVirusTotalApiUrl,
      virustotalUploadFallback: downloadScanVirusTotalUploadFallback,
      virustotalUploadAllowedDomains: downloadScanVirusTotalUploadAllowedDomains,
      virustotalAnalysisPollAttempts: downloadScanVirusTotalAnalysisPollAttempts,
      virustotalAnalysisPollDelayMs: downloadScanVirusTotalAnalysisPollDelayMs,
      timeoutMs: downloadScanTimeoutMs,
      malwareSandboxProvider,
      malwareSandboxApiUrl,
      malwareSandboxApiToken,
      malwareSandboxTimeoutMs,
      malwareSandboxRequired,
      content: artifactContentToBuffer(artifact.content),
      contentType: inferArtifactContentType(artifact),
      filename: `${String(artifact.artifactType || "artifact")}.${typeof artifact.content === "string" ? "txt" : "json"}`,
      localResult: buildLocalScanResult({
        threats: [],
        quarantined: false,
      }),
    }),
  };
}

async function withArtifactScans(artifacts = []) {
  return Promise.all((Array.isArray(artifacts) ? artifacts : []).map((artifact) => withArtifactScan(artifact)));
}

async function completeRunRecord(run, output, artifacts = []) {
  const session = ensureSessionRecord(run.sessionId);
  run.status = session.cancelRequested ? "canceled" : "completed";
  run.output = output;
  run.artifacts = await withArtifactScans(artifacts);
  await persistRunArtifactsAsEvidence(run, run.artifacts, { database }).catch((error) => {
    mapleLog("warn", "openclaw_agent.evidence_persist_failed", {
      runId: run.runId,
      error: error instanceof Error ? error.message : String(error),
    });
  });
  run.cost = extractCostFromOutput(output);
  run.updatedAt = nowIso();

  session.status = run.status;
  session.updatedAt = run.updatedAt;
  if (run.status === "canceled") {
    session.lastError = "Run canceled by operator request.";
    emitSessionEvent(session.sessionId, "run_canceled", {
      runId: run.runId,
      type: run.type,
    });
  } else {
    session.lastError = "";
    emitSessionEvent(session.sessionId, "run_completed", {
      runId: run.runId,
      type: run.type,
    });
  }
  await persistRunRecord(run).catch(() => {});
  await persistSessionRecord(session).catch(() => {});
  await persistRunArtifacts(run, run.artifacts).catch(() => {});
}

function failRunRecord(run, errorText) {
  const session = ensureSessionRecord(run.sessionId);
  run.status = "failed";
  run.error = String(errorText ?? "Unknown execution error.");
  run.updatedAt = nowIso();

  session.status = "failed";
  session.lastError = run.error;
  session.updatedAt = run.updatedAt;
  persistRunRecord(run).catch(() => {});
  persistSessionRecord(session).catch(() => {});
  emitSessionEvent(session.sessionId, "run_failed", {
    runId: run.runId,
    type: run.type,
    error: run.error,
  });
}

function isSessionCancelRequested(sessionId) {
  const session = sessionStore.get(String(sessionId ?? ""));
  return Boolean(session?.cancelRequested);
}

function clampInt(value, min, max, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

function looksLikeGatewayLocalTarget() {
  if (!openclawAgentDevProfile) {
    return false;
  }
  return openclawAgentGatewayBind === "loopback" || openclawAgentGatewayBind === "auto";
}

function extractLastJson(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    // Ignore full-body parse failures.
  }
  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (!line.startsWith("{") && !line.startsWith("[")) {
      continue;
    }
    try {
      return JSON.parse(line);
    } catch {
      // Continue searching.
    }
  }
  return undefined;
}

function extractReplyFromParsed(parsed) {
  if (!parsed || typeof parsed !== "object") {
    return "";
  }
  const candidatePaths = [
    parsed.reply,
    parsed.output,
    parsed.text,
    parsed.content,
    parsed.response?.text,
    parsed.response?.content,
    parsed.result?.reply,
    parsed.result?.output,
    parsed.result?.text,
    parsed.message?.content,
    parsed.message,
  ];
  for (const candidate of candidatePaths) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  if (Array.isArray(parsed.messages) && parsed.messages.length > 0) {
    const last = parsed.messages[parsed.messages.length - 1];
    if (last && typeof last === "object" && typeof last.content === "string") {
      return String(last.content).trim();
    }
  }
  // OpenClaw payloads format: { payloads: [{ text: "..." }] }
  if (Array.isArray(parsed.payloads) && parsed.payloads.length > 0) {
    const texts = parsed.payloads
      .map((p) => (typeof p?.text === "string" ? p.text.trim() : ""))
      .filter(Boolean);
    if (texts.length > 0) return texts.join("\n");
  }
  return "";
}

function extractSessionIdFromParsed(parsed) {
  if (!parsed || typeof parsed !== "object") {
    return "";
  }
  const candidates = [
    parsed.sessionId,
    parsed.session_id,
    parsed.session?.id,
    parsed.result?.sessionId,
    parsed.result?.session_id,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return "";
}

function extractErrorFromParsed(parsed) {
  if (!parsed || typeof parsed !== "object") {
    return "";
  }
  const candidates = [
    parsed.error,
    parsed.errorMessage,
    parsed.message && parsed.ok === false ? parsed.message : "",
    parsed.result?.error,
    parsed.result?.errorMessage,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return "";
}

function extractLikelyErrorFromText(stdout, stderr) {
  const combined = [String(stdout ?? ""), String(stderr ?? "")].filter(Boolean).join("\n");
  if (!combined.trim()) {
    return "";
  }
  const lines = combined
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const patterns = [
    /FailoverError:/i,
    /Gateway call failed:/i,
    /No API key found/i,
    / lane task error:/i,
    /^\s*Error:/i,
  ];
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (patterns.some((pattern) => pattern.test(line))) {
      return line;
    }
  }
  return "";
}

export function parseOpenClawAgentOutput(stdoutRaw, stderrRaw) {
  const stdout = String(stdoutRaw ?? "").trim();
  const stderr = String(stderrRaw ?? "").trim();
  const parsed = extractLastJson(stdout);
  const parsedError = extractErrorFromParsed(parsed);
  const textError = extractLikelyErrorFromText(stdout, stderr);
  const error = parsedError || textError;
  const reply = parsed ? extractReplyFromParsed(parsed) : stdout;
  const sessionId = parsed ? extractSessionIdFromParsed(parsed) : "";
  return {
    ok: error.length === 0,
    error,
    reply,
    sessionId,
    parsed,
    stdout,
    stderr,
  };
}

function looksLikeUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value ?? "").trim()
  );
}

function resolveTargetAgentId(options = {}) {
  const explicitTarget =
    asString(options.targetAgentId) ??
    asString(options.openclawAgentId);
  if (explicitTarget) {
    return explicitTarget;
  }

  // Legacy compatibility: historically `agentId` was forwarded to `--agent`.
  // Skip UUID-shaped IDs so DB record IDs are not treated as OpenClaw agent keys.
  const legacyAgentId = asString(options.agentId);
  if (!legacyAgentId || looksLikeUuid(legacyAgentId)) {
    return "";
  }
  return legacyAgentId;
}

function firstUrlInText(value) {
  const match = String(value ?? "").match(/https?:\/\/[^\s)'"`]+/i);
  return match ? match[0] : "";
}

function sanitizePromptSubject(value) {
  return String(value ?? "")
    .replace(/^['"`]+|['"`]+$/g, "")
    .replace(/[.?!]\s*$/g, "")
    .trim();
}

function extractWikipediaTitle(message) {
  const match = String(message ?? "").match(/wikipedia (?:summary|article)?(?:\s+of)?\s+(.+?)(?:\s+(?:and|then)\b|$)/i);
  return match ? sanitizePromptSubject(match[1]) : "";
}

function extractSearchQuery(message) {
  const match = String(message ?? "").match(/(?:search for|look up|research|find information on|find info on|google|ask online|ask people on reddit about|ask reddit about)\s+(.+?)(?:\s+(?:and|then)\b|$)/i);
  return match ? sanitizePromptSubject(match[1]) : "";
}

function extractLocationHint(message) {
  const directCityState = String(message ?? "").match(/\b([A-Z][A-Za-z.\- ]+,\s*[A-Z]{2})\b/);
  if (directCityState) {
    return sanitizePromptSubject(
      directCityState[1].replace(/^(?:I live at|live at|at|where I live in)\s+/i, ""),
    );
  }
  const inLocation = String(message ?? "").match(/\b(?:in|near|around)\s+([A-Z][A-Za-z.\- ]+(?:,\s*[A-Z]{2})?)/);
  if (inLocation) {
    return sanitizePromptSubject(
      inLocation[1].replace(/^(?:I live at|live at|at)\s+/i, ""),
    );
  }
  return "";
}

function buildRecommendationQuery(message) {
  const normalized = String(message ?? "");
  const location = extractLocationHint(normalized);
  const wantsReddit = /\breddit\b/i.test(normalized);
  if (/\brestaurant|restaurants|eat|dining|food\b/i.test(normalized)) {
    const base = location ? `restaurants in ${location}` : "restaurants";
    return wantsReddit ? `site:reddit.com ${base}` : base;
  }
  if (/\brecommend|recommendation|best\b/i.test(normalized) && location) {
    const base = `recommendations in ${location}`;
    return wantsReddit ? `site:reddit.com ${base}` : base;
  }
  if (/\bwhere i live|near me|local service|around here\b/i.test(normalized) && location) {
    const base = `recommendations in ${location}`;
    return wantsReddit ? `site:reddit.com ${base}` : base;
  }
  return "";
}

function extractFilesystemPath(message) {
  const candidates = [];
  for (const match of String(message ?? "").matchAll(/[`'"]([^`'"]*\/[^`'"]+)['"`]/g)) {
    candidates.push(match[1]);
  }
  for (const match of String(message ?? "").matchAll(/\b([A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+)\b/g)) {
    candidates.push(match[1]);
  }
  const normalized = candidates
    .map((value) => String(value ?? "").trim())
    .filter((value) => value && !/^https?:\/\//i.test(value));
  return normalized[0] || "";
}

function buildContextWallRequestContext(overrides = {}) {
  const requestContext = currentRequestContext() ?? {};
  const authContext = authContextStorage.getStore?.() ?? {};
  const tenantId = asString(overrides.tenantId || requestContext.tenantId || authContext.tenantId || "default");
  const orgId = asString(overrides.orgId || requestContext.orgId || authContext.orgId || "default");
  return {
    requestId: asString(overrides.requestId || requestContext.requestId || ""),
    sessionId: asString(overrides.sessionId || requestContext.sessionId || ""),
    traceId: asString(overrides.traceId || requestContext.traceId || ""),
    runId: asString(overrides.runId || requestContext.runId || ""),
    userId: asString(overrides.userId || authContext.userId || requestContext.userId || "frontend-b-demo-user"),
    keyFingerprint: asString(authContext.keyFingerprint || ""),
    sourceService: "gateway-api",
    tenantId,
    deviceId: asString(overrides.deviceId || requestContext.deviceId || "frontend-b"),
    orgId,
  };
}

function getContextWallClient() {
  return getGrpcClients()?.contextWall ?? null;
}

async function sanitizePromptViaContextWall(prompt, options = {}, dependencies = {}) {
  if (typeof dependencies.sanitizePromptImpl === "function") {
    return dependencies.sanitizePromptImpl(prompt, options);
  }
  const contextWall = getContextWallClient();
  if (!contextWall) {
    return {
      sanitizedPrompt: prompt,
      blocked: false,
      blockedReason: "",
      matches: [],
      modified: false,
      policyMode: "strict",
      confidence: 0,
      rationale: "",
      redactedOriginalPrompt: prompt,
    };
  }
  const response = await grpcUnary(contextWall, "sanitizePrompt", {
    prompt,
    context: buildContextWallRequestContext(options),
  }, { deadlineMs: 10000 });
  const hasSanitizedPrompt = typeof response?.sanitizedPrompt === "string";
  const hasRedactedOriginalPrompt = typeof response?.redactedOriginalPrompt === "string";
  return {
    sanitizedPrompt: hasSanitizedPrompt ? String(response.sanitizedPrompt) : prompt,
    blocked: response?.blocked === true,
    blockedReason: String(response?.blockedReason || ""),
    matches: Array.isArray(response?.matches) ? response.matches : [],
    modified: response?.modified === true,
    policyMode: String(response?.policyMode || "strict"),
    confidence: Number(response?.confidence || 0),
    rationale: String(response?.rationale || ""),
    redactedOriginalPrompt: hasRedactedOriginalPrompt ? String(response.redactedOriginalPrompt) : prompt,
  };
}

async function sanitizeStructuredContentViaContextWall(content, options = {}, dependencies = {}) {
  if (typeof dependencies.sanitizeStructuredContentImpl === "function") {
    return dependencies.sanitizeStructuredContentImpl(content, options);
  }
  const contextWall = getContextWallClient();
  if (!contextWall) {
    return {
      allowed: true,
      blockedReason: "",
      sanitizedContent: content,
      modified: false,
      matches: [],
      policyMode: "strict",
      confidence: 0,
      rationale: "",
      redactedOriginalText: JSON.stringify(content ?? {}),
    };
  }
  const response = await grpcUnary(contextWall, "sanitizeStructuredContent", {
    contentJson: Buffer.from(JSON.stringify(content ?? {})),
    toolName: asString(options.toolName || ""),
    originText: asString(options.originText || ""),
    context: buildContextWallRequestContext(options),
  }, { deadlineMs: 10000 });
  let sanitizedContent = content;
  try {
    sanitizedContent = JSON.parse(Buffer.from(response?.sanitizedContentJson ?? Buffer.from("{}")).toString("utf8"));
  } catch {
    sanitizedContent = content;
  }
  return {
    allowed: response?.allowed !== false,
    blockedReason: String(response?.blockedReason || ""),
    sanitizedContent,
    modified: response?.modified === true,
    matches: Array.isArray(response?.matches) ? response.matches : [],
    policyMode: String(response?.policyMode || "strict"),
    confidence: Number(response?.confidence || 0),
    rationale: String(response?.rationale || ""),
    redactedOriginalText: String(response?.redactedOriginalText || JSON.stringify(content ?? {})),
  };
}

function leakageArtifactFromPrompt(sanitizedPrompt, originalPrompt) {
  return {
    artifactType: "context_leakage_prompt",
    filename: "context-leakage-prompt.json",
    contentType: "application/json",
    content: {
      originalRedactedPrompt: sanitizedPrompt.redactedOriginalPrompt || originalPrompt,
      sanitizedPrompt: sanitizedPrompt.sanitizedPrompt,
      blocked: sanitizedPrompt.blocked === true,
      blockedReason: sanitizedPrompt.blockedReason || "",
      modified: sanitizedPrompt.modified === true,
      matches: sanitizedPrompt.matches ?? [],
      policyMode: sanitizedPrompt.policyMode || "strict",
      confidence: Number(sanitizedPrompt.confidence || 0),
      rationale: sanitizedPrompt.rationale || "",
    },
  };
}

function leakageArtifactFromToolArgs(result, toolName, originalArgs) {
  return {
    artifactType: "context_leakage_outbound",
    filename: `context-leakage-${toolName || "tool"}.json`,
    contentType: "application/json",
    content: {
      toolName,
      blocked: result.allowed === false,
      blockedReason: result.blockedReason || "",
      modified: result.modified === true,
      matches: result.matches ?? [],
      policyMode: result.policyMode || "strict",
      confidence: Number(result.confidence || 0),
      redactedOriginalText: result.redactedOriginalText || JSON.stringify(originalArgs ?? {}),
      sanitizedContent: result.sanitizedContent ?? originalArgs ?? {},
      rationale: result.rationale || "",
    },
  };
}

function inferPromptMediation(message) {
  const normalized = String(message ?? "").trim();
  if (!normalized) {
    return null;
  }

  const explicitUrl = firstUrlInText(normalized);
  if (explicitUrl) {
    return {
      kind: "mediated_network",
      toolName: "web_fetch",
      toolArgs: {
        url: explicitUrl,
        maxChars: 2400,
      },
      summary: `Fetch ${explicitUrl}`,
    };
  }

  const wikipediaTitle = extractWikipediaTitle(normalized);
  if (wikipediaTitle) {
    return {
      kind: "mediated_network",
      toolName: "wikipedia_summary",
      toolArgs: {
        title: wikipediaTitle,
        lang: "en",
      },
      summary: `Wikipedia summary for ${wikipediaTitle}`,
    };
  }

  const searchQuery = extractSearchQuery(normalized);
  if (searchQuery) {
    return {
      kind: "mediated_network",
      toolName: "web_search",
      toolArgs: {
        query: searchQuery,
        maxResults: 5,
      },
      summary: `Web search for ${searchQuery}`,
    };
  }

  const recommendationQuery = buildRecommendationQuery(normalized);
  if (recommendationQuery) {
    return {
      kind: "mediated_network",
      toolName: "web_search",
      toolArgs: {
        query: recommendationQuery,
        maxResults: 5,
      },
      summary: `Recommendation search for ${recommendationQuery}`,
    };
  }

  if (/\b(delete|remove|wipe|rebuild|rewrite|replace|clean out|clean up)\b/i.test(normalized)) {
    const targetPath = extractFilesystemPath(normalized);
    if (targetPath) {
      const recursive = /\b(recursive|recursively|entire|whole|tree|from scratch|all)\b/i.test(normalized) || /\/src\/?$/.test(targetPath);
      return {
        kind: "mediated_filesystem",
        command: recursive ? `rm -rf ${targetPath}` : `rm -f ${targetPath}`,
        operations: [
          {
            type: "delete",
            path: targetPath,
            recursive,
          },
        ],
        summary: `Delete ${targetPath}`,
      };
    }
  }

  return null;
}

function buildMediationReply(payload = {}) {
  if (payload.kind === "mediated_filesystem") {
    const item = payload.item ?? {};
    return [
      `I did not execute the destructive filesystem request directly.`,
      `Maple created filesystem intervention plan ${item.planId || "--"} with lane ${item.lane || "--"} and status ${item.status || "--"}.`,
      `Review it in Frontend A under /maple/interventions before any promotion.`,
    ].join(" ");
  }

  if (payload.kind === "mediated_network") {
    const cyberReport = payload.cyberReport && typeof payload.cyberReport === "object"
      ? payload.cyberReport
      : null;
    const scan = cyberReport?.scan && typeof cyberReport.scan === "object"
      ? cyberReport.scan
      : payload.result?.scan && typeof payload.result.scan === "object"
        ? payload.result.scan
        : null;
    const scanSummary = scan
      ? `Scan provider=${scan.provider || "--"} stage=${scan.stage || "--"} verdict=${scan.verdict || "--"}.`
      : "";
    const cyberSummary = cyberReport
      ? cyberReport.quarantined
        ? `Cyber verdict: quarantined (${cyberReport.quarantineReason || "policy review required"}).`
        : cyberReport.malware
          ? `Cyber verdict: malicious content detected.`
          : cyberReport.urlReputation === "pending"
            ? `Cyber verdict: VirusTotal analysis pending.`
            : cyberReport.urlReputation === "blocked"
              ? `Cyber verdict: blocked by cyber policy.`
              : ""
      : "";
    if (payload.ok !== true) {
      return [
        `Maple blocked or quarantined the network action through the mediated firewall path.`,
        `tool=${payload.toolName || "--"} traceId=${payload.traceId || "--"} sessionId=${payload.sessionId || "--"}.`,
        cyberSummary || payload.error || "Review Frontend A /maple/cyber for the incident/evidence.",
        scanSummary,
        cyberSummary && payload.error ? payload.error : "",
      ].join(" ");
    }
    const rawPreview = String(payload.resultPreview || payload.resultText || "").trim();
    const hasMeaningfulPreview =
      rawPreview.length > 0 &&
      rawPreview !== "{}" &&
      rawPreview !== "[]";
    const preview =
      hasMeaningfulPreview
        ? rawPreview
        : payload.toolName === "web_fetch" && cyberSummary
          ? cyberSummary
          : "Review Frontend A /maple/cyber for evidence and scan state.";
    return [
      `Maple executed the network action through the mediated firewall path.`,
      `tool=${payload.toolName || "--"} traceId=${payload.traceId || "--"} sessionId=${payload.sessionId || "--"}.`,
      preview,
      scanSummary,
    ].join(" ");
  }

  return "Mediated action completed.";
}

async function maybeRunMediatedTurn(run, options = {}, dependencies = {}) {
  if (!openclawAgentMediationEnabled) {
    return null;
  }
  const intent = inferPromptMediation(options.message);
  if (!intent) {
    return null;
  }

  const requestContext = currentRequestContext() ?? {};
  const tenantId = asString(options.tenantId || requestContext.tenantId || "default");
  const orgId = asString(options.orgId || requestContext.orgId || "default");
  const userId = asString(options.userId || requestContext.userId || "frontend-b-demo-user");
  const deviceId = asString(options.deviceId || requestContext.deviceId || "cli");
  const mediationTraceId = asString(requestContext.traceId || `openclaw-mediated-${run.runId}`);

  if (intent.kind === "mediated_filesystem") {
    const item = await (dependencies.preflightFilesystemMutationImpl ?? preflightFilesystemMutation)({
      workspaceRoot: process.cwd(),
      toolName: "shell",
      sourceSurface: "frontendB",
      sourceType: "agent_prompt",
      taskText: asString(options.message),
      command: intent.command,
      operations: intent.operations,
      traceId: mediationTraceId,
      sessionId: run.sessionId,
      runId: run.runId,
    }, {
      database,
      tenantId,
      orgId,
      traceId: mediationTraceId,
      sessionId: run.sessionId,
      runId: run.runId,
      actorUserId: userId,
    });
    if (!item) {
      throw new Error("Filesystem mediation did not detect a mutation plan.");
    }
    const mediationPayload = {
      kind: "mediated_filesystem",
      item: {
        planId: item.planId,
        lane: item.lane,
        status: item.status,
        traceId: item.traceId,
        sessionId: item.sessionId,
        runId: item.runId,
      },
    };
    return {
      reply: buildMediationReply(mediationPayload),
      raw: {
        mediation: mediationPayload,
      },
      artifacts: [
        {
          artifactType: "filesystem_mediation",
          filename: `filesystem-mediation-${item.planId}.json`,
          contentType: "application/json",
          traceId: item.traceId,
          content: mediationPayload,
        },
      ],
    };
  }

  if (openclawAgentRequireVirustotal) {
    if (downloadScanProvider !== "virustotal" || !downloadScanVirusTotalApiKey) {
      throw new Error("OpenClaw mediated network actions require VirusTotal-backed scanning, but MAPLE_DOWNLOAD_SCAN_PROVIDER=virustotal with a real MAPLE_VIRUSTOTAL_API_KEY is not configured.");
    }
  }

  const appIds = dependencies.resolveDispatchAppIdsImpl
    ? dependencies.resolveDispatchAppIdsImpl({
        includeDefaultExecutionOrder: true,
      })
    : resolveDispatchAppIds({
        includeDefaultExecutionOrder: true,
      });

  const sanitizedToolArgs = await sanitizeStructuredContentViaContextWall(intent.toolArgs, {
    sessionId: run.sessionId,
    traceId: mediationTraceId,
    tenantId,
    orgId,
    userId,
    deviceId,
    toolName: intent.toolName,
    originText: asString(options.message),
  }, dependencies);
  if (sanitizedToolArgs.allowed === false) {
    const mediationPayload = {
      kind: "mediated_network",
      ok: false,
      toolName: intent.toolName,
      appIds,
      traceId: mediationTraceId,
      sessionId: run.sessionId,
      runId: run.runId,
      error: sanitizedToolArgs.blockedReason || "Sensitive outbound tool arguments blocked by context leakage policy.",
      blockedByPolicy: true,
      policy: {
        action: "deny",
        rule: "context-leakage-block",
        message: sanitizedToolArgs.blockedReason || "Sensitive outbound tool arguments blocked by context leakage policy.",
      },
      cyberReport: null,
    };
    return {
      reply: buildMediationReply(mediationPayload),
      raw: {
        mediation: mediationPayload,
      },
      artifacts: [
        leakageArtifactFromToolArgs(sanitizedToolArgs, intent.toolName, intent.toolArgs),
        {
          artifactType: "network_mediation",
          filename: `network-mediation-${run.runId}.json`,
          contentType: "application/json",
          traceId: mediationPayload.traceId,
          url: intent.toolArgs?.url || "",
          content: mediationPayload,
        },
      ],
    };
  }

  const chainResult = await (dependencies.dispatchDownstreamChainAndLogImpl ?? dispatchDownstreamChainAndLog)({
    appIds,
    toolName: intent.toolName,
    toolArgs: {
      ...(sanitizedToolArgs.sanitizedContent ?? intent.toolArgs),
      runId: run.runId,
    },
    sessionId: run.sessionId,
    traceId: "",
    origin: "openclaw_agent",
    tenantId,
    orgId,
    userId,
    deviceId,
    runId: run.runId,
  });

  const finalResult = chainResult.finalResult ?? {};
  const mediationPayload = {
    kind: "mediated_network",
    ok: chainResult.ok === true,
    toolName: intent.toolName,
    appIds,
    traceId: finalResult.trace?.id || "",
    sessionId: finalResult.trace?.sessionId || run.sessionId,
    runId: run.runId,
    resultPreview: finalResult.dispatch?.textPreview || "",
    result: finalResult.dispatch?.result ?? null,
    error: chainResult.ok ? "" : (chainResult.failure || finalResult.failure || ""),
    blockedByPolicy: chainResult.blockedByPolicy === true,
    policy: finalResult.preExecutionDecision ?? null,
    cyberReport: finalResult.dispatch?.cyberReport ?? finalResult.cyberReport ?? null,
  };
  return {
    reply: buildMediationReply(mediationPayload),
    raw: {
      mediation: mediationPayload,
    },
    artifacts: [
      ...(sanitizedToolArgs.modified
        ? [leakageArtifactFromToolArgs(sanitizedToolArgs, intent.toolName, intent.toolArgs)]
        : []),
      {
        artifactType: "network_mediation",
        filename: `network-mediation-${run.runId}.json`,
        contentType: "application/json",
        traceId: mediationPayload.traceId,
        url: intent.toolArgs?.url || "",
        content: mediationPayload,
      },
    ],
  };
}

export function buildOpenClawAgentArgs(options = {}) {
  const mode = options.mode === "local" ? "local" : "gateway";
  const devProfile = options.devProfile === true;
  const sessionId = asString(options.sessionId) ?? openclawAgentDefaultSessionId;
  const thinking = asString(options.thinking) ?? openclawAgentDefaultThinking;
  const timeoutSeconds = clampInt(
    options.timeoutSeconds,
    15,
    1200,
    openclawAgentDefaultTimeoutSeconds
  );

  const args = [];
  if (devProfile) {
    args.push("--dev");
  }
  args.push("agent");
  if (mode === "local") {
    args.push("--local");
  }
  args.push("--json");
  if (sessionId) {
    args.push("--session-id", sessionId);
  }
  const targetAgentId = resolveTargetAgentId(options);
  if (targetAgentId) {
    args.push("--agent", targetAgentId);
  }
  if (asString(options.to)) {
    args.push("--to", String(options.to));
  }
  if (options.deliver === true) {
    args.push("--deliver");
  }
  if (thinking) {
    args.push("--thinking", thinking);
  }
  const modelFlag = asString(options.model);
  if (modelFlag) {
    if (!/^[a-zA-Z0-9\/_.\-:]+$/.test(modelFlag)) {
      throw new Error(`Invalid model identifier: "${modelFlag}"`);
    }
    args.push("--model", modelFlag);
  }
  args.push("--timeout", String(timeoutSeconds));
  // Pass equipped tools as --allowlist so the agent only sees its assigned tools
  if (Array.isArray(options.tools) && options.tools.length > 0) {
    args.push("--allowlist", options.tools.join(","));
  }
  if (asString(options.message)) {
    args.push("--message", String(options.message));
  }
  return args;
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(500);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, "127.0.0.1");
  });
}

async function waitForGatewayPort(port, timeoutMs = 15000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    // eslint-disable-next-line no-await-in-loop
    if (await isPortOpen(port)) {
      return true;
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolveSleep) => setTimeout(resolveSleep, 250));
  }
  return false;
}

function startGatewayProcessIfNeeded() {
  if (!openclawAgentAutoStartGateway || !looksLikeGatewayLocalTarget()) {
    return;
  }
  if (gatewayProcess && gatewayProcess.exitCode == null) {
    return;
  }
  const args = [];
  if (openclawAgentDevProfile) {
    args.push("--dev");
  }
  args.push(
    "gateway",
    "run",
    "--port",
    String(openclawAgentGatewayPort),
    "--bind",
    openclawAgentGatewayBind,
    "--allow-unconfigured",
    "--verbose"
  );
  gatewayProcess = spawn("openclaw", args, {
    stdio: "ignore",
  });
  runtimeState.gatewayAutoStarted = true;
  gatewayProcess.on("exit", (code) => {
    mapleLog("warn", "openclaw_agent.gateway_exit", {
      code: typeof code === "number" ? code : null,
    });
  });
}

async function ensureCliAvailable() {
  await execFileAsync("openclaw", ["--version"], {
    timeout: 4000,
    maxBuffer: 1024 * 1024,
  });
}

// ── NemoClaw sandbox support ──────────────────────────

function useNemoClaw(options = {}) {
  if (!nemoClawEnabled) return false;
  if (options.nemoclaw === false) return false;
  if (options.nemoclaw === true) return true;
  return nemoClawEnabled;
}

function resolveNemoClawSandbox(options = {}) {
  return asString(options.nemoClawSandbox) || nemoClawSandboxName;
}

function resolveClawCommand(openclawArgs, options = {}) {
  if (useNemoClaw(options) && runtimeState.nemoClawAvailable) {
    const sandbox = resolveNemoClawSandbox(options);
    return {
      cmd: "nemoclaw",
      args: [sandbox, "connect", "--", "openclaw", ...openclawArgs],
      runtime: "nemoclaw",
      sandbox,
    };
  }
  return { cmd: "openclaw", args: openclawArgs, runtime: "openclaw", sandbox: null };
}

async function ensureNemoClawAvailable() {
  try {
    await execFileAsync("nemoclaw", ["--version"], {
      timeout: 4000,
      maxBuffer: 1024 * 1024,
    });
    return true;
  } catch {
    return false;
  }
}

export async function bootstrapOpenClawRuntime() {
  runtimeState.lastCheckAt = new Date().toISOString();
  if (!runtimeState.enabled) {
    runtimeState.bootstrapped = true;
    runtimeState.ready = false;
    runtimeState.lastError = "OpenClaw agent runtime disabled by MAPLE_OPENCLAW_AGENT_ENABLED.";
    return getOpenClawRuntimeStatus();
  }

  try {
    await ensureCliAvailable();
    runtimeState.cliAvailable = true;
    if (runtimeState.mode === "gateway" && openclawAgentAutoStartGateway && looksLikeGatewayLocalTarget()) {
      const alreadyOpen = await isPortOpen(openclawAgentGatewayPort);
      if (!alreadyOpen) {
        startGatewayProcessIfNeeded();
        const opened = await waitForGatewayPort(openclawAgentGatewayPort);
        if (!opened) {
          throw new Error(
            `OpenClaw gateway did not become reachable on 127.0.0.1:${openclawAgentGatewayPort}.`
          );
        }
      }
    }
    // Check NemoClaw availability if enabled
    if (nemoClawEnabled) {
      const nemoClawAvail = await ensureNemoClawAvailable();
      runtimeState.nemoClawAvailable = nemoClawAvail;
      if (nemoClawAvail) {
        mapleLog("info", "openclaw_agent.nemoclaw_available", { sandbox: nemoClawSandboxName });
      } else {
        mapleLog("warn", "openclaw_agent.nemoclaw_unavailable", {
          message: "NemoClaw CLI not found. Falling back to direct OpenClaw execution.",
        });
      }
    }
    runtimeState.ready = true;
    runtimeState.lastError = "";
    runtimeState.bootstrapped = true;
    mapleLog("info", "openclaw_agent.runtime_ready", {
      mode: runtimeState.mode,
      autoStartedGateway: runtimeState.gatewayAutoStarted,
    });
    return getOpenClawRuntimeStatus();
  } catch (error) {
    runtimeState.cliAvailable = false;
    runtimeState.ready = false;
    runtimeState.bootstrapped = true;
    runtimeState.lastError = error instanceof Error ? error.message : String(error);
    mapleLog("warn", "openclaw_agent.runtime_unavailable", {
      error: runtimeState.lastError,
      mode: runtimeState.mode,
    });
    if (openclawAgentRequired) {
      throw new Error(runtimeState.lastError);
    }
    return getOpenClawRuntimeStatus();
  }
}

function assertRuntimeEnabled() {
  if (!runtimeState.enabled) {
    throw new Error("OpenClaw agent runtime is disabled.");
  }
}

function resolveRuntimeOptions(options) {
  return {
    mode: options.mode === "local" ? "local" : runtimeState.mode,
    devProfile:
      typeof options.devProfile === "boolean" ? options.devProfile : openclawAgentDevProfile,
  };
}

export async function runOpenClawTurn(options = {}, dependencies = {}) {
  assertRuntimeEnabled();
  if (!runtimeState.bootstrapped) {
    await bootstrapOpenClawRuntime();
  }
  if (!runtimeState.cliAvailable) {
    throw new Error(runtimeState.lastError || "OpenClaw CLI is unavailable.");
  }

  const resolved = resolveRuntimeOptions(options);
  const message = asString(options.message);
  if (!message) {
    throw new Error("Missing OpenClaw agent message.");
  }
  const requestedSessionId =
    asString(options.sessionId) ?? openclawAgentDefaultSessionId;
  const requestContext = currentRequestContext() ?? {};
  const preallocatedRunId = randomUUID();
  const promptSanitization = await sanitizePromptViaContextWall(message, {
    runId: preallocatedRunId,
    sessionId: requestedSessionId,
    traceId: asString(requestContext.traceId || ""),
    tenantId: asString(options.tenantId || requestContext.tenantId || "default"),
    orgId: asString(options.orgId || requestContext.orgId || "default"),
    userId: asString(options.userId || requestContext.userId || "frontend-b-demo-user"),
    deviceId: asString(options.deviceId || requestContext.deviceId || "frontend-b"),
  }, dependencies);
  const sanitizedMessage = promptSanitization.blocked ? "" : asString(promptSanitization.sanitizedPrompt || message) || message;
  const run = await createRunRecord({
    runId: preallocatedRunId,
    type: "turn",
    sessionId: requestedSessionId,
    parentRunId: asString(options.parentRunId) || null,
    input: {
      message: sanitizedMessage || promptSanitization.redactedOriginalPrompt || "",
      mode: resolved.mode,
      deliver: options.deliver === true,
      agentId: asString(options.agentId) || null,
      sanitized: promptSanitization.modified === true || promptSanitization.blocked === true,
    },
  });
  const promptSanitizationArtifact = leakageArtifactFromPrompt(promptSanitization, message);
  if (promptSanitization.blocked) {
    const resultPayload = {
      mode: "context-wall",
      sessionId: run.sessionId,
      reply: promptSanitization.blockedReason || "Maple blocked the request because it contained protected context.",
      raw: {
        policy: {
          blocked: true,
          reason: promptSanitization.blockedReason || "",
          matches: promptSanitization.matches ?? [],
        },
      },
    };
    await completeRunRecord(run, resultPayload, [
      promptSanitizationArtifact,
      {
        artifactType: "reply",
        content: resultPayload.reply,
      },
      {
        artifactType: "raw",
        content: resultPayload.raw,
      },
    ]);
    mapleLog("info", "openclaw_agent.turn_complete", {
      mode: "context-wall-blocked",
      sessionId: run.sessionId,
      replyChars: resultPayload.reply.length,
    });
    return {
      ...resultPayload,
      runId: run.runId,
    };
  }
  if (isSessionCancelRequested(run.sessionId)) {
    await completeRunRecord(run, { canceled: true }, []);
    throw new Error("OpenClaw session was canceled.");
  }
  const args = buildOpenClawAgentArgs({
    ...options,
    message: sanitizedMessage,
    sessionId: run.sessionId,
    mode: resolved.mode,
    devProfile: resolved.devProfile,
  });
  const timeoutSeconds = clampInt(
    options.timeoutSeconds,
    15,
    1200,
    openclawAgentDefaultTimeoutSeconds
  );
  const execImpl = dependencies.execImpl ?? execFileAsync;

  try {
    const mediated = await maybeRunMediatedTurn(run, {
      ...options,
      message: sanitizedMessage,
    }, dependencies);
    if (mediated) {
      const resultPayload = {
        mode: "mediated",
        sessionId: run.sessionId,
        reply: mediated.reply,
        raw: mediated.raw,
      };
      await completeRunRecord(run, resultPayload, [
        ...(promptSanitization.modified || (promptSanitization.matches?.length ?? 0) > 0 ? [promptSanitizationArtifact] : []),
        {
          artifactType: "reply",
          content: mediated.reply,
        },
        {
          artifactType: "raw",
          content: mediated.raw ?? null,
        },
        ...(Array.isArray(mediated.artifacts) ? mediated.artifacts : []),
      ]);
      mapleLog("info", "openclaw_agent.turn_complete", {
        mode: "mediated",
        sessionId: run.sessionId,
        replyChars: mediated.reply.length,
      });
      return {
        ...resultPayload,
        runId: run.runId,
      };
    }

    const clawCmd = resolveClawCommand(args, options);
    mapleLog("info", "openclaw_agent.turn_begin", {
      mode: resolved.mode,
      sessionId: run.sessionId,
      deliver: options.deliver === true,
      runtime: clawCmd.runtime,
      sandbox: clawCmd.sandbox,
    });
    const { stdout, stderr } = await execImpl(clawCmd.cmd, clawCmd.args, {
      timeout: timeoutSeconds * 1000 + 3000,
      maxBuffer: 8 * 1024 * 1024,
    });
    const parsed = parseOpenClawAgentOutput(stdout, stderr);
    mapleLog("info", "openclaw_agent.turn_raw_output", {
      mode: resolved.mode,
      stdoutLen: stdout.length,
      stderrLen: stderr.length,
      stdoutPreview: stdout.slice(0, 500),
      parsedKeys: parsed.parsed ? Object.keys(parsed.parsed).join(",") : "none",
      replyLen: parsed.reply.length,
    });
    if (!parsed.ok) {
      throw new Error(parsed.error || "OpenClaw agent call returned no usable reply.");
    }
    const resolvedSessionId = run.sessionId;
    const resultPayload = {
      mode: resolved.mode,
      sessionId: resolvedSessionId,
      reply: parsed.reply,
      raw: parsed.parsed ?? null,
    };
    await completeRunRecord(run, resultPayload, [
      ...(promptSanitization.modified || (promptSanitization.matches?.length ?? 0) > 0 ? [promptSanitizationArtifact] : []),
      {
        artifactType: "reply",
        content: parsed.reply,
      },
      {
        artifactType: "raw",
        content: parsed.parsed ?? null,
      },
    ]);
    mapleLog("info", "openclaw_agent.turn_complete", {
      mode: resolved.mode,
      sessionId: resolvedSessionId,
      replyChars: parsed.reply.length,
    });
    return {
      ...resultPayload,
      runId: run.runId,
    };
  } catch (error) {
    const stdout = error && typeof error === "object" ? error.stdout : "";
    const stderr = error && typeof error === "object" ? error.stderr : "";
    const parsed = parseOpenClawAgentOutput(stdout, stderr);
    const messageText =
      parsed.error ||
      (error instanceof Error ? error.message : String(error)) ||
      "Unknown OpenClaw execution failure.";
    mapleLog("warn", "openclaw_agent.turn_failed", {
      mode: resolved.mode,
      error: messageText,
    });
    failRunRecord(run, messageText);
    throw new Error(`OpenClaw agent execution failed: ${messageText}`);
  }
}

export async function runOpenClawLongform(options = {}) {
  const objective = asString(options.objective);
  if (!objective) {
    throw new Error("Missing longform objective.");
  }
  const maxTurns = clampInt(options.maxTurns, 1, 8, 4);
  const sessionId = asString(options.sessionId) ?? openclawAgentDefaultSessionId;
  const run = await createRunRecord({
    type: "longform",
    sessionId,
    parentRunId: asString(options.parentRunId) || null,
    input: {
      objective,
      maxTurns,
      agentId: asString(options.agentId) || null,
    },
  });
  const turns = [];
  let completed = false;

  let prompt = [
    "You are Maple core backend intelligence for thin-client and longform workflows.",
    `Objective: ${objective}`,
    "Generate a concise execution plan and immediately begin execution.",
    "When fully complete, prefix your final response with TASK_COMPLETE:.",
  ].join("\n");

  try {
    for (let turn = 1; turn <= maxTurns; turn += 1) {
      if (isSessionCancelRequested(run.sessionId)) {
        const output = {
          sessionId: run.sessionId,
          objective,
          completed: false,
          turns,
          canceled: true,
        };
        await completeRunRecord(run, output, [
          {
            artifactType: "turns",
            content: turns,
          },
        ]);
        return {
          ...output,
          runId: run.runId,
        };
      }
      // eslint-disable-next-line no-await-in-loop
      const result = await runOpenClawTurn({
        ...options,
        sessionId: run.sessionId,
        message: prompt,
      });
      turns.push({ turn, reply: result.reply });
      if (/TASK_COMPLETE:/i.test(result.reply)) {
        completed = true;
        break;
      }
      prompt = [
        `Objective: ${objective}`,
        `Previous response: ${result.reply}`,
        "Continue execution toward completion. Use concrete next actions.",
        "When done, prefix your final response with TASK_COMPLETE:.",
      ].join("\n");
    }

    const output = {
      sessionId: run.sessionId,
      objective,
      completed,
      turns,
    };
    await completeRunRecord(run, output, [
      {
        artifactType: "turns",
        content: turns,
      },
    ]);

    return {
      ...output,
      runId: run.runId,
    };
  } catch (error) {
    const errorText = error instanceof Error ? error.message : String(error);
    failRunRecord(run, errorText);
    throw error;
  }
}

function toPublicSession(session) {
  let lastInputPreview = "";
  if (session.lastRunId) {
    const lastRun = runStore.get(session.lastRunId);
    const msg = lastRun?.input?.message ?? lastRun?.input?.objective ?? "";
    lastInputPreview = msg.length > 80 ? msg.slice(0, 80) + "..." : msg;
  }
  return {
    sessionId: session.sessionId,
    status: session.status,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    lastRunId: session.lastRunId,
    lastError: session.lastError,
    cancelRequested: session.cancelRequested,
    runCount: session.runIds.length,
    lastInputPreview,
  };
}

function toPublicSessionFromRow(row, lastInputPreview = "") {
  const runIds = parseJson(row.run_ids_json, []);
  return {
    sessionId: row.session_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastRunId: row.last_run_id,
    lastError: row.last_error,
    cancelRequested: row.cancel_requested === true || row.cancel_requested === "true",
    runCount: Array.isArray(runIds) ? runIds.length : 0,
    lastInputPreview,
  };
}

function toPublicRun(run) {
  return {
    runId: run.runId,
    type: run.type,
    sessionId: run.sessionId,
    status: run.status,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    error: run.error,
    cost: run.cost ?? null,
    parentRunId: run.parentRunId ?? null,
    childRunIds: run.childRunIds ?? [],
  };
}

const VALID_SESSION_STATUSES = new Set(["idle", "running", "completed", "failed", "canceled", "cancel_requested"]);

export async function listOpenClawSessions(options = {}) {
  const filterStatus = typeof options.status === "string" && VALID_SESSION_STATUSES.has(options.status) ? options.status : undefined;
  const filterAgentId = typeof options.agentId === "string" && options.agentId.trim() ? options.agentId.trim() : undefined;

  if (hasPersistentDatabase()) {
    return (async () => {
      await ensureOpenClawPersistence();
      const limit = clampInt(options.limit, 1, 100, 20);
      const offset = parseCursorOffset(options.cursor);
      const params = [];
      const conditions = [];
      let paramIdx = 0;

      if (filterStatus) {
        paramIdx++;
        conditions.push(`s.status = $${paramIdx}`);
        params.push(filterStatus);
      }
      if (filterAgentId) {
        paramIdx++;
        const escapedAgentId = filterAgentId.replace(/[\\%_]/g, "\\$&");
        conditions.push(`EXISTS (SELECT 1 FROM openclaw_agent_runs ar WHERE ar.session_id = s.session_id AND COALESCE(ar.input_json, '{}')::text ILIKE $${paramIdx} ESCAPE '\\')`);
        params.push(`%"agentId":"${escapedAgentId}"%`);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      paramIdx++;
      const limitParam = paramIdx;
      params.push(limit);
      paramIdx++;
      const offsetParam = paramIdx;
      params.push(offset);

      const result = await database.pool.query(
        `SELECT s.*,
                r.input_json AS last_input_json
           FROM openclaw_agent_sessions s
      LEFT JOIN openclaw_agent_runs r ON r.run_id = s.last_run_id
          ${whereClause}
       ORDER BY s.updated_at DESC
          LIMIT $${limitParam} OFFSET $${offsetParam}`,
        params,
      );
      const items = result.rows.map((row) => {
        const input = parseJson(row.last_input_json, {});
        const msg = String(input?.message ?? input?.objective ?? "");
        const preview = msg.length > 80 ? `${msg.slice(0, 80)}...` : msg;
        return toPublicSessionFromRow(row, preview);
      });
      const nextCursor = result.rows.length === limit ? String(offset + result.rows.length) : "";
      return { items, nextCursor };
    })();
  }
  const limit = clampInt(options.limit, 1, 100, 20);
  const offset = parseCursorOffset(options.cursor);
  let all = [...sessionStore.values()].sort((a, b) =>
    String(b.updatedAt).localeCompare(String(a.updatedAt))
  );
  if (filterStatus) {
    all = all.filter((s) => s.status === filterStatus);
  }
  if (filterAgentId) {
    all = all.filter((s) =>
      s.runIds.some((runId) => {
        const run = runStore.get(runId);
        return run && String(run.input?.agentId ?? "") === filterAgentId;
      })
    );
  }
  const items = all.slice(offset, offset + limit).map(toPublicSession);
  const nextCursor = offset + limit < all.length ? String(offset + limit) : "";
  return { items, nextCursor };
}

export async function getOpenClawSession(sessionId) {
  if (hasPersistentDatabase()) {
    return (async () => {
      await ensureOpenClawPersistence();
      const sessionResult = await database.pool.query(`SELECT * FROM openclaw_agent_sessions WHERE session_id = $1 LIMIT 1`, [String(sessionId ?? "")]);
      if (sessionResult.rows.length === 0) return null;
      const runsResult = await database.pool.query(
        `SELECT * FROM openclaw_agent_runs WHERE session_id = $1 ORDER BY updated_at DESC`,
        [String(sessionId ?? "")],
      );
      const eventsResult = await database.pool.query(
        `SELECT cursor FROM openclaw_agent_run_events WHERE session_id = $1 ORDER BY sequence DESC LIMIT 1`,
        [String(sessionId ?? "")],
      );
      return {
        ...toPublicSessionFromRow(sessionResult.rows[0]),
        runs: runsResult.rows.map((row) => toPublicRun({
          runId: row.run_id,
          type: row.type,
          sessionId: row.session_id,
          status: row.status,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          error: row.error,
          cost: parseJson(row.cost_json, null),
          parentRunId: row.parent_run_id,
          childRunIds: parseJson(row.child_run_ids_json, []),
        })),
        latestEventCursor: eventsResult.rows[0]?.cursor ?? "0",
      };
    })();
  }
  const session = sessionStore.get(String(sessionId ?? ""));
  if (!session) {
    return null;
  }
  const runs = session.runIds
    .map((runId) => runStore.get(runId))
    .filter(Boolean)
    .map(toPublicRun)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return {
    ...toPublicSession(session),
    runs,
    latestEventCursor:
      session.events.length > 0
        ? session.events[session.events.length - 1].cursor
        : "0",
  };
}

export async function cancelOpenClawSession(sessionId) {
  const TERMINAL_STATUSES = new Set(["completed", "failed", "canceled"]);
  if (hasPersistentDatabase()) {
    return (async () => {
      await ensureOpenClawPersistence();
      // First, read the current status before updating
      const preCheck = await database.pool.query(
        `SELECT status FROM openclaw_agent_sessions WHERE session_id = $1 LIMIT 1`,
        [String(sessionId ?? "")],
      );
      if (preCheck.rows.length === 0) return null;
      const previousStatus = preCheck.rows[0].status;
      const wasAlreadyTerminal = TERMINAL_STATUSES.has(previousStatus);

      const updatedAt = nowIso();
      const result = await database.pool.query(`
        UPDATE openclaw_agent_sessions
           SET cancel_requested = TRUE,
               status = CASE WHEN status = 'running' THEN 'cancel_requested' WHEN status != 'completed' THEN 'canceled' ELSE status END,
               updated_at = $2
         WHERE session_id = $1
         RETURNING *
      `, [String(sessionId ?? ""), updatedAt]);
      if (result.rows.length === 0) return null;
      const session = ensureSessionRecord(sessionId);
      session.cancelRequested = true;
      session.status = result.rows[0].status;
      session.updatedAt = updatedAt;
      emitSessionEvent(session.sessionId, "cancel_requested", { sessionId: session.sessionId });
      if (!wasAlreadyTerminal) {
        emitAuditEvent({
          eventType: "AUDIT_EVENT_TYPE_SESSION_CANCELED",
          sourceService: "openclaw-agent-runtime",
          summary: `OpenClaw session ${session.sessionId} canceled`,
          payload: { sessionId: session.sessionId },
        });
      }
      const publicSession = toPublicSessionFromRow(result.rows[0]);
      if (wasAlreadyTerminal) {
        publicSession.alreadyTerminal = true;
      }
      return publicSession;
    })();
  }
  const session = sessionStore.get(String(sessionId ?? ""));
  if (!session) {
    return null;
  }
  const wasAlreadyTerminal = TERMINAL_STATUSES.has(session.status);
  session.cancelRequested = true;
  if (session.status === "running") {
    session.status = "cancel_requested";
  } else if (session.status !== "completed") {
    session.status = "canceled";
  }
  session.updatedAt = nowIso();
  persistSessionRecord(session).catch(() => {});
  emitSessionEvent(session.sessionId, "cancel_requested", {
    sessionId: session.sessionId,
  });
  if (!wasAlreadyTerminal) {
    emitAuditEvent({
      eventType: "AUDIT_EVENT_TYPE_SESSION_CANCELED",
      sourceService: "openclaw-agent-runtime",
      summary: `OpenClaw session ${session.sessionId} canceled`,
      payload: { sessionId: session.sessionId },
    });
  }
  const publicSession = toPublicSession(session);
  if (wasAlreadyTerminal) {
    publicSession.alreadyTerminal = true;
  }
  return publicSession;
}

export async function getOpenClawRunArtifacts(runId) {
  if (hasPersistentDatabase()) {
    await ensureOpenClawPersistence();
    const runResult = await database.pool.query(`SELECT * FROM openclaw_agent_runs WHERE run_id = $1 LIMIT 1`, [String(runId ?? "")]);
    if (runResult.rows.length === 0) return null;
    const artifactsResult = await database.pool.query(
      `SELECT artifact_json FROM openclaw_agent_run_artifacts WHERE run_id = $1 ORDER BY artifact_index ASC`,
      [String(runId ?? "")],
    );
    const artifacts = await withArtifactScans(artifactsResult.rows.map((row) => parseJson(row.artifact_json, {})));
    const row = runResult.rows[0];
    return {
      ...toPublicRun({
        runId: row.run_id,
        type: row.type,
        sessionId: row.session_id,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        error: row.error,
        cost: parseJson(row.cost_json, null),
        parentRunId: row.parent_run_id,
        childRunIds: parseJson(row.child_run_ids_json, []),
      }),
      output: parseJson(row.output_json, null),
      artifacts,
    };
  }
  const run = runStore.get(String(runId ?? ""));
  if (!run) {
    return null;
  }
  run.artifacts = await withArtifactScans(run.artifacts);
  return {
    ...toPublicRun(run),
    output: run.output,
    artifacts: run.artifacts,
  };
}

export async function listOpenClawRuns(options = {}) {
  if (hasPersistentDatabase()) {
    return (async () => {
      await ensureOpenClawPersistence();
      const limit = clampInt(options.limit, 1, 100, 20);
      const offset = parseCursorOffset(options.cursor);
      const result = await database.pool.query(
        `SELECT * FROM openclaw_agent_runs ORDER BY updated_at DESC LIMIT $1 OFFSET $2`,
        [limit, offset],
      );
      const items = result.rows.map((row) => toPublicRun({
        runId: row.run_id,
        type: row.type,
        sessionId: row.session_id,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        error: row.error,
        cost: parseJson(row.cost_json, null),
        parentRunId: row.parent_run_id,
        childRunIds: parseJson(row.child_run_ids_json, []),
      }));
      const nextCursor = result.rows.length === limit ? String(offset + result.rows.length) : "";
      return { items, nextCursor };
    })();
  }
  const limit = clampInt(options.limit, 1, 100, 20);
  const offset = parseCursorOffset(options.cursor);
  const all = [...runStore.values()].sort((a, b) =>
    String(b.updatedAt).localeCompare(String(a.updatedAt))
  );
  const items = all.slice(offset, offset + limit).map(toPublicRun);
  const nextCursor = offset + limit < all.length ? String(offset + limit) : "";
  return { items, nextCursor };
}

export async function getOpenClawRun(runId) {
  if (hasPersistentDatabase()) {
    return (async () => {
      await ensureOpenClawPersistence();
      const result = await database.pool.query(`SELECT * FROM openclaw_agent_runs WHERE run_id = $1 LIMIT 1`, [String(runId ?? "")]);
      if (result.rows.length === 0) return null;
      const row = result.rows[0];
      return {
        ...toPublicRun({
          runId: row.run_id,
          type: row.type,
          sessionId: row.session_id,
          status: row.status,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          error: row.error,
          cost: parseJson(row.cost_json, null),
          parentRunId: row.parent_run_id,
          childRunIds: parseJson(row.child_run_ids_json, []),
        }),
        input: parseJson(row.input_json, {}),
        output: parseJson(row.output_json, null),
      };
    })();
  }
  const run = runStore.get(String(runId ?? ""));
  if (!run) {
    return null;
  }
  return {
    ...toPublicRun(run),
    input: run.input,
    output: run.output,
  };
}

export async function getOpenClawRunTimeline(runId) {
  if (hasPersistentDatabase()) {
    return (async () => {
      await ensureOpenClawPersistence();
      const run = await getOpenClawRun(runId);
      if (!run) return null;
      const result = await database.pool.query(
        `SELECT event_id, event_type, timestamp, payload_json, cursor
           FROM openclaw_agent_run_events
          WHERE run_id = $1
          ORDER BY sequence ASC`,
        [String(runId ?? "")],
      );
      return {
        run,
        timeline: result.rows.map((row) => ({
          id: row.event_id,
          eventType: row.event_type,
          timestamp: row.timestamp,
          payload: parseJson(row.payload_json, {}),
          cursor: row.cursor,
        })),
      };
    })();
  }
  const run = runStore.get(String(runId ?? ""));
  if (!run) {
    return null;
  }
  const session = sessionStore.get(run.sessionId);
  const timeline = Array.isArray(session?.events)
    ? session.events
        .filter((event) => String(event.payload?.runId ?? "") === run.runId)
        .map((event) => ({
          id: event.id,
          eventType: event.eventType,
          timestamp: event.timestamp,
          payload: event.payload,
          cursor: event.cursor,
        }))
    : [];
  return {
    run: toPublicRun(run),
    timeline,
  };
}

export async function listOpenClawSessionEvents(sessionId, options = {}) {
  if (hasPersistentDatabase()) {
    return (async () => {
      await ensureOpenClawPersistence();
      const minSequence = parseEventCursor(options.afterCursor);
      const result = await database.pool.query(
        `SELECT event_id, sequence, cursor, session_id, event_type, timestamp, payload_json
           FROM openclaw_agent_run_events
          WHERE session_id = $1 AND sequence > $2
          ORDER BY sequence ASC`,
        [String(sessionId ?? ""), minSequence],
      );
      const items = result.rows.map((row) => ({
        id: row.event_id,
        sequence: Number(row.sequence),
        cursor: row.cursor,
        sessionId: row.session_id,
        eventType: row.event_type,
        timestamp: row.timestamp,
        payload: parseJson(row.payload_json, {}),
      }));
      const latestCursor = items.length > 0 ? items[items.length - 1].cursor : String(minSequence);
      return { items, latestCursor };
    })();
  }
  const session = sessionStore.get(String(sessionId ?? ""));
  if (!session) {
    return { items: [], latestCursor: "0" };
  }
  const minSequence = parseEventCursor(options.afterCursor);
  const items = session.events.filter((event) => event.sequence > minSequence);
  const latestCursor =
    session.events.length > 0
      ? session.events[session.events.length - 1].cursor
      : String(minSequence);
  return { items, latestCursor };
}

export function subscribeOpenClawSessionEvents(sessionId, callback) {
  const normalizedSessionId = String(sessionId ?? "").trim();
  if (!normalizedSessionId || typeof callback !== "function") {
    return () => {};
  }
  const watchers = sessionWatchers.get(normalizedSessionId) ?? new Set();
  watchers.add(callback);
  sessionWatchers.set(normalizedSessionId, watchers);
  return () => {
    const nextWatchers = sessionWatchers.get(normalizedSessionId);
    if (!nextWatchers) {
      return;
    }
    nextWatchers.delete(callback);
    if (nextWatchers.size === 0) {
      sessionWatchers.delete(normalizedSessionId);
    }
  };
}

export function isOpenClawRuntimeEnabled() {
  return runtimeState.enabled;
}

export function isOpenClawRuntimeReady() {
  return runtimeState.enabled && runtimeState.ready && runtimeState.cliAvailable;
}

export function getOpenClawRuntimeStatus() {
  return {
    enabled: runtimeState.enabled,
    mode: runtimeState.mode,
    bootstrapped: runtimeState.bootstrapped,
    cliAvailable: runtimeState.cliAvailable,
    ready: isOpenClawRuntimeReady(),
    gatewayAutoStarted: runtimeState.gatewayAutoStarted,
    lastError: runtimeState.lastError,
    lastCheckAt: runtimeState.lastCheckAt,
    nemoClawEnabled,
    nemoClawAvailable: runtimeState.nemoClawAvailable || false,
    nemoClawSandbox: nemoClawEnabled ? nemoClawSandboxName : null,
  };
}

export async function getOpenClawRunChildren(runId) {
  if (hasPersistentDatabase()) {
    return (async () => {
      await ensureOpenClawPersistence();
      const parent = await getOpenClawRun(runId);
      if (!parent) return null;
      const childIds = Array.isArray(parent.childRunIds) ? parent.childRunIds : [];
      if (childIds.length === 0) return { parentRunId: parent.runId, children: [] };
      const result = await database.pool.query(
        `SELECT * FROM openclaw_agent_runs WHERE run_id = ANY($1::text[]) ORDER BY updated_at DESC`,
        [childIds],
      );
      return {
        parentRunId: parent.runId,
        children: result.rows.map((row) => toPublicRun({
          runId: row.run_id,
          type: row.type,
          sessionId: row.session_id,
          status: row.status,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          error: row.error,
          cost: parseJson(row.cost_json, null),
          parentRunId: row.parent_run_id,
          childRunIds: parseJson(row.child_run_ids_json, []),
        })),
      };
    })();
  }
  const parent = runStore.get(String(runId ?? ""));
  if (!parent) {
    return null;
  }
  const children = (parent.childRunIds ?? [])
    .map((childId) => runStore.get(childId))
    .filter(Boolean)
    .map(toPublicRun);
  return { parentRunId: parent.runId, children };
}

export async function listSessionsForAgent(agentId) {
  if (hasPersistentDatabase()) {
    return (async () => {
      await ensureOpenClawPersistence();
      const escapedAgentId = String(agentId ?? "").trim().replace(/[\\%_]/g, "\\$&");
      const result = await database.pool.query(
        `SELECT DISTINCT s.*
           FROM openclaw_agent_sessions s
           JOIN openclaw_agent_runs r ON r.session_id = s.session_id
          WHERE COALESCE(r.input_json, '{}')::text ILIKE $1 ESCAPE '\\'
          ORDER BY s.updated_at DESC`,
        [`%"agentId":"${escapedAgentId}"%`],
      );
      return result.rows.map((row) => toPublicSessionFromRow(row));
    })();
  }
  const normalizedAgentId = String(agentId ?? "").trim();
  if (!normalizedAgentId) {
    return [];
  }
  const results = [];
  for (const session of sessionStore.values()) {
    const hasAgentRun = session.runIds.some((runId) => {
      const run = runStore.get(runId);
      return run && String(run.input?.agentId ?? "") === normalizedAgentId;
    });
    if (hasAgentRun) {
      results.push(toPublicSession(session));
    }
  }
  results.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return results;
}

export async function shutdownOpenClawRuntime() {
  clearInterval(_evictionTimer);
  if (gatewayProcess && gatewayProcess.exitCode == null) {
    gatewayProcess.kill("SIGTERM");
  }
  gatewayProcess = undefined;
  sessionEventSequence = 0;
  sessionStore.clear();
  runStore.clear();
  sessionWatchers.clear();
  openClawPersistenceReady = false;
}
