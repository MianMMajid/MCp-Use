import { startGrpcServer, gracefulShutdown, mapleLog } from "@maple/common";
import { createToolRunnerService } from "./service.js";
import { config } from "./config.js";
async function main() {
    mapleLog("info", "tool_runner_starting", { port: config.port });
    const server = createToolRunnerService();
    await startGrpcServer(server, { port: config.port, host: config.host, serviceName: "tool-runner" });
    gracefulShutdown(server, "tool-runner");
}
main().catch((err) => {
    mapleLog("error", "tool_runner_fatal", { error: err.message });
    process.exit(1);
});
//# sourceMappingURL=main.js.map