import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer as createHttpsServer } from "node:https";
import { loadGrpcTlsConfig, loadServiceClientSecurePooled, CircuitBreaker, mapleLog } from "@maple/common";
import { config } from "./config.js";
import { createStaticRoutes } from "./static-routes.js";
// ── gRPC client helpers ─────────────────────────────────────────────────────
const PROTO_ROOT = resolve(import.meta.dirname, "../../../../proto");
const grpcTlsConfig = loadGrpcTlsConfig();
function loadProtoClientPooled(protoFile, servicePath, address) {
    return loadServiceClientSecurePooled(protoFile, servicePath, address, PROTO_ROOT, grpcTlsConfig);
}
const DEFAULT_DEADLINE_MS = 5000;
const serviceBreakers = new Map();
function getBreaker(name) {
    let breaker = serviceBreakers.get(name);
    if (!breaker) {
        breaker = new CircuitBreaker(`admin-console->${name}`, { failureThreshold: 5, resetTimeoutMs: 30000 });
        serviceBreakers.set(name, breaker);
    }
    return breaker;
}
function grpcUnary(clientOrPool, method, request, { deadlineMs = DEFAULT_DEADLINE_MS } = {}) {
    const client = typeof clientOrPool?.getClient === "function" ? clientOrPool.getClient() : clientOrPool;
    const deadline = new Date(Date.now() + deadlineMs);
    return new Promise((resolve, reject) => {
        client[method](request, { deadline }, (err, response) => {
            if (err)
                reject(err);
            else
                resolve(response);
        });
    });
}
function grpcUnaryProtected(pool, serviceName, method, request, options) {
    const breaker = getBreaker(serviceName);
    return breaker.execute(() => grpcUnary(pool, method, request, options));
}
// ── Audit event emitter (fire-and-forget) ───────────────────────────────────
function emitAuditEvent(auditPool, opts) {
    try {
        grpcUnary(auditPool, "appendEvent", {
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
// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
    mapleLog("info", "admin_console_starting", { port: config.port });
    // Create gRPC client pools
    const contextWallPool = loadProtoClientPooled("maple/context/v1/context_wall.proto", "maple.context.v1.ContextWallService", config.contextWallAddress);
    const auditWriterPool = loadProtoClientPooled("maple/audit/v1/audit_writer.proto", "maple.audit.v1.AuditWriterService", config.auditWriterAddress);
    mapleLog("info", "admin_console_grpc_clients_created", {
        contextWall: config.contextWallAddress,
        auditWriter: config.auditWriterAddress,
    });
    // Emit startup audit event
    emitAuditEvent(auditWriterPool, {
        eventType: "AUDIT_EVENT_TYPE_SERVICE_STARTED",
        summary: "admin-console service started",
        payload: { port: config.port },
    });
    // Build Hono app
    const app = new Hono();
    // Health check
    app.get("/health", (c) => c.json({
        status: "ok",
        service: "admin-console",
        timestamp: new Date().toISOString(),
    }));
    // ── Admin API: Policies (proxy to context-wall) ─────────────────────────
    app.get("/admin/api/policies", async (c) => {
        try {
            const response = await grpcUnaryProtected(contextWallPool, "context-wall", "listPolicyRules", {});
            const rules = Array.isArray(response?.rules) ? response.rules : [];
            emitAuditEvent(auditWriterPool, {
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
    // ── Admin API: Audit events (proxy to audit-writer) ─────────────────────
    app.get("/admin/api/audit", async (c) => {
        try {
            const traceId = c.req.query("trace_id") || "";
            const sessionId = c.req.query("session_id") || "";
            const since = c.req.query("since") || "";
            const until = c.req.query("until") || "";
            const limit = parseInt(c.req.query("limit") || "50", 10);
            const cursor = c.req.query("cursor") || "";
            const response = await grpcUnaryProtected(auditWriterPool, "audit-writer", "queryEvents", {
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
            emitAuditEvent(auditWriterPool, {
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
    // ── Admin API: Policy reload (proxy to context-wall) ────────────────────
    app.post("/admin/api/policies/reload", async (c) => {
        try {
            const response = await grpcUnaryProtected(contextWallPool, "context-wall", "reloadPolicies", {});
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
            return c.json({
                error: "Failed to reach context-wall",
                details: err.message,
                success: false,
            }, 502);
        }
    });
    // ── Admin API: HITL approvals ────────────────────────────────────────────
    app.get("/admin/api/approvals", async (c) => {
        try {
            const sessionId = c.req.query("session_id") || "";
            const response = await grpcUnaryProtected(contextWallPool, "context-wall", "listPendingApprovals", { sessionId });
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
            return c.json({
                error: "Failed to list pending approvals",
                details: err.message,
                approvals: [],
            }, 502);
        }
    });
    app.get("/admin/api/approvals/watch", async (c) => {
        const sessionId = c.req.query("session_id") || "";
        const encoder = new TextEncoder();
        let approvalStream;
        const stream = new ReadableStream({
            start(controller) {
                controller.enqueue(encoder.encode("event: ready\ndata: {}\n\n"));
                approvalStream = contextWallPool.getClient().watchApprovalQueue({ sessionId });
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
                return c.json({ error: "traceId and stepIndex are required" }, 400);
            }
            const grpcAction = toGuardActionEnum(action);
            if (grpcAction === "GUARD_ACTION_PENDING") {
                return c.json({ error: "action must be allow or block" }, 400);
            }
            const response = await grpcUnaryProtected(contextWallPool, "context-wall", "submitApproval", {
                traceId,
                stepIndex: Math.max(0, Math.trunc(stepIndexRaw)),
                action: grpcAction,
                reason,
                approverId,
            });
            emitAuditEvent(auditWriterPool, {
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
            return c.json({
                error: "Failed to submit approval",
                details: err.message,
            }, 502);
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
