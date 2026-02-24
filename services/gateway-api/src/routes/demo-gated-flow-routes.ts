import { server } from "../state.js";
import { registerDemoForkRoute } from "./demo-gated-flow-fork-route.js";
import { registerDemoFullRoute } from "./demo-gated-flow-full-route.js";
import { registerDemoIngestRoute } from "./demo-gated-flow-ingest-route.js";

export function registerDemoGatedFlowRoutes(app: typeof server.app) {
  registerDemoForkRoute(app);
  registerDemoFullRoute(app);
  registerDemoIngestRoute(app);
}
