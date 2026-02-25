import { getEnvOrDefault, getEnvPort } from "@maple/common";
export const config = {
    port: getEnvPort("MODEL_ROUTER_PORT", 9100),
    host: getEnvOrDefault("MODEL_ROUTER_HOST", "0.0.0.0"),
    auditWriterAddress: getEnvOrDefault("AUDIT_WRITER_ADDRESS", "localhost:9400"),
    defaultModel: getEnvOrDefault("DEFAULT_MODEL", "gpt-4o"),
    // LLM API keys
    openaiApiKey: getEnvOrDefault("OPENAI_API_KEY", ""),
    anthropicApiKey: getEnvOrDefault("ANTHROPIC_API_KEY", ""),
    // Provider selection
    primaryProvider: getEnvOrDefault("MAPLE_FIREWALL_CHAT_PRIMARY", "openai"),
    // Model names
    openaiModel: getEnvOrDefault("MAPLE_FIREWALL_CHAT_OPENAI_MODEL", "gpt-4o-mini"),
    anthropicModel: getEnvOrDefault("MAPLE_FIREWALL_CHAT_ANTHROPIC_MODEL", "claude-sonnet-4-6"),
    // Timeouts & limits
    chatTimeoutMs: parseInt(getEnvOrDefault("MAPLE_FIREWALL_CHAT_TIMEOUT_MS", "15000"), 10),
    maxTokens: 4096,
};
//# sourceMappingURL=config.js.map