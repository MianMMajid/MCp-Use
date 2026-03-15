import { startGrpcServer, gracefulShutdown, mapleLog } from "@maple/common";
import { createCyberProxyService, closeCyberProxyClients } from "./service.js";
import { config } from "./config.js";
async function main() {
    mapleLog("info", "cyber_proxy_starting", { port: config.port });
    const grpcServer = createCyberProxyService();
    await startGrpcServer(grpcServer, { port: config.port, host: config.host, serviceName: "cyber-proxy" });
    gracefulShutdown(grpcServer, "cyber-proxy", () => closeCyberProxyClients());
}
main().catch((err) => {
    mapleLog("error", "cyber_proxy_fatal", { error: err.message });
    process.exit(1);
});
//# sourceMappingURL=main.js.map
