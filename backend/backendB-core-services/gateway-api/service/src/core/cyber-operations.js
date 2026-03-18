import { createHash } from "node:crypto";
import {
  cyberAllowLocalTargets,
  cyberAllowedDomains,
  cyberAllowedLocalHosts,
  cyberBlockedDomains,
  cyberMaxResponseBytes,
  cyberProxyAddress,
  cyberQuarantineEnabled,
  cyberToolAllowedDomains,
  downloadScanProvider,
  downloadScanVirusTotalAnalysisPollAttempts,
  downloadScanVirusTotalAnalysisPollDelayMs,
  downloadScanVirusTotalApiKey,
  downloadScanVirusTotalUploadAllowedDomains,
  downloadScanVirusTotalUploadFallback,
} from "../config.js";
import { replayAuditEvents } from "./audit-outbox.js";
import { listOpenClawRuns, getOpenClawRunArtifacts } from "./openclaw-agent-runtime.js";
import { evaluateGatewayRuntimeDependencies } from "./runtime-dependencies.js";

const CYBER_RELEVANT_EVENT_TYPES = new Set([
  "AUDIT_EVENT_TYPE_CONTENT_SCANNED",
  "AUDIT_EVENT_TYPE_URL_BLOCKED",
]);

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asString(value, fallback = "") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function eventSourceService(entry = {}) {
  return asString(entry?.event?.sourceService || entry?.sourceService || "");
}

function buildId(input) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 20);
}

function artifactFilename(artifact = {}) {
  const artifactType = asString(artifact.artifactType, "artifact");
  if (artifact.filename) {
    return asString(artifact.filename, `${artifactType}.json`);
  }
  if (artifact.contentType === "text/plain" || typeof artifact.content === "string") {
    return `${artifactType}.txt`;
  }
  return `${artifactType}.json`;
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
    sizeBytes: Number(source.sizeBytes ?? base.sizeBytes ?? 0),
    reasons: [...new Set([...asArray(source.reasons), ...asArray(base.reasons)].map((value) => String(value ?? "").trim()).filter(Boolean))],
    checkedAt: asString(source.checkedAt, asString(base.checkedAt)),
    blocked: Boolean(source.blocked ?? base.blocked),
    quarantined: Boolean(source.quarantined ?? base.quarantined),
  };
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
    id: `artifact-${run.runId}-${index}-${buildId({ runId: run.runId, index, sha256: scan.sha256 || artifact?.artifactType || "artifact" })}`,
    source: "artifact",
    traceId: asString(artifact?.traceId),
    sessionId: asString(run.sessionId),
    runId: asString(run.runId),
    url: asString(artifact?.url),
    filename: artifactFilename(artifact),
    contentType: scan.contentType,
    sizeBytes: Number(scan.sizeBytes ?? 0),
    createdAt: asString(artifact?.createdAt, asString(run.updatedAt || run.createdAt)),
    policyReason: asString(artifact?.policyReason, scan.reasons[0] ?? ""),
    eventType: "artifact_scan",
    summary: `${artifact?.artifactType || "artifact"} scanned for run ${run.runId}`,
    severity: scan.quarantined || scan.blocked || scan.verdict === "malicious" ? "RISK_SEVERITY_HIGH" : "RISK_SEVERITY_LOW",
    scan,
    metadata: {
      artifactType: asString(artifact?.artifactType, "artifact"),
      parentRunId: asString(run.parentRunId),
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
  const source = url ? "proxy_download" : "proxy_download";
  return {
    id: `audit-${asString(entry.outboxId, buildId({ createdAt: entry.createdAt, summary, url }))}`,
    source,
    traceId: asString(event.traceId || event.context?.traceId || payload.traceId),
    sessionId: asString(event.context?.sessionId || payload.sessionId),
    runId: asString(payload.runId),
    url,
    filename: asString(payload.filename),
    contentType: asString(scan.contentType),
    sizeBytes: Number(scan.sizeBytes ?? 0),
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
      attempts: Number(entry.attempts ?? 0),
      lastError: asString(entry.lastError),
      toolName: asString(payload.toolName),
      appId: asString(payload.appId),
      resolvedIp: asString(payload.resolvedIp),
      scopedMaxBytes: payload.scopedMaxBytes ?? null,
    },
  };
}

export function isCyberRelevantAuditEntry(entry) {
  const eventType = asString(entry?.event?.eventType);
  const sourceService = eventSourceService(entry);
  return CYBER_RELEVANT_EVENT_TYPES.has(eventType) || sourceService === "cyber-proxy";
}

async function listAllOpenClawRuns() {
  const items = [];
  let cursor = "";
  do {
    const page = await listOpenClawRuns({ cursor, limit: 100 });
    items.push(...asArray(page.items));
    cursor = asString(page.nextCursor);
  } while (cursor);
  return items;
}

