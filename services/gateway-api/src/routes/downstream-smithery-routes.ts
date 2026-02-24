import { server } from "../state.js";
import { legacySmitheryRoutesEnabled } from "../config.js";
import { registerSmitheryCatalogRoutes } from "./downstream-smithery-catalog-routes.js";
import { registerSmitheryManagementRoutes } from "./downstream-smithery-management-routes.js";

export function registerLegacySmitheryRoutes(app: typeof server.app) {
  if (!legacySmitheryRoutesEnabled) {
    return;
  }

  registerSmitheryCatalogRoutes(app);
  registerSmitheryManagementRoutes(app);
}
