import { server } from "../state.js";
import { GPT_SPEC_TTL_MS } from "../config.js";
import {
  resolveDispatchAppIds,
  resolveDownstreamApp,
  listToolsFromDownstreamCached,
} from "../firewall-proxy.js";
import { gptAdapterBaseUrl } from "./gpt-adapter-common.js";

let gptOpenApiSpecCache: { spec: Record<string, unknown>; expiresAt: number } | null = null;

export function registerGptPluginRoutes(app: typeof server.app) {
  app.get("/.well-known/ai-plugin.json", async (c) => {
    const baseUrl = gptAdapterBaseUrl();
    return c.json({
      schema_version: "v1",
      name_for_human: "Maple MCP Tools",
      name_for_model: "maple_mcp_tools",
      description_for_human: "Access curated web, research, and utility tools through Maple's MCP firewall gateway.",
      description_for_model:
        "Maple MCP gateway providing web_search, web_fetch, wikipedia_summary, github_repo_info, weather_forecast, hn_search, arxiv_search, openlibrary_search tools. Each tool is dispatched through Maple's firewall and tracing layer.",
      auth: {
        type: "none",
      },
      api: {
        type: "openapi",
        url: `${baseUrl}/gpt/openapi.json`,
      },
      logo_url: `${baseUrl}/logo.png`,
      contact_email: "support@maple.dev",
      legal_info_url: `${baseUrl}/landing`,
    });
  });

  app.get("/gpt/openapi.json", async (c) => {
    const baseUrl = gptAdapterBaseUrl();

    if (gptOpenApiSpecCache && Date.now() < gptOpenApiSpecCache.expiresAt) {
      return c.json(gptOpenApiSpecCache.spec);
    }

    let allTools: Array<{ name: string; description?: string | null; inputSchema?: unknown }> = [];
    try {
      const appIds = resolveDispatchAppIds({ includeDefaultExecutionOrder: true });
      for (const appId of appIds) {
        try {
          const appConfig = resolveDownstreamApp(appId);
          const listed = await listToolsFromDownstreamCached(appConfig, {});
          allTools = allTools.concat(listed.tools);
        } catch (_appErr) {
          // Skip unavailable apps in dynamic OpenAPI generation.
        }
      }
    } catch (_err) {
      // No apps configured.
    }

    const paths: Record<string, unknown> = {};
    for (const tool of allTools) {
      const schema =
        tool.inputSchema && typeof tool.inputSchema === "object"
          ? tool.inputSchema
          : { type: "object", properties: {} };
      paths[`/gpt/tools/${tool.name}`] = {
        post: {
          operationId: tool.name,
          summary: tool.description ?? tool.name,
          security: [],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema },
            },
          },
          responses: {
            "200": {
              description: "Tool result",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok: { type: "boolean" },
                      result: { type: "string" },
                      data: { type: "object" },
                    },
                  },
                },
              },
            },
          },
        },
      };
    }

    const spec = {
      openapi: "3.1.0",
      info: {
        title: "Maple MCP Tools",
        description:
          "REST adapter for Maple MCP gateway tools. Each endpoint dispatches a tool call through Maple's firewall and tracing layer.",
        version: "1.0.0",
      },
      servers: [{ url: baseUrl }],
      paths,
      components: {},
      security: [],
    };

    gptOpenApiSpecCache = { spec, expiresAt: Date.now() + GPT_SPEC_TTL_MS };
    return c.json(spec);
  });
}
