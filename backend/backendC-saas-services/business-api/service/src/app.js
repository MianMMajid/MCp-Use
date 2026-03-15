import { Hono } from "hono";
import { mapleLog } from "@maple/common";
import { MaplePostgresDatabase } from "@maple/persistence";
import { billingEnabled, stripeWebhookSecret } from "./config.js";
import { registerHealthRoutes } from "./routes/health-routes.js";
import { registerUserRoutes } from "./routes/user-routes.js";
import { registerBillingRoutes } from "./routes/billing-routes.js";
import { registerAuthMeRoute } from "./routes/auth-me-route.js";
import { registerAuthLoginRegisterRoutes } from "./routes/auth-login-register-routes.js";
import { registerAuthLogoutRoute } from "./routes/auth-logout-route.js";
import { registerAuthGoogleRoutes } from "./routes/auth-google-routes.js";
import { AuthRecoveryStore } from "./auth-recovery-store.js";
import { registerAuthRecoveryRoutes } from "./routes/auth-recovery-routes.js";
import { registerPlatformRoutes } from "./routes/platform-routes.js";

export async function createApp(options = {}) {
  const database = options.database ?? new MaplePostgresDatabase();
  const authRecoveryStore =
    options.authRecoveryStore ?? new AuthRecoveryStore({ database });
  const auditEmitter =
    typeof options.auditEmitter === "function" ? options.auditEmitter : () => {};
  const shouldInitialize = options.skipDatabaseInit !== true;

  if (shouldInitialize && typeof database.initialize === "function") {
    await database.initialize();
  }
  if (typeof authRecoveryStore.ensureInitialized === "function") {
    await authRecoveryStore.ensureInitialized();
  }

  const app = new Hono();

  app.use("/api/business/*", async (c, next) => {
    const startedAt = Date.now();
    let raisedError;
    try {
      await next();
    } catch (err) {
      raisedError = err;
      throw err;
    } finally {
      const status = c.res?.status ?? (raisedError ? 500 : 200);
      const severity =
        status >= 500
          ? "RISK_SEVERITY_HIGH"
          : status >= 400
            ? "RISK_SEVERITY_MEDIUM"
            : "RISK_SEVERITY_LOW";
      auditEmitter({
        eventType: "AUDIT_EVENT_TYPE_POLICY_EVALUATED",
        severity,
        summary: `${c.req.method} ${c.req.path}`,
        context: {
          traceId: c.req.header("x-trace-id") ?? "",
          requestId: c.req.header("x-request-id") ?? "",
          tenantId: c.req.header("x-maple-tenant-id") ?? "",
          userId: c.req.header("x-maple-user-id") ?? "",
          deviceId: c.req.header("x-maple-device-id") ?? "",
          sessionId: c.req.header("x-maple-session-id") ?? "",
        },
        payload: {
          method: c.req.method,
          path: c.req.path,
          status,
          durationMs: Date.now() - startedAt,
          sourceService: c.req.header("x-maple-source-service") ?? "unknown",
        },
      });
    }
  });

  registerHealthRoutes(app, { getDatabase: () => database });
  registerUserRoutes(app, { database });
  registerBillingRoutes(app, {
    database,
    billingEnabled: options.billingEnabled ?? billingEnabled,
    stripeWebhookSecret: options.stripeWebhookSecret ?? stripeWebhookSecret,
  });
  registerAuthMeRoute(app, { database });
  registerAuthLoginRegisterRoutes(app, { database });
  registerAuthLogoutRoute(app, { database });
  registerAuthGoogleRoutes(app, { database });
  registerAuthRecoveryRoutes(app, {
    database,
    recoveryStore: authRecoveryStore,
    auditEmitter,
    onRecoveryTokenIssued: options.onAuthRecoveryTokenIssued,
  });
  await registerPlatformRoutes(app, { database });

  app.notFound((c) => c.json({ error: "Not Found", path: c.req.path }, 404));

  app.onError((err, c) => {
    mapleLog("error", "business_api.unhandled_error", {
      error: err?.message ?? String(err),
      stack: err?.stack,
    });
    return c.json({ error: "Internal Server Error" }, 500);
  });

  const shutdown = async () => {
    if (options.manageDatabaseLifecycle === false) {
      return;
    }
    if (typeof database.close === "function") {
      await database.close();
    }
  };

  return { app, database, shutdown };
}
