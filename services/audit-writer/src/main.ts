import { startGrpcServer, gracefulShutdown, mapleLog } from "@maple/common";
import { createServer as createHttpServer } from "node:http";
import { AuditStore } from "./store.js";
import { createAuditWriterService } from "./service.js";
import { config } from "./config.js";

function headerValue(raw: string | string[] | undefined): string {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) return raw[0] ?? "";
  return "";
}

function startEdgeAuditIngestServer(store: AuditStore): void {
  const server = createHttpServer((req, res) => {
    if (req.method !== "POST" || req.url !== "/v1/audit/edge-access") {
      res.statusCode = 404;
      res.end();
      return;
    }

    req.on("data", () => {
      // Discard request body; all fields come from headers.
    });
    req.on("end", () => {
      try {
        const method = headerValue(req.headers["x-maple-method"]) || "UNKNOWN";
        const path = headerValue(req.headers["x-maple-path"]) || "/";
        const requestId = headerValue(req.headers["x-request-id"]);
        const traceId = headerValue(req.headers["x-maple-trace-id"]);
        const sessionId = headerValue(req.headers["x-maple-session-id"]);
        const tenantId = headerValue(req.headers["x-tenant-id"]);
        const userId = headerValue(req.headers["x-user-id"]);
        const deviceId = headerValue(req.headers["x-device-id"]);

        store.append({
          eventId: "",
          eventType: "proxy_request",
          timestamp: new Date().toISOString(),
          sourceService: "maple-edge",
          traceId,
          sessionId,
          requestId,
          userId,
          summary: `Edge ingress ${method} ${path}`,
          severity: "low",
          payload: {
            method,
            path,
            tenantId,
            deviceId,
          },
        });
      } catch (err: any) {
        mapleLog("warn", "audit_writer_edge_ingest_failed", { error: err.message });
      }
      res.statusCode = 202;
      res.end();
    });
  });

  server.listen(config.httpPort, config.host, () => {
    mapleLog("info", "audit_writer_edge_ingest_listening", {
      host: config.host,
      port: config.httpPort,
    });
  });
}

async function main() {
  mapleLog("info", "audit_writer_starting", { port: config.port });

  const store = new AuditStore();

  // Initialize PostgreSQL persistence before starting the gRPC server
  await store.initialize(config.databaseUrl);

  const server = createAuditWriterService(store);
  startEdgeAuditIngestServer(store);

  await startGrpcServer(server, {
    port: config.port,
    host: config.host,
    serviceName: "audit-writer",
  });

  gracefulShutdown(server, "audit-writer");

  // Log service startup event
  store.append({
    eventId: "",
    eventType: "service_started",
    timestamp: new Date().toISOString(),
    sourceService: "audit-writer",
    summary: `audit-writer started on port ${config.port}`,
  });
}

main().catch((err) => {
  mapleLog("error", "audit_writer_fatal", { error: err.message });
  process.exit(1);
});
