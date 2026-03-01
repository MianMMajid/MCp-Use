import { requireEnv, requireEnvPort } from "@maple/common";
export const config = {
    port: requireEnvPort("AUDIT_WRITER_PORT"),
    httpPort: requireEnvPort("AUDIT_WRITER_HTTP_PORT"),
    host: requireEnv("AUDIT_WRITER_HOST"),
    databaseUrl: requireEnv("DATABASE_URL"),
    maxBatchSize: 1000,
    flushIntervalMs: 5000,
};
//# sourceMappingURL=config.js.map