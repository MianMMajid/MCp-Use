import { randomUUID } from "node:crypto";
import * as grpc from "@grpc/grpc-js";
import { resolve } from "node:path";
import {
  loadGrpcTlsConfig,
  loadServiceClientSecure,
} from "@maple/common";
import { authContextStorage } from "../auth.js";
import { requestContextStorage } from "../logging.js";

export interface GatewayRequestContextOverrides {
  requestId?: string;
  sessionId?: string;
  traceId?: string;
  tenantId?: string;
  userId?: string;
  deviceId?: string;
}

const PROTO_ROOT = resolve(import.meta.dirname, "../../../../../proto");
const CONTEXT_WALL_ADDRESS = process.env.CONTEXT_WALL_ADDRESS?.trim() || "localhost:9000";
const grpcTlsConfig = loadGrpcTlsConfig();

function loadProtoClient(protoFile: string, servicePath: string, address: string): any {
  return loadServiceClientSecure(
    protoFile,
    servicePath,
    address,
    PROTO_ROOT,
    grpcTlsConfig,
  );
}

export function grpcUnary<T>(client: any, method: string, request: any): Promise<T> {
  return new Promise((resolvePromise, rejectPromise) => {
    client[method](request, (err: grpc.ServiceError | null, response: T) => {
      if (err) {
        rejectPromise(err);
      } else {
        resolvePromise(response);
      }
    });
  });
}

let contextWallClient: any;

export function getContextWallClient(): any {
  if (!contextWallClient) {
    contextWallClient = loadProtoClient(
      "maple/context/v1/context_wall.proto",
      "maple.context.v1.ContextWallService",
      CONTEXT_WALL_ADDRESS,
    );
  }
  return contextWallClient;
}

export function buildGatewayRequestContext(
  overrides: GatewayRequestContextOverrides = {},
): Record<string, string> {
  const authContext = authContextStorage.getStore();
  const requestLogContext = requestContextStorage.getStore();
  const derivedTenantId =
    overrides.tenantId ??
    requestLogContext?.tenantId ??
    "default";
  const derivedUserId =
    overrides.userId ??
    authContext?.userId ??
    authContext?.keyFingerprint ??
    "anonymous";
  const derivedDeviceId =
    overrides.deviceId ??
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
