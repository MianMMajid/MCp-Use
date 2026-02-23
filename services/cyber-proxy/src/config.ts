import { getEnvOrDefault, getEnvPort } from "@maple/common";

function parseToolAllowedDomains(raw: string): Record<string, string[]> {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const out: Record<string, string[]> = {};
    for (const [toolName, domains] of Object.entries(parsed as Record<string, unknown>)) {
      if (!toolName || !Array.isArray(domains)) continue;
      const normalized = domains
        .map((domain) => String(domain || "").trim().toLowerCase())
        .filter((domain) => domain.length > 0);
      if (normalized.length > 0) {
        out[toolName] = [...new Set(normalized)];
      }
    }
    return out;
  } catch {
    return {};
  }
}

export const config = {
  port: getEnvPort("CYBER_PROXY_PORT", 8080),
  host: getEnvOrDefault("CYBER_PROXY_HOST", "0.0.0.0"),
  auditWriterAddress: getEnvOrDefault("AUDIT_WRITER_ADDRESS", "localhost:9400"),
  allowedDomains: getEnvOrDefault("CYBER_ALLOWED_DOMAINS", "").split(",").filter(Boolean),
  blockedDomains: getEnvOrDefault("CYBER_BLOCKED_DOMAINS", "").split(",").filter(Boolean),
  toolAllowedDomains: parseToolAllowedDomains(getEnvOrDefault("CYBER_TOOL_ALLOWED_DOMAINS_JSON", "")),
  requestTimeoutMs: 15000,
  /** Maximum response body size in bytes (default 10 MB). Responses exceeding this are quarantined. */
  maxResponseBytes: Number.parseInt(getEnvOrDefault("CYBER_MAX_RESPONSE_BYTES", "10485760"), 10),
  /** Enable download quarantine for dangerous file types and executables (default true). */
  quarantineEnabled: getEnvOrDefault("CYBER_QUARANTINE_ENABLED", "1") === "1",
} as const;
