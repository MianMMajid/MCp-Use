import { server, database, initializeDatabase, setGrpcClients } from "./state.js";
import { bootstrapAuthUsers } from "./auth.js";
import { createGrpcClients, closeGrpcClients } from "./grpc-clients.js";
import { startHitlBroker, stopHitlBroker } from "./hitl-broker.js";
import { healthRoutes } from "./routes/health.js";
import { redirectRoutes } from "./routes/redirect-routes.js";
import { registerTraceRoutes } from "./routes/trace-routes.js";
import { registerDownstreamRoutes } from "./routes/downstream-routes.js";
import { mapleLog } from "./logging.js";
import { bootstrapOpenClawRuntime, shutdownOpenClawRuntime } from "./core/openclaw-agent-runtime.js";
// Side-effect imports — these register middleware/routes on `server.app` at load time.
import "./middleware.js";
import "./routes/mcp-middleware.js";
import "./routes/auth-routes.js";
import "./routes/billing-routes.js";
import "./routes/firewall-routes.js";
import "./routes/openclaw-agent-routes.js";
import "./routes/hitl-routes.js";
import "./routes/demo-routes.js";
import "./routes/gpt-adapter.js";
import "./routes/mcp-tools.js";
export async function createApp() {
    const app = server.app;
    const grpcClients = createGrpcClients();
    setGrpcClients(grpcClients);
    const disableHitlBroker = String(process.env.MAPLE_DISABLE_HITL_BROKER ?? "0").trim().toLowerCase() === "true" ||
        String(process.env.MAPLE_DISABLE_HITL_BROKER ?? "0").trim() === "1";
    if (!disableHitlBroker) {
        startHitlBroker();
    }
    // Function-based route registration
    app.route("/", healthRoutes);
    app.route("/", redirectRoutes);
    registerTraceRoutes(app);
    registerDownstreamRoutes(app);
    // 404 fallback
    app.notFound((c) => c.json({ error: "Not Found", path: c.req.path }, 404));
    // Error handler
    app.onError((err, c) => {
        mapleLog("error", "unhandled_error", { error: err.message, stack: err.stack });
        return c.json({ error: "Internal Server Error" }, 500);
    });
    // Database + auth bootstrap
    await initializeDatabase();
    await bootstrapOpenClawRuntime();
    const skipAuthBootstrap = String(process.env.MAPLE_SKIP_AUTH_BOOTSTRAP ?? "0").trim().toLowerCase() === "true" ||
        String(process.env.MAPLE_SKIP_AUTH_BOOTSTRAP ?? "0").trim() === "1";
    if (!skipAuthBootstrap) {
        await bootstrapAuthUsers(database);
    }
    const shutdown = async () => {
        stopHitlBroker();
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
