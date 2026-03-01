import { existsSync, readFileSync } from "node:fs";
import { createServer as createHttpsServer } from "node:https";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { gatewayPort, gatewayHost, gatewayTlsCaPath, gatewayTlsCertPath, gatewayTlsKeyPath, isProductionRuntime, } from "./config.js";
import { mapleLog } from "./logging.js";
import { buildRuntimeStatus } from "./state.js";
async function main() {
    mapleLog("info", "gateway_api.starting", { port: gatewayPort, host: gatewayHost });
    const { server } = await createApp();
    const runtimeStatus = buildRuntimeStatus();
    mapleLog("info", "gateway_api.runtime_status", {
        routeMode: runtimeStatus.routeMode,
        routeSummary: runtimeStatus.routeSummary,
        activeDownstreamCount: runtimeStatus.activeDownstreamCount,
    });
    const fetchHandler = await server.getHandler();
    const hasTls = existsSync(gatewayTlsCertPath) && existsSync(gatewayTlsKeyPath) && existsSync(gatewayTlsCaPath);
    if (hasTls) {
        const tlsConfig = {
            cert: readFileSync(gatewayTlsCertPath),
            key: readFileSync(gatewayTlsKeyPath),
            ca: readFileSync(gatewayTlsCaPath),
        };
        serve({
            fetch: fetchHandler,
            hostname: gatewayHost,
            port: gatewayPort,
            createServer: createHttpsServer,
            serverOptions: {
                cert: tlsConfig.cert,
                key: tlsConfig.key,
                ca: tlsConfig.ca,
            },
        }, (info) => {
            mapleLog("info", "gateway_api.listening", {
                port: info.port,
                host: info.address,
                protocol: "https",
            });
        });
    } else if (!isProductionRuntime) {
        mapleLog("info", "gateway_api.tls_not_found", { msg: "Starting in plain HTTP mode (development only)" });
        serve({
            fetch: fetchHandler,
            hostname: gatewayHost,
            port: gatewayPort,
        }, (info) => {
            mapleLog("info", "gateway_api.listening", {
                port: info.port,
                host: info.address,
                protocol: "http",
            });
        });
    } else {
        throw new Error("TLS certificates are required in production. Set MAPLE_GATEWAY_TLS_CERT, MAPLE_GATEWAY_TLS_KEY, MAPLE_GATEWAY_TLS_CA.");
    }
}
main().catch((err) => {
    mapleLog("error", "gateway_api.fatal", { error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
});
//# sourceMappingURL=main.js.map
