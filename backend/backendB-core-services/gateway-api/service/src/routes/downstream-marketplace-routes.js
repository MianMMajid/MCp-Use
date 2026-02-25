import { registerMarketplaceDiscoveryRoutes } from "./downstream-marketplace-discovery-routes.js";
import { registerMarketplaceConnectionRoutes } from "./downstream-marketplace-connection-routes.js";
export function registerMarketplaceRoutes(app) {
    registerMarketplaceDiscoveryRoutes(app);
    registerMarketplaceConnectionRoutes(app);
}
//# sourceMappingURL=downstream-marketplace-routes.js.map