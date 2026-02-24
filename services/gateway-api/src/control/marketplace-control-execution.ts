import {
  executeMarketplaceConnectedApps,
  executeMarketplaceConnect,
  executeMarketplaceDisconnect,
  executeMarketplaceGetStarted,
  executeMarketplaceSearch,
} from "./marketplace-control-basic.js";
import { executeMarketplaceAutorouteCall } from "./marketplace-control-autoroute.js";
import type { MarketplaceControlExecutionOptions } from "./marketplace-control-types.js";

export async function executeMarketplaceControlTool(options: MarketplaceControlExecutionOptions) {
  const { toolName } = options;

  if (toolName === "maple_get_started") {
    return executeMarketplaceGetStarted(options);
  }

  if (toolName === "maple_autoroute_call") {
    return executeMarketplaceAutorouteCall(options);
  }

  if (toolName === "maple_marketplace_search") {
    return executeMarketplaceSearch(options);
  }

  if (toolName === "maple_marketplace_connect") {
    return executeMarketplaceConnect(options);
  }

  if (toolName === "maple_marketplace_connected_apps") {
    return executeMarketplaceConnectedApps(options);
  }

  if (toolName === "maple_marketplace_disconnect") {
    return executeMarketplaceDisconnect(options);
  }

  throw new Error(`Unsupported marketplace control tool: ${toolName}`);
}
