import type { DownstreamAppConfig } from "./downstream-proxy.js";
import type {
  MarketplaceProvider,
  MarketplaceResolvedServer,
  MarketplaceSearchEntry,
  RegisterMarketplaceDownstreamOptions,
} from "./marketplace-provider.js";

export interface DownstreamChainDispatchResultLike {
  ok: boolean;
  blockedByPolicy: boolean;
  stages: unknown[];
  finalResult: {
    app: { id: string };
    preExecutionWouldBlock: boolean;
    trace: { id: string; sessionId: string };
    step: { index: number };
    preExecutionStep: { index: number };
    preExecutionDecision: unknown;
    dispatch?: { result?: unknown };
    failure?: string;
  };
}

export interface RegisterMarketplaceDownstreamResult {
  app: DownstreamAppConfig;
  appId: string;
  provider: MarketplaceProvider;
  resolved: MarketplaceResolvedServer;
  replaced: boolean;
}

export interface MarketplaceControlExecutionOptions {
  toolName: string;
  toolArgs: Record<string, unknown>;
  searchMarketplaceServers: (options: {
    provider?: MarketplaceProvider | "all";
    query?: string;
    limit?: number;
  }) => Promise<MarketplaceSearchEntry[]>;
  registerMarketplaceDownstream: (
    options: RegisterMarketplaceDownstreamOptions,
  ) => Promise<RegisterMarketplaceDownstreamResult>;
  dispatchDownstreamChainAndLog: (options: {
    appIds: string[];
    toolName: string;
    toolArgs: Record<string, unknown>;
    traceId?: string;
    sessionId?: string;
    origin: "api" | "mcp" | "mcp_proxy";
  }) => Promise<DownstreamChainDispatchResultLike>;
}
