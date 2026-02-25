import { startGrpcServer, gracefulShutdown, mapleLog } from "@maple/common";
import { createModelRouterService } from "./service.js";
import { config } from "./config.js";
async function main() {
    mapleLog("info", "model_router_starting", { port: config.port });
    const server = createModelRouterService();
    await startGrpcServer(server, { port: config.port, host: config.host, serviceName: "model-router" });
    gracefulShutdown(server, "model-router");
}
main().catch((err) => {
    mapleLog("error", "model_router_fatal", { error: err.message });
    process.exit(1);
});
//# sourceMappingURL=main.js.map