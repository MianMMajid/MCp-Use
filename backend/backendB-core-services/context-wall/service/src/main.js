import { startGrpcServer, gracefulShutdown, mapleLog } from "@maple/common";
import { PolicyStore } from "@maple/security";
import { ApprovalQueue } from "./approval-queue.js";
import { PolicyStorePg } from "./policy-store-pg.js";
import { createContextWallService } from "./service.js";
import { config } from "./config.js";
async function main() {
    mapleLog("info", "context_wall_starting", { port: config.port, hasDatabaseUrl: !!config.databaseUrl });
    const approvalQueue = new ApprovalQueue();
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
    gracefulShutdown(server, "context-wall");
}
main().catch((err) => {
    mapleLog("error", "context_wall_fatal", { error: err.message });
    process.exit(1);
});
//# sourceMappingURL=main.js.map