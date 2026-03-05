import { requireEnv, requireEnvPort } from "@maple/common";
const hitlApprovalTimeoutRaw = Number.parseInt(requireEnv("CONTEXT_WALL_HITL_TIMEOUT_MS"), 10);
if (!Number.isFinite(hitlApprovalTimeoutRaw) || hitlApprovalTimeoutRaw < 1000) {
    throw new Error(`Invalid CONTEXT_WALL_HITL_TIMEOUT_MS: must be a finite number >= 1000`);
}
export const config = {
    port: requireEnvPort("CONTEXT_WALL_PORT"),
    host: requireEnv("CONTEXT_WALL_HOST"),
    auditWriterAddress: requireEnv("AUDIT_WRITER_ADDRESS"),
    mcpProxyAddress: requireEnv("MCP_PROXY_ADDRESS"),
    hitlApprovalTimeoutMs: hitlApprovalTimeoutRaw,
    databaseUrl: process.env.DATABASE_URL?.trim() || undefined,
};
//# sourceMappingURL=config.js.map
