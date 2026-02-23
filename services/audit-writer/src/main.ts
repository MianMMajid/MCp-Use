import { startGrpcServer, gracefulShutdown, mapleLog } from "@maple/common";
import { AuditStore } from "./store.js";
import { createAuditWriterService } from "./service.js";
import { config } from "./config.js";

async function main() {
  mapleLog("info", "audit_writer_starting", { port: config.port });

  const store = new AuditStore();

  // Initialize PostgreSQL persistence before starting the gRPC server
  await store.initialize(config.databaseUrl);

  const server = createAuditWriterService(store);

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
