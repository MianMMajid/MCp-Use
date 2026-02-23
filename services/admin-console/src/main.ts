import { serve } from "@hono/node-server";
import { Hono } from "hono";
import * as grpc from "@grpc/grpc-js";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer as createHttpsServer } from "node:https";
import { loadGrpcTlsConfig, loadServiceClientSecure, mapleLog } from "@maple/common";
import { config } from "./config.js";
import { createStaticRoutes } from "./static-routes.js";

// ── gRPC client helpers ─────────────────────────────────────────────────────

const PROTO_ROOT = resolve(import.meta.dirname, "../../../proto");
const grpcTlsConfig = loadGrpcTlsConfig();

function loadProtoClient(protoFile: string, servicePath: string, address: string): any {
  return loadServiceClientSecure(
    protoFile,
    servicePath,
    address,
    PROTO_ROOT,
    grpcTlsConfig,
  );
}

function grpcUnary<T>(client: any, method: string, request: any): Promise<T> {
  return new Promise((resolve, reject) => {
    client[method](request, (err: grpc.ServiceError | null, response: T) => {
      if (err) reject(err);
      else resolve(response);
    });
  });
}

// ── Audit event emitter (fire-and-forget) ───────────────────────────────────

function emitAuditEvent(
  auditClient: any,
  opts: { eventType: string; summary: string; severity?: string; payload?: Record<string, unknown> },
): void {
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
  } catch {
    // fire-and-forget
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  mapleLog("info", "admin_console_starting", { port: config.port });

  // Create gRPC clients
  const contextWall = loadProtoClient(
    "maple/context/v1/context_wall.proto",
    "maple.context.v1.ContextWallService",
    config.contextWallAddress
  );

  const auditWriter = loadProtoClient(
    "maple/audit/v1/audit_writer.proto",
    "maple.audit.v1.AuditWriterService",
    config.auditWriterAddress
  );

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

  // Health check
  app.get("/health", (c) =>
    c.json({
      status: "ok",
      service: "admin-console",
      timestamp: new Date().toISOString(),
    })
  );

  // ── Admin API: Policies (proxy to context-wall) ─────────────────────────

  app.get("/admin/api/policies", async (c) => {
    try {
      // Use GetPolicyDecision with a blank lookup to list active policies.
      // The context-wall EvaluateStep RPC is the primary policy engine entry
      // point; we call it with an empty step to get a baseline decision that
      // includes the active policy set.
      const response = await grpcUnary<any>(contextWall, "getPolicyDecision", {
        traceId: "",
        stepIndex: 0,
      });
      emitAuditEvent(auditWriter, {
        eventType: "AUDIT_EVENT_TYPE_POLICY_EVALUATED",
        summary: "admin-console: policy state queried",
        payload: { action: response.decision?.action },
      });
      return c.json({ policies: response.decision || response });
    } catch (err: any) {
      mapleLog("warn", "admin_console_policies_grpc_error", {
        code: err.code,
        message: err.message,
      });
      // Fallback: return a structured error so the UI still renders
      return c.json(
        {
          error: "Failed to reach context-wall",
          details: err.message,
          policies: [],
        },
        502
      );
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

      const response = await grpcUnary<any>(auditWriter, "queryEvents", {
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
    } catch (err: any) {
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

  // ── Admin API: Policy reload (proxy to context-wall) ────────────────────

  app.post("/admin/api/policies/reload", async (c) => {
    try {
      const response = await grpcUnary<any>(contextWall, "reloadPolicies", {});
      return c.json({
        success: response.success,
        ruleCount: response.ruleCount,
        errorMessage: response.errorMessage || "",
      });
    } catch (err: any) {
      mapleLog("warn", "admin_console_reload_policies_grpc_error", {
        code: err.code,
        message: err.message,
      });
      return c.json(
        {
          error: "Failed to reach context-wall",
          details: err.message,
          success: false,
        },
        502
      );
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
