import { mcpMarketplaceEnabled } from "../config.js";
import { errorMessage, jsonRpcErrorPayload } from "../helpers.js";
import { executeMarketplaceControlTool } from "./marketplace-control-execution.js";
import { isMarketplaceControlToolName } from "./marketplace-tools.js";
import type { McpToolsCallOptions } from "./mcp-tools-call-types.js";

export async function maybeHandleMarketplaceControlTool(options: {
  toolName: string;
  toolArgs: Record<string, unknown>;
  request: Pick<
    McpToolsCallOptions,
    "c" | "id" | "searchMarketplaceServers" | "registerMarketplaceDownstream" | "dispatchDownstreamChainAndLog"
  >;
}): Promise<Response | undefined> {
  const { toolName, toolArgs, request } = options;

  if (!isMarketplaceControlToolName(toolName, mcpMarketplaceEnabled)) {
    return undefined;
  }

  try {
    const result = await executeMarketplaceControlTool({
      toolName,
      toolArgs,
      searchMarketplaceServers: request.searchMarketplaceServers,
      registerMarketplaceDownstream: request.registerMarketplaceDownstream,
      dispatchDownstreamChainAndLog: request.dispatchDownstreamChainAndLog,
    });
    return request.c.json(
      {
        jsonrpc: "2.0",
        id: request.id,
        result,
      },
      200,
    );
  } catch (controlError) {
    return request.c.json(
      jsonRpcErrorPayload(request.id, -32603, "Marketplace control tool failed.", {
        toolName,
        detail: errorMessage(controlError),
      }),
      400,
    );
  }
}
