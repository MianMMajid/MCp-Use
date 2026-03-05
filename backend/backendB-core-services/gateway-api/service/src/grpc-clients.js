import { resolve } from "node:path";
import { loadGrpcTlsConfig, loadServiceClientSecure, CircuitBreaker } from "@maple/common";
import { contextWallAddress, auditWriterAddress, } from "./config.js";
import { currentRequestContext } from "./logging.js";
import { recordServiceCall } from "./core/service-utilization.js";
const DEFAULT_DEADLINE_MS = 5000;
const serviceBreakers = new Map();
const PROTO_ROOT = resolve(import.meta.dirname, "../../../../proto");
const grpcTlsConfig = loadGrpcTlsConfig();
function loadProtoClient(protoFile, servicePath, address) {
    return loadServiceClientSecure(protoFile, servicePath, address, PROTO_ROOT, grpcTlsConfig);
}
function annotateGrpcClient(client, serviceName) {
    if (!client || typeof client !== "object") {
        return client;
    }
    try {
        Object.defineProperty(client, "__mapleServiceName", {
            value: serviceName,
            enumerable: false,
            configurable: true,
            writable: false,
        });
    }
    catch {
        // best effort
    }
    return client;
}
export function createGrpcClients() {
    return {
        contextWall: annotateGrpcClient(loadProtoClient("maple/context/v1/context_wall.proto", "maple.context.v1.ContextWallService", contextWallAddress), "context-wall"),
        auditWriter: annotateGrpcClient(loadProtoClient("maple/audit/v1/audit_writer.proto", "maple.audit.v1.AuditWriterService", auditWriterAddress), "audit-writer"),
    };
}
export function closeGrpcClients(clients) {
    if (!clients || typeof clients !== "object") {
        return;
    }
    for (const client of Object.values(clients)) {
        if (!client || typeof client.close !== "function") {
            continue;
        }
        try {
            client.close();
        }
        catch {
            // best effort
        }
    }
}
export function grpcUnary(client, method, request, { deadlineMs = DEFAULT_DEADLINE_MS } = {}) {
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
export function grpcUnaryProtected(client, method, request, options) {
    const serviceName = String(client?.__mapleServiceName ?? "unknown");
    const breaker = getBreaker(serviceName);
    return breaker.execute(() => grpcUnary(client, method, request, options));
}
//# sourceMappingURL=grpc-clients.js.map
