import { server } from "../state.js";
import { registerMarketplaceProvidersRoute } from "./downstream-marketplace-providers-route.js";
import { registerMarketplaceSearchRoute } from "./downstream-marketplace-search-route.js";
import { registerMarketplaceConnectedRoute } from "./downstream-marketplace-connected-route.js";
import { registerMarketplaceCatalogRoute } from "./downstream-marketplace-catalog-route.js";

export function registerMarketplaceDiscoveryRoutes(app: typeof server.app) {
  registerMarketplaceProvidersRoute(app);
  registerMarketplaceSearchRoute(app);
  registerMarketplaceConnectedRoute(app);
  registerMarketplaceCatalogRoute(app);
}
