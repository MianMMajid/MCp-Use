import { requireEnv, requireEnvPort } from "@maple/common";
export const config = {
    port: requireEnvPort("MCP_PROXY_PORT"),
    host: requireEnv("MCP_PROXY_HOST"),
    auditWriterAddress: requireEnv("AUDIT_WRITER_ADDRESS"),
    contextWallAddress: requireEnv("CONTEXT_WALL_ADDRESS"),
    cyberProxyAddress: requireEnv("CYBER_PROXY_ADDRESS"),
    // Downstream apps are optional — the registry gracefully handles empty/missing
    // values. Railway sets these to "" which requireEnv() rejects, so use optional.
    downstreamApps: process.env.DOWNSTREAM_APPS?.trim() || "",
    mapleDownstreamApps: process.env.MAPLE_DOWNSTREAM_APPS?.trim() || "",
    toolExecutionTimeoutMs: 30000,
    // Tool-runner is deprecated (merged into mcp-proxy). These vars are only
    // required when MAPLE_TOOL_RUNNER_MODE=job (K8s job execution). Default to
    // "service" mode which bypasses the tool-runner entirely.
    toolRunnerMode: process.env.MAPLE_TOOL_RUNNER_MODE?.trim() || "service",
    toolRunnerImage: process.env.MAPLE_TOOL_RUNNER_IMAGE?.trim() || "",
    toolRunnerJobNamespace: process.env.MAPLE_TOOL_RUNNER_JOB_NAMESPACE?.trim() || "default",
    databaseUrl: process.env.DATABASE_URL?.trim() || undefined,
};
//# sourceMappingURL=config.js.map
