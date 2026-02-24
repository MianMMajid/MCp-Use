import { server } from "../state.js";
import { registerSmitheryDownstreamRegisteredRoute } from "./downstream-smithery-registered-route.js";
import { registerSmitheryDownstreamRegisterRoute } from "./downstream-smithery-register-route.js";
import { registerSmitheryDownstreamUnregisterRoute } from "./downstream-smithery-unregister-route.js";

export function registerSmitheryManagementRoutes(app: typeof server.app) {
  registerSmitheryDownstreamRegisteredRoute(app);
  registerSmitheryDownstreamRegisterRoute(app);
  registerSmitheryDownstreamUnregisterRoute(app);
}
