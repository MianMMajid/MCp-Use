import { startGrpcServer, gracefulShutdown, mapleLog } from "@maple/common";
import { CredentialStore } from "./credential-store.js";
import { CredentialStorePg } from "./credential-store-pg.js";
import { createSecretsBrokerService } from "./service.js";
import { config } from "./config.js";
async function main() {
    mapleLog("info", "secrets_broker_starting", { port: config.port, hasDatabaseUrl: !!config.databaseUrl });
    let store;
    if (config.databaseUrl) {
        const pgStore = new CredentialStorePg();
        await pgStore.initialize(config.databaseUrl);
        store = pgStore;
        mapleLog("info", "secrets_broker_using_pg_store");
    } else {
        store = new CredentialStore();
        mapleLog("info", "secrets_broker_using_memory_store");
    }
    const server = createSecretsBrokerService(store);
    await startGrpcServer(server, { port: config.port, host: config.host, serviceName: "secrets-broker" });
    gracefulShutdown(server, "secrets-broker");
}
main().catch((err) => {
    mapleLog("error", "secrets_broker_fatal", { error: err.message });
    process.exit(1);
});
//# sourceMappingURL=main.js.map