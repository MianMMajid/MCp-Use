import { getEnvOrDefault, getEnvPort } from "@maple/common";
export const config = {
    port: getEnvPort("AUDIT_WRITER_PORT", 9400),
    httpPort: getEnvPort("AUDIT_WRITER_HTTP_PORT", 9401),
    host: getEnvOrDefault("AUDIT_WRITER_HOST", "0.0.0.0"),
    databaseUrl: getEnvOrDefault("DATABASE_URL", "postgresql://maple:maple@localhost:5432/maple"),
    maxBatchSize: 1000,
    flushIntervalMs: 5000,
};
//# sourceMappingURL=config.js.map