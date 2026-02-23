import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mapleLog } from "./logging.js";

export interface GrpcTlsConfig {
  certPath: string;
  keyPath: string;
  caPath: string;
}

/**
 * Load TLS config from MAPLE_GRPC_TLS_CERT, MAPLE_GRPC_TLS_KEY, MAPLE_GRPC_TLS_CA env vars.
 * Returns null if any are unset.
 */
export function loadGrpcTlsConfig(): GrpcTlsConfig | null {
  const certPath = process.env.MAPLE_GRPC_TLS_CERT?.trim();
  const keyPath = process.env.MAPLE_GRPC_TLS_KEY?.trim();
  const caPath = process.env.MAPLE_GRPC_TLS_CA?.trim();
  if (!certPath || !keyPath || !caPath) return null;
  return { certPath, keyPath, caPath };
}

/**
 * Create gRPC client credentials.
 * TLS is required.
 */
export function createGrpcClientCredentials(tlsConfig?: GrpcTlsConfig | null): grpc.ChannelCredentials {
  if (!tlsConfig) {
    throw new Error(
      "gRPC TLS client config missing. Set MAPLE_GRPC_TLS_CERT, MAPLE_GRPC_TLS_KEY, MAPLE_GRPC_TLS_CA.",
    );
  }
  try {
    const rootCerts = readFileSync(tlsConfig.caPath);
    const privateKey = readFileSync(tlsConfig.keyPath);
    const certChain = readFileSync(tlsConfig.certPath);
    return grpc.credentials.createSsl(rootCerts, privateKey, certChain);
  } catch (err) {
    throw new Error(`Failed to load gRPC TLS client credentials: ${(err as Error).message}`);
  }
}

/**
 * Create gRPC server credentials.
 * TLS is required.
 */
export function createGrpcServerCredentials(tlsConfig?: GrpcTlsConfig | null): grpc.ServerCredentials {
  if (!tlsConfig) {
    throw new Error(
      "gRPC TLS server config missing. Set MAPLE_GRPC_TLS_CERT, MAPLE_GRPC_TLS_KEY, MAPLE_GRPC_TLS_CA.",
    );
  }
  try {
    const rootCerts = readFileSync(tlsConfig.caPath);
    const privateKey = readFileSync(tlsConfig.keyPath);
    const certChain = readFileSync(tlsConfig.certPath);
    return grpc.ServerCredentials.createSsl(rootCerts, [{ private_key: privateKey, cert_chain: certChain }], false);
  } catch (err) {
    throw new Error(`Failed to load gRPC TLS server credentials: ${(err as Error).message}`);
  }
}

/**
 * Centralized gRPC client factory with optional TLS support.
 */
export function loadServiceClientSecure(
  protoFile: string,
  servicePath: string,
  address: string,
  protoRoot: string,
  tlsConfig?: GrpcTlsConfig | null,
): any {
  const packageDefinition = protoLoader.loadSync(resolve(protoRoot, protoFile), {
    keepCase: false, longs: String, enums: String, defaults: true, oneofs: true,
    includeDirs: [protoRoot],
  });
  const proto = grpc.loadPackageDefinition(packageDefinition);
  const parts = servicePath.split(".");
  let service: any = proto;
  for (const part of parts) service = service[part];
  const credentials = createGrpcClientCredentials(tlsConfig);
  return new service(address, credentials);
}

export interface GrpcServerOptions {
  port: number;
  host?: string;
  serviceName: string;
  credentials?: grpc.ServerCredentials;
}

export async function startGrpcServer(
  server: grpc.Server,
  options: GrpcServerOptions
): Promise<void> {
  const { port, host = "0.0.0.0", serviceName } = options;
  const address = `${host}:${port}`;
  const credentials = options.credentials ?? createGrpcServerCredentials(loadGrpcTlsConfig());

  return new Promise((resolve, reject) => {
    server.bindAsync(address, credentials, (err) => {
      if (err) {
        mapleLog("error", `${serviceName} failed to bind`, { address, error: err.message });
        reject(err);
        return;
      }
      mapleLog("info", `${serviceName} listening`, { address });
      resolve();
    });
  });
}

export function createGrpcChannel(address: string): grpc.Channel {
  const credentials = createGrpcClientCredentials(loadGrpcTlsConfig());
  return new grpc.Channel(address, credentials, {});
}

export function getEnvOrDefault(key: string, defaultValue: string): string {
  const value = process.env[key]?.trim();
  return value && value.length > 0 ? value : defaultValue;
}

export function getEnvPort(key: string, defaultPort: number): number {
  const raw = process.env[key]?.trim();
  if (!raw) return defaultPort;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultPort;
}

export function gracefulShutdown(server: grpc.Server, serviceName: string): void {
  const shutdown = () => {
    mapleLog("info", `${serviceName} shutting down`);
    server.tryShutdown(() => {
      mapleLog("info", `${serviceName} stopped`);
      process.exit(0);
    });
    setTimeout(() => {
      mapleLog("warn", `${serviceName} forced shutdown`);
      server.forceShutdown();
      process.exit(1);
    }, 10_000);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
