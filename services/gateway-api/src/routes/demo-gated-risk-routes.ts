import { server } from "../state.js";
import { registerDemoAuditRoute } from "./demo-gated-risk-audit-route.js";
import { registerDemoMlRoute } from "./demo-gated-risk-ml-route.js";
import { registerDemoBlockRoute } from "./demo-gated-risk-block-route.js";
import { registerDemoGuardRoute } from "./demo-gated-risk-guard-route.js";

export function registerDemoGatedRiskRoutes(app: typeof server.app) {
  registerDemoAuditRoute(app);
  registerDemoMlRoute(app);
  registerDemoBlockRoute(app);
  registerDemoGuardRoute(app);
}
