import { server } from "../state.js";
import { registerMarketplaceDiscoveryRoutes } from "./downstream-marketplace-discovery-routes.js";
import { registerMarketplaceConnectionRoutes } from "./downstream-marketplace-connection-routes.js";

export function registerMarketplaceRoutes(app: typeof server.app) {
  registerMarketplaceDiscoveryRoutes(app);
  registerMarketplaceConnectionRoutes(app);
}
