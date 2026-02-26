import { getEnvOrDefault, getEnvPort } from "@maple/common";
export const config = {
    port: getEnvPort("SECRETS_BROKER_PORT", 9300),
    host: getEnvOrDefault("SECRETS_BROKER_HOST", "0.0.0.0"),
    auditWriterAddress: getEnvOrDefault("AUDIT_WRITER_ADDRESS", "localhost:9400"),
    defaultTtlSeconds: 300,
    maxTtlSeconds: 3600,
};
//# sourceMappingURL=config.js.map