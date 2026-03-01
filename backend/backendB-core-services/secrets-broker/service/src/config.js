import { requireEnv, requireEnvPort } from "@maple/common";
export const config = {
    port: requireEnvPort("SECRETS_BROKER_PORT"),
    host: requireEnv("SECRETS_BROKER_HOST"),
    auditWriterAddress: requireEnv("AUDIT_WRITER_ADDRESS"),
    databaseUrl: process.env.DATABASE_URL?.trim() || undefined,
    defaultTtlSeconds: 300,
    maxTtlSeconds: 3600,
};
//# sourceMappingURL=config.js.map