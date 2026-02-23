import * as grpc from "@grpc/grpc-js";
import { resolve } from "node:path";
import { loadGrpcTlsConfig, loadServiceClientSecure } from "@maple/common";
import {
  contextWallAddress,
  mcpProxyAddress,
  secretsBrokerAddress,
  auditWriterAddress,
} from "./config.js";

const PROTO_ROOT = resolve(import.meta.dirname, "../../../../proto");
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

export function createGrpcClients() {
  return {
    contextWall: loadProtoClient(
      "maple/context/v1/context_wall.proto",
      "maple.context.v1.ContextWallService",
      contextWallAddress
    ),
    mcpProxy: loadProtoClient(
      "maple/proxy/v1/mcp_proxy.proto",
      "maple.proxy.v1.McpProxyService",
      mcpProxyAddress
    ),
    secretsBroker: loadProtoClient(
      "maple/secrets/v1/secrets_broker.proto",
      "maple.secrets.v1.SecretsBrokerService",
      secretsBrokerAddress
    ),
    auditWriter: loadProtoClient(
      "maple/audit/v1/audit_writer.proto",
      "maple.audit.v1.AuditWriterService",
      auditWriterAddress
    ),
  };
}

export type GrpcClients = ReturnType<typeof createGrpcClients>;

export function grpcUnary<T>(client: any, method: string, request: any): Promise<T> {
  return new Promise((resolve, reject) => {
    client[method](request, (err: grpc.ServiceError | null, response: T) => {
      if (err) reject(err);
      else resolve(response);
    });
  });
}
