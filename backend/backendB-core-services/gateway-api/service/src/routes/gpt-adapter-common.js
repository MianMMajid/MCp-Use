export function gptAdapterBaseUrl() {
    if (!process.env.MCP_URL) {
        throw new Error("Missing required environment variable: MCP_URL");
    }
    return process.env.MCP_URL;
}
//# sourceMappingURL=gpt-adapter-common.js.map