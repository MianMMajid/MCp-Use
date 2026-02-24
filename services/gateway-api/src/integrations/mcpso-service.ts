import { parseServerObjectsFromHtml } from "./mcpso-html.js";
import {
  asString,
  normalizeBaseUrl,
  parseSlugInput,
  toDetail,
  toSearchResult,
} from "./mcpso-utils.js";

import type {
  McpSoSearchResult,
  McpSoServerDetails,
  ResolveMcpSoServerDetailsOptions,
  SearchMcpSoServersOptions,
} from "./mcpso-types.js";

const DEFAULT_CACHE_TTL_MS = 1000 * 60 * 5;
const cacheTtlMs = (() => {
  const raw = Number.parseInt(String(process.env.MAPLE_MCPSO_CACHE_TTL_MS ?? DEFAULT_CACHE_TTL_MS), 10);
  if (!Number.isFinite(raw) || raw <= 0) {
    return DEFAULT_CACHE_TTL_MS;
  }
  return Math.max(5_000, Math.min(1000 * 60 * 60, raw));
})();
const searchCache = new Map<string, { expiresAt: number; result: McpSoSearchResult[] }>();
const detailsCache = new Map<string, { expiresAt: number; result: McpSoServerDetails }>();

function getCachedSearch(key: string): McpSoSearchResult[] | undefined {
  const cached = searchCache.get(key);
  if (!cached) {
    return undefined;
  }
  if (Date.now() > cached.expiresAt) {
    searchCache.delete(key);
    return undefined;
  }
  return cached.result;
}

function setCachedSearch(key: string, result: McpSoSearchResult[]): void {
  searchCache.set(key, {
    expiresAt: Date.now() + cacheTtlMs,
    result,
  });
}

function getCachedDetails(key: string): McpSoServerDetails | undefined {
  const cached = detailsCache.get(key);
  if (!cached) {
    return undefined;
  }
  if (Date.now() > cached.expiresAt) {
    detailsCache.delete(key);
    return undefined;
  }
  return cached.result;
}

function setCachedDetails(key: string, result: McpSoServerDetails): void {
  detailsCache.set(key, {
    expiresAt: Date.now() + cacheTtlMs,
    result,
  });
}

export async function searchMcpSoServers(
  options: SearchMcpSoServersOptions = {},
): Promise<McpSoSearchResult[]> {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const root = new URL(baseUrl);
  const page = options.page && Number.isFinite(options.page) ? Math.max(1, Math.trunc(options.page)) : 1;
  const limit = options.limit && Number.isFinite(options.limit) ? Math.max(1, Math.min(100, Math.trunc(options.limit))) : 20;
  const query = asString(options.query);
  const cacheKey = JSON.stringify({
    baseUrl,
    page,
    limit,
    query: query ?? "",
  });

  try {
    const pageUrl = new URL("/servers", root);
    if (query) {
      pageUrl.searchParams.set("q", query);
    }
    pageUrl.searchParams.set("page", String(page));

    const response = await fetch(pageUrl, {
      method: "GET",
      headers: {
        accept: "text/html",
      },
      signal: options.signal,
    });
    const html = await response.text();
    if (!response.ok) {
      throw new Error(`MCP.so search request failed (${response.status}).`);
    }

    const parsed = parseServerObjectsFromHtml(html)
      .map((entry) => toSearchResult(baseUrl, entry))
      .filter((entry): entry is McpSoSearchResult => Boolean(entry));

    const filtered = query
      ? parsed.filter((entry) => {
          const haystack = [
            entry.title,
            entry.slug,
            entry.authorName,
            entry.description,
            ...entry.tags,
          ]
            .filter(Boolean)
            .join("\n")
            .toLowerCase();
          return haystack.includes(query.toLowerCase());
        })
      : parsed;

    const result = filtered.slice(0, limit);
    setCachedSearch(cacheKey, result);
    return result;
  } catch (error) {
    const cached = getCachedSearch(cacheKey);
    if (cached) {
      return cached;
    }
    throw error;
  }
}

export async function resolveMcpSoServerDetails(
  options: ResolveMcpSoServerDetailsOptions = {},
): Promise<McpSoServerDetails> {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const root = new URL(baseUrl);
  const slugInput = parseSlugInput(options.slug);
  const explicitServerUrl = asString(options.serverUrl) ?? slugInput.serverUrl;
  let serverPath: string | undefined;

  if (explicitServerUrl) {
    const parsed = new URL(explicitServerUrl);
    if (!/mcp\.so$/i.test(parsed.hostname) || !parsed.pathname.startsWith("/server/")) {
      throw new Error("MCP.so serverUrl must point to /server/{name}/{author}.");
    }
    serverPath = parsed.pathname;
  } else {
    const name = slugInput.name;
    const authorName = slugInput.authorName;
    if (!name) {
      throw new Error("MCP.so server slug is required.");
    }
    serverPath = authorName ? `/server/${name}/${authorName}` : `/server/${name}`;
  }
  const cacheKey = JSON.stringify({
    baseUrl,
    serverPath,
  });

  try {
    const serverUrl = new URL(serverPath, root);
    const response = await fetch(serverUrl, {
      method: "GET",
      headers: {
        accept: "text/html",
      },
      signal: options.signal,
    });
    const html = await response.text();
    if (!response.ok) {
      throw new Error(`MCP.so server page request failed (${response.status}).`);
    }

    const servers = parseServerObjectsFromHtml(html);
    if (servers.length === 0) {
      throw new Error(`MCP.so server data could not be parsed for ${serverUrl.toString()}.`);
    }

    let chosen = servers[0];
    const name = slugInput.name;
    const authorName = slugInput.authorName;
    if (name) {
      const matched = servers.find((entry) => {
        const sameName = asString(entry.name) === name;
        const sameAuthor = !authorName || asString(entry.author_name) === authorName;
        return sameName && sameAuthor;
      });
      if (matched) {
        chosen = matched;
      }
    }

    const detail = toDetail(baseUrl, chosen);
    if (!detail) {
      throw new Error(`MCP.so server detail is missing required fields for ${serverUrl.toString()}.`);
    }
    detail.pageUrl = serverUrl.toString();
    setCachedDetails(cacheKey, detail);
    return detail;
  } catch (error) {
    const cached = getCachedDetails(cacheKey);
    if (cached) {
      return cached;
    }
    throw error;
  }
}
