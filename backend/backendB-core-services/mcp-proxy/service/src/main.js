import { startGrpcServer, gracefulShutdown, mapleLog } from "@maple/common";
import { createServer as createHttpServer } from "node:http";
import { DownstreamRegistry } from "./downstream-registry.js";
import { createMcpProxyService, closeMcpProxyClients } from "./service.js";
import { config } from "./config.js";

let serviceReady = false;

function startHealthServer(port, host) {
    const server = createHttpServer((req, res) => {
        if (req.method === "GET" && req.url === "/health") {
            res.statusCode = 200;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ status: "ok", service: "mcp-proxy", timestamp: new Date().toISOString() }));
            return;
        }
        if (req.method === "GET" && req.url === "/ready") {
            res.statusCode = serviceReady ? 200 : 503;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ ready: serviceReady, service: "mcp-proxy" }));
            return;
        }
        res.statusCode = 404;
        res.end();
    });
    server.listen(port, host, () => {
        mapleLog("info", "mcp_proxy_health_server_listening", { host, port });
    });
}

async function main() {
    mapleLog("info", "mcp_proxy_starting", { port: config.port, toolRunnerMode: config.toolRunnerMode, hasDatabaseUrl: !!config.databaseUrl });
    const healthPort = Number(process.env.MCP_PROXY_HEALTH_PORT || config.port + 1000);
    startHealthServer(healthPort, config.host);
    const registry = new DownstreamRegistry();
    registry.loadFromEnv();
    if (config.databaseUrl) {
        await registry.initializePg(config.databaseUrl);
        await registry.loadToolsFromPg();
    }
    // Instantiate K8s Job dispatcher if running in job mode — deferred import
    // so the service can start outside K8s clusters when not in job mode.
    let dispatcher;
    if (config.toolRunnerMode === "job") {
        try {
            const { K8sJobDispatcher } = await import("./k8s-job-dispatcher.js");
            dispatcher = new K8sJobDispatcher();
            mapleLog("info", "k8s_job_dispatcher_enabled", {
                namespace: config.toolRunnerJobNamespace,
                image: config.toolRunnerImage,
            });
        } catch (err) {
            mapleLog("error", "k8s_job_dispatcher_init_failed", { error: err.message });
            throw new Error(`K8s job dispatcher failed to initialize: ${err.message}. Ensure KUBERNETES_SERVICE_HOST is set.`);
        }
    }
    const server = createMcpProxyService(registry, dispatcher);
    await startGrpcServer(server, { port: config.port, host: config.host, serviceName: "mcp-proxy" });
    serviceReady = true;
    mapleLog("info", "mcp_proxy_ready");
    gracefulShutdown(server, "mcp-proxy", () => closeMcpProxyClients());
}
main().catch((err) => {
    mapleLog("error", "mcp_proxy_fatal", { error: err.message });
    process.exit(1);
});
//# sourceMappingURL=main.js.map