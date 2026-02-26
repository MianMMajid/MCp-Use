export function gptAdapterBaseUrl() {
    return String(process.env.MCP_URL || `http://localhost:${process.env.PORT || 3000}`);
}
//# sourceMappingURL=gpt-adapter-common.js.map