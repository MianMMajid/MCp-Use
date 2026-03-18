import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
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
import { registerRbacRoutes } from "./rbac-routes.js";
import { registerAuthMfaRoutes } from "./auth-routes-mfa.js";
import { registerFirewallRuleRoutes } from "./firewall-rule-routes.js";
import { registerFirewallContextLeakageRoutes } from "./firewall-context-leakage-routes.js";
import { registerCyberRoutes } from "./cyber-routes.js";
import { registerRiskPostureRoutes } from "./risk-posture-routes.js";
import { registerComplianceRoutes } from "./compliance-routes.js";
import { registerShadowAgentRoutes } from "./shadow-agent-routes.js";
import { registerPolicyVersionRoutes } from "./policy-version-routes.js";
import { registerDashboardRoutes } from "./dashboard-routes.js";
import { registerScimRoutes } from "./scim-routes.js";
import { registerSsoRoutes } from "./sso-routes.js";
import { registerTraceSearchRoutes } from "./trace-search-routes.js";
import { registerTraceExportRoutes } from "./trace-export-routes.js";
import { registerRunRoutes } from "./run-routes.js";
import { registerRuntimeDiagnosticsRoutes } from "./runtime-diagnostics-routes.js";
import { registerToolGovernanceRoutes } from "./tool-governance-routes.js";
import { database } from "../state.js";
import { emitAuditEvent } from "../audit-emitter.js";
import { adminApiKeys, adminAllowNoAuth, auditWriterHttpOrigin } from "../config.js";
import { RbacStore } from "../core/rbac-store.js";
import { setRbacStore } from "../middleware/rbac-middleware.js";
import { mapleLog } from "../logging.js";

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

  // Serve AI-generated images (cached locally from any provider: DALL-E, Nano Banana Pro, etc.)
  app.get("/api/generated-images/:filename", (c) => {
    const filename = c.req.param("filename").replace(/[^a-zA-Z0-9._-]/g, "");
    const imgPath = join(process.cwd(), ".maple", "generated-images", filename);
    if (!existsSync(imgPath)) return c.json({ error: "Image not found" }, 404);
    const ext = filename.split(".").pop()?.toLowerCase();
    const mimeTypes = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" };
    const buf = readFileSync(imgPath);
    return new Response(buf, {
      headers: {
        "Content-Type": mimeTypes[ext] || "image/png",
        "Cache-Control": "public, max-age=3600",
      },
    });
  });

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

  // RBAC routes
  registerRbacRoutes(app);

  // MFA routes
  registerAuthMfaRoutes(app);

  // Firewall rule CRUD (Phase 5 — endpoints the frontend already calls)
  registerFirewallRuleRoutes(app);
  registerFirewallContextLeakageRoutes(app);

  // Cyber operations routes (refactored from side-effect to explicit registration)
  registerCyberRoutes(app);

  // Phase 6: Risk posture, compliance, shadow agents, policy versioning
  registerRiskPostureRoutes(app);
  registerComplianceRoutes(app);
  registerShadowAgentRoutes(app);
  registerPolicyVersionRoutes(app);

  // Phase 8: Customizable dashboard
  registerDashboardRoutes(app);

  // Phase 3: SSO — SAML 2.0 + OIDC
  registerSsoRoutes(app);

  // Phase 4: SCIM 2.0 provisioning
  registerScimRoutes(app);

  // Phase 3 (M3): Observability + Compliance — trace search, export, runs, diagnostics, tool governance
  registerTraceSearchRoutes(app);
  registerTraceExportRoutes(app);
  registerRunRoutes(app);
  registerRuntimeDiagnosticsRoutes(app);
  registerToolGovernanceRoutes(app);

  // Initialize RBAC store (non-fatal)
  try {
    const rbacStore = new RbacStore({ database });
    await rbacStore.initialize();
    setRbacStore(rbacStore);
    mapleLog("info", "gateway_api.rbac_initialized", {});
  } catch (err) {
    mapleLog("warn", "gateway_api.rbac_init_failed", { error: err instanceof Error ? err.message : String(err) });
  }

  // M4-09: TODO — OpenAPI spec generation from route definitions. The versioned
  // API docs endpoint should introspect registered routes and produce a complete
  // OpenAPI 3.1 spec at /api/docs/openapi.json with per-route schemas, auth
  // requirements, and example payloads.

  registerGatewayFallbackRoutes(app);
}

function registerGatewayFallbackRoutes(app) {
  // FrontendC: downloads (Next.js API routes handle this locally in frontendC,
  // but if the gateway is hit directly, return a proper 404)
  app.get("/api/downloads/latest", (c) => c.json({ error: "Download routes are served by the marketing frontend, not the gateway." }, 404));
  app.get("/api/downloads/:platform", (c) => c.json({ error: "Download routes are served by the marketing frontend, not the gateway." }, 404));
}
