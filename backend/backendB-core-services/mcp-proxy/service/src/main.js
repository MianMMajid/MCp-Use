import { startGrpcServer, gracefulShutdown, mapleLog } from "@maple/common";
import { DownstreamRegistry } from "./downstream-registry.js";
import { createMcpProxyService, closeMcpProxyClients } from "./service.js";
import { config } from "./config.js";
async function main() {
    mapleLog("info", "mcp_proxy_starting", { port: config.port, toolRunnerMode: config.toolRunnerMode, hasDatabaseUrl: !!config.databaseUrl });
    const registry = new DownstreamRegistry();
    registry.loadFromEnv();
    if (config.databaseUrl) {
        await registry.initializePg(config.databaseUrl);
        await registry.loadToolsFromPg();
    }
    // Instantiate K8s Job dispatcher if running in job mode
    let dispatcher;
    if (config.toolRunnerMode === "job") {
        const { K8sJobDispatcher } = await import("./k8s-job-dispatcher.js");
        dispatcher = new K8sJobDispatcher();
        mapleLog("info", "k8s_job_dispatcher_enabled", {
            namespace: config.toolRunnerJobNamespace,
            image: config.toolRunnerImage,
        });
    }
    const server = createMcpProxyService(registry, dispatcher);
    await startGrpcServer(server, { port: config.port, host: config.host, serviceName: "mcp-proxy" });
    gracefulShutdown(server, "mcp-proxy", () => closeMcpProxyClients());
}
main().catch((err) => {
    mapleLog("error", "mcp_proxy_fatal", { error: err.message });
    process.exit(1);
});
//# sourceMappingURL=main.js.map