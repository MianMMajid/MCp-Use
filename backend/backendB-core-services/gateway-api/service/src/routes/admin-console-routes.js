import { randomUUID, createHash } from "node:crypto";
import { extractApiKeyFromHeaders, verifyApiKey } from "@maple/security";
import { loadApiKeysFromEnv } from "@maple/security";
import { mapleLog } from "../logging.js";
import { apiErrorPayload, apiErrorResponse } from "../api-error.js";
import { getGrpcClients, database as adminDatabase } from "../state.js";
import { grpcUnary } from "../grpc-clients.js";

// ── Admin auth helpers ──────────────────────────────────────────────────────

function normalizeConfiguredKeys(value) {
  return Array.isArray(value)
    ? value.map((entry) => String(entry ?? "").trim()).filter((entry) => entry.length > 0)
    : [];
}

function loadAdminApiKeys(env = process.env) {
  return loadApiKeysFromEnv({
    ...env,
    MAPLE_API_KEY: env.MAPLE_ADMIN_API_KEY ?? env.MAPLE_API_KEY,
    MAPLE_API_KEYS: env.MAPLE_ADMIN_API_KEYS ?? env.MAPLE_API_KEYS,
  });
}

function createAdminAuthMiddleware(options = {}) {
  const configuredKeys = normalizeConfiguredKeys(options.apiKeys);
  // Finding 6: Guard inside the middleware itself, not just the call site
  const allowNoAuth = options.allowNoAuth === true && process.env.NODE_ENV !== "production";
  return async (c, next) => {
    if (allowNoAuth) {
      await next();
      return;
    }
    if (configuredKeys.length === 0) {
      return apiErrorResponse(
        c,
        503,
        "ADMIN_AUTH_MISCONFIGURED",
        "Admin authentication is not configured.",
        "Set MAPLE_ADMIN_API_KEY or MAPLE_ADMIN_API_KEYS."
      );
    }
    const provided = extractApiKeyFromHeaders(
      c.req.header("x-api-key"),
      c.req.header("authorization")
    );
    const result = verifyApiKey(configuredKeys, provided);
    if (!result.ok) {
      const reason = result.reason ?? "missing_key";
      return apiErrorResponse(
        c,
        reason === "invalid_key" ? 401 : 401,
        reason === "invalid_key" ? "ADMIN_AUTH_INVALID_KEY" : "ADMIN_AUTH_REQUIRED",
        reason === "invalid_key" ? "Invalid admin API key." : "Admin authentication required.",
        "Provide x-api-key or Authorization: Bearer <token>."
      );
    }
    await next();
  };
}

// ── Audit event emitter (fire-and-forget) ───────────────────────────────────

function emitAuditEvent(auditWriter, opts) {
  try {
    grpcUnary(auditWriter, "appendEvent", {
      event: {
        eventId: randomUUID(),
        eventType: opts.eventType,
        timestamp: new Date().toISOString(),
        sourceService: "admin-console",
        context: { traceId: "" },
        payloadJson: Buffer.from(JSON.stringify(opts.payload ?? {})),
        severity: opts.severity ?? "RISK_SEVERITY_LOW",
        summary: opts.summary,
      },
    }).catch((err) => {
      mapleLog("warn", "admin_console_audit_emit_failed", { error: err.message });
    });
  } catch {
    // fire-and-forget
  }
}

// ── Policy helpers ──────────────────────────────────────────────────────────

function toGuardActionEnum(raw) {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "allow") return "GUARD_ACTION_ALLOW";
  if (normalized === "block" || normalized === "deny" || normalized === "reject")
    return "GUARD_ACTION_BLOCK";
  return "GUARD_ACTION_PENDING";
}

function fromGuardActionEnum(raw) {
  const value = String(raw || "");
  if (value === "GUARD_ACTION_ALLOW") return "allow";
  if (value === "GUARD_ACTION_BLOCK") return "block";
  return "pending";
}

function approvalEventToApi(event) {
  return {
    traceId: String(event?.traceId || ""),
    stepIndex: Number(event?.stepIndex || 0),
    requestedAt: String(event?.requestedAt || ""),
    step: event?.step ?? null,
    pendingDecision: event?.pendingDecision ?? null,
  };
}

