import { getEnvOrDefault, getEnvPort } from "@maple/common";
/**
 * Tool Runner Configuration
 *
 * All outbound HTTP traffic from the tool-runner is routed through cyber-proxy
 * via dual enforcement:
 *
 * 1. **gRPC enforcement**: Tool execution calls go through the cyber-proxy
 *    `ProxyHttpRequest` / `ProxyHttpRequestStream` RPCs which perform SSRF
 *    checks, content scanning, and download quarantine.
 *
 * 2. **HTTP_PROXY enforcement**: The `HTTP_PROXY` / `HTTPS_PROXY` env vars
 *    (set in docker-compose.yml and k8s deployment) route all HTTP(S) traffic
 *    from this container through cyber-proxy on port 8080.
 *    This ensures even non-gRPC outbound calls (e.g. from tool code) are
 *    inspected. `NO_PROXY` excludes internal services.
 */
export const config = {
    port: getEnvPort("TOOL_RUNNER_PORT", 9250),
    host: getEnvOrDefault("TOOL_RUNNER_HOST", "0.0.0.0"),
    cyberProxyAddress: getEnvOrDefault("CYBER_PROXY_ADDRESS", "localhost:8080"),
    auditWriterAddress: getEnvOrDefault("AUDIT_WRITER_ADDRESS", "localhost:9400"),
};
//# sourceMappingURL=config.js.map