export interface DownstreamAppConfig {
  id: string;
  name: string;
  description?: string;
  mcpUrl: string;
  enabled: boolean;
  timeoutMs: number;
  apiKey?: string;
  authHeader: string;
  authScheme: "raw" | "bearer";
  headers?: Record<string, string>;
  toolAllowlist?: string[];
}

export interface DownstreamAppInfo {
  id: string;
  name: string;
  description?: string;
  mcpUrl: string;
  enabled: boolean;
  timeoutMs: number;
  authHeader: string;
  authScheme: "raw" | "bearer";
  hasApiKey: boolean;
  headerKeys?: string[];
  toolAllowlist?: string[];
}

export interface DownstreamToolInfo {
  name: string;
  description?: string;
  inputSchema?: unknown;
  annotations?: Record<string, unknown>;
}

export interface DownstreamCallResult {
  appId: string;
  toolName: string;
  requestId: string;
  durationMs: number;
  responseStatus: number;
  result: unknown;
  textPreview: string;
}

export interface DownstreamJsonRpcForwardResult {
  durationMs: number;
  responseStatus: number;
  payload: Record<string, unknown>;
}
