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
  resolvedMcpUrl?: string;
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
