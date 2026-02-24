import { server } from "../state.js";
import { registerLegacySmitheryRoutes } from "./downstream-smithery-routes.js";
import { registerMarketplaceRoutes } from "./downstream-marketplace-routes.js";
import { registerDownstreamControlRoutes } from "./downstream-control-routes.js";

export function registerDownstreamRoutes(app: typeof server.app) {
  registerLegacySmitheryRoutes(app);
  registerMarketplaceRoutes(app);
  registerDownstreamControlRoutes(app);
}
