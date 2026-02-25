import { serviceName } from "../config.js";
import { evaluateBusinessRuntimeDependencies } from "../runtime-dependencies.js";

export function registerHealthRoutes(app) {
  app.get("/health", (c) =>
    c.json({
      status: "ok",
      service: serviceName,
      timestamp: new Date().toISOString(),
    })
  );

  app.get("/ready", async (c) => {
    const report = await evaluateBusinessRuntimeDependencies({ force: true });
    return c.json(
      {
        ready: report.ready,
        strict: report.strict,
        generatedAt: report.generatedAt,
        service: serviceName,
        timestamp: new Date().toISOString(),
        failingDependencies: report.requiredFailures.map((check) => ({
          id: check.id,
          label: check.label,
          reason: check.reason,
        })),
      },
      report.ready ? 200 : 503
    );
  });
}
