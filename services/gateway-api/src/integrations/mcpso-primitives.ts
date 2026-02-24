const DEFAULT_MCPSO_BASE_URL = "https://mcp.so";

export function asString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return undefined;
}

export function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export function normalizeBaseUrl(raw?: string): string {
  const fallback = raw?.trim() ? raw.trim() : DEFAULT_MCPSO_BASE_URL;
  const parsed = new URL(fallback);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`MCP.so base URL must be http/https: ${fallback}`);
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
  return parsed.toString();
}

export function normalizeSlug(name?: string, authorName?: string): string {
  const n = asString(name);
  const a = asString(authorName);
  if (n && a) {
    return `${n}/${a}`;
  }
  return n ?? "";
}

export function parseSlugInput(input?: string): { name?: string; authorName?: string; serverUrl?: string } {
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
