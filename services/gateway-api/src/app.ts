import { server, database, initializeDatabase, setGrpcClients } from "./state.js";
import { bootstrapAuthUsers } from "./auth.js";
import { createGrpcClients } from "./grpc-clients.js";
import { startHitlBroker } from "./hitl-broker.js";
import { healthRoutes } from "./routes/health.js";
import { redirectRoutes } from "./routes/redirect-routes.js";
import { registerTraceRoutes } from "./routes/trace-routes.js";
import { registerDownstreamRoutes } from "./routes/downstream-routes.js";
import { mapleLog } from "./logging.js";

// Side-effect imports — these register middleware/routes on `server.app` at load time.
import "./middleware.js";
import "./routes/mcp-middleware.js";
import "./routes/auth-routes.js";
import "./routes/billing-routes.js";
import "./routes/firewall-routes.js";
import "./routes/hitl-routes.js";
import "./routes/demo-routes.js";
import "./routes/gpt-adapter.js";
import "./routes/mcp-tools.js";

export async function createApp() {
  const app = server.app;
  const grpcClients = createGrpcClients();
  setGrpcClients(grpcClients);
  startHitlBroker();

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
  await bootstrapAuthUsers(database);

  return { server, app, grpcClients };
}
