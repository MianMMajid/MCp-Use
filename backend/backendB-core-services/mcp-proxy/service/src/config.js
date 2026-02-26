import { getEnvOrDefault, getEnvPort } from "@maple/common";
export const config = {
    port: getEnvPort("MCP_PROXY_PORT", 9200),
    host: getEnvOrDefault("MCP_PROXY_HOST", "0.0.0.0"),
    auditWriterAddress: getEnvOrDefault("AUDIT_WRITER_ADDRESS", "localhost:9400"),
    contextWallAddress: getEnvOrDefault("CONTEXT_WALL_ADDRESS", "localhost:9000"),
    secretsBrokerAddress: getEnvOrDefault("SECRETS_BROKER_ADDRESS", "localhost:9300"),
    toolRunnerAddress: getEnvOrDefault("TOOL_RUNNER_ADDRESS", "localhost:9250"),
    cyberProxyAddress: getEnvOrDefault("CYBER_PROXY_ADDRESS", "localhost:8080"),
    downstreamApps: getEnvOrDefault("DOWNSTREAM_APPS", ""),
    mapleDownstreamApps: getEnvOrDefault("MAPLE_DOWNSTREAM_APPS", ""),
    toolExecutionTimeoutMs: 30000,
    /**
     * Tool runner execution mode:
     * - "service": default, uses the persistent tool-runner gRPC service
     * - "job": creates a K8s Job per tool execution for maximum isolation
     */
    toolRunnerMode: getEnvOrDefault("MAPLE_TOOL_RUNNER_MODE", "service"),
    /** Container image for tool-runner Job pods (only used in job mode). */
    toolRunnerImage: getEnvOrDefault("MAPLE_TOOL_RUNNER_IMAGE", "tool-runner:latest"),
    /** K8s namespace for tool-runner Job pods (only used in job mode). */
    toolRunnerJobNamespace: getEnvOrDefault("MAPLE_TOOL_RUNNER_JOB_NAMESPACE", "maple-tools"),
};
//# sourceMappingURL=config.js.map