import { asString } from "../helpers.js";
import type { DownstreamAppConfig } from "./downstream-proxy.js";

export type MarketplaceProvider = "smithery" | "mcpso";

export interface MarketplaceSearchEntry {
  provider: MarketplaceProvider;
  id: string;
  title: string;
  description?: string;
  sourceUrl?: string;
  appIdSuggestion: string;
  connectable?: boolean;
  resolvedMcpUrl?: string;
  allowCall?: boolean;
}

export interface MarketplaceResolvedServer {
  provider: MarketplaceProvider;
  id: string;
  title: string;
  description?: string;
  sourceUrl?: string;
  appIdSuggestion: string;
  mcpUrl?: string;
  defaultToolAllowlist?: string[];
}

export interface RegisterMarketplaceDownstreamOptions {
  provider: MarketplaceProvider;
  id: string;
  overwrite?: boolean;
  appId?: string;
  name?: string;
  enabled?: boolean;
  timeoutMs?: number;
  resolvedTitle?: string;
  resolvedDescription?: string;
  resolvedSourceUrl?: string;
  resolvedMcpUrl?: string;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  apiKey?: string;
  authHeader?: string;
  authScheme?: "raw" | "bearer";
  toolAllowlist?: string[];
  restrictToCatalogTools?: boolean;
}

export function parseMarketplaceProvider(value: unknown): MarketplaceProvider | "all" | undefined {
  const normalized = asString(value)?.toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (normalized === "all") {
    return "all";
  }
  if (normalized === "smithery" || normalized === "mcpso") {
    return normalized;
  }
  return undefined;
}

export function parseMcpSoSlug(value: string): { slug?: string; serverUrl?: string } {
  const normalized = value.trim();
  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    return {
      serverUrl: normalized,
    };
  }
  return {
    slug: normalized.replace(/^\/+/, "").replace(/^server\//, ""),
  };
}

export function normalizeMarketplaceId(provider: MarketplaceProvider, rawId: string): string {
  const trimmed = rawId.trim();
  if (provider === "smithery") {
    return trimmed;
  }
  const mcpSoParsed = parseMcpSoSlug(trimmed);
  if (mcpSoParsed.serverUrl) {
    try {
      const parsed = new URL(mcpSoParsed.serverUrl);
      if (parsed.pathname.startsWith("/server/")) {
        return parsed.pathname.replace(/^\/server\//, "").replace(/\/+$/, "");
      }
    } catch {
      return trimmed;
    }
  }
  return mcpSoParsed.slug ?? trimmed;
}

export function isSmitheryDownstreamApp(app: DownstreamAppConfig): boolean {
  return app.id.startsWith("smithery-") || app.description?.startsWith("[smithery] ") === true;
}

export function isMcpSoDownstreamApp(app: DownstreamAppConfig): boolean {
  return app.id.startsWith("mcpso-") || app.description?.startsWith("[mcpso] ") === true;
}

export function classifyMarketplaceProviderForApp(
  app: DownstreamAppConfig,
): MarketplaceProvider | undefined {
  if (isSmitheryDownstreamApp(app)) {
    return "smithery";
  }
  if (isMcpSoDownstreamApp(app)) {
    return "mcpso";
  }
  return undefined;
}
