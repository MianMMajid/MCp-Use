import { requireEnv, requireEnvPort } from "@maple/common";
function optionalEnv(key, fallback = "") {
    const raw = (process.env[key] ?? "").trim();
    return raw.length > 0 ? raw : fallback;
}
function optionalEnvBool(key, fallback) {
    const raw = (process.env[key] ?? "").trim().toLowerCase();
    if (!raw)
        return fallback;
    if (raw === "1" || raw === "true" || raw === "yes")
        return true;
    if (raw === "0" || raw === "false" || raw === "no")
        return false;
    throw new Error(`Invalid boolean for ${key}: "${raw}" (must be 0/1/true/false/yes/no)`);
}
export const config = {
    port: requireEnvPort("MCP_PROXY_PORT"),
    host: requireEnv("MCP_PROXY_HOST"),
    auditWriterAddress: requireEnv("AUDIT_WRITER_ADDRESS"),
    contextWallAddress: requireEnv("CONTEXT_WALL_ADDRESS"),
    secretsBrokerAddress: optionalEnv("SECRETS_BROKER_ADDRESS"),
    secretsBrokerRetired: optionalEnvBool("MAPLE_SECRETS_BROKER_RETIRED", true),
    toolRunnerAddress: requireEnv("TOOL_RUNNER_ADDRESS"),
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
