import { readFileSync, accessSync } from "node:fs";
import { createServer as createHttpsServer } from "node:https";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { gatewayPort, gatewayHost, gatewayTlsCaPath, gatewayTlsCertPath, gatewayTlsKeyPath, isProductionRuntime, } from "./config.js";
import { mapleLog } from "./logging.js";
import { buildRuntimeStatus } from "./state.js";
function canReadFile(p) { try { accessSync(p); return true; } catch { return false; } }
async function main() {
    mapleLog("info", "gateway_api.starting", { port: gatewayPort, host: gatewayHost });
    const { server, shutdown } = await createApp();
    const runtimeStatus = buildRuntimeStatus();
    mapleLog("info", "gateway_api.runtime_status", {
        routeMode: runtimeStatus.routeMode,
        routeSummary: runtimeStatus.routeSummary,
        activeDownstreamCount: runtimeStatus.activeDownstreamCount,
    });
    const fetchHandler = await server.getHandler();
    const tlsAvailable = canReadFile(gatewayTlsCertPath) && canReadFile(gatewayTlsKeyPath);
    const useHttps = tlsAvailable && gatewayTlsCertPath !== "/dev/null";
    if (!useHttps && isProductionRuntime) {
        throw new Error("TLS certificates are required in production. Set MAPLE_GATEWAY_TLS_CERT/KEY.");
    }
    const serveOpts = { fetch: fetchHandler, hostname: gatewayHost, port: gatewayPort };
    if (useHttps) {
        const tlsConfig = {
            cert: readFileSync(gatewayTlsCertPath),
            key: readFileSync(gatewayTlsKeyPath),
            ca: canReadFile(gatewayTlsCaPath) ? readFileSync(gatewayTlsCaPath) : undefined,
        };
        serveOpts.createServer = createHttpsServer;
        serveOpts.serverOptions = { cert: tlsConfig.cert, key: tlsConfig.key, ca: tlsConfig.ca };
    } else {
        mapleLog("warn", "gateway_api.no_tls", { message: "Running without TLS (development only)" });
    }
    const protocol = useHttps ? "https" : "http";
    const httpServer = serve(serveOpts, (info) => {
        mapleLog("info", "gateway_api.listening", {
            port: info.port,
            host: info.address,
            protocol,
        });
    });
    let shuttingDown = false;
    const shutdownHandler = async (signal) => {
        if (shuttingDown) return;
        shuttingDown = true;
        mapleLog("info", "gateway_api.shutting_down", { signal });
        const forceTimeout = setTimeout(() => {
            mapleLog("warn", "gateway_api.shutdown_timeout", { message: "Forcing exit after 10s" });
            process.exit(1);
        }, 10_000);
        forceTimeout.unref();
        try {
            httpServer.close();
            await shutdown();
            mapleLog("info", "gateway_api.shutdown_complete");
        } catch (err) {
            mapleLog("error", "gateway_api.shutdown_error", { error: err instanceof Error ? err.message : String(err) });
        }
        process.exit(0);
    };
    process.on("SIGTERM", () => shutdownHandler("SIGTERM"));
    process.on("SIGINT", () => shutdownHandler("SIGINT"));
}
main().catch((err) => {
    mapleLog("error", "gateway_api.fatal", { error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
});
//# sourceMappingURL=main.js.map
