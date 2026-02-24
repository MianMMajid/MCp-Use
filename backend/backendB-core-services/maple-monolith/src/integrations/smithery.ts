import { createHash } from "node:crypto";

export interface SmitheryListServer {
  id: string;
  qualifiedName: string;
  namespace?: string;
  slug?: string;
  displayName?: string;
  description?: string;
  iconUrl?: string;
  verified?: boolean;
  useCount?: number;
  remote?: boolean;
  isDeployed?: boolean;
  createdAt?: string;
  homepage?: string;
}

export interface SmitheryListResponse {
  servers: SmitheryListServer[];
  pagination?: {
    currentPage?: number;
    pageSize?: number;
    totalPages?: number;
    totalCount?: number;
  };
}

export interface SmitheryServerTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

export interface SmitheryServerConnection {
  type?: string;
  deploymentUrl?: string;
  configSchema?: unknown;
}

export interface SmitheryServerDetails {
  qualifiedName: string;
  displayName?: string;
  description?: string;
  iconUrl?: string;
  remote?: boolean;
  deploymentUrl?: string;
  connections?: SmitheryServerConnection[];
  security?: unknown;
  tools?: SmitheryServerTool[];
}

interface SmitheryRequestOptions {
  apiBaseUrl?: string;
  apiKey?: string;
  signal?: AbortSignal;
}

export interface ListSmitheryServersOptions extends SmitheryRequestOptions {
  page?: number;
  pageSize?: number;
  query?: string;
  remote?: boolean;
  deployed?: boolean;
  verified?: boolean;
}

const DEFAULT_SMITHERY_API_BASE_URL = "https://api.smithery.ai";

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return undefined;
}

function normalizeApiBaseUrl(raw?: string): string {
  const fallback = raw?.trim() ? raw.trim() : DEFAULT_SMITHERY_API_BASE_URL;
  const parsed = new URL(fallback);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`Smithery API base URL must be http/https: ${fallback}`);
  }
  const path = parsed.pathname.replace(/\/+$/, "");
  parsed.pathname = path.length > 0 ? path : "/";
  return parsed.toString();
}

function buildRequestHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
  };
  const token = asString(apiKey);
  if (token) {
    headers.authorization = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
  }
  return headers;
}

