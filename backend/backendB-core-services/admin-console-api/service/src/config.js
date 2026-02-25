import { getEnvOrDefault, getEnvPort } from "@maple/common";
import { loadApiKeysFromEnv } from "@maple/security";

function parseBoolean(value, fallback = false) {
    const normalized = String(value ?? "").trim().toLowerCase();
    if (!normalized) {
        return fallback;
    }
    if (normalized === "1" || normalized === "true" || normalized === "yes") {
        return true;
    }
    if (normalized === "0" || normalized === "false" || normalized === "no") {
        return false;
    }
    return fallback;
}

function loadAdminApiKeys(env = process.env) {
    return loadApiKeysFromEnv({
        ...env,
        MAPLE_API_KEY: env.MAPLE_ADMIN_API_KEY ?? env.MAPLE_API_KEY,
        MAPLE_API_KEYS: env.MAPLE_ADMIN_API_KEYS ?? env.MAPLE_API_KEYS,
    });
}
export const config = {
    port: getEnvPort("ADMIN_CONSOLE_PORT", 9443),
    host: getEnvOrDefault("ADMIN_CONSOLE_HOST", "0.0.0.0"),
    auditWriterAddress: getEnvOrDefault("AUDIT_WRITER_ADDRESS", "localhost:9400"),
    contextWallAddress: getEnvOrDefault("CONTEXT_WALL_ADDRESS", "localhost:9000"),
    tlsCertPath: getEnvOrDefault("MAPLE_ADMIN_TLS_CERT", "/etc/maple/admin-tls/tls.crt"),
    tlsKeyPath: getEnvOrDefault("MAPLE_ADMIN_TLS_KEY", "/etc/maple/admin-tls/tls.key"),
    tlsCaPath: getEnvOrDefault("MAPLE_ADMIN_TLS_CA", "/etc/maple/admin-tls/ca.crt"),
    allowNoAuth: parseBoolean(process.env.MAPLE_ADMIN_ALLOW_NO_AUTH, false),
    apiKeys: loadAdminApiKeys(),
};
//# sourceMappingURL=config.js.map
