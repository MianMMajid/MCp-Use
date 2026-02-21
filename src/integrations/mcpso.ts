import { createHash } from "node:crypto";

export interface McpSoServer {
  id?: number;
  uuid?: string;
  name?: string;
  title?: string;
  description?: string;
  avatar_url?: string;
  author_name?: string;
  tags?: string;
  url?: string;
  type?: string;
  tools?: unknown;
  sse_url?: string | null;
  sse_provider?: string | null;
  server_command?: string | null;
  server_config?: string | null;
  allow_call?: boolean;
  is_featured?: boolean;
  sort?: number;
}

export interface McpSoSearchResult {
  provider: "mcpso";
  id: string;
  uuid?: string;
  slug: string;
  title: string;
  description?: string;
  authorName?: string;
  tags: string[];
  sourceUrl: string;
  sseUrl?: string;
  allowCall?: boolean;
  serverConfig?: string;
}

export interface McpSoServerDetails extends McpSoSearchResult {
  serverCommand?: string;
  pageUrl: string;
}

export interface SearchMcpSoServersOptions {
  baseUrl?: string;
  query?: string;
  page?: number;
  limit?: number;
  signal?: AbortSignal;
}

export interface ResolveMcpSoServerDetailsOptions {
  baseUrl?: string;
  slug?: string;
  serverUrl?: string;
  signal?: AbortSignal;
}

const DEFAULT_MCPSO_BASE_URL = "https://mcp.so";
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

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function normalizeBaseUrl(raw?: string): string {
  const fallback = raw?.trim() ? raw.trim() : DEFAULT_MCPSO_BASE_URL;
  const parsed = new URL(fallback);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`MCP.so base URL must be http/https: ${fallback}`);
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
  return parsed.toString();
}

function dedupeBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const id = key(item);
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    out.push(item);
  }
  return out;
}

function decodeNextFlightPayload(html: string): string {
  const regex = /self\.__next_f\.push\(\[\s*\d+\s*,\s*"([\s\S]*?)"\s*\]\)/g;
  let decoded = "";
  for (const match of html.matchAll(regex)) {
    const raw = match[1];
    if (!raw) {
      continue;
    }
    try {
      decoded += JSON.parse(`"${raw}"`);
    } catch {
      continue;
    }
  }
  return decoded;
}

function extractJsonObjects<T>(
  source: string,
  shouldInclude: (value: unknown) => boolean
): T[] {
  const collectMatches = (root: unknown): T[] => {
    const out: T[] = [];
    const stack: unknown[] = [root];
    while (stack.length > 0) {
      const node = stack.pop();
      if (!node || typeof node !== "object") {
        continue;
      }
      if (Array.isArray(node)) {
        for (const item of node) {
          stack.push(item);
        }
        continue;
      }
      const record = node as Record<string, unknown>;
      if (shouldInclude(record)) {
        out.push(record as T);
      }
      for (const value of Object.values(record)) {
        if (value && typeof value === "object") {
          stack.push(value);
        }
      }
    }
    return out;
  };

  const found: T[] = [];
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] !== "{") {
      continue;
    }
    let depth = 0;
    let inString = false;
    let escaped = false;
    let end = -1;
    for (let j = i; j < source.length; j += 1) {
      const ch = source[j];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === "\\") {
          escaped = true;
        } else if (ch === "\"") {
          inString = false;
        }
        continue;
      }
      if (ch === "\"") {
        inString = true;
        continue;
      }
      if (ch === "{") {
        depth += 1;
        continue;
      }
      if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          end = j;
          break;
        }
      }
    }
    if (end <= i) {
      continue;
    }
    const candidate = source.slice(i, end + 1);
    try {
      const parsed = JSON.parse(candidate);
      found.push(...collectMatches(parsed));
    } catch {
      continue;
    }
    i = end;
  }
  return found;
}

function normalizeSlug(name?: string, authorName?: string): string {
  const n = asString(name);
  const a = asString(authorName);
  if (n && a) {
    return `${n}/${a}`;
  }
  return n ?? "";
}

function parseTags(value?: string): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

function isLikelyMcpSoServerRecord(value: unknown): boolean {
  const obj = asObject(value);
  const name = asString(obj.name);
  const title = asString(obj.title);
  if (!name || !title) {
    return false;
  }

  const type = asString(obj.type)?.toLowerCase();
  if (type && type !== "server") {
    return false;
  }

  const hasServerSignals =
    Boolean(asString(obj.author_name)) ||
    Boolean(asString(obj.uuid)) ||
    Boolean(asString(obj.url)) ||
    Boolean(asString(obj.tags)) ||
    Boolean(asString(obj.server_config)) ||
    Boolean(asString(obj.server_command)) ||
    asNumber(obj.id) !== undefined;
  return hasServerSignals;
}

