import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { mapleLog } from "./logging.js";

export const DEFAULT_GRPC_CHANNEL_OPTIONS = {
  'grpc.keepalive_time_ms': 30000,
  'grpc.keepalive_timeout_ms': 10000,
  'grpc.keepalive_permit_without_calls': 1,
  'grpc.max_send_message_length': 10 * 1024 * 1024,
  'grpc.max_receive_message_length': 10 * 1024 * 1024,
  'grpc.max_concurrent_streams': 100,
  'grpc.initial_reconnect_backoff_ms': 1000,
  'grpc.max_reconnect_backoff_ms': 10000,
  'grpc.dns_min_time_between_resolutions_ms': 30000,
  'grpc.default_compression_algorithm': 2,
  'grpc.enable_retries': 1,
  'grpc.service_config': JSON.stringify({
    loadBalancingConfig: [{ round_robin: {} }],
    methodConfig: [{
      name: [{}],
      retryPolicy: {
        maxAttempts: 3,
        initialBackoff: '0.1s',
        maxBackoff: '1s',
        backoffMultiplier: 2,
        retryableStatusCodes: ['UNAVAILABLE', 'DEADLINE_EXCEEDED'],
      },
    }],
  }),
};

export const DEFAULT_GRPC_SERVER_OPTIONS = {
  'grpc.keepalive_time_ms': 30000,
  'grpc.keepalive_timeout_ms': 10000,
  'grpc.keepalive_permit_without_calls': 1,
  'grpc.max_send_message_length': 10 * 1024 * 1024,
  'grpc.max_receive_message_length': 10 * 1024 * 1024,
  'grpc.max_concurrent_streams': 100,
  'grpc.http2.min_time_between_pings_ms': 20000,
  'grpc.http2.min_ping_interval_without_data_ms': 20000,
};
/**
 * Load TLS config from MAPLE_GRPC_TLS_CERT, MAPLE_GRPC_TLS_KEY, MAPLE_GRPC_TLS_CA env vars.
 * Returns null if any are unset.
 */
export function loadGrpcTlsConfig() {
    const disableTls = ["1","true","yes"].includes(
        (process.env.MAPLE_DISABLE_TLS ?? "").trim().toLowerCase()
    );
    if (disableTls) return null;
    const certPath = process.env.MAPLE_GRPC_TLS_CERT?.trim();
    const keyPath = process.env.MAPLE_GRPC_TLS_KEY?.trim();
    const caPath = process.env.MAPLE_GRPC_TLS_CA?.trim();
    if (!certPath || !keyPath || !caPath)
        return null;
    return { certPath, keyPath, caPath };
}
/**
 * Create gRPC client credentials.
 * TLS is required in production; falls back to insecure in development.
 */
export function createGrpcClientCredentials(tlsConfig) {
    if (!tlsConfig) {
        const isTrustedProxy = ["1","true","yes"].includes(
            (process.env.MAPLE_BEHIND_TRUSTED_PROXY ?? "").trim().toLowerCase()
        );
        if (process.env.NODE_ENV !== "production" || isTrustedProxy) {
            return grpc.credentials.createInsecure();
        }
        throw new Error("gRPC TLS client config missing. Set MAPLE_GRPC_TLS_CERT/KEY/CA or MAPLE_BEHIND_TRUSTED_PROXY=true.");
    }
    try {
        const rootCerts = readFileSync(tlsConfig.caPath);
        const privateKey = readFileSync(tlsConfig.keyPath);
        const certChain = readFileSync(tlsConfig.certPath);
        return grpc.credentials.createSsl(rootCerts, privateKey, certChain);
    }
    catch (err) {
        throw new Error(`Failed to load gRPC TLS client credentials: ${err.message}`);
    }
}
/**
 * Create gRPC server credentials.
 * TLS is required.
 */
