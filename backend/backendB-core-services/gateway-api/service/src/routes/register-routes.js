import { healthRoutes } from "./health.js";
import { redirectRoutes } from "./redirect-routes.js";
import { registerTraceRoutes } from "./trace-routes.js";
import { registerDownstreamRoutes } from "./downstream-routes.js";
import { registerAgentManagementRoutes } from "./agent-management-routes.js";
import { registerSearchRoutes } from "./search-routes.js";
import { registerNotificationRoutes } from "./notification-routes.js";
import { registerOrchestrationRoutes } from "./orchestration-routes.js";
import { registerAdminConsoleRoutes } from "./admin-console-routes.js";
import { createAdminStaticRoutes } from "./admin-static-routes.js";
import { registerIntegrationRoutes } from "./integration-routes.js";
import { registerFrontendBRoutes } from "./frontend-b-routes.js";
import { registerOperationsPlatformRoutes } from "./operations-platform-routes.js";
import { database } from "../state.js";
import { emitAuditEvent } from "../audit-emitter.js";
import { adminApiKeys, adminAllowNoAuth, auditWriterHttpOrigin } from "../config.js";

const SIDE_EFFECT_ROUTE_MODULES = [
  "../middleware.js",
  "./mcp-middleware.js",
  "./auth-routes.js",
  "./billing-routes.js",
  "./firewall-routes.js",
  "./cyber-routes.js",
  "./openclaw-agent-routes.js",
  "./openclaw-cli-routes.js",
  "./openclaw-modifier-routes.js",
  "./openclaw-modifier-observability-routes.js",
  "./orchestration-observability-routes.js",
  "./orchestration-operations-routes.js",
  "./openclaw-modifier-ops-routes.js",
  "./modifier-approval-watch.js",
  "./prometheus-metrics.js",
  "./hitl-routes.js",
  "./demo-routes.js",
  "./platform-routes.js",
  "./ops-governance.js",
  "./gpt-adapter.js",
  "./mcp-tools.js",
  "./openclaw-posture-routes.js",
];

export async function registerGatewayRoutes(app) {
  for (const modulePath of SIDE_EFFECT_ROUTE_MODULES) {
    await import(modulePath);
  }

  app.route("/", healthRoutes);
  app.route("/", redirectRoutes);
  registerTraceRoutes(app);
  registerDownstreamRoutes(app);
  registerAgentManagementRoutes(app);
  registerSearchRoutes(app);
  registerNotificationRoutes(app);
  registerOrchestrationRoutes(app);
  registerFrontendBRoutes(app);
  registerOperationsPlatformRoutes(app);

  // Admin console routes (merged from admin-console-api)
  registerAdminConsoleRoutes(app, { adminApiKeys, adminAllowNoAuth, auditWriterHttpOrigin });
  app.route("/", createAdminStaticRoutes());

  // Integration routes (merged from business-api)
  registerIntegrationRoutes(app, { database, auditEmitter: emitAuditEvent });

  registerGatewayFallbackRoutes(app);
}

function registerGatewayFallbackRoutes(app) {
  // FrontendC: downloads (Next.js API routes handle this locally in frontendC,
  // but if the gateway is hit directly, return a proper 404)
  app.get("/api/downloads/latest", (c) => c.json({ error: "Download routes are served by the marketing frontend, not the gateway." }, 404));
  app.get("/api/downloads/:platform", (c) => c.json({ error: "Download routes are served by the marketing frontend, not the gateway." }, 404));
}
