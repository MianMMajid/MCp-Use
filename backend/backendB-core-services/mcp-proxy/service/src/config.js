import { requireEnv, requireEnvPort } from "@maple/common";
export const config = {
    port: requireEnvPort("MCP_PROXY_PORT"),
    host: requireEnv("MCP_PROXY_HOST"),
    auditWriterAddress: requireEnv("AUDIT_WRITER_ADDRESS"),
    contextWallAddress: requireEnv("CONTEXT_WALL_ADDRESS"),
    cyberProxyAddress: requireEnv("CYBER_PROXY_ADDRESS"),
    downstreamApps: requireEnv("DOWNSTREAM_APPS"),
    mapleDownstreamApps: requireEnv("MAPLE_DOWNSTREAM_APPS"),
    toolExecutionTimeoutMs: 30000,
    toolRunnerMode: requireEnv("MAPLE_TOOL_RUNNER_MODE"),
    toolRunnerImage: requireEnv("MAPLE_TOOL_RUNNER_IMAGE"),
    toolRunnerJobNamespace: requireEnv("MAPLE_TOOL_RUNNER_JOB_NAMESPACE"),
    databaseUrl: process.env.DATABASE_URL?.trim() || undefined,
};
//# sourceMappingURL=config.js.map
