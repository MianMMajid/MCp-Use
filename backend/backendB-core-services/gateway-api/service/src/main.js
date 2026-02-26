import { readFileSync } from "node:fs";
import { createServer as createHttpsServer } from "node:https";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { gatewayPort, gatewayHost, gatewayTlsCaPath, gatewayTlsCertPath, gatewayTlsKeyPath, } from "./config.js";
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
    const tlsConfig = {
        cert: readFileSync(gatewayTlsCertPath),
        key: readFileSync(gatewayTlsKeyPath),
        ca: readFileSync(gatewayTlsCaPath),
    };
    const fetchHandler = await server.getHandler();
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
}
main().catch((err) => {
    mapleLog("error", "gateway_api.fatal", { error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
});
//# sourceMappingURL=main.js.map
