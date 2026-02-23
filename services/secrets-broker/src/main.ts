import { startGrpcServer, gracefulShutdown, mapleLog } from "@maple/common";
import { CredentialStore } from "./credential-store.js";
import { createSecretsBrokerService } from "./service.js";
import { config } from "./config.js";

async function main() {
  mapleLog("info", "secrets_broker_starting", { port: config.port });
  const store = new CredentialStore();
  const server = createSecretsBrokerService(store);
  await startGrpcServer(server, { port: config.port, host: config.host, serviceName: "secrets-broker" });
  gracefulShutdown(server, "secrets-broker");
}

main().catch((err) => {
  mapleLog("error", "secrets_broker_fatal", { error: err.message });
  process.exit(1);
});
