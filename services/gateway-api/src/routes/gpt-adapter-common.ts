export function gptAdapterBaseUrl(): string {
  return String(process.env.MCP_URL || `http://localhost:${process.env.PORT || 3000}`);
}
