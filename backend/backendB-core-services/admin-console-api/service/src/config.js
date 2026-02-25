import { getEnvOrDefault, getEnvPort } from "@maple/common";
export const config = {
    port: getEnvPort("ADMIN_CONSOLE_PORT", 9443),
    host: getEnvOrDefault("ADMIN_CONSOLE_HOST", "0.0.0.0"),
    auditWriterAddress: getEnvOrDefault("AUDIT_WRITER_ADDRESS", "localhost:9400"),
    contextWallAddress: getEnvOrDefault("CONTEXT_WALL_ADDRESS", "localhost:9000"),
    tlsCertPath: getEnvOrDefault("MAPLE_ADMIN_TLS_CERT", "/etc/maple/admin-tls/tls.crt"),
    tlsKeyPath: getEnvOrDefault("MAPLE_ADMIN_TLS_KEY", "/etc/maple/admin-tls/tls.key"),
    tlsCaPath: getEnvOrDefault("MAPLE_ADMIN_TLS_CA", "/etc/maple/admin-tls/ca.crt"),
};
//# sourceMappingURL=config.js.map