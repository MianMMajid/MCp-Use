import { startGrpcServer, gracefulShutdown, mapleLog } from "@maple/common";
import { createServer as createHttpServer } from "node:http";
import { AuditStore } from "./store.js";
import { createAuditWriterService } from "./service.js";
import { config } from "./config.js";
function headerValue(raw) {
    if (typeof raw === "string")
        return raw;
    if (Array.isArray(raw))
        return raw[0] ?? "";
    return "";
}
function startEdgeAuditIngestServer(store) {
    const server = createHttpServer((req, res) => {
        // Dead-letter queue endpoints
        if (req.method === "GET" && req.url?.startsWith("/v1/audit/dead-letter")) {
            void (async () => {
                try {
                    const url = new URL(req.url, `http://${req.headers.host}`);
                    const limit = parseInt(url.searchParams.get("limit") || "50", 10);
                    const offset = parseInt(url.searchParams.get("offset") || "0", 10);
                    const result = await store.listDeadLetter(limit, offset);
                    res.statusCode = 200;
                    res.setHeader("content-type", "application/json");
                    res.end(JSON.stringify(result));
                } catch (err) {
                    res.statusCode = 500;
                    res.setHeader("content-type", "application/json");
                    res.end(JSON.stringify({ error: err.message }));
                }
            })();
            return;
        }

        const replayMatch = req.method === "POST" && req.url?.match(/^\/v1\/audit\/dead-letter\/([^/]+)\/replay$/);
        if (replayMatch) {
            void (async () => {
                try {
                    const eventId = replayMatch[1];
                    const result = await store.replayDeadLetter(eventId);
                    res.statusCode = result.replayed ? 200 : 404;
                    res.setHeader("content-type", "application/json");
                    res.end(JSON.stringify(result));
                } catch (err) {
                    res.statusCode = 500;
                    res.setHeader("content-type", "application/json");
                    res.end(JSON.stringify({ error: err.message }));
                }
            })();
            return;
        }

        if (req.method === "GET" && req.url === "/health") {
            res.statusCode = 200;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ status: "ok", service: "audit-writer", timestamp: new Date().toISOString() }));
            return;
        }
        if (req.method === "GET" && req.url === "/ready") {
            const ready = store.isInitialized?.() ?? true;
            res.statusCode = ready ? 200 : 503;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ ready, service: "audit-writer" }));
            return;
        }
        if (req.method !== "POST" || req.url !== "/v1/audit/edge-access") {
            res.statusCode = 404;
            res.end();
            return;
        }
        req.on("data", () => {
            // Discard request body; all fields come from headers.
        });
        req.on("end", () => {
            void (async () => {
                try {
                const method = headerValue(req.headers["x-maple-method"]) || "UNKNOWN";
                const path = headerValue(req.headers["x-maple-path"]) || "/";
                const requestId = headerValue(req.headers["x-request-id"]);
                const traceId = headerValue(req.headers["x-maple-trace-id"]);
                const sessionId = headerValue(req.headers["x-maple-session-id"]);
                const tenantId = headerValue(req.headers["x-tenant-id"]);
                const userId = headerValue(req.headers["x-user-id"]);
                const deviceId = headerValue(req.headers["x-device-id"]);
                await store.append({
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
            }
            catch (err) {
                mapleLog("warn", "audit_writer_edge_ingest_failed", { error: err.message });
            }
            res.statusCode = 202;
            res.end();
            })();
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
    const store = new AuditStore({
        maxBufferSize: config.maxBatchSize,
        flushIntervalMs: config.flushIntervalMs,
    });
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
    await store.append({
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
//# sourceMappingURL=main.js.map
