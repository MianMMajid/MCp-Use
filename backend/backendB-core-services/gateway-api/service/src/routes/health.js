import { Hono } from "hono";
import {
  buildFeatureCapabilitiesFromDependencyReport,
  evaluateGatewayRuntimeDependencies,
} from "../core/runtime-dependencies.js";

export const healthRoutes = new Hono();

healthRoutes.get("/health", (c) =>
  c.json({
    status: "ok",
    service: "gateway-api",
    timestamp: new Date().toISOString(),
  })
);

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
