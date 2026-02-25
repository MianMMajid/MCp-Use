import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { resolve } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer as createHttpsServer } from "node:https";
import { loadGrpcTlsConfig, loadServiceClientSecure, mapleLog } from "@maple/common";
import { config } from "./config.js";
import { createAdminAuthMiddleware } from "./admin-auth.js";
import { apiErrorResponse } from "./api-error.js";
import { createStaticRoutes } from "./static-routes.js";
// ── gRPC client helpers ─────────────────────────────────────────────────────
const PROTO_ROOT = resolve(import.meta.dirname, "../../../../proto");
const grpcTlsConfig = loadGrpcTlsConfig();
function loadProtoClient(protoFile, servicePath, address) {
    return loadServiceClientSecure(protoFile, servicePath, address, PROTO_ROOT, grpcTlsConfig);
}
function grpcUnary(client, method, request) {
    return new Promise((resolve, reject) => {
        client[method](request, (err, response) => {
            if (err)
                reject(err);
            else
                resolve(response);
        });
    });
}
// ── Audit event emitter (fire-and-forget) ───────────────────────────────────
function emitAuditEvent(auditClient, opts) {
    try {
        grpcUnary(auditClient, "appendEvent", {
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
    }
    catch {
        // fire-and-forget
    }
}
function toGuardActionEnum(raw) {
    const normalized = raw.trim().toLowerCase();
    if (normalized === "allow")
        return "GUARD_ACTION_ALLOW";
    if (normalized === "block" || normalized === "deny" || normalized === "reject")
        return "GUARD_ACTION_BLOCK";
    return "GUARD_ACTION_PENDING";
}
function fromGuardActionEnum(raw) {
    const value = String(raw || "");
    if (value === "GUARD_ACTION_ALLOW")
        return "allow";
    if (value === "GUARD_ACTION_BLOCK")
        return "block";
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
        items: [...policyVersionStore.values()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
    };
}
// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
    mapleLog("info", "admin_console_starting", { port: config.port });
    // Create gRPC clients
    const contextWall = loadProtoClient("maple/context/v1/context_wall.proto", "maple.context.v1.ContextWallService", config.contextWallAddress);
    const auditWriter = loadProtoClient("maple/audit/v1/audit_writer.proto", "maple.audit.v1.AuditWriterService", config.auditWriterAddress);
    mapleLog("info", "admin_console_grpc_clients_created", {
        contextWall: config.contextWallAddress,
        auditWriter: config.auditWriterAddress,
    });
    // Emit startup audit event
    emitAuditEvent(auditWriter, {
        eventType: "AUDIT_EVENT_TYPE_SERVICE_STARTED",
        summary: "admin-console service started",
        payload: { port: config.port },
    });
    // Build Hono app
    const app = new Hono();
    app.use("/admin/api/*", createAdminAuthMiddleware({
        apiKeys: config.apiKeys,
        allowNoAuth: config.allowNoAuth,
    }));
    // Health check
    app.get("/health", (c) => c.json({
        status: "ok",
        service: "admin-console",
        timestamp: new Date().toISOString(),
    }));
    // ── Admin API: Policies (proxy to context-wall) ─────────────────────────
    app.get("/admin/api/policies", async (c) => {
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
        }
        catch (err) {
            mapleLog("warn", "admin_console_policies_grpc_error", {
                code: err.code,
                message: err.message,
            });
            // Fallback: return a structured error so the UI still renders
            return c.json({
                error: "Failed to reach context-wall",
                details: err.message,
                rules: [],
                ruleCount: 0,
                policies: [],
            }, 502);
        }
    });
    app.get("/admin/api/policies/versions", async (c) => {
        try {
            const versions = await syncPolicyVersionState(contextWall);
            return c.json({
                ok: true,
                ...versions,
            });
        }
        catch (err) {
            return c.json({
                error: "Failed to read policy versions.",
                details: err.message,
                activeVersionId: activePolicyVersionId,
                items: [...policyVersionStore.values()],
            }, 502);
        }
    });
    app.post("/admin/api/policies/versions/:versionId/activate", async (c) => {
        const versionId = String(c.req.param("versionId") || "").trim();
        if (!versionId) {
            return apiErrorResponse(c, 400, "INVALID_ARGUMENT", "versionId is required.");
        }
        await syncPolicyVersionState(contextWall).catch(() => null);
        const found = policyVersionStore.get(versionId);
        if (!found) {
            return apiErrorResponse(c, 404, "NOT_FOUND", "Policy version not found.");
        }
        activePolicyVersionId = versionId;
        for (const version of policyVersionStore.values()) {
            version.active = version.versionId === versionId;
        }
        emitAuditEvent(auditWriter, {
            eventType: "AUDIT_EVENT_TYPE_POLICY_EVALUATED",
            summary: "admin-console: activated policy version",
            payload: { versionId },
        });
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
        for (let index = 0; index < rules.length; index += 1) {
            const rule = rules[index];
            if (!rule || typeof rule !== "object") {
                errors.push(`Rule ${index} is not an object.`);
                continue;
            }
            if (!String(rule.id || "").trim()) {
                errors.push(`Rule ${index} is missing id.`);
            }
            if (!String(rule.action || "").trim()) {
                warnings.push(`Rule ${index} is missing action.`);
            }
            if (!String(rule.match || rule.selector || "").trim()) {
                warnings.push(`Rule ${index} is missing match selector.`);
            }
        }
        return c.json({
            ok: errors.length === 0,
            valid: errors.length === 0,
            errors,
            warnings,
        }, errors.length === 0 ? 200 : 400);
    });
    // ── Admin API: Audit events (proxy to audit-writer) ─────────────────────
    app.get("/admin/api/audit", async (c) => {
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
                payload: { traceId, sessionId, limit, resultCount: (response.events || []).length },
            });
            return c.json({
                events: response.events || [],
                nextCursor: response.nextCursor || "",
                totalCount: response.totalCount || 0,
            });
        }
        catch (err) {
            mapleLog("warn", "admin_console_audit_grpc_error", {
                code: err.code,
                message: err.message,
            });
            return c.json({
                error: "Failed to reach audit-writer",
                details: err.message,
                events: [],
            }, 502);
        }
    });
    app.post("/admin/api/audit/export", async (c) => {
        const body = await c.req.json().catch(() => ({}));
        const format = String(body?.format || "json").trim().toLowerCase();
        const traceId = String(body?.traceId || body?.trace_id || "").trim();
        const sessionId = String(body?.sessionId || body?.session_id || "").trim();
        const since = String(body?.since || "").trim();
        const until = String(body?.until || "").trim();
        const limit = Number.parseInt(String(body?.limit || "1000"), 10);
        try {
            const response = await grpcUnary(auditWriter, "queryEvents", {
                traceId,
                sessionId,
                sourceService: "",
                eventTypes: [],
                since,
                until,
                minSeverity: 0,
                limit: Number.isFinite(limit) ? Math.max(1, Math.min(limit, 5000)) : 1000,
                cursor: "",
            });
            const events = Array.isArray(response?.events) ? response.events : [];
            if (format === "jsonl") {
                const content = events.map((event) => JSON.stringify(event)).join("\n");
                return c.text(content, 200, {
                    "content-type": "application/x-ndjson",
                });
            }
            return c.json({
                ok: true,
                format: "json",
                count: events.length,
                events,
            });
        }
        catch (err) {
            return apiErrorResponse(c, 502, "UPSTREAM_UNAVAILABLE", "Failed to export audit events.", err.message);
        }
    });
    app.get("/admin/api/audit/schemas", async (c) => {
        return c.json({
            ok: true,
            schemas: [
                {
                    id: "audit_event_v1",
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
            ],
        });
    });
    app.get("/admin/api/compliance/reports", async (c) => {
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
            const findings = events.filter((event) => String(event?.severity || "").includes("HIGH") || String(event?.severity || "").includes("CRITICAL"));
            return c.json({
                ok: true,
                reports: [
                    {
                        id: "compliance-baseline",
                        generatedAt: new Date().toISOString(),
                        status: findings.length > 0 ? "warn" : "pass",
                        controlsEvaluated: 12,
                        findings: findings.length,
                        evidenceWindowStart: since,
                        eventCount: events.length,
                    },
                ],
            });
        }
        catch (err) {
            return apiErrorResponse(c, 502, "UPSTREAM_UNAVAILABLE", "Failed to build compliance reports.", err.message);
        }
    });
    // ── Admin API: Policy reload (proxy to context-wall) ────────────────────
    app.post("/admin/api/policies/reload", async (c) => {
        try {
            const response = await grpcUnary(contextWall, "reloadPolicies", {});
            return c.json({
                success: response.success,
                ruleCount: response.ruleCount,
                errorMessage: response.errorMessage || "",
            });
        }
        catch (err) {
            mapleLog("warn", "admin_console_reload_policies_grpc_error", {
                code: err.code,
                message: err.message,
            });
            return apiErrorResponse(c, 502, "UPSTREAM_UNAVAILABLE", "Failed to reach context-wall", err.message);
        }
    });
    // ── Admin API: HITL approvals ────────────────────────────────────────────
    app.get("/admin/api/approvals", async (c) => {
        try {
            const sessionId = c.req.query("session_id") || "";
            const response = await grpcUnary(contextWall, "listPendingApprovals", { sessionId });
            const approvals = Array.isArray(response?.approvals) ? response.approvals : [];
            return c.json({
                approvals: approvals.map((event) => approvalEventToApi(event)),
                count: approvals.length,
            });
        }
        catch (err) {
            mapleLog("warn", "admin_console_approvals_list_failed", {
                code: err.code,
                message: err.message,
            });
            return apiErrorResponse(c, 502, "UPSTREAM_UNAVAILABLE", "Failed to list pending approvals", err.message);
        }
    });
    app.get("/admin/api/approvals/watch", async (c) => {
        const sessionId = c.req.query("session_id") || "";
        const encoder = new TextEncoder();
        let approvalStream;
        const stream = new ReadableStream({
            start(controller) {
                controller.enqueue(encoder.encode("event: ready\ndata: {}\n\n"));
                approvalStream = contextWall.watchApprovalQueue({ sessionId });
                approvalStream.on("data", (event) => {
                    controller.enqueue(encoder.encode(`event: approval\ndata: ${JSON.stringify(approvalEventToApi(event))}\n\n`));
                });
                approvalStream.on("error", (err) => {
                    controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: String(err?.message || "watch failed") })}\n\n`));
                    controller.close();
                });
                approvalStream.on("end", () => {
                    controller.enqueue(encoder.encode("event: end\ndata: {}\n\n"));
                    controller.close();
                });
            },
            cancel() {
                if (approvalStream && typeof approvalStream.cancel === "function") {
                    approvalStream.cancel();
                }
                else if (approvalStream && typeof approvalStream.destroy === "function") {
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
        try {
            const body = await c.req.json().catch(() => ({}));
            const traceId = String(body?.traceId || "").trim();
            const stepIndexRaw = Number(body?.stepIndex);
            const action = String(body?.action || "").trim();
            const reason = String(body?.reason || "").trim();
            const approverId = String(body?.approverId || "admin-console").trim();
            if (!traceId || !Number.isFinite(stepIndexRaw)) {
                return apiErrorResponse(c, 400, "INVALID_ARGUMENT", "traceId and stepIndex are required.");
            }
            const grpcAction = toGuardActionEnum(action);
            if (grpcAction === "GUARD_ACTION_PENDING") {
                return apiErrorResponse(c, 400, "INVALID_ARGUMENT", "action must be allow or block.");
            }
            const response = await grpcUnary(contextWall, "submitApproval", {
                traceId,
                stepIndex: Math.max(0, Math.trunc(stepIndexRaw)),
                action: grpcAction,
                reason,
                approverId,
            });
            emitAuditEvent(auditWriter, {
                eventType: grpcAction === "GUARD_ACTION_ALLOW"
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
                stepIndex: Number(response?.stepIndex ?? Math.max(0, Math.trunc(stepIndexRaw))),
                resultingAction: fromGuardActionEnum(response?.resultingAction || grpcAction),
            });
        }
        catch (err) {
            mapleLog("warn", "admin_console_approval_submit_failed", {
                code: err.code,
                message: err.message,
            });
            return apiErrorResponse(c, 502, "UPSTREAM_UNAVAILABLE", "Failed to submit approval", err.message);
        }
    });
    // ── Static UI routes (dashboard) ────────────────────────────────────────
    const staticRoutes = createStaticRoutes();
    app.route("/", staticRoutes);
    // ── Start server ────────────────────────────────────────────────────────
    const tlsConfig = {
        cert: readFileSync(config.tlsCertPath),
        key: readFileSync(config.tlsKeyPath),
        ca: readFileSync(config.tlsCaPath),
    };
    serve({
        fetch: app.fetch,
        port: config.port,
        hostname: config.host,
        createServer: createHttpsServer,
        serverOptions: {
            cert: tlsConfig.cert,
            key: tlsConfig.key,
            ca: tlsConfig.ca,
        },
    }, (info) => {
        mapleLog("info", "admin_console_listening", {
            port: info.port,
            host: info.address,
            protocol: "https",
        });
    });
}
main().catch((err) => {
    mapleLog("error", "admin_console_fatal", { error: err.message });
    process.exit(1);
});
//# sourceMappingURL=main.js.map
