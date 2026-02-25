import { getEnvOrDefault, getEnvPort } from "@maple/common";
/**
 * Tool Runner Configuration
 *
 * All tool execution traffic from the tool-runner is routed through cyber-proxy
 * via gRPC enforcement:
 *
 * 1. **gRPC enforcement**: Tool execution calls go through the cyber-proxy
 *    `ProxyHttpRequest` / `ProxyHttpRequestStream` RPCs which perform SSRF
 *    checks, content scanning, and download quarantine.
 */
export const config = {
    port: getEnvPort("TOOL_RUNNER_PORT", 9250),
    host: getEnvOrDefault("TOOL_RUNNER_HOST", "0.0.0.0"),
    cyberProxyAddress: getEnvOrDefault("CYBER_PROXY_ADDRESS", "localhost:8080"),
    auditWriterAddress: getEnvOrDefault("AUDIT_WRITER_ADDRESS", "localhost:9400"),
};
//# sourceMappingURL=config.js.map
