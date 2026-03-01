import { requireEnv, requireEnvPort } from "@maple/common";
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
    port: requireEnvPort("TOOL_RUNNER_PORT"),
    host: requireEnv("TOOL_RUNNER_HOST"),
    cyberProxyAddress: requireEnv("CYBER_PROXY_ADDRESS"),
    auditWriterAddress: requireEnv("AUDIT_WRITER_ADDRESS"),
};
//# sourceMappingURL=config.js.map
