import { requireEnv, requireEnvPort } from "@maple/common";

function optionalEnv(key, fallback = "") {
    const raw = (process.env[key] ?? "").trim();
    return raw.length > 0 ? raw : fallback;
}

function optionalEnvInt(key, fallback, { min, max } = {}) {
    const raw = (process.env[key] ?? "").trim();
    if (!raw) {
        return fallback;
    }
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) {
        throw new Error(`Invalid integer for ${key}: "${raw}"`);
    }
    if (min !== undefined && parsed < min) {
        throw new Error(`${key} value ${parsed} is below minimum ${min}`);
    }
    if (max !== undefined && parsed > max) {
        throw new Error(`${key} value ${parsed} is above maximum ${max}`);
    }
    return parsed;
}

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
    allowLocalTargets: ["1", "true", "yes"].includes((process.env.CYBER_ALLOW_LOCAL_TARGETS ?? "0").toLowerCase()),
    allowedLocalHosts: (process.env.CYBER_ALLOWED_LOCAL_HOSTS ?? "")
        .split(",")
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean),
    requestTimeoutMs: 15000,
    maxResponseBytes: (() => {
        const raw = Number.parseInt(requireEnv("CYBER_MAX_RESPONSE_BYTES"), 10);
        if (!Number.isFinite(raw) || raw < 1024 || raw > 500 * 1024 * 1024) {
            throw new Error(`CYBER_MAX_RESPONSE_BYTES must be between 1024 and 524288000, got: ${raw}`);
        }
        return raw;
    })(),
    quarantineEnabled: ["1", "true", "yes"].includes(requireEnv("CYBER_QUARANTINE_ENABLED").toLowerCase()),
    downloadScanProvider: (() => {
        const raw = optionalEnv("MAPLE_DOWNLOAD_SCAN_PROVIDER", "local").toLowerCase();
        if (raw !== "local" && raw !== "virustotal") {
            throw new Error(`Invalid MAPLE_DOWNLOAD_SCAN_PROVIDER: "${raw}" (must be "local" or "virustotal")`);
        }
        return raw;
    })(),
    virustotalApiKey: optionalEnv("MAPLE_VIRUSTOTAL_API_KEY"),
    virustotalApiUrl: optionalEnv("MAPLE_VIRUSTOTAL_API_URL", "https://www.virustotal.com/api/v3"),
    downloadScanTimeoutMs: optionalEnvInt("MAPLE_DOWNLOAD_SCAN_TIMEOUT_MS", 4000, { min: 250, max: 30000 }),
    malwareSandboxProvider: (() => {
        const raw = optionalEnv("MAPLE_MALWARE_SANDBOX_PROVIDER", "none").toLowerCase();
        if (raw !== "none" && raw !== "http") {
            throw new Error(`Invalid MAPLE_MALWARE_SANDBOX_PROVIDER: "${raw}" (must be "none" or "http")`);
        }
        return raw;
    })(),
    malwareSandboxApiUrl: optionalEnv("MAPLE_MALWARE_SANDBOX_API_URL"),
    malwareSandboxApiToken: optionalEnv("MAPLE_MALWARE_SANDBOX_API_TOKEN"),
    malwareSandboxTimeoutMs: optionalEnvInt("MAPLE_MALWARE_SANDBOX_TIMEOUT_MS", 5000, { min: 250, max: 60000 }),
    malwareSandboxRequired: ["1", "true", "yes"].includes(optionalEnv("MAPLE_MALWARE_SANDBOX_REQUIRED", "0").toLowerCase()),
};
//# sourceMappingURL=config.js.map
