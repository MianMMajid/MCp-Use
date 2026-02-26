import { readFileSync } from "node:fs";
import { createServer as createHttpsServer } from "node:https";
import { serve } from "@hono/node-server";
import { mapleLog } from "@maple/common";
import {
  businessApiHost,
  businessApiMtlsRequired,
  businessApiPort,
  businessApiSkipDatabaseInit,
  businessApiTlsCaPath,
  businessApiTlsCertPath,
  businessApiTlsKeyPath,
} from "./config.js";
import { createApp } from "./app.js";
import { createAuditEmitter } from "./audit-emitter.js";
import { enforceBusinessStartupDependencies } from "./runtime-dependencies.js";
import { createRecoveryNotificationPublisher } from "./recovery-notifier.js";

async function main() {
  mapleLog("info", "business_api.starting", {
    host: businessApiHost,
    port: businessApiPort,
  });

  await enforceBusinessStartupDependencies();

  const { app, shutdown } = await createApp({
    auditEmitter: createAuditEmitter(),
    onAuthRecoveryTokenIssued: createRecoveryNotificationPublisher(),
    skipDatabaseInit: businessApiSkipDatabaseInit,
  });

  const tlsConfig = {
    cert: readFileSync(businessApiTlsCertPath),
    key: readFileSync(businessApiTlsKeyPath),
    ca: readFileSync(businessApiTlsCaPath),
    requestCert: businessApiMtlsRequired,
    rejectUnauthorized: businessApiMtlsRequired,
  };

  serve(
    {
      fetch: app.fetch,
      hostname: businessApiHost,
      port: businessApiPort,
      createServer: createHttpsServer,
      serverOptions: tlsConfig,
    },
    (info) => {
      mapleLog("info", "business_api.listening", {
        host: info.address,
        port: info.port,
        protocol: "https",
        mtls: businessApiMtlsRequired,
      });
    }
  );

  const handleSignal = async (signal) => {
    mapleLog("info", "business_api.shutdown_signal", { signal });
    try {
      await shutdown();
    } catch (err) {
      mapleLog("warn", "business_api.shutdown_error", {
        error: err?.message ?? String(err),
      });
    }
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void handleSignal("SIGINT");
  });
  process.on("SIGTERM", () => {
    void handleSignal("SIGTERM");
  });
}

main().catch((err) => {
  mapleLog("error", "business_api.fatal", {
    error: err?.message ?? String(err),
    stack: err?.stack,
  });
  process.exit(1);
});
