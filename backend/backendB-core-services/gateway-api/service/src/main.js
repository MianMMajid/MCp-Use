import { readFileSync } from "node:fs";
import { createServer as createHttpsServer } from "node:https";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { gatewayPort, gatewayHost, gatewayTlsCaPath, gatewayTlsCertPath, gatewayTlsKeyPath, } from "./config.js";
import { mapleLog } from "./logging.js";
import { buildRuntimeStatus, server } from "./state.js";
import { healthRoutes } from "./routes/health.js";
const disableTls = (process.env.MAPLE_DISABLE_TLS || "").toLowerCase() === "true";
async function main() {
    mapleLog("info", "gateway_api.starting", { port: gatewayPort, host: gatewayHost, tls: !disableTls });
    // Register health routes EARLY so /health is reachable during initialization.
    // Without this, Railway healthchecks fail because createApp() blocks for
    // 30-60+ seconds on dependency checks, DB init, and OpenClaw bootstrap.
    server.app.route("/", healthRoutes);
    const fetchHandler = await server.getHandler();
    const serveOptions = {
        fetch: fetchHandler,
        hostname: gatewayHost,
        port: gatewayPort,
    };
    if (!disableTls) {
        const tlsConfig = {
            cert: readFileSync(gatewayTlsCertPath),
            key: readFileSync(gatewayTlsKeyPath),
            ca: readFileSync(gatewayTlsCaPath),
        };
        serveOptions.createServer = createHttpsServer;
        serveOptions.serverOptions = {
            cert: tlsConfig.cert,
            key: tlsConfig.key,
            ca: tlsConfig.ca,
        };
    }
    const protocol = disableTls ? "http" : "https";
    const httpServer = serve(serveOptions, (info) => {
        mapleLog("info", "gateway_api.listening", {
            port: info.port,
            host: info.address,
            protocol,
        });
    });
    // Full app initialization runs AFTER the server is listening.
    // Routes registered by createApp() will be picked up dynamically by Hono.
    const { shutdown } = await createApp();
    const runtimeStatus = buildRuntimeStatus();
    mapleLog("info", "gateway_api.runtime_status", {
        routeMode: runtimeStatus.routeMode,
        routeSummary: runtimeStatus.routeSummary,
        activeDownstreamCount: runtimeStatus.activeDownstreamCount,
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
