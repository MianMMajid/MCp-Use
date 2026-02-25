import { errorMessage, jsonRpcErrorPayload } from "../helpers.js";
import { listToolsFromDownstreamCached, resolveDispatchAppIds, resolveDownstreamApp } from "./downstream-resolution.js";

function applyToolAllowlist(app, tools) {
  const allowlist = app.toolAllowlist;
  if (!allowlist || allowlist.length === 0) {
    return tools;
  }
  return tools.filter((tool) => {
    const name = typeof tool.name === "string" ? tool.name : "";
    return Boolean(name && allowlist.includes(name));
  });
}

function toToolResponse(tool) {
  return {
    name: tool.name,
    ...(tool.description ? { description: tool.description } : {}),
    ...(tool.inputSchema !== undefined ? { inputSchema: tool.inputSchema } : {}),
    ...(tool.annotations ? { annotations: tool.annotations } : {}),
  };
}

export async function handleMcpToolsListMethod(options) {
  try {
    if (!options.target && options.routeLockTargetOverrideDenied) {
      return options.proxyTargetErrorResponse();
    }

    const explicitChain = options.c.req.header("x-maple-chain-apps") ?? options.c.req.query("mapleChain");
    const appIds = options.target
      ? [options.target.app.id]
      : resolveDispatchAppIds({
          explicitChain,
          includeDefaultExecutionOrder: true,
        });

    if (options.target?.mode === "dynamic" && appIds.length > 1) {
      return options.c.json(
        jsonRpcErrorPayload(options.id, -32602, "Dynamic target mode does not support multi-app tools/list.", {
          mode: options.target.mode,
          appIds,
        }),
        400
      );
    }

    const multipleApps = appIds.length > 1;
    const allTools = [];

    for (const appId of appIds) {
      const app =
        options.target?.mode === "dynamic" && options.target.app.id === appId
          ? options.target.app
          : resolveDownstreamApp(appId);

      const listed = await listToolsFromDownstreamCached(app);
      const tools = applyToolAllowlist(app, listed.tools.map((tool) => toToolResponse(tool)));

      for (const tool of tools) {
        const qualifiedName = `${app.id}::${tool.name}`;
        allTools.push({
          ...(multipleApps ? { name: qualifiedName } : { name: tool.name }),
          ...(tool.description ? { description: multipleApps ? `[${app.id}] ${tool.description}` : tool.description } : {}),
          ...(tool.inputSchema !== undefined ? { inputSchema: tool.inputSchema } : {}),
          ...(tool.annotations ? { annotations: tool.annotations } : {}),
          _meta: {
            mapleProxyAppId: app.id,
            mapleProxyToolName: tool.name,
            mapleQualifiedName: qualifiedName,
          },
        });
      }
    }

    return options.c.json(
      {
        jsonrpc: "2.0",
        id: options.id,
        result: {
          tools: allTools,
          appIds,
        },
      },
      200
    );
  } catch (listError) {
    const detail = errorMessage(listError);
    const authorityUnavailable = detail.includes("Context-wall policy authority is unavailable.");
    return options.c.json(
      jsonRpcErrorPayload(options.id, -32002, "Downstream tools/list failed.", {
        detail,
        appId: options.target?.app.id,
        authority: "context-wall",
        authorityUnavailable,
      }),
      authorityUnavailable ? 503 : 502
    );
  }
}
