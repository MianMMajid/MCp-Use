import { server } from "../state.js";
import { registerDownstreamAppsRoute } from "./downstream-control-apps-route.js";
import { registerDownstreamToolsRoute } from "./downstream-control-tools-route.js";
import { registerDownstreamDispatchRoute } from "./downstream-control-dispatch-route.js";

export function registerDownstreamControlRoutes(app: typeof server.app) {
  registerDownstreamAppsRoute(app);
  registerDownstreamToolsRoute(app);
  registerDownstreamDispatchRoute(app);
}
