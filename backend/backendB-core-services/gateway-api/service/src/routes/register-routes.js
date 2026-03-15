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
import { database } from "../state.js";
import { emitAuditEvent } from "../audit-emitter.js";
import { adminApiKeys, adminAllowNoAuth, auditWriterHttpOrigin } from "../config.js";
import { requireApiKeyResponse } from "../auth.js";
import { authContextStorage } from "../auth-context.js";
import { listUserTenantBindings } from "../core/tenant-claim-resolver.js";
import { asString } from "../helpers.js";

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
  // Fix 11: Gate stub routes with auth middleware so they aren't publicly reachable
  const authGate = async (c, next) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;
    await next();
  };
  app.use("/api/operations/*", authGate);

  // Tenant bindings — return real data from tenant-claim-resolver when available
  app.get("/api/operations/orchestrations/tenant-bindings", async (c) => {
    const ctx = authContextStorage.getStore();
    const userId = asString(ctx?.userId) ?? asString(ctx?.keyFingerprint) ?? "";
    if (!userId) return c.json({ ok: true, bindings: [] });
    try {
      const bindings = await listUserTenantBindings(userId, { database });
      return c.json({ ok: true, bindings });
    } catch {
      return c.json({ ok: true, bindings: [] });
    }
  });
  app.post("/api/operations/orchestrations/tenant-bindings", (c) => c.json({ error: "Use POST /api/org to create organizations and tenant bindings." }, 501));
  app.delete("/api/operations/orchestrations/tenant-bindings", (c) => c.json({ error: "Use org member removal to manage tenant bindings." }, 501));
  app.get("/api/operations/orchestrations/tenant-scope", async (c) => {
    const ctx = authContextStorage.getStore();
    const tenantId = asString(c.req.header("x-tenant-id")) ?? "";
    const orgId = asString(c.req.header("x-org-id")) ?? "";
    return c.json({ ok: true, scope: tenantId ? { tenantId, orgId, userId: ctx?.userId ?? "" } : null });
  });
  // Org tree — return real orgs for the authenticated user
  app.get("/api/operations/orchestrations/org/tree", async (c) => {
    const ctx = authContextStorage.getStore();
    const userId = asString(ctx?.userId) ?? "";
    if (!userId || !database?.pool) return c.json({ ok: true, tree: [] });
    try {
      const { PlatformStore } = await import("../core/platform-store.js");
      const store = new PlatformStore({ database });
      const orgs = await store.listOrganizationsForUser(userId);
      return c.json({ ok: true, tree: orgs });
    } catch {
      return c.json({ ok: true, tree: [] });
    }
  });
  app.get("/api/operations/orchestrations/org/:orgId", async (c) => {
    const ctx = authContextStorage.getStore();
    const orgId = asString(c.req.param("orgId")) ?? "";
    const userId = asString(ctx?.userId) ?? "";
    if (!orgId || !userId || !database?.pool) return c.json({ ok: true, org: null });
    try {
      const { PlatformStore } = await import("../core/platform-store.js");
      const store = new PlatformStore({ database });
      const org = await store.getOrganizationForUser(orgId, userId);
      return c.json({ ok: true, org: org ?? null });
    } catch {
      return c.json({ ok: true, org: null });
    }
  });
  app.get("/api/operations/orchestrations/org/:orgId/lifecycle", (c) => c.json({ ok: true, events: [] }));
  app.post("/api/operations/orchestrations/org", (c) => c.json({ error: "Use POST /api/org to create organizations." }, 501));
  app.delete("/api/operations/orchestrations/org/:orgId", (c) => c.json({ error: "Organization deletion is not supported. Remove members instead." }, 501));

  // FrontendC: downloads (Next.js API routes handle this locally in frontendC,
  // but if the gateway is hit directly, return a proper 404)
  app.get("/api/downloads/latest", (c) => c.json({ error: "Download routes are served by the marketing frontend, not the gateway." }, 404));
  app.get("/api/downloads/:platform", (c) => c.json({ error: "Download routes are served by the marketing frontend, not the gateway." }, 404));
}
