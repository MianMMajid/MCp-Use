import { registerDemoAuditRoute } from "./demo-gated-risk-audit-route.js";
import { registerDemoMlRoute } from "./demo-gated-risk-ml-route.js";
import { registerDemoBlockRoute } from "./demo-gated-risk-block-route.js";
import { registerDemoGuardRoute } from "./demo-gated-risk-guard-route.js";
export function registerDemoGatedRiskRoutes(app) {
    registerDemoAuditRoute(app);
    registerDemoMlRoute(app);
    registerDemoBlockRoute(app);
    registerDemoGuardRoute(app);
}
//# sourceMappingURL=demo-gated-risk-routes.js.map