import { resolve } from "node:path";
import { loadGrpcTlsConfig, loadServiceClientSecure } from "@maple/common";
import { contextWallAddress, secretsBrokerAddress, secretsBrokerRetired, auditWriterAddress, } from "./config.js";
import { currentRequestContext } from "./logging.js";
import { recordServiceCall } from "./core/service-utilization.js";
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
function createRetiredGrpcClient(serviceName, replacementHint) {
    return new Proxy({}, {
        get(_target, prop) {
            if (prop === "close") {
                return () => { };
            }
            return (_request, callback) => {
                callback(new Error(`${serviceName} has been retired. Replacement: ${replacementHint}`));
            };
        },
    });
}
export function createGrpcClients() {
    const secretsBrokerClient = secretsBrokerRetired || !String(secretsBrokerAddress ?? "").trim()
        ? createRetiredGrpcClient("secrets-broker", "context-wall policy plane credential delegation")
        : loadProtoClient("maple/secrets/v1/secrets_broker.proto", "maple.secrets.v1.SecretsBrokerService", secretsBrokerAddress);
    return {
        contextWall: annotateGrpcClient(loadProtoClient("maple/context/v1/context_wall.proto", "maple.context.v1.ContextWallService", contextWallAddress), "context-wall"),
        secretsBroker: annotateGrpcClient(secretsBrokerClient, "secrets-broker"),
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
export function grpcUnary(client, method, request) {
    const startedAtMs = Date.now();
    return new Promise((resolve, reject) => {
        client[method](request, (err, response) => {
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
//# sourceMappingURL=grpc-clients.js.map
