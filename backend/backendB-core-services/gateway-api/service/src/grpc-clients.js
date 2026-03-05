import { resolve } from "node:path";
import { loadGrpcTlsConfig, loadServiceClientSecurePooled, CircuitBreaker } from "@maple/common";
import { contextWallAddress, auditWriterAddress, } from "./config.js";
import { currentRequestContext } from "./logging.js";
import { recordServiceCall } from "./core/service-utilization.js";
const DEFAULT_DEADLINE_MS = 5000;
const serviceBreakers = new Map();
const PROTO_ROOT = resolve(import.meta.dirname, "../../../../proto");
const grpcTlsConfig = loadGrpcTlsConfig();
function loadProtoClientPooled(protoFile, servicePath, address) {
    return loadServiceClientSecurePooled(protoFile, servicePath, address, PROTO_ROOT, grpcTlsConfig);
}
function annotatePooledClient(pool, serviceName) {
    const originalGetClient = pool.getClient.bind(pool);
    pool.getClient = () => {
        const client = originalGetClient();
        try {
            Object.defineProperty(client, "__mapleServiceName", {
                value: serviceName,
                enumerable: false,
                configurable: true,
                writable: false,
            });
        }
        catch {
            // best effort — property may already exist
        }
        return client;
    };
    return pool;
}
export function createGrpcClients() {
    return {
        contextWall: annotatePooledClient(loadProtoClientPooled("maple/context/v1/context_wall.proto", "maple.context.v1.ContextWallService", contextWallAddress), "context-wall"),
        auditWriter: annotatePooledClient(loadProtoClientPooled("maple/audit/v1/audit_writer.proto", "maple.audit.v1.AuditWriterService", auditWriterAddress), "audit-writer"),
    };
}
export function closeGrpcClients(clients) {
    if (!clients || typeof clients !== "object") {
        return;
    }
    for (const pool of Object.values(clients)) {
        if (!pool) continue;
        if (typeof pool.close === "function") {
            try { pool.close(); } catch { /* best effort */ }
        }
    }
}
export function grpcUnary(clientOrPool, method, request, { deadlineMs = DEFAULT_DEADLINE_MS } = {}) {
    const client = typeof clientOrPool?.getClient === "function" ? clientOrPool.getClient() : clientOrPool;
    const startedAtMs = Date.now();
    const deadline = new Date(Date.now() + deadlineMs);
    return new Promise((resolve, reject) => {
        client[method](request, { deadline }, (err, response) => {
            const ctx = currentRequestContext();
            const serviceName = String(client?.__mapleServiceName ?? "unknown");
            const routeId = ctx ? `${ctx.method} ${ctx.path}` : "";
            recordServiceCall({
                caller: "gateway-api",
                service: serviceName,
                operation: String(method ?? "unknown"),
                status: err ? "error" : "ok",
                latencyMs: Date.now() - startedAtMs,
                routeId,
                traceId: ctx?.traceId ?? "",
                tenantId: ctx?.tenantId ?? "",
            });
            if (err)
                reject(err);
            else
                resolve(response);
        });
    });
}
function getBreaker(serviceName) {
    let breaker = serviceBreakers.get(serviceName);
    if (!breaker) {
        breaker = new CircuitBreaker(`grpc-${serviceName}`, {
            failureThreshold: 5,
            resetTimeoutMs: 30000,
        });
        serviceBreakers.set(serviceName, breaker);
    }
    return breaker;
}
export function grpcUnaryProtected(clientOrPool, method, request, options) {
    const client = typeof clientOrPool?.getClient === "function" ? clientOrPool.getClient() : clientOrPool;
    const serviceName = String(client?.__mapleServiceName ?? "unknown");
    const breaker = getBreaker(serviceName);
    return breaker.execute(() => grpcUnary(client, method, request, options));
}
//# sourceMappingURL=grpc-clients.js.map
