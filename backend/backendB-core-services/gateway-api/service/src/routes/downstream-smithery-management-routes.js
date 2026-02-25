import { registerSmitheryDownstreamRegisteredRoute } from "./downstream-smithery-registered-route.js";
import { registerSmitheryDownstreamRegisterRoute } from "./downstream-smithery-register-route.js";
import { registerSmitheryDownstreamUnregisterRoute } from "./downstream-smithery-unregister-route.js";
export function registerSmitheryManagementRoutes(app) {
    registerSmitheryDownstreamRegisteredRoute(app);
    registerSmitheryDownstreamRegisterRoute(app);
    registerSmitheryDownstreamUnregisterRoute(app);
}
//# sourceMappingURL=downstream-smithery-management-routes.js.map