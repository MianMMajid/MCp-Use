import { resolve } from "node:path";
import { loadGrpcTlsConfig, loadServiceClientSecure } from "@maple/common";
import { contextWallAddress, mcpProxyAddress, secretsBrokerAddress, auditWriterAddress, } from "./config.js";
const PROTO_ROOT = resolve(import.meta.dirname, "../../../../proto");
const grpcTlsConfig = loadGrpcTlsConfig();
function loadProtoClient(protoFile, servicePath, address) {
    return loadServiceClientSecure(protoFile, servicePath, address, PROTO_ROOT, grpcTlsConfig);
}
export function createGrpcClients() {
    return {
        contextWall: loadProtoClient("maple/context/v1/context_wall.proto", "maple.context.v1.ContextWallService", contextWallAddress),
        mcpProxy: loadProtoClient("maple/proxy/v1/mcp_proxy.proto", "maple.proxy.v1.McpProxyService", mcpProxyAddress),
        secretsBroker: loadProtoClient("maple/secrets/v1/secrets_broker.proto", "maple.secrets.v1.SecretsBrokerService", secretsBrokerAddress),
        auditWriter: loadProtoClient("maple/audit/v1/audit_writer.proto", "maple.audit.v1.AuditWriterService", auditWriterAddress),
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
    return new Promise((resolve, reject) => {
        client[method](request, (err, response) => {
            if (err)
                reject(err);
            else
                resolve(response);
        });
    });
}
//# sourceMappingURL=grpc-clients.js.map
