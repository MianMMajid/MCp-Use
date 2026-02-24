import {
  asString,
  dedupeBy,
  withAbortTimeout,
} from "../helpers.js";
import {
  smitheryEnabled,
  smitheryApiBaseUrl,
  smitheryApiKey,
  smitheryTimeoutMs,
  mcpSoEnabled,
  mcpSoBaseUrl,
  mcpSoTimeoutMs,
} from "../config.js";
import {
  type MarketplaceProvider,
  type MarketplaceSearchEntry,
} from "./marketplace-provider.js";
import {
  listSmitheryServers,
  toSmitheryDownstreamAppId,
} from "../integrations/smithery.js";
import {
  searchMcpSoServers,
  toMcpSoDownstreamAppId,
} from "../integrations/mcpso.js";

export async function searchMarketplaceServers(options: {
  provider?: MarketplaceProvider | "all";
  query?: string;
  limit?: number;
}): Promise<MarketplaceSearchEntry[]> {
  const provider = options.provider ?? "all";
  const limit = options.limit ? Math.max(1, Math.min(100, Math.trunc(options.limit))) : 20;
  const query = asString(options.query);
  const requests: Array<Promise<MarketplaceSearchEntry[]>> = [];

  if ((provider === "all" || provider === "smithery") && smitheryEnabled) {
    requests.push(
      withAbortTimeout(smitheryTimeoutMs, (signal) =>
        listSmitheryServers({
          apiBaseUrl: smitheryApiBaseUrl,
          apiKey: smitheryApiKey,
          signal,
          query,
          page: 1,
          pageSize: Math.max(limit, 20),
        }),
      ).then((smithery) =>
        smithery.servers.map((server) => {
          const id = server.qualifiedName;
          return {
            provider: "smithery" as const,
            id,
            title: server.displayName ?? id,
            description: server.description,
            sourceUrl: `https://smithery.ai/server/${encodeURIComponent(id)}`,
            appIdSuggestion: toSmitheryDownstreamAppId(id),
            connectable: server.isDeployed,
          };
        }),
      ),
    );
  }

  if ((provider === "all" || provider === "mcpso") && mcpSoEnabled) {
    requests.push(
      withAbortTimeout(mcpSoTimeoutMs, (signal) =>
        searchMcpSoServers({
          baseUrl: mcpSoBaseUrl,
          signal,
          query,
          limit: Math.max(limit, 20),
        }),
      ).then((mcpSo) =>
        mcpSo.map((server) => {
          const id = server.slug || server.id;
          return {
            provider: "mcpso" as const,
            id,
            title: server.title,
            description: server.description,
            sourceUrl: server.sourceUrl,
            allowCall: server.allowCall,
            appIdSuggestion: toMcpSoDownstreamAppId(server.slug),
            connectable: Boolean(server.resolvedMcpUrl),
            resolvedMcpUrl: server.resolvedMcpUrl,
          };
        }),
      ),
    );
  }

  const entries = (await Promise.all(requests)).flat();
  const prioritized = [...entries].sort((a, b) => {
    const rank = (entry: MarketplaceSearchEntry): number => {
      if (entry.connectable === true) {
        return 2;
      }
      if (entry.connectable === false) {
        return 0;
      }
      return 1;
    };
    return rank(b) - rank(a);
  });
  const deduped = dedupeBy(prioritized, (entry) => `${entry.provider}:${entry.id.toLowerCase()}`);
  return deduped.slice(0, limit);
}