const policyVersionStore = new Map();
let activePolicyVersionId = "";

function toPolicyVersionId(rules) {
  const digest = createHash("sha256")
    .update(JSON.stringify(rules ?? []))
    .digest("hex")
    .slice(0, 12);
  return `rules-${digest}`;
}

function ensurePolicyVersionRecord(input) {
  const existing = policyVersionStore.get(input.versionId);
  if (existing) {
    return existing;
  }
  const created = {
    versionId: input.versionId,
    createdAt: input.createdAt,
    createdBy: input.createdBy ?? "system",
    summary: input.summary ?? "",
    ruleCount: Number(input.ruleCount ?? 0),
    active: false,
  };
  policyVersionStore.set(created.versionId, created);
  return created;
}

async function syncPolicyVersionState(contextWall) {
  const response = await grpcUnary(contextWall, "listPolicyRules", {});
  const rules = Array.isArray(response?.rules) ? response.rules : [];
  const versionId = toPolicyVersionId(rules);
  const record = ensurePolicyVersionRecord({
    versionId,
    createdAt: new Date().toISOString(),
    summary: "Snapshot from context-wall policy rules",
    ruleCount: rules.length,
  });
  if (!activePolicyVersionId) {
    activePolicyVersionId = record.versionId;
  }
  for (const version of policyVersionStore.values()) {
    version.active = version.versionId === activePolicyVersionId;
  }
  return {
    activeVersionId: activePolicyVersionId,
    items: [...policyVersionStore.values()].sort(
      (a, b) => String(b.createdAt).localeCompare(String(a.createdAt))
    ),
  };
}

// ── Main registration ───────────────────────────────────────────────────────

