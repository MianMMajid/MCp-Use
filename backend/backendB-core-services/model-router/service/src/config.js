import { requireEnv, requireEnvPort } from "@maple/common";
export const config = {
    port: requireEnvPort("MODEL_ROUTER_PORT"),
    host: requireEnv("MODEL_ROUTER_HOST"),
    auditWriterAddress: requireEnv("AUDIT_WRITER_ADDRESS"),
    defaultModel: requireEnv("DEFAULT_MODEL"),
    // LLM API keys
    openaiApiKey: requireEnv("OPENAI_API_KEY"),
    anthropicApiKey: requireEnv("ANTHROPIC_API_KEY"),
    // Provider selection
    primaryProvider: requireEnv("MAPLE_FIREWALL_CHAT_PRIMARY"),
    // Model names
    openaiModel: requireEnv("MAPLE_FIREWALL_CHAT_OPENAI_MODEL"),
    anthropicModel: requireEnv("MAPLE_FIREWALL_CHAT_ANTHROPIC_MODEL"),
    // Timeouts & limits
    chatTimeoutMs: parseInt(requireEnv("MAPLE_FIREWALL_CHAT_TIMEOUT_MS"), 10),
    maxTokens: 4096,
};
//# sourceMappingURL=config.js.map