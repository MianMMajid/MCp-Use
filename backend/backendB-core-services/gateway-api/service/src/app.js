import { server, database, initializeDatabase, setGrpcClients } from "./state.js";
import { bootstrapAuthUsers } from "./auth.js";
import { createGrpcClients, closeGrpcClients } from "./grpc-clients.js";
import { registerGatewayRoutes } from "./routes/register-routes.js";
import { mapleLog } from "./logging.js";
import { bootstrapOpenClawRuntime, shutdownOpenClawRuntime } from "./core/openclaw-agent-runtime.js";
import { registerEnterpriseModules } from "./bootstrap/register-enterprise-modules.js";
import { startGatewayWorkers } from "./bootstrap/register-workers.js";
import { enforceGatewayStartupDependencies } from "./core/runtime-dependencies.js";
import { eventTransportBackend, redisUrl } from "./config.js";

export async function createApp() {
    const app = server.app;
    const grpcClients = createGrpcClients();
    setGrpcClients(grpcClients);
    await enforceGatewayStartupDependencies();
    // Explicit route registration entrypoint.
    await registerGatewayRoutes(app);
    // 404 fallback
    app.notFound((c) => c.json({ error: "Not Found", path: c.req.path }, 404));
    // Error handler
    app.onError((err, c) => {
        mapleLog("error", "unhandled_error", { error: err.message, stack: err.stack });
        return c.json({ error: "Internal Server Error" }, 500);
    });
    // Database + auth bootstrap
    // DB init is non-fatal so the gateway can still serve stateless routes
    // (firewall, chat, gRPC proxying) even when PostgreSQL is unreachable.
    let dbReady = false;
    try {
        await initializeDatabase();
        dbReady = true;
    } catch (err) {
        mapleLog("warn", "gateway_api.database_init_failed", {
            error: err.message,
            hint: "Gateway will serve stateless routes; DB-dependent features are unavailable.",
        });
    }
    if (dbReady) {
        await registerEnterpriseModules({ database });
    }
    const stopWorkers = startGatewayWorkers({
        database: dbReady ? database : null,
        transportBackend: eventTransportBackend,
        redisUrl,
    });
    await bootstrapOpenClawRuntime();
    if (dbReady) {
        const skipAuthBootstrap = String(process.env.MAPLE_SKIP_AUTH_BOOTSTRAP ?? "0").trim().toLowerCase() === "true" ||
            String(process.env.MAPLE_SKIP_AUTH_BOOTSTRAP ?? "0").trim() === "1";
        if (skipAuthBootstrap && process.env.NODE_ENV === "production") {
            mapleLog("error", "gateway_api.skip_auth_bootstrap_blocked", {
                message: "MAPLE_SKIP_AUTH_BOOTSTRAP is ignored in production. Auth bootstrap will run.",
            });
        }
        if (!skipAuthBootstrap || process.env.NODE_ENV === "production") {
            await bootstrapAuthUsers(database);
        }
    }
    const shutdown = async () => {
        await stopWorkers();
        closeGrpcClients(grpcClients);
        await shutdownOpenClawRuntime();
        try {
            await database.close();
        }
        catch (err) {
            mapleLog("warn", "gateway_api.database_close_failed", { error: err.message });
        }
    };
    return { server, app, grpcClients, shutdown };
}
//# sourceMappingURL=app.js.map
