import { startGrpcServer, gracefulShutdown, mapleLog } from "@maple/common";
import { createServer as createHttpServer } from "node:http";
import { PolicyStore } from "@maple/security";
import { ApprovalQueue } from "./approval-queue.js";
import { PolicyStorePg } from "./policy-store-pg.js";
import { createContextWallService, closeContextWallClients } from "./service.js";
import { config } from "./config.js";

let serviceReady = false;

function startHealthServer(port, host) {
    const server = createHttpServer((req, res) => {
        if (req.method === "GET" && req.url === "/health") {
            res.statusCode = 200;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ status: "ok", service: "context-wall", timestamp: new Date().toISOString() }));
            return;
        }
        if (req.method === "GET" && req.url === "/ready") {
            res.statusCode = serviceReady ? 200 : 503;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ ready: serviceReady, service: "context-wall" }));
            return;
        }
        res.statusCode = 404;
        res.end();
    });
    server.listen(port, host, () => {
        mapleLog("info", "context_wall_health_server_listening", { host, port });
    });
}

async function main() {
    mapleLog("info", "context_wall_starting", { port: config.port, hasDatabaseUrl: !!config.databaseUrl });
    const healthPort = Number(process.env.CONTEXT_WALL_HEALTH_PORT || config.port + 1000);
    startHealthServer(healthPort, config.host);
    const approvalQueue = new ApprovalQueue({ databaseUrl: config.databaseUrl });
    await approvalQueue.initialize().catch((err) => {
        mapleLog("warn", "context_wall_approval_queue_init_failed", { error: err.message });
    });
    const policyStore = new PolicyStore();
    await policyStore.initialize();
    // Load persisted policies from PostgreSQL if available
    let policyStorePg;
    if (config.databaseUrl) {
        try {
            policyStorePg = new PolicyStorePg();
            await policyStorePg.initialize(config.databaseUrl);
            mapleLog("info", "context_wall_policy_pg_initialized");
        } catch (err) {
            mapleLog("warn", "context_wall_policy_pg_init_failed", { error: err.message });
            policyStorePg = undefined;
        }
    }
    policyStore.onReload((result) => {
        mapleLog("info", "context_wall_policy_reloaded", {
            success: result.success,
            ruleCount: result.ruleCount,
            error: result.error,
        });
    });
    const server = createContextWallService(approvalQueue, policyStore);
    await startGrpcServer(server, { port: config.port, host: config.host, serviceName: "context-wall" });
    serviceReady = true;
    mapleLog("info", "context_wall_ready");
    gracefulShutdown(server, "context-wall", () => closeContextWallClients());
}
main().catch((err) => {
    mapleLog("error", "context_wall_fatal", { error: err.message });
    process.exit(1);
});
//# sourceMappingURL=main.js.map
