import { readFileSync } from "node:fs";
import { createServer as createHttpsServer } from "node:https";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { gatewayPort, gatewayHost, gatewayTlsCaPath, gatewayTlsCertPath, gatewayTlsKeyPath, } from "./config.js";
import { mapleLog } from "./logging.js";
import { buildRuntimeStatus, server } from "./state.js";
const disableTls = (process.env.MAPLE_DISABLE_TLS || "").toLowerCase() === "true";
const behindTrustedProxy = (process.env.MAPLE_BEHIND_TRUSTED_PROXY || "").toLowerCase() === "true";
if (disableTls && process.env.NODE_ENV === "production" && !behindTrustedProxy) {
    throw new Error("MAPLE_DISABLE_TLS cannot be set in production. TLS is required for all production deployments. Set MAPLE_BEHIND_TRUSTED_PROXY=true if TLS terminates at a reverse proxy.");
}
async function main() {
    mapleLog("info", "gateway_api.starting", { port: gatewayPort, host: gatewayHost, tls: !disableTls });
    // Use a lightweight fetch wrapper so Railway healthchecks pass immediately
    // while createApp() registers routes and initializes services.
    // Hono throws "Can not add a route since the matcher is already built"
    // if routes are added after the first app.fetch() call, so we must keep
    // all requests away from Hono until route registration is complete.
    let appReady = false;
    const fetch = (req, env) => {
        if (!appReady) {
            const url = new URL(req.url);
            if (url.pathname === "/health" || url.pathname === "/healthz") {
                return new Response(JSON.stringify({ ok: true, initializing: true }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                });
            }
            return new Response(JSON.stringify({ error: "Service initializing" }), {
                status: 503,
                headers: { "Content-Type": "application/json" },
            });
        }
        return server.app.fetch(req, env);
    };
    const serveOptions = {
        fetch,
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
    // Full app initialization: register all routes + async init.
    // appReady gates requests to Hono until route registration is complete.
    const { shutdown } = await createApp();
    await server.getHandler();
    appReady = true;
    mapleLog("info", "gateway_api.ready", { message: "All routes registered, accepting traffic" });
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
