import { startGrpcServer, gracefulShutdown, mapleLog } from "@maple/common";
import { createServer as createHttpServer } from "node:http";
import { createToolRunnerService, closeToolRunnerClients } from "./service.js";
import { config } from "./config.js";

let serviceReady = false;

function startHealthServer(port, host) {
    const server = createHttpServer((req, res) => {
        if (req.method === "GET" && req.url === "/health") {
            res.statusCode = 200;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ status: "ok", service: "tool-runner", timestamp: new Date().toISOString() }));
            return;
        }
        if (req.method === "GET" && req.url === "/ready") {
            res.statusCode = serviceReady ? 200 : 503;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ ready: serviceReady, service: "tool-runner" }));
            return;
        }
        res.statusCode = 404;
        res.end();
    });
    server.listen(port, host, () => {
        mapleLog("info", "tool_runner_health_server_listening", { host, port });
    });
}

async function main() {
    mapleLog("info", "tool_runner_starting", { port: config.port });
    const healthPort = Number(process.env.TOOL_RUNNER_HEALTH_PORT || config.port + 1000);
    startHealthServer(healthPort, config.host);
    const server = createToolRunnerService();
    await startGrpcServer(server, { port: config.port, host: config.host, serviceName: "tool-runner" });
    serviceReady = true;
    mapleLog("info", "tool_runner_ready");
    gracefulShutdown(server, "tool-runner", () => closeToolRunnerClients());
}
main().catch((err) => {
    mapleLog("error", "tool_runner_fatal", { error: err.message });
    process.exit(1);
});
//# sourceMappingURL=main.js.map