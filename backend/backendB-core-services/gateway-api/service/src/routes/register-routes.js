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
import { database } from "../state.js";
import { emitAuditEvent } from "../audit-emitter.js";
import { adminApiKeys, adminAllowNoAuth, auditWriterHttpOrigin } from "../config.js";

const SIDE_EFFECT_ROUTE_MODULES = [
  "../middleware.js",
  "./mcp-middleware.js",
  "./auth-routes.js",
  "./billing-routes.js",
  "./firewall-routes.js",
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

  // Admin console routes (merged from admin-console-api)
  registerAdminConsoleRoutes(app, { adminApiKeys, adminAllowNoAuth, auditWriterHttpOrigin });
  app.route("/", createAdminStaticRoutes());

  // Integration routes (merged from business-api)
  registerIntegrationRoutes(app, { database, auditEmitter: emitAuditEvent });

  // ── Stub routes for frontend-referenced endpoints not yet implemented ──
  // These return proper JSON so frontends get structured responses instead of
  // the MCP inspector HTML fallback (which the SPA catch-all would serve).
  registerStubRoutes(app);
}

// Stub routes for endpoints the frontends call but the gateway hasn't
// fully implemented yet.  Returning structured JSON lets the UI show
// "empty / not available" instead of silently failing on HTML parse.
function registerStubRoutes(app) {
  // FrontendB: task management
  app.get("/api/tasks", (c) => c.json({ ok: true, items: [] }));
  app.post("/api/tasks", (c) => c.json({ ok: true, item: null, error: "Task creation not yet implemented." }, 501));
  app.get("/api/tasks/:taskId", (c) => c.json({ error: "Tasks not yet implemented." }, 501));
  app.patch("/api/tasks/:taskId", (c) => c.json({ error: "Tasks not yet implemented." }, 501));
  app.delete("/api/tasks/:taskId", (c) => c.json({ ok: true }));
  app.post("/api/tasks/:taskId/:command", (c) => c.json({ error: "Tasks not yet implemented." }, 501));

  // FrontendB: agent tools
  app.get("/api/agents/:agentId/tools", (c) => c.json({ ok: true, items: [], equippedToolIds: [] }));
  app.patch("/api/agents/:agentId/tools", (c) => c.json({ ok: true }));

  // FrontendA: tenant bindings, org hierarchy, tenant scope
  app.get("/api/operations/orchestrations/tenant-bindings", (c) => c.json({ ok: true, bindings: [] }));
  app.post("/api/operations/orchestrations/tenant-bindings", (c) => c.json({ error: "Tenant bindings not yet implemented." }, 501));
  app.delete("/api/operations/orchestrations/tenant-bindings", (c) => c.json({ ok: true }));
  app.get("/api/operations/orchestrations/tenant-scope", (c) => c.json({ ok: true, scope: null }));
  app.get("/api/operations/orchestrations/org/tree", (c) => c.json({ ok: true, tree: [] }));
  app.get("/api/operations/orchestrations/org/:orgId", (c) => c.json({ ok: true, org: null }));
  app.get("/api/operations/orchestrations/org/:orgId/lifecycle", (c) => c.json({ ok: true, events: [] }));
  app.post("/api/operations/orchestrations/org", (c) => c.json({ error: "Org management not yet implemented." }, 501));
  app.delete("/api/operations/orchestrations/org/:orgId", (c) => c.json({ ok: true }));

  // FrontendC: downloads (Next.js API routes handle this locally in frontendC,
  // but if the gateway is hit directly, return a proper 404)
  app.get("/api/downloads/latest", (c) => c.json({ error: "Download routes are served by the marketing frontend, not the gateway." }, 404));
  app.get("/api/downloads/:platform", (c) => c.json({ error: "Download routes are served by the marketing frontend, not the gateway." }, 404));
}