export function createGrpcServerCredentials(tlsConfig) {
    if (!tlsConfig) {
        const isTrustedProxy = ["1","true","yes"].includes(
            (process.env.MAPLE_BEHIND_TRUSTED_PROXY ?? "").trim().toLowerCase()
        );
        if (process.env.NODE_ENV !== "production" || isTrustedProxy) {
            return grpc.ServerCredentials.createInsecure();
        }
        throw new Error("gRPC TLS server config missing. Set MAPLE_GRPC_TLS_CERT, MAPLE_GRPC_TLS_KEY, MAPLE_GRPC_TLS_CA.");
    }
    try {
        const rootCerts = readFileSync(tlsConfig.caPath);
        const privateKey = readFileSync(tlsConfig.keyPath);
        const certChain = readFileSync(tlsConfig.certPath);
        return grpc.ServerCredentials.createSsl(rootCerts, [{ private_key: privateKey, cert_chain: certChain }], false);
    }
    catch (err) {
        throw new Error(`Failed to load gRPC TLS server credentials: ${err.message}`);
    }
}
/**
 * Centralized gRPC client factory with optional TLS support.
 */
export function loadServiceClientSecure(protoFile, servicePath, address, protoRoot, tlsConfig, channelOptions = {}) {
    const protoPath = resolve(protoRoot, protoFile);
    const packageDefinition = protoLoader.loadSync(protoPath, {
        keepCase: false, longs: String, enums: String, defaults: true, oneofs: true,
        includeDirs: [protoRoot, resolve(protoRoot, "maple"), dirname(protoPath)],
    });
    const proto = grpc.loadPackageDefinition(packageDefinition);
    const parts = servicePath.split(".");
    let service = proto;
    for (const part of parts)
        service = service[part];
    const credentials = createGrpcClientCredentials(tlsConfig);
    return new service(address, credentials, { ...DEFAULT_GRPC_CHANNEL_OPTIONS, ...channelOptions });
}
/**
 * Create a pool of gRPC clients sharing the same proto definition but using
 * separate HTTP/2 connections. Each pool member uses a local subchannel pool
 * to prevent connection sharing, breaking the 100-concurrent-stream ceiling.
 *
 * Returns { getClient(), close(), size }.
 * getClient() round-robins across pool members — call it per-RPC.
 */
export function loadServiceClientSecurePooled(protoFile, servicePath, address, protoRoot, tlsConfig, poolSize = 4, channelOptions = {}) {
    const protoPath = resolve(protoRoot, protoFile);
    const packageDefinition = protoLoader.loadSync(protoPath, {
        keepCase: false, longs: String, enums: String, defaults: true, oneofs: true,
        includeDirs: [protoRoot, resolve(protoRoot, "maple"), dirname(protoPath)],
    });
    const proto = grpc.loadPackageDefinition(packageDefinition);
    const parts = servicePath.split(".");
    let ServiceClass = proto;
    for (const part of parts) ServiceClass = ServiceClass[part];
    const credentials = createGrpcClientCredentials(tlsConfig);
    const clients = [];
    for (let i = 0; i < poolSize; i++) {
        clients.push(new ServiceClass(address, credentials, {
            ...DEFAULT_GRPC_CHANNEL_OPTIONS,
            ...channelOptions,
            'grpc.use_local_subchannel_pool': 1,
        }));
    }
    let idx = 0;
    return {
        getClient() {
            const client = clients[idx];
            idx = (idx + 1) % clients.length;
            return client;
        },
        close() {
            for (const client of clients) {
                try { client.close(); } catch { /* best effort */ }
            }
        },
        get size() {
            return clients.length;
        },
    };
}
export async function startGrpcServer(server, options) {
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
export function createGrpcChannel(address, channelOptions = {}) {
    const credentials = createGrpcClientCredentials(loadGrpcTlsConfig());
    return new grpc.Channel(address, credentials, { ...DEFAULT_GRPC_CHANNEL_OPTIONS, ...channelOptions });
}
export function createGrpcServer(options = {}) {
    return new grpc.Server({ ...DEFAULT_GRPC_SERVER_OPTIONS, ...options });
}
export function requireEnv(key) {
    const value = process.env[key]?.trim();
    if (!value || value.length === 0) {
        throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
}
export function requireEnvPort(key) {
    const raw = process.env[key]?.trim();
    if (!raw) {
        throw new Error(`Missing required environment variable: ${key}`);
    }
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
        throw new Error(`Invalid port for ${key}: "${raw}" (must be 1-65535)`);
    }
    return parsed;
}
export function gracefulShutdown(server, serviceName) {
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
//# sourceMappingURL=grpc.js.map
