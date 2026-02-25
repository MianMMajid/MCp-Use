/**
 * firewall-proxy.ts
 *
 * Facade for downstream resolution, marketplace integration, chain dispatch,
 * and MCP proxy handling.
 */
export { clearDownstreamToolsCache, listToolsFromDownstreamCached, normalizeDynamicMcpUrl, resolveDefaultTargetApp, resolveDispatchAppIds, resolveDownstreamApp, toPublicDownstreamApp, } from "./control/downstream-resolution.js";
export { dispatchDownstreamChainAndLog, } from "./control/downstream-dispatch-log.js";
export { buildMarketplaceCatalogForAppIds, listEnabledDownstreamAppIds, } from "./control/marketplace-catalog.js";
export { classifyMarketplaceProviderForApp, isMcpSoDownstreamApp, isSmitheryDownstreamApp, normalizeMarketplaceId, parseMarketplaceProvider, } from "./control/marketplace-provider.js";
export { searchMarketplaceServers, registerMarketplaceDownstream, } from "./control/marketplace-discovery.js";
export { handleMcpFirewallProxy, } from "./control/mcp-firewall-proxy-handler.js";
//# sourceMappingURL=firewall-proxy.js.map