import { asObject } from "./downstream-proxy-utils.js";

export interface NormalizedForwardTool {
  name: string;
  description: string;
  inputSchema?: unknown;
}

export function parseJsonFromUnknown(raw: unknown): unknown {
  if (!raw) {
    return undefined;
  }
  try {
    const json = typeof raw === "string" ? raw : Buffer.from(raw as Uint8Array).toString("utf-8");
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}

export function parseForwardPayload(raw: unknown): Record<string, unknown> {
  const parsed = parseJsonFromUnknown(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }
  return asObject(parsed);
}

function parseToolInputSchema(rawSchema: unknown): unknown {
  if (!rawSchema) {
    return undefined;
  }
  try {
    if (typeof rawSchema === "object" && !Array.isArray(rawSchema)) {
      return rawSchema;
    }
    const json = typeof rawSchema === "string" ? rawSchema : Buffer.from(rawSchema as Uint8Array).toString("utf-8");
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}

export function normalizeToolsListFromPayload(forwardPayload: Record<string, unknown>): NormalizedForwardTool[] {
  const result = asObject(forwardPayload.result);
  const upstreamTools = Array.isArray(result.tools) ? result.tools : [];
  return upstreamTools
    .map((tool) => {
      const raw = tool as Record<string, unknown>;
      const inputSchema = parseToolInputSchema(
        raw?.inputSchema ?? raw?.input_schema ?? raw?.schema ?? raw?.inputSchemaJson,
      );
      return {
        name: String(raw?.name || ""),
        description: String(raw?.description || ""),
        ...(inputSchema ? { inputSchema } : {}),
      };
    })
    .filter((tool) => tool.name.length > 0);
}