export async function listCyberEvents(options = {}) {
  const replay = await replayAuditEvents({
    database: options.database,
    tenantId: options.tenantId,
    since: options.since,
    until: options.until,
    status: options.auditStatus,
    limit: Math.max(50, Number(options.limit ?? 200)),
    offset: 0,
  });
  const records = replay.events
    .filter(isCyberRelevantAuditEntry)
    .map((entry) => normalizeAuditDownloadRecord(entry));
  return records.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function listCyberDownloads(options = {}) {
  const [events, runs] = await Promise.all([
    listCyberEvents(options),
    listAllOpenClawRuns(),
  ]);

  const artifactPayloads = await Promise.all(
    runs.map(async (run) => {
      const detail = await getOpenClawRunArtifacts(run.runId);
      return asArray(detail?.artifacts).map((artifact, index) => normalizeArtifactRecord(run, artifact, index));
    })
  );

  const records = [...events, ...artifactPayloads.flat()]
    .filter((record) => (options.source ? record.source === options.source : true))
    .filter((record) => (options.status ? record.scan.status === options.status : true))
    .filter((record) => (options.verdict ? record.scan.verdict === options.verdict : true))
    .filter((record) => (options.provider ? record.scan.provider === options.provider : true))
    .filter((record) => (options.traceId ? record.traceId === options.traceId : true))
    .filter((record) => (options.sessionId ? record.sessionId === options.sessionId : true))
    .filter((record) => (options.runId ? record.runId === options.runId : true))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  const offset = Math.max(0, Number(options.offset) || 0);
  const limit = Math.max(1, Math.min(10_000, Number(options.limit) || 50));
  const items = records.slice(offset, offset + limit);
  return {
    items,
    total: records.length,
    offset,
    nextOffset: offset + items.length < records.length ? offset + items.length : null,
  };
}

export async function getCyberDownloadRecordById(id, options = {}) {
  if (!id) {
    return null;
  }
  const all = await listCyberDownloads({
    ...options,
    limit: 10000,
    offset: 0,
  });
  return all.items.find((item) => item.id === id) ?? null;
}

export async function getCyberStatus(options = {}) {
  const report = await evaluateGatewayRuntimeDependencies({ force: options.force === true });
  const recentEvents = await listCyberEvents({
    database: options.database,
    tenantId: options.tenantId,
    since: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    limit: 500,
  });
  const blockedCount = recentEvents.filter((item) => item.scan.blocked || item.scan.quarantined || item.eventType === "AUDIT_EVENT_TYPE_URL_BLOCKED").length;
  const scannedCount = recentEvents.filter((item) => item.eventType === "AUDIT_EVENT_TYPE_CONTENT_SCANNED" || item.scan.status !== "missing").length;
  const cyberDependency = report.checks.find((check) => check.id === "grpc.cyber_proxy");
  const mcpDependency = report.checks.find((check) => check.id === "grpc.mcp_proxy");
  const contextDependency = report.checks.find((check) => check.id === "grpc.context_wall");
  const vtConfigured = downloadScanProvider === "virustotal" && Boolean(asString(downloadScanVirusTotalApiKey));
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    providers: {
      contextWall: {
        reachable: contextDependency?.ok === true,
        reason: contextDependency?.reason ?? "unknown",
      },
      mcpProxy: {
        reachable: mcpDependency?.ok === true,
        reason: mcpDependency?.reason ?? "unknown",
      },
      cyberProxy: {
        reachable: cyberDependency?.ok === true,
        reason: cyberDependency?.reason ?? "unknown",
        address: cyberProxyAddress,
      },
    },
    scanning: {
      provider: downloadScanProvider,
      hashLookupFirst: downloadScanProvider === "virustotal",
      uploadFallbackEnabled: downloadScanProvider === "virustotal" && downloadScanVirusTotalUploadFallback,
      uploadAllowedDomains: downloadScanProvider === "virustotal" ? downloadScanVirusTotalUploadAllowedDomains : [],
      analysisPollAttempts: downloadScanProvider === "virustotal" ? downloadScanVirusTotalAnalysisPollAttempts : 0,
      analysisPollDelayMs: downloadScanProvider === "virustotal" ? downloadScanVirusTotalAnalysisPollDelayMs : 0,
      quarantineEnabled: cyberQuarantineEnabled,
      enrichmentConfigured: downloadScanProvider !== "virustotal" || vtConfigured,
      degraded:
        (downloadScanProvider === "virustotal" && !vtConfigured) ||
        cyberDependency?.ok !== true,
      states: {
        contextPolicyUnavailable: contextDependency?.ok !== true,
        cyberScanUnavailable: cyberDependency?.ok !== true,
        virustotalUnavailable: downloadScanProvider === "virustotal" && !vtConfigured,
      },
    },
    recent: {
      blockedCount,
      scannedCount,
      incidents: recentEvents.slice(0, 10),
    },
  };
}

export function getCyberPolicies() {
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    scanProvider: downloadScanProvider,
    hashLookupFirst: downloadScanProvider === "virustotal",
    uploadFallbackEnabled: downloadScanProvider === "virustotal" && downloadScanVirusTotalUploadFallback,
    uploadAllowedDomains: downloadScanProvider === "virustotal" ? downloadScanVirusTotalUploadAllowedDomains : [],
    analysisPollAttempts: downloadScanProvider === "virustotal" ? downloadScanVirusTotalAnalysisPollAttempts : 0,
    analysisPollDelayMs: downloadScanProvider === "virustotal" ? downloadScanVirusTotalAnalysisPollDelayMs : 0,
    quarantineEnabled: cyberQuarantineEnabled,
    maxResponseBytes: cyberMaxResponseBytes,
    allowLocalTargets: cyberAllowLocalTargets,
    allowedDomains: cyberAllowedDomains,
    blockedDomains: cyberBlockedDomains,
    toolAllowedDomains: cyberToolAllowedDomains,
    allowedLocalHosts: cyberAllowedLocalHosts,
    fileDownloadGating: {
      credentialScoped: true,
      quarantineEnabled: cyberQuarantineEnabled,
    },
  };
}
