import { requireEnv, requireEnvPort } from "@maple/common";
function parseToolAllowedDomains(raw) {
    const trimmed = raw.trim();
    if (!trimmed)
        return {};
    try {
        const parsed = JSON.parse(trimmed);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return {};
        }
        const out = {};
        for (const [toolName, domains] of Object.entries(parsed)) {
            if (!toolName || !Array.isArray(domains))
                continue;
            const normalized = domains
                .map((domain) => String(domain || "").trim().toLowerCase())
                .filter((domain) => domain.length > 0);
            if (normalized.length > 0) {
                out[toolName] = [...new Set(normalized)];
            }
        }
        return out;
    }
    catch {
        return {};
    }
}
export const config = {
    port: requireEnvPort("CYBER_PROXY_PORT"),
    host: requireEnv("CYBER_PROXY_HOST"),
    auditWriterAddress: requireEnv("AUDIT_WRITER_ADDRESS"),
    allowedDomains: requireEnv("CYBER_ALLOWED_DOMAINS").split(",").filter(Boolean),
    blockedDomains: requireEnv("CYBER_BLOCKED_DOMAINS").split(",").filter(Boolean),
    toolAllowedDomains: parseToolAllowedDomains(requireEnv("CYBER_TOOL_ALLOWED_DOMAINS_JSON")),
    requestTimeoutMs: 15000,
    maxResponseBytes: (() => {
        const raw = Number.parseInt(requireEnv("CYBER_MAX_RESPONSE_BYTES"), 10);
        if (!Number.isFinite(raw) || raw < 1024 || raw > 500 * 1024 * 1024) {
            throw new Error(`CYBER_MAX_RESPONSE_BYTES must be between 1024 and 524288000, got: ${raw}`);
        }
        return raw;
    })(),
    quarantineEnabled: ["1", "true", "yes"].includes(requireEnv("CYBER_QUARANTINE_ENABLED").toLowerCase()),
};
//# sourceMappingURL=config.js.map