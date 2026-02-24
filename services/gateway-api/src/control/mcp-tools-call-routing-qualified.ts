import { jsonRpcErrorPayload } from "../helpers.js";
import { resolveDownstreamApp } from "./downstream-resolution.js";
import type { McpToolsCallOptions } from "./mcp-tools-call-types.js";

export function resolveQualifiedMarketplaceTool(options: {
  request: Pick<McpToolsCallOptions, "c" | "id" | "target">;
  toolName: string;
  qualifiedTool: { appId: string; toolName: string };
  mcpRouteLockEnabled: boolean;
  allowedMarketplaceAppIds: string[];
}): { kind: "resolved"; normalizedToolName: string; explicitAppIds: string[] } | { kind: "error"; response: Response } {
  const { request, toolName, qualifiedTool } = options;
  if (options.mcpRouteLockEnabled && !options.allowedMarketplaceAppIds.includes(qualifiedTool.appId)) {
    return {
      kind: "error",
      response: request.c.json(
        jsonRpcErrorPayload(
          request.id,
          -32003,
          `Tool "${toolName}" targets app "${qualifiedTool.appId}" which is outside locked marketplace route.`,
          {
            requestedAppId: qualifiedTool.appId,
            allowedAppIds: options.allowedMarketplaceAppIds,
          },
        ),
        403,
      ),
    };
  }
  try {
    resolveDownstreamApp(qualifiedTool.appId);
  } catch (resolutionError) {
    return {
      kind: "error",
      response: request.c.json(
        jsonRpcErrorPayload(request.id, -32602, "Invalid tools/call params: unknown marketplace app.", {
          detail: resolutionError instanceof Error ? resolutionError.message : String(resolutionError),
          requestedAppId: qualifiedTool.appId,
        }),
        400,
      ),
    };
  }
  return {
    kind: "resolved",
    normalizedToolName: qualifiedTool.toolName,
    explicitAppIds: [qualifiedTool.appId],
  };
}
