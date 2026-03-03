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
const hitlApprovalTimeoutRaw = Number.parseInt(requireEnv("CONTEXT_WALL_HITL_TIMEOUT_MS"), 10);
if (!Number.isFinite(hitlApprovalTimeoutRaw) || hitlApprovalTimeoutRaw < 1000) {
    throw new Error(`Invalid CONTEXT_WALL_HITL_TIMEOUT_MS: must be a finite number >= 1000`);
}
export const config = {
    port: requireEnvPort("CONTEXT_WALL_PORT"),
    host: requireEnv("CONTEXT_WALL_HOST"),
    auditWriterAddress: requireEnv("AUDIT_WRITER_ADDRESS"),
    modelRouterAddress: optionalEnv("MODEL_ROUTER_ADDRESS"),
    modelRouterRetired: optionalEnvBool("MAPLE_MODEL_ROUTER_RETIRED", true),
    mcpProxyAddress: requireEnv("MCP_PROXY_ADDRESS"),
    hitlApprovalTimeoutMs: hitlApprovalTimeoutRaw,
    databaseUrl: process.env.DATABASE_URL?.trim() || undefined,
};
//# sourceMappingURL=config.js.map
