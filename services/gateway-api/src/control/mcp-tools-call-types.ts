import type { DownstreamAppConfig } from "./downstream-proxy.js";
import type { McpProxyTargetResolution } from "./mcp-target-resolution.js";
import type {
  MarketplaceProvider,
  MarketplaceResolvedServer,
  MarketplaceSearchEntry,
  RegisterMarketplaceDownstreamOptions,
} from "./marketplace-provider.js";

export interface JsonRequestContext {
  req: {
    header: (name: string) => string | undefined;
    query: (name: string) => string | undefined;
  };
  json: (body: unknown, status?: number) => Response;
}

export type SearchMarketplaceServersFn = (options: {
  provider?: MarketplaceProvider | "all";
  query?: string;
  limit?: number;
}) => Promise<MarketplaceSearchEntry[]>;

export type RegisterMarketplaceDownstreamFn = (
  options: RegisterMarketplaceDownstreamOptions,
) => Promise<{
  app: DownstreamAppConfig;
  appId: string;
  provider: MarketplaceProvider;
  resolved: MarketplaceResolvedServer;
  replaced: boolean;
}>;

export interface DispatchDownstreamFinalResult {
  failure?: string;
  preExecutionWouldBlock: boolean;
  app: {
    id: string;
  };
  trace: {
    id: string;
    sessionId: string;
  };
  step: {
    index: number;
  };
  preExecutionStep: {
    index: number;
  };
  preExecutionDecision: unknown;
  dispatch?: {
    result?: unknown;
  };
}

export interface DispatchDownstreamChainResult {
  ok: boolean;
  blockedByPolicy: boolean;
  appIds: string[];
  stages: unknown[];
  finalResult: DispatchDownstreamFinalResult;
}

export type DispatchDownstreamChainAndLogFn = (options: {
  appIds: string[];
  toolName: string;
  toolArgs: Record<string, unknown>;
  traceId?: string;
  sessionId?: string;
  origin: "api" | "mcp" | "mcp_proxy";
}) => Promise<DispatchDownstreamChainResult>;

export interface McpToolsCallOptions {
  c: JsonRequestContext;
  id: unknown;
  rpcParams: unknown;
  target?: McpProxyTargetResolution;
  routeLockTargetOverrideDenied: boolean;
  proxyTargetErrorResponse: () => Response;
  searchMarketplaceServers: SearchMarketplaceServersFn;
  registerMarketplaceDownstream: RegisterMarketplaceDownstreamFn;
  dispatchDownstreamChainAndLog: DispatchDownstreamChainAndLogFn;
}
