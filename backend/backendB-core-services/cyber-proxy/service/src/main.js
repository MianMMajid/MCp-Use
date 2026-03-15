import { startGrpcServer, gracefulShutdown, mapleLog } from "@maple/common";
import { createServer as createHttpServer } from "node:http";
import { createCyberProxyService, closeCyberProxyClients } from "./service.js";
import { config } from "./config.js";

let serviceReady = false;

function startHealthServer(port, host) {
    const server = createHttpServer((req, res) => {
        if (req.method === "GET" && req.url === "/health") {
            res.statusCode = 200;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ status: "ok", service: "cyber-proxy", timestamp: new Date().toISOString() }));
            return;
        }
        if (req.method === "GET" && req.url === "/ready") {
            res.statusCode = serviceReady ? 200 : 503;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ ready: serviceReady, service: "cyber-proxy" }));
            return;
        }
        res.statusCode = 404;
        res.end();
    });
    server.listen(port, host, () => {
        mapleLog("info", "cyber_proxy_health_server_listening", { host, port });
    });
}

async function main() {
    mapleLog("info", "cyber_proxy_starting", { port: config.port });
    const healthPort = Number(process.env.CYBER_PROXY_HEALTH_PORT || config.port + 1000);
    startHealthServer(healthPort, config.host);
    const grpcServer = createCyberProxyService();
    await startGrpcServer(grpcServer, { port: config.port, host: config.host, serviceName: "cyber-proxy" });
    serviceReady = true;
    mapleLog("info", "cyber_proxy_ready");
    gracefulShutdown(grpcServer, "cyber-proxy", () => closeCyberProxyClients());
}
main().catch((err) => {
    mapleLog("error", "cyber_proxy_fatal", { error: err.message });
    process.exit(1);
});
//# sourceMappingURL=main.js.map
