import { server } from "../state.js";
import { demoRoutesEnabled } from "../config.js";
import { registerDemoGatedRiskRoutes } from "./demo-gated-risk-routes.js";
import { registerDemoGatedFlowRoutes } from "./demo-gated-flow-routes.js";

if (demoRoutesEnabled) {
  registerDemoGatedRiskRoutes(server.app);
  registerDemoGatedFlowRoutes(server.app);
}
