import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { loadGrpcTlsConfig, loadServiceClientSecure, } from "@maple/common";
import { authContextStorage } from "../auth.js";
import { requestContextStorage } from "../logging.js";
const PROTO_ROOT = resolve(import.meta.dirname, "../../../../../proto");
const CONTEXT_WALL_ADDRESS = process.env.CONTEXT_WALL_ADDRESS?.trim() || "localhost:9000";
const grpcTlsConfig = loadGrpcTlsConfig();
function loadProtoClient(protoFile, servicePath, address) {
    return loadServiceClientSecure(protoFile, servicePath, address, PROTO_ROOT, grpcTlsConfig);
}
export function grpcUnary(client, method, request) {
    return new Promise((resolvePromise, rejectPromise) => {
        client[method](request, (err, response) => {
            if (err) {
                rejectPromise(err);
            }
            else {
                resolvePromise(response);
            }
        });
    });
}
let contextWallClient;
export function getContextWallClient() {
    if (!contextWallClient) {
        contextWallClient = loadProtoClient("maple/context/v1/context_wall.proto", "maple.context.v1.ContextWallService", CONTEXT_WALL_ADDRESS);
    }
    return contextWallClient;
}
export function buildGatewayRequestContext(overrides = {}) {
    const authContext = authContextStorage.getStore();
    const requestLogContext = requestContextStorage.getStore();
    const derivedTenantId = overrides.tenantId ??
        requestLogContext?.tenantId ??
        "default";
    const derivedUserId = overrides.userId ??
        authContext?.userId ??
        authContext?.keyFingerprint ??
        "anonymous";
    const derivedDeviceId = overrides.deviceId ??
        requestLogContext?.deviceId ??
        "unknown-device";
    return {
        requestId: overrides.requestId ?? requestLogContext?.requestId ?? randomUUID().slice(0, 12),
        sessionId: overrides.sessionId ?? requestLogContext?.sessionId ?? "",
        traceId: overrides.traceId ?? requestLogContext?.traceId ?? "",
        userId: derivedUserId,
        keyFingerprint: authContext?.keyFingerprint ?? "",
        sourceService: "gateway-api",
        tenantId: derivedTenantId,
        deviceId: derivedDeviceId,
    };
}
//# sourceMappingURL=downstream-proxy-contextwall-grpc.js.map