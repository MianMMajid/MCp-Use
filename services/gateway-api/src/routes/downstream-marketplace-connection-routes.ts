import { server } from "../state.js";
import { registerMarketplaceConnectRoute } from "./downstream-marketplace-connect-route.js";
import { registerMarketplaceDisconnectRoute } from "./downstream-marketplace-disconnect-route.js";

export function registerMarketplaceConnectionRoutes(app: typeof server.app) {
  registerMarketplaceConnectRoute(app);
  registerMarketplaceDisconnectRoute(app);
}