export function registerAdminConsoleRoutes(app, options = {}) {
  const adminApiKeys = options.adminApiKeys ?? loadAdminApiKeys();
  // Fix 8: Never allow no-auth bypass in production
  const adminAllowNoAuth = options.adminAllowNoAuth === true && process.env.NODE_ENV !== "production";
  const auditWriterHttpOrigin = options.auditWriterHttpOrigin ?? "";

  // Admin auth middleware for /admin/api/* routes
  app.use(
    "/admin/api/*",
    createAdminAuthMiddleware({
      apiKeys: adminApiKeys,
      allowNoAuth: adminAllowNoAuth,
    })
  );

  // ── Admin API: Policies (proxy to context-wall) ─────────────────────────

  app.get("/admin/api/policies", async (c) => {
    const grpcClients = getGrpcClients();
    const contextWall = grpcClients?.contextWall;
    const auditWriter = grpcClients?.auditWriter;
    try {
      const response = await grpcUnary(contextWall, "listPolicyRules", {});
      const rules = Array.isArray(response?.rules) ? response.rules : [];
      emitAuditEvent(auditWriter, {
        eventType: "AUDIT_EVENT_TYPE_POLICY_EVALUATED",
        summary: "admin-console: policy state queried",
        payload: { ruleCount: rules.length },
      });
      return c.json({
        rules,
        ruleCount: Number(response?.ruleCount ?? rules.length),
        policies: rules,
      });
    } catch (err) {
      mapleLog("warn", "admin_console_policies_grpc_error", {
        code: err.code,
        message: err.message,
      });
      return c.json(
        {
          error: "Failed to reach context-wall",
          details: err.message,
          rules: [],
          ruleCount: 0,
          policies: [],
        },
        502
      );
    }
  });

  app.get("/admin/api/policies/versions", async (c) => {
    const grpcClients = getGrpcClients();
    const contextWall = grpcClients?.contextWall;
    // M1-18: Try PostgreSQL first, fall back to in-memory store
    try {
      const db = adminDatabase;
      const dbResult = await db.pool.query(
        `SELECT id, policy_id, version_number, created_by, created_at FROM policy_versions ORDER BY created_at DESC LIMIT 50`
      );
      const items = dbResult.rows.map((row) => ({
        versionId: row.id,
        policyId: row.policy_id,
        versionNumber: row.version_number,
        createdBy: row.created_by ?? "system",
        createdAt: row.created_at,
        active: String(row.id) === activePolicyVersionId,
      }));
      return c.json({
        ok: true,
        source: "database",
        activeVersionId: activePolicyVersionId,
        total: items.length,
        items,
      });
    } catch (dbErr) {
      mapleLog("warn", "admin_console_policy_versions_db_fallback", {
        error: dbErr instanceof Error ? dbErr.message : String(dbErr),
      });
      // M1-18: Fall back to in-memory syncPolicyVersionState
      try {
        const versions = await syncPolicyVersionState(contextWall);
        return c.json({
          ok: true,
          source: "in-memory",
          total: versions.items.length,
          ...versions,
        });
      } catch (err) {
        return c.json(
          {
            error: "Failed to read policy versions.",
            details: err.message,
            activeVersionId: activePolicyVersionId,
            total: [...policyVersionStore.values()].length,
            items: [...policyVersionStore.values()],
          },
          502
        );
      }
    }
  });

  app.post("/admin/api/policies/versions/:versionId/activate", async (c) => {
    const grpcClients = getGrpcClients();
    const contextWall = grpcClients?.contextWall;
    const auditWriter = grpcClients?.auditWriter;
    const versionId = String(c.req.param("versionId") || "").trim();
    if (!versionId) {
      return apiErrorResponse(c, 400, "INVALID_ARGUMENT", "versionId is required.");
    }
    await syncPolicyVersionState(contextWall).catch(() => null);
    const found = policyVersionStore.get(versionId);
    if (!found) {
      return apiErrorResponse(c, 404, "NOT_FOUND", "Policy version not found.");
    }
    // M1-19: Idempotent activation — if already active, return early
    if (found.active === true) {
      return c.json({
        ok: true,
        activeVersionId: activePolicyVersionId,
        activatedVersion: found,
        alreadyActive: true,
      });
    }
    activePolicyVersionId = versionId;
    for (const version of policyVersionStore.values()) {
      version.active = version.versionId === versionId;
    }
    // M1-19: Correct audit event type for activation
    emitAuditEvent(auditWriter, {
      eventType: "AUDIT_EVENT_TYPE_POLICY_ACTIVATED",
      summary: "admin-console: activated policy version",
      payload: { versionId },
    });
    // M1-19: Propagate to context-wall via gRPC (fire and forget)
    if (contextWall) {
      try {
        grpcUnary(contextWall, "upsertPolicyRules", { versionId }).catch((err) => {
          mapleLog("warn", "admin_console_activate_propagation_failed", { error: err.message });
        });
      } catch {
        // fire-and-forget — do not block response
      }
    }
    return c.json({
      ok: true,
      activeVersionId: activePolicyVersionId,
      activatedVersion: found,
    });
  });

  app.post("/admin/api/policies/validate", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const rules = Array.isArray(body?.rules)
      ? body.rules
      : Array.isArray(body?.policy?.rules)
        ? body.policy.rules
        : [];
    const errors = [];
    const warnings = [];
    if (!Array.isArray(rules) || rules.length === 0) {
      warnings.push("No policy rules supplied; validation ran with empty set.");
    }
    // M1-20: Enforce max rule count
    if (rules.length > 1000) {
      errors.push(`Rule count ${rules.length} exceeds maximum of 1000.`);
      return c.json(
        {
          ok: false,
          valid: false,
          errors,
          warnings,
        },
        400
      );
    }
    const VALID_ACTIONS = new Set(["allow", "block", "warn", "pending"]);
    const matchActionMap = new Map();
    for (let index = 0; index < rules.length; index += 1) {
      const rule = rules[index];
      if (!rule || typeof rule !== "object") {
        errors.push(`Rule ${index} is not an object.`);
        continue;
      }
      if (!String(rule.id || "").trim()) {
        errors.push(`Rule ${index} is missing id.`);
      }
      const actionStr = String(rule.action || "").trim();
      if (!actionStr) {
        warnings.push(`Rule ${index} is missing action.`);
      } else if (!VALID_ACTIONS.has(actionStr)) {
        // M1-20: Validate action against enum
        errors.push(`Rule ${index} has invalid action "${actionStr}"; must be one of: allow, block, warn, pending.`);
      }
      const matchStr = String(rule.match || rule.selector || "").trim();
      if (!matchStr) {
        warnings.push(`Rule ${index} is missing match selector.`);
      } else {
        // M1-20: Validate match as regex
        try {
          new RegExp(matchStr);
        } catch (regexErr) {
          errors.push(`Rule ${index} has invalid match regex "${matchStr}": ${regexErr.message}`);
        }
        // M1-20: Check for conflicting rules (same match, different action)
        if (actionStr && matchActionMap.has(matchStr)) {
          const prevAction = matchActionMap.get(matchStr);
          if (prevAction !== actionStr) {
            warnings.push(`Rule ${index} conflicts: match "${matchStr}" has action "${actionStr}" but a previous rule uses "${prevAction}".`);
          }
        }
        if (actionStr) {
          matchActionMap.set(matchStr, actionStr);
        }
      }
    }
    return c.json(
      {
        ok: errors.length === 0,
        valid: errors.length === 0,
        errors,
        warnings,
      },
      errors.length === 0 ? 200 : 400
    );
  });

  // ── Admin API: Audit events (proxy to audit-writer) ─────────────────────

  app.get("/admin/api/audit", async (c) => {
    const grpcClients = getGrpcClients();
    const auditWriter = grpcClients?.auditWriter;
    try {
      const traceId = c.req.query("trace_id") || "";
      const sessionId = c.req.query("session_id") || "";
      const since = c.req.query("since") || "";
      const until = c.req.query("until") || "";
      const limit = parseInt(c.req.query("limit") || "50", 10);
      const cursor = c.req.query("cursor") || "";
      const response = await grpcUnary(auditWriter, "queryEvents", {
        traceId,
        sessionId,
        sourceService: "",
        eventTypes: [],
        since,
        until,
        minSeverity: 0,
        limit,
        cursor,
      });
      emitAuditEvent(auditWriter, {
        eventType: "AUDIT_EVENT_TYPE_POLICY_EVALUATED",
        summary: "admin-console: audit events queried",
        payload: {
          traceId,
          sessionId,
          limit,
          resultCount: (response.events || []).length,
        },
      });
      return c.json({
        events: response.events || [],
        nextCursor: response.nextCursor || "",
        totalCount: response.totalCount || 0,
      });
    } catch (err) {
      mapleLog("warn", "admin_console_audit_grpc_error", {
        code: err.code,
        message: err.message,
      });
      return c.json(
        {
          error: "Failed to reach audit-writer",
          details: err.message,
          events: [],
        },
        502
      );
    }
  });

  app.post("/admin/api/audit/export", async (c) => {
    const grpcClients = getGrpcClients();
    const auditWriter = grpcClients?.auditWriter;
    const body = await c.req.json().catch(() => ({}));
    const format = String(body?.format || "json").trim().toLowerCase();
    const traceId = String(body?.traceId || body?.trace_id || "").trim();
    const sessionId = String(body?.sessionId || body?.session_id || "").trim();
    const since = String(body?.since || "").trim();
    const until = String(body?.until || "").trim();
    const eventType = String(body?.eventType || "").trim();
    const limit = Number.parseInt(String(body?.limit || "1000"), 10);

    // M3-07: Validate format — support csv alongside json/jsonl
    if (format !== "json" && format !== "jsonl" && format !== "csv") {
      return apiErrorResponse(c, 400, "INVALID_FORMAT", "format must be json, jsonl, or csv.");
    }

    // M3-08: Build eventTypes filter from body
    const eventTypes = eventType
      ? [eventType]
      : Array.isArray(body?.eventTypes) ? body.eventTypes.map((t) => String(t).trim()).filter(Boolean) : [];

    try {
      const response = await grpcUnary(auditWriter, "queryEvents", {
        traceId,
        sessionId,
        sourceService: "",
        eventTypes,
        since,
        until,
        minSeverity: 0,
        limit: Number.isFinite(limit) ? Math.max(1, Math.min(limit, 5000)) : 1000,
        cursor: "",
      });
      let events = Array.isArray(response?.events) ? response.events : [];

      // M3-08: Client-side eventType filter (in case upstream does not support it)
      if (eventType && events.length > 0) {
        events = events.filter((ev) => String(ev?.eventType || "") === eventType);
      }

      if (format === "jsonl") {
        const content = events.map((event) => JSON.stringify(event)).join("\n");
        return c.text(content, 200, {
          "content-type": "application/x-ndjson",
        });
      }

      // M3-07: CSV format support
      if (format === "csv") {
        const csvFields = ["eventId", "eventType", "timestamp", "sourceService", "severity", "summary"];
        const header = csvFields.join(",");
        const rows = events.map((event) =>
          csvFields.map((field) => {
            const value = String(event?.[field] ?? "").replace(/"/g, '""');
            return `"${value}"`;
          }).join(",")
        );
        const csvContent = [header, ...rows].join("\n");
        return c.text(csvContent, 200, {
          "content-type": "text/csv",
          "content-disposition": "attachment; filename=audit-export.csv",
        });
      }

      return c.json({
        ok: true,
        format: "json",
        count: events.length,
        events,
      });
    } catch (err) {
      return apiErrorResponse(
        c,
        502,
        "UPSTREAM_UNAVAILABLE",
        "Failed to export audit events.",
        err.message
      );
    }
  });

  app.get("/admin/api/audit/schemas", async (c) => {
    // M3-09: Return full JSON Schema per event type
    return c.json({
      ok: true,
      schemas: [
        {
          id: "audit_event_v1",
          type: "object",
          description: "Base audit event schema used for all event types.",
          required: ["eventId", "eventType", "timestamp"],
          properties: {
            eventId: { type: "string", description: "Unique event identifier (UUID)." },
            eventType: { type: "string", description: "Event type enum (e.g. AUDIT_EVENT_TYPE_POLICY_EVALUATED)." },
            timestamp: { type: "string", format: "date-time", description: "ISO 8601 timestamp." },
            sourceService: { type: "string", description: "Service that emitted the event." },
            severity: { type: "string", enum: ["RISK_SEVERITY_LOW", "RISK_SEVERITY_MEDIUM", "RISK_SEVERITY_HIGH", "RISK_SEVERITY_CRITICAL"], description: "Risk severity level." },
            summary: { type: "string", description: "Human-readable event summary." },
            context: {
              type: "object",
              properties: {
                traceId: { type: "string", description: "Distributed trace identifier." },
                sessionId: { type: "string", description: "Session identifier." },
              },
            },
            payloadJson: { type: "string", description: "JSON-encoded event payload." },
          },
          fields: [
            "eventId",
            "eventType",
            "timestamp",
            "sourceService",
            "severity",
            "summary",
            "context.traceId",
            "context.sessionId",
            "payloadJson",
          ],
        },
        {
          id: "audit_event_policy_activated",
          type: "object",
          description: "Schema for policy activation events.",
          allOf: [{ "$ref": "#/schemas/audit_event_v1" }],
          properties: {
            payloadJson: {
              type: "string",
              description: "JSON containing { versionId: string }.",
            },
          },
        },
        {
          id: "audit_event_hitl_decision",
          type: "object",
          description: "Schema for human-in-the-loop approval/rejection events.",
          allOf: [{ "$ref": "#/schemas/audit_event_v1" }],
          properties: {
            payloadJson: {
              type: "string",
              description: "JSON containing { traceId, stepIndex, action, reason, approverId, accepted }.",
            },
          },
        },
      ],
    });
  });

  app.get("/admin/api/compliance/reports", async (c) => {
    const grpcClients = getGrpcClients();
    const auditWriter = grpcClients?.auditWriter;
    try {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const response = await grpcUnary(auditWriter, "queryEvents", {
        traceId: "",
        sessionId: "",
        sourceService: "",
        eventTypes: [],
        since,
        until: "",
        minSeverity: 0,
        limit: 5000,
        cursor: "",
      });
      const events = Array.isArray(response?.events) ? response.events : [];
      const findings = events.filter(
        (event) =>
          String(event?.severity || "").includes("HIGH") ||
          String(event?.severity || "").includes("CRITICAL")
      );

      // M3-09: Per-control evidence and framework scoring
      const controls = [
        { id: "AC-1", name: "Access Control Policy", framework: "NIST-800-53" },
        { id: "AC-2", name: "Account Management", framework: "NIST-800-53" },
        { id: "AU-2", name: "Audit Events", framework: "NIST-800-53" },
        { id: "AU-3", name: "Content of Audit Records", framework: "NIST-800-53" },
        { id: "AU-6", name: "Audit Review", framework: "NIST-800-53" },
        { id: "CM-2", name: "Baseline Configuration", framework: "NIST-800-53" },
        { id: "IA-2", name: "Identification and Authentication", framework: "NIST-800-53" },
        { id: "IR-4", name: "Incident Handling", framework: "NIST-800-53" },
        { id: "RA-5", name: "Vulnerability Scanning", framework: "NIST-800-53" },
        { id: "SC-7", name: "Boundary Protection", framework: "NIST-800-53" },
        { id: "SC-13", name: "Cryptographic Protection", framework: "NIST-800-53" },
        { id: "SI-4", name: "Information System Monitoring", framework: "NIST-800-53" },
      ];

      const controlResults = controls.map((control) => {
        // Derive evidence from audit events matching control-related event types
        const relatedEvents = events.filter((ev) => {
          const evType = String(ev?.eventType || "");
          if (control.id === "AC-1" || control.id === "AC-2") return evType.includes("POLICY");
          if (control.id === "AU-2" || control.id === "AU-3" || control.id === "AU-6") return evType.includes("AUDIT");
          if (control.id === "IA-2") return evType.includes("AUTH") || evType.includes("HITL");
          if (control.id === "IR-4") return evType.includes("INCIDENT") || evType.includes("CRITICAL");
          if (control.id === "SI-4") return evType.includes("MONITOR") || evType.includes("SCAN");
          return false;
        });
        const controlFindings = relatedEvents.filter(
          (ev) =>
            String(ev?.severity || "").includes("HIGH") ||
            String(ev?.severity || "").includes("CRITICAL")
        );
        return {
          controlId: control.id,
          controlName: control.name,
          framework: control.framework,
          status: controlFindings.length > 0 ? "finding" : relatedEvents.length > 0 ? "pass" : "no-evidence",
          evidenceCount: relatedEvents.length,
          findingCount: controlFindings.length,
        };
      });

      const passedControls = controlResults.filter((cr) => cr.status === "pass").length;
      const totalControls = controlResults.length;
      const frameworkScore = totalControls > 0 ? Math.round((passedControls / totalControls) * 100) : 0;

      return c.json({
        ok: true,
        reports: [
          {
            id: "compliance-baseline",
            generatedAt: new Date().toISOString(),
            status: findings.length > 0 ? "warn" : "pass",
            controlsEvaluated: totalControls,
            findings: findings.length,
            evidenceWindowStart: since,
            eventCount: events.length,
            frameworkScore,
            frameworkScoreLabel: `${frameworkScore}% controls passing`,
            controls: controlResults,
          },
        ],
      });
    } catch (err) {
      return apiErrorResponse(
        c,
        502,
        "UPSTREAM_UNAVAILABLE",
        "Failed to build compliance reports.",
        err.message
      );
    }
  });

  // ── Admin API: Policy reload (proxy to context-wall) ────────────────────

  app.post("/admin/api/policies/reload", async (c) => {
    const grpcClients = getGrpcClients();
    const contextWall = grpcClients?.contextWall;
    try {
      const response = await grpcUnary(contextWall, "reloadPolicies", {});
      return c.json({
        success: response.success,
        ruleCount: response.ruleCount,
        errorMessage: response.errorMessage || "",
      });
    } catch (err) {
      mapleLog("warn", "admin_console_reload_policies_grpc_error", {
        code: err.code,
        message: err.message,
      });
      return apiErrorResponse(
        c,
        502,
        "UPSTREAM_UNAVAILABLE",
        "Failed to reach context-wall",
        err.message
      );
    }
  });

  // ── Admin API: HITL approvals ────────────────────────────────────────────

  app.get("/admin/api/approvals", async (c) => {
    const grpcClients = getGrpcClients();
    const contextWall = grpcClients?.contextWall;
    try {
      const sessionId = c.req.query("session_id") || "";
      const response = await grpcUnary(contextWall, "listPendingApprovals", {
        sessionId,
      });
      const approvals = Array.isArray(response?.approvals) ? response.approvals : [];
      return c.json({
        approvals: approvals.map((event) => approvalEventToApi(event)),
        count: approvals.length,
      });
    } catch (err) {
      mapleLog("warn", "admin_console_approvals_list_failed", {
        code: err.code,
        message: err.message,
      });
      return apiErrorResponse(
        c,
        502,
        "UPSTREAM_UNAVAILABLE",
        "Failed to list pending approvals",
        err.message
      );
    }
  });

  app.get("/admin/api/approvals/watch", async (c) => {
    const grpcClients = getGrpcClients();
    const contextWall = grpcClients?.contextWall;
    const sessionId = c.req.query("session_id") || "";
    const encoder = new TextEncoder();
    let approvalStream;
    let closed = false;
    let onData;
    let onError;
    let onEnd;
    const stream = new ReadableStream({
      start(controller) {
        const safeEnqueue = (payload) => {
          if (closed) return false;
          try {
            controller.enqueue(payload);
            return true;
          } catch {
            closed = true;
            return false;
          }
        };
        const safeClose = () => {
          if (closed) return;
          closed = true;
          try {
            controller.close();
          } catch {
            // Ignore closed stream errors.
          }
        };
        safeEnqueue(encoder.encode("event: ready\ndata: {}\n\n"));
        approvalStream = contextWall.watchApprovalQueue({ sessionId });
        onData = (event) => {
          safeEnqueue(
            encoder.encode(
              `event: approval\ndata: ${JSON.stringify(approvalEventToApi(event))}\n\n`
            )
          );
        };
        onError = (err) => {
          safeEnqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({ error: String(err?.message || "watch failed") })}\n\n`
            )
          );
          safeClose();
        };
        onEnd = () => {
          safeEnqueue(encoder.encode("event: end\ndata: {}\n\n"));
          safeClose();
        };
        approvalStream.on("data", onData);
        approvalStream.on("error", onError);
        approvalStream.on("end", onEnd);
      },
      cancel() {
        closed = true;
        if (approvalStream) {
          if (typeof approvalStream.off === "function") {
            if (onData) approvalStream.off("data", onData);
            if (onError) approvalStream.off("error", onError);
            if (onEnd) approvalStream.off("end", onEnd);
          } else if (typeof approvalStream.removeListener === "function") {
            if (onData) approvalStream.removeListener("data", onData);
            if (onError) approvalStream.removeListener("error", onError);
            if (onEnd) approvalStream.removeListener("end", onEnd);
          }
        }
        if (approvalStream && typeof approvalStream.cancel === "function") {
          approvalStream.cancel();
        } else if (approvalStream && typeof approvalStream.destroy === "function") {
          approvalStream.destroy();
        }
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  });

  app.post("/admin/api/approvals/decision", async (c) => {
    const grpcClients = getGrpcClients();
    const contextWall = grpcClients?.contextWall;
    const auditWriter = grpcClients?.auditWriter;
    try {
      const body = await c.req.json().catch(() => ({}));
      const traceId = String(body?.traceId || "").trim();
      const stepIndexRaw = Number(body?.stepIndex);
      const action = String(body?.action || "").trim();
      const reason = String(body?.reason || "").trim();
      const approverId = String(body?.approverId || "admin-console").trim();
      if (!traceId || !Number.isFinite(stepIndexRaw)) {
        return apiErrorResponse(
          c,
          400,
          "INVALID_ARGUMENT",
          "traceId and stepIndex are required."
        );
      }
      const grpcAction = toGuardActionEnum(action);
      if (grpcAction === "GUARD_ACTION_PENDING") {
        return apiErrorResponse(
          c,
          400,
          "INVALID_ARGUMENT",
          "action must be allow or block."
        );
      }
      const response = await grpcUnary(contextWall, "submitApproval", {
        traceId,
        stepIndex: Math.max(0, Math.trunc(stepIndexRaw)),
        action: grpcAction,
        reason,
        approverId,
      });
      emitAuditEvent(auditWriter, {
        eventType:
          grpcAction === "GUARD_ACTION_ALLOW"
            ? "AUDIT_EVENT_TYPE_HITL_APPROVED"
            : "AUDIT_EVENT_TYPE_HITL_REJECTED",
        summary: `admin-console submitted HITL ${fromGuardActionEnum(grpcAction)} decision`,
        payload: {
          traceId,
          stepIndex: Math.max(0, Math.trunc(stepIndexRaw)),
          action: fromGuardActionEnum(grpcAction),
          reason,
          approverId,
          accepted: Boolean(response?.accepted),
        },
      });
      return c.json({
        accepted: Boolean(response?.accepted),
        traceId: String(response?.traceId || traceId),
        stepIndex: Number(
          response?.stepIndex ?? Math.max(0, Math.trunc(stepIndexRaw))
        ),
        resultingAction: fromGuardActionEnum(response?.resultingAction || grpcAction),
      });
    } catch (err) {
      mapleLog("warn", "admin_console_approval_submit_failed", {
        code: err.code,
        message: err.message,
      });
      return apiErrorResponse(
        c,
        502,
        "UPSTREAM_UNAVAILABLE",
        "Failed to submit approval",
        err.message
      );
    }
  });

  // ── Admin API: Audit dead-letter (proxy to audit-writer HTTP) ──────────

  const resolvedAuditWriterHttpOrigin =
    auditWriterHttpOrigin ||
    (() => {
      const addr = String(process.env.AUDIT_WRITER_ADDRESS ?? "").trim();
      const host = addr.includes(":") ? addr.split(":")[0] : addr;
      return host ? `https://${host}:8090` : "";
    })();

  if (resolvedAuditWriterHttpOrigin) {
    app.get("/admin/api/audit/dead-letter", async (c) => {
      const grpcClients = getGrpcClients();
      try {
        const limit = c.req.query("limit") || "50";
        const offset = c.req.query("offset") || "0";
        const upstream = `${resolvedAuditWriterHttpOrigin}/audit/dead-letter?limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}`;
        const res = await fetch(upstream, {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) {
          return c.json(
            { error: `Upstream returned ${res.status}`, items: [] },
            res.status
          );
        }
        const data = await res.json();
        return c.json(data);
      } catch (err) {
        mapleLog("warn", "admin_console_dead_letter_list_failed", {
          error: err.message,
        });
        return apiErrorResponse(
          c,
          502,
          "UPSTREAM_UNAVAILABLE",
          "Failed to fetch dead-letter events",
          err.message
        );
      }
    });

    app.post("/admin/api/audit/dead-letter/:eventId/replay", async (c) => {
      const grpcClients = getGrpcClients();
      const auditWriter = grpcClients?.auditWriter;
      try {
        const eventId = c.req.param("eventId");
        const upstream = `${resolvedAuditWriterHttpOrigin}/audit/dead-letter/${encodeURIComponent(eventId)}/replay`;
        const res = await fetch(upstream, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        if (!res.ok) {
          return c.json({ error: `Upstream returned ${res.status}` }, res.status);
        }
        const data = await res.json();
        emitAuditEvent(auditWriter, {
          eventType: "AUDIT_EVENT_TYPE_POLICY_EVALUATED",
          summary: "admin-console: dead-letter event replayed",
          payload: { eventId },
        });
        return c.json(data);
      } catch (err) {
        mapleLog("warn", "admin_console_dead_letter_replay_failed", {
          error: err.message,
        });
        return apiErrorResponse(
          c,
          502,
          "UPSTREAM_UNAVAILABLE",
          "Failed to replay dead-letter event",
          err.message
        );
      }
    });

    mapleLog("info", "admin_console_dead_letter_routes_enabled", {
      origin: resolvedAuditWriterHttpOrigin,
    });
  }
}
