import { registerLegacySmitheryRoutes } from "./downstream-smithery-routes.js";
import { registerMarketplaceRoutes } from "./downstream-marketplace-routes.js";
import { registerDownstreamControlRoutes } from "./downstream-control-routes.js";
export function registerDownstreamRoutes(app) {
    registerLegacySmitheryRoutes(app);
    registerMarketplaceRoutes(app);
    registerDownstreamControlRoutes(app);
}
//# sourceMappingURL=downstream-routes.js.map