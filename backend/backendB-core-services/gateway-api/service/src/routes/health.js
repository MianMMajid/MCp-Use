import { Hono } from "hono";
import {
  buildFeatureCapabilitiesFromDependencyReport,
  evaluateGatewayRuntimeDependencies,
} from "../core/runtime-dependencies.js";
import { database } from "../state.js";

const DB_HEALTH_TIMEOUT_MS = 2000;

export const healthRoutes = new Hono();

// Fix 7: /health is a liveness probe — always 200 if the process is running.
// DB status is reported but does not affect the HTTP status code.
// Use /ready for readiness (returns 503 when DB or dependencies are down).
healthRoutes.get("/health", async (c) => {
  let dbOk = true;
  let dbError = "";
  if (database?.pool) {
    try {
      await Promise.race([
        database.pool.query("SELECT 1"),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("DB health check timed out")), DB_HEALTH_TIMEOUT_MS)
        ),
      ]);
    } catch (err) {
      dbOk = false;
      dbError = err instanceof Error ? err.message : String(err);
    }
  }
  return c.json({
    status: dbOk ? "ok" : "degraded",
    service: "gateway-api",
    timestamp: new Date().toISOString(),
    db: dbOk ? { ok: true } : { ok: false, error: dbError },
  });
});

healthRoutes.get("/ready", async (c) => {
  const report = await evaluateGatewayRuntimeDependencies({ force: true });
  return c.json(
    {
      ready: report.ready,
      service: "gateway-api",
      strict: report.strict,
      generatedAt: report.generatedAt,
      failingDependencies: report.requiredFailures.map((check) => ({
        id: check.id,
        label: check.label,
        reason: check.reason,
      })),
    },
    report.ready ? 200 : 503
  );
});

healthRoutes.get("/api/runtime/feature-capabilities", async (c) => {
  const report = await evaluateGatewayRuntimeDependencies({ force: true });
  const capabilities = buildFeatureCapabilitiesFromDependencyReport(report);
  return c.json({
    ok: true,
    service: "gateway-api",
    ...capabilities,
  });
});
//# sourceMappingURL=health.js.map