function normalizeUrlCandidate(raw?: string | null): string | undefined {
  const trimmed = asString(raw ?? undefined);
  if (!trimmed) {
    return undefined;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return undefined;
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
}

export function toMcpSoDownstreamAppId(slug: string): string {
  const normalized = slug
    .toLowerCase()
    .replace(/^https?:\/\/mcp\.so\/server\//, "")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
  const compact = normalized
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
  const digest = createHash("sha1").update(normalized || slug).digest("hex").slice(0, 8);
  const base = compact.length > 0 ? compact.slice(0, 42) : "server";
  return `mcpso-${base}-${digest}`;
}

export function resolveMcpSoDeploymentUrl(server: Pick<
  McpSoServer,
  "sse_url" | "server_config" | "server_command" | "url"
>): string | undefined {
  const explicitSse = normalizeUrlCandidate(server.sse_url);
  if (explicitSse) {
    return explicitSse;
  }

  const candidates: string[] = [];
  const config = asString(server.server_config);
  if (config) {
    try {
      const parsed = JSON.parse(config) as Record<string, unknown>;
      const mcpServers = asObject(parsed.mcpServers);
      for (const value of Object.values(mcpServers)) {
        const item = asObject(value);
        const directUrl = asString(item.url);
        if (directUrl) {
          candidates.push(directUrl);
        }
        const args = Array.isArray(item.args) ? item.args : [];
        for (const arg of args) {
          const entry = asString(arg);
          if (!entry) {
            continue;
          }
          const urlMatch = entry.match(/https?:\/\/[^\s"'`]+/i);
          if (urlMatch?.[0]) {
            candidates.push(urlMatch[0]);
          }
        }
      }
    } catch {
      const urlMatch = config.match(/https?:\/\/[^\s"'`]+/i);
      if (urlMatch?.[0]) {
        candidates.push(urlMatch[0]);
      }
    }
  }

  const command = asString(server.server_command);
  if (command) {
    const urlMatch = command.match(/https?:\/\/[^\s"'`]+/i);
    if (urlMatch?.[0]) {
      candidates.push(urlMatch[0]);
    }
  }

  const homepage = asString(server.url);
  if (homepage && /(\/mcp|\/sse)\b/i.test(homepage)) {
    candidates.push(homepage);
  }

  for (const candidate of candidates) {
    const normalized = normalizeUrlCandidate(candidate);
    if (normalized) {
      return normalized;
    }
  }
  return undefined;
}

function toSearchResult(baseUrl: string, project: McpSoServer): McpSoSearchResult | undefined {
  const uuid = asString(project.uuid);
  const name = asString(project.name);
  const title = asString(project.title);
  if (!title || !name) {
    return undefined;
  }
  const authorName = asString(project.author_name);
  const slug = normalizeSlug(name, authorName);
  if (!slug) {
    return undefined;
  }
  const root = new URL(baseUrl);
  const sourceUrl = new URL(`/server/${slug}`, root).toString();
  return {
    provider: "mcpso",
    id: uuid ?? slug,
    uuid,
    slug,
    title,
    description: asString(project.description),
    authorName,
    tags: parseTags(asString(project.tags)),
    sourceUrl,
    sseUrl: normalizeUrlCandidate(project.sse_url),
    allowCall: asBoolean(project.allow_call),
    serverConfig: asString(project.server_config),
  };
}

function parseServerObjectsFromHtml(html: string): McpSoServer[] {
  const decoded = decodeNextFlightPayload(html);
  const candidates = [...[decoded, html]]
    .filter((entry) => entry.length > 0)
    .flatMap((entry) =>
      extractJsonObjects<McpSoServer>(entry, (value) => {
        return isLikelyMcpSoServerRecord(value);
      })
    );
  return dedupeBy(candidates, (item) => asString(item.uuid) ?? normalizeSlug(item.name, item.author_name));
}

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

function parseSlugInput(input?: string): { name?: string; authorName?: string; serverUrl?: string } {
  const value = asString(input);
  if (!value) {
    return {};
  }
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return {
      serverUrl: value,
    };
  }
  const normalized = value.replace(/^\/+/, "").replace(/^server\//, "");
  const parts = normalized.split("/").map((entry) => entry.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { name: parts[0], authorName: parts[1] };
  }
  if (parts.length === 1) {
    return { name: parts[0] };
  }
  return {};
}

function toDetail(
  baseUrl: string,
  project: McpSoServer
): McpSoServerDetails | undefined {
  const search = toSearchResult(baseUrl, project);
  if (!search) {
    return undefined;
  }
  return {
    ...search,
    serverCommand: asString(project.server_command),
    pageUrl: search.sourceUrl,
  };
}

export async function searchMcpSoServers(
  options: SearchMcpSoServersOptions = {}
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
  options: ResolveMcpSoServerDetailsOptions = {}
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
