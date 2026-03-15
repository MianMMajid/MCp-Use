import { randomUUID } from "node:crypto";
import { authContextStorage } from "../auth.js";
import { requestContextStorage } from "../logging.js";
import { getGrpcClients } from "../state.js";
import { grpcUnaryProtected } from "../grpc-clients.js";
export { grpcUnaryProtected as grpcUnary };
export function isContextWallAuthorityAvailable() {
    return Boolean(getGrpcClients()?.contextWall);
}
export function getContextWallClient() {
    const pool = getGrpcClients()?.contextWall;
    if (!pool) {
        throw new Error("Context-wall policy authority is unavailable.");
    }
    return pool;
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
