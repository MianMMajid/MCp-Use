import { server, database, initializeDatabase, setGrpcClients } from "./state.js";
import { bootstrapAuthUsers } from "./auth.js";
import { createGrpcClients, closeGrpcClients } from "./grpc-clients.js";
import { startHitlBroker, stopHitlBroker } from "./hitl-broker.js";
import { healthRoutes } from "./routes/health.js";
import { redirectRoutes } from "./routes/redirect-routes.js";
import { registerTraceRoutes } from "./routes/trace-routes.js";
import { registerDownstreamRoutes } from "./routes/downstream-routes.js";
import { registerAgentManagementRoutes } from "./routes/agent-management-routes.js";
import { registerSearchRoutes } from "./routes/search-routes.js";
import { registerNotificationRoutes } from "./routes/notification-routes.js";
import { mapleLog } from "./logging.js";
import { bootstrapOpenClawRuntime, shutdownOpenClawRuntime } from "./core/openclaw-agent-runtime.js";
import { configureOpenClawModifierRuntime } from "./core/openclaw-modifier-runtime.js";
import { startAuditOutboxWorker, stopAuditOutboxWorker } from "./core/audit-outbox.js";
import { startBillingQueueWorker, stopBillingQueueWorker } from "./core/billing-cache.js";
import { startEscalationWorker, stopEscalationWorker } from "./core/escalation-worker.js";
import { startRetentionWorker, stopRetentionWorker } from "./core/retention-worker.js";
import { startTraceExporter, stopTraceExporter } from "./core/trace-exporter.js";
import { configureModifierApprovalBroker, stopModifierApprovalBroker } from "./modifier-approval-broker.js";
import { configureTenantClaimResolver, ensureTenantBindingsTable } from "./core/tenant-claim-resolver.js";
import { configureStepUpAuth, ensureStepUpTable } from "./core/step-up-auth.js";
import { configureOrgHierarchy, ensureOrgHierarchyTables } from "./core/org-hierarchy.js";
import { configureRateLimiter, ensureRateLimiterTables } from "./core/rate-limiter.js";
import { configureEscalationChain, ensureEscalationTables } from "./core/escalation-chain.js";
import { configureAuditIntegrity, ensureAuditChainTable } from "./core/audit-integrity.js";
import { configureAlertWebhook, ensureAlertWebhookTables } from "./core/alert-webhook.js";
import { configureComplianceReporter } from "./core/compliance-reporter.js";
import { enforceGatewayStartupDependencies } from "./core/runtime-dependencies.js";
import { eventTransportBackend, redisUrl } from "./config.js";
// Side-effect imports — these register middleware/routes on `server.app` at load time.
import "./middleware.js";
import "./routes/mcp-middleware.js";
import "./routes/auth-routes.js";
import "./routes/billing-routes.js";
import "./routes/firewall-routes.js";
import "./routes/openclaw-agent-routes.js";
import "./routes/openclaw-cli-routes.js";
import "./routes/openclaw-modifier-routes.js";
import "./routes/openclaw-modifier-observability-routes.js";
import "./routes/openclaw-modifier-ops-routes.js";
import "./routes/modifier-approval-watch.js";
import "./routes/prometheus-metrics.js";
import "./routes/hitl-routes.js";
import "./routes/demo-routes.js";
import "./routes/platform-routes.js";
import "./routes/ops-governance.js";
import "./routes/gpt-adapter.js";
import "./routes/mcp-tools.js";
export async function createApp() {
    const app = server.app;
    const grpcClients = createGrpcClients();
    setGrpcClients(grpcClients);
    await enforceGatewayStartupDependencies();
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
    registerAgentManagementRoutes(app);
    registerSearchRoutes(app);
    registerNotificationRoutes(app);
    // 404 fallback
    app.notFound((c) => c.json({ error: "Not Found", path: c.req.path }, 404));
    // Error handler
    app.onError((err, c) => {
        mapleLog("error", "unhandled_error", { error: err.message, stack: err.stack });
        return c.json({ error: "Internal Server Error" }, 500);
    });
    // Database + auth bootstrap
    await initializeDatabase();
    // Configure enterprise modules with database
    configureOpenClawModifierRuntime({ database });
    configureTenantClaimResolver({ database });
    configureStepUpAuth({ database });
    configureOrgHierarchy({ database });
    configureRateLimiter({ database });
    configureEscalationChain({ database });
    configureAuditIntegrity({ database });
    configureAlertWebhook({ database });
    configureComplianceReporter({ database });
    // Initialize enterprise tables
    await Promise.all([
        ensureTenantBindingsTable(database),
        ensureStepUpTable(database),
        ensureOrgHierarchyTables(database),
        ensureRateLimiterTables(database),
        ensureEscalationTables(database),
        ensureAuditChainTable(database),
        ensureAlertWebhookTables(database),
    ]);
    configureModifierApprovalBroker({ database, transportBackend: eventTransportBackend, redisUrl });
    startAuditOutboxWorker({ database });
    startEscalationWorker({ database });
    startRetentionWorker({ database });
    startBillingQueueWorker({ database });
    startTraceExporter();
    await bootstrapOpenClawRuntime();
    const skipAuthBootstrap = String(process.env.MAPLE_SKIP_AUTH_BOOTSTRAP ?? "0").trim().toLowerCase() === "true" ||
        String(process.env.MAPLE_SKIP_AUTH_BOOTSTRAP ?? "0").trim() === "1";
    if (!skipAuthBootstrap) {
        await bootstrapAuthUsers(database);
    }
    const shutdown = async () => {
        stopHitlBroker();
        stopModifierApprovalBroker();
        stopAuditOutboxWorker();
        stopEscalationWorker();
        stopRetentionWorker();
        stopBillingQueueWorker();
        await stopTraceExporter();
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