async function fetchSmitheryJson(
  path: string,
  options: SmitheryRequestOptions & { query?: Record<string, string> } = {}
): Promise<unknown> {
  const baseUrl = normalizeApiBaseUrl(options.apiBaseUrl);
  const url = new URL(path.replace(/^\//, ""), baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  const query = options.query ?? {};
  for (const [key, value] of Object.entries(query)) {
    const trimmed = asString(value);
    if (!trimmed) {
      continue;
    }
    url.searchParams.set(key, trimmed);
  }

  const response = await fetch(url, {
    method: "GET",
    headers: buildRequestHeaders(options.apiKey),
    signal: options.signal,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail =
      payload && typeof payload === "object" ? JSON.stringify(payload) : String(payload ?? "");
    throw new Error(`Smithery API request failed (${response.status}): ${detail}`);
  }
  return payload;
}

function normalizeQualifiedNameCandidate(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return trimmed;
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const parsed = new URL(trimmed);
      const marker = "/servers/";
      const index = parsed.pathname.indexOf(marker);
      if (index >= 0) {
        const extracted = decodeURIComponent(parsed.pathname.slice(index + marker.length));
        return extracted.trim();
      }
    } catch {
      return trimmed;
    }
  }

  return decodeURIComponent(trimmed);
}

function candidateQualifiedNames(rawQualifiedName: string): string[] {
  const normalized = normalizeQualifiedNameCandidate(rawQualifiedName);
  if (!normalized) {
    return [];
  }
  const candidates = new Set<string>([normalized]);
  if (!normalized.startsWith("@")) {
    candidates.add(`@${normalized}`);
  }
  if (normalized.startsWith("@")) {
    candidates.add(normalized.slice(1));
  }
  return [...candidates].filter((entry) => entry.trim().length > 0);
}

export function toSmitheryDownstreamAppId(qualifiedName: string): string {
  const normalized = normalizeQualifiedNameCandidate(qualifiedName).toLowerCase().replace(/^@/, "");
  const slug = normalized
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
  const digest = createHash("sha1").update(normalized || qualifiedName).digest("hex").slice(0, 8);
  const base = slug.length > 0 ? slug.slice(0, 42) : "server";
  return `smithery-${base}-${digest}`;
}

export function resolveSmitheryDeploymentUrl(server: SmitheryServerDetails): string | undefined {
  const candidates = [
    ...(Array.isArray(server.connections) ? server.connections : []),
  ];
  for (const connection of candidates) {
    if (!connection || typeof connection !== "object") {
      continue;
    }
    const type = asString((connection as Record<string, unknown>).type)?.toLowerCase();
    const url = asString((connection as Record<string, unknown>).deploymentUrl);
    if (type === "http" && url) {
      return url;
    }
  }
  return asString(server.deploymentUrl);
}

export async function listSmitheryServers(
  options: ListSmitheryServersOptions = {}
): Promise<SmitheryListResponse> {
  const page = options.page && Number.isFinite(options.page) ? Math.max(1, Math.trunc(options.page)) : 1;
  const pageSizeRaw =
    options.pageSize && Number.isFinite(options.pageSize)
      ? Math.trunc(options.pageSize)
      : 20;
  const pageSize = Math.max(1, Math.min(100, pageSizeRaw));

  const payload = await fetchSmitheryJson("/servers", {
    apiBaseUrl: options.apiBaseUrl,
    apiKey: options.apiKey,
    signal: options.signal,
    query: {
      page: String(page),
      pageSize: String(pageSize),
      ...(options.query ? { q: options.query } : {}),
      ...(typeof options.remote === "boolean" ? { remote: String(options.remote) } : {}),
      ...(typeof options.deployed === "boolean" ? { deployed: String(options.deployed) } : {}),
      ...(typeof options.verified === "boolean" ? { verified: String(options.verified) } : {}),
    },
  });

  const root = asObject(payload);
  const rawServers = Array.isArray(root.servers) ? root.servers : [];
  const servers: SmitheryListServer[] = rawServers
    .map((entry) => asObject(entry))
    .map((entry) => ({
      id: asString(entry.id) ?? "",
      qualifiedName: asString(entry.qualifiedName) ?? "",
      namespace: asString(entry.namespace),
      slug: asString(entry.slug),
      displayName: asString(entry.displayName),
      description: asString(entry.description),
      iconUrl: asString(entry.iconUrl),
      verified: asBoolean(entry.verified),
      useCount: asNumber(entry.useCount),
      remote: asBoolean(entry.remote),
      isDeployed: asBoolean(entry.isDeployed),
      createdAt: asString(entry.createdAt),
      homepage: asString(entry.homepage),
    }))
    .filter((server) => server.qualifiedName.length > 0);

  const pagination = asObject(root.pagination);
  return {
    servers,
    pagination: {
      currentPage: asNumber(pagination.currentPage),
      pageSize: asNumber(pagination.pageSize),
      totalPages: asNumber(pagination.totalPages),
      totalCount: asNumber(pagination.totalCount),
    },
  };
}

export async function fetchSmitheryServerDetails(
  qualifiedName: string,
  options: SmitheryRequestOptions = {}
): Promise<SmitheryServerDetails> {
  const candidates = candidateQualifiedNames(qualifiedName);
  if (candidates.length === 0) {
    throw new Error("qualifiedName is required.");
  }

  let lastError: Error | undefined;
  for (const candidate of candidates) {
    try {
      const payload = await fetchSmitheryJson(`/servers/${encodeURIComponent(candidate)}`, {
        apiBaseUrl: options.apiBaseUrl,
        apiKey: options.apiKey,
        signal: options.signal,
      });
      const root = asObject(payload);
      const toolsRaw = Array.isArray(root.tools) ? root.tools : [];
      const tools = toolsRaw
        .map((entry) => asObject(entry))
        .map((tool) => ({
          name: asString(tool.name) ?? "",
          description: asString(tool.description),
          inputSchema: tool.inputSchema,
        }))
        .filter((tool) => tool.name.length > 0);
      const connectionsRaw = Array.isArray(root.connections) ? root.connections : [];
      const connections = connectionsRaw
        .map((entry) => asObject(entry))
        .map((connection) => ({
          type: asString(connection.type),
          deploymentUrl: asString(connection.deploymentUrl),
          configSchema: connection.configSchema,
        }));

      const resolvedQualifiedName = asString(root.qualifiedName) ?? candidate;
      return {
        qualifiedName: resolvedQualifiedName,
        displayName: asString(root.displayName),
        description: asString(root.description),
        iconUrl: asString(root.iconUrl),
        remote: asBoolean(root.remote),
        deploymentUrl: asString(root.deploymentUrl),
        connections,
        security: root.security,
        tools,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error ?? "Unknown error"));
    }
  }

  throw lastError ?? new Error(`Unable to resolve Smithery server "${qualifiedName}".`);
}
