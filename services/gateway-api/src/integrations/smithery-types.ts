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

export interface SmitheryRequestOptions {
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
