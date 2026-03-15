import { registerMarketplaceConnectRoute } from "./downstream-marketplace-connect-route.js";
import { registerMarketplaceDisconnectRoute } from "./downstream-marketplace-disconnect-route.js";
export function registerMarketplaceConnectionRoutes(app) {
    registerMarketplaceConnectRoute(app);
    registerMarketplaceDisconnectRoute(app);
}
//# sourceMappingURL=downstream-marketplace-connection-routes.js.map