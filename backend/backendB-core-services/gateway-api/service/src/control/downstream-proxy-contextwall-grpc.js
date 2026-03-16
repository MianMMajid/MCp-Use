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
function firstNonEmptyString(...values) {
    for (const value of values) {
        const normalized = String(value ?? "").trim();
        if (normalized.length > 0) {
            return normalized;
        }
    }
    return "";
}
export function buildGatewayRequestContext(overrides = {}) {
    const authContext = authContextStorage.getStore();
    const requestLogContext = requestContextStorage.getStore();
    const derivedTenantId = firstNonEmptyString(overrides.tenantId, requestLogContext?.tenantId, "default");
    const derivedUserId = firstNonEmptyString(overrides.userId, authContext?.userId, authContext?.keyFingerprint, "anonymous");
    const derivedDeviceId = firstNonEmptyString(overrides.deviceId, requestLogContext?.deviceId, "cli");
    return {
        requestId: firstNonEmptyString(overrides.requestId, requestLogContext?.requestId, randomUUID().slice(0, 12)),
        sessionId: firstNonEmptyString(overrides.sessionId, requestLogContext?.sessionId, ""),
        traceId: firstNonEmptyString(overrides.traceId, requestLogContext?.traceId, ""),
        userId: derivedUserId,
        keyFingerprint: firstNonEmptyString(authContext?.keyFingerprint, ""),
        sourceService: firstNonEmptyString(overrides.sourceService, "gateway-api"),
        tenantId: derivedTenantId,
        deviceId: derivedDeviceId,
    };
}
//# sourceMappingURL=downstream-proxy-contextwall-grpc.js.map
