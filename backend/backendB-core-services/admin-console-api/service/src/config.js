import { requireEnv, requireEnvPort } from "@maple/common";
import { loadApiKeysFromEnv } from "@maple/security";

function parseBoolean(value) {
    const normalized = String(value ?? "").trim().toLowerCase();
    if (!normalized) {
        throw new Error("Boolean environment variable value is empty");
    }
    if (normalized === "1" || normalized === "true" || normalized === "yes") {
        return true;
    }
    if (normalized === "0" || normalized === "false" || normalized === "no") {
        return false;
    }
    throw new Error(`Invalid boolean value: "${value}"`);
}

function loadAdminApiKeys(env = process.env) {
    return loadApiKeysFromEnv({
        ...env,
        MAPLE_API_KEY: env.MAPLE_ADMIN_API_KEY ?? env.MAPLE_API_KEY,
        MAPLE_API_KEYS: env.MAPLE_ADMIN_API_KEYS ?? env.MAPLE_API_KEYS,
    });
}
function isProductionRuntime() {
    return requireEnv("NODE_ENV").toLowerCase() === "production";
}
const allowNoAuthRequested = parseBoolean(requireEnv("MAPLE_ADMIN_ALLOW_NO_AUTH"));
if (isProductionRuntime() && allowNoAuthRequested) {
    throw new Error("MAPLE_ADMIN_ALLOW_NO_AUTH cannot be enabled in production runtime.");
}
export const config = {
    port: requireEnvPort("ADMIN_CONSOLE_PORT"),
    host: requireEnv("ADMIN_CONSOLE_HOST"),
    auditWriterAddress: requireEnv("AUDIT_WRITER_ADDRESS"),
    contextWallAddress: requireEnv("CONTEXT_WALL_ADDRESS"),
    auditWriterHttpOrigin: process.env.AUDIT_WRITER_HTTP_ORIGIN || "",
    tlsCertPath: requireEnv("MAPLE_ADMIN_TLS_CERT"),
    tlsKeyPath: requireEnv("MAPLE_ADMIN_TLS_KEY"),
    tlsCaPath: requireEnv("MAPLE_ADMIN_TLS_CA"),
    allowNoAuth: allowNoAuthRequested,
    apiKeys: loadAdminApiKeys(),
    gatewayApiUrl: process.env.GATEWAY_API_URL || "",
};
//# sourceMappingURL=config.js.map
