import { getEnvOrDefault, getEnvPort } from "@maple/common";
const hitlApprovalTimeoutRaw = Number.parseInt(getEnvOrDefault("CONTEXT_WALL_HITL_TIMEOUT_MS", "120000"), 10);
export const config = {
    port: getEnvPort("CONTEXT_WALL_PORT", 9000),
    host: getEnvOrDefault("CONTEXT_WALL_HOST", "0.0.0.0"),
    auditWriterAddress: getEnvOrDefault("AUDIT_WRITER_ADDRESS", "localhost:9400"),
    modelRouterAddress: getEnvOrDefault("MODEL_ROUTER_ADDRESS", "localhost:9100"),
    mcpProxyAddress: getEnvOrDefault("MCP_PROXY_ADDRESS", "localhost:9200"),
    hitlApprovalTimeoutMs: Number.isFinite(hitlApprovalTimeoutRaw)
        ? Math.max(1000, hitlApprovalTimeoutRaw)
        : 120_000,
};
//# sourceMappingURL=config.js.map