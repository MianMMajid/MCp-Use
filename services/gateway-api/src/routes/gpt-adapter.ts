import { server, database } from "../state.js";
import {
  GPT_OAUTH_CLIENT_ID,
  GPT_OAUTH_CLIENT_SECRET,
  GPT_SPEC_TTL_MS,
  configuredApiKeys,
} from "../config.js";
import { asString, readJsonBody, errorMessage } from "../helpers.js";
import {
  resolveDispatchAppIds,
  resolveDownstreamApp,
  listToolsFromDownstreamCached,
  dispatchDownstreamChainAndLog,
} from "../firewall-proxy.js";
import { toPolicySnapshot } from "../trace-helpers.js";

// ── ChatGPT Actions adapter ──

let gptOpenApiSpecCache: { spec: Record<string, unknown>; expiresAt: number } | null = null;

// OAuth2 discovery endpoints (MCP spec / ChatGPT requirement)
server.get("/.well-known/oauth-authorization-server", async (c) => {
  const baseUrl = String(process.env.MCP_URL || `http://localhost:${process.env.PORT || 3000}`);
  return c.json({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/gpt/oauth/authorize`,
    token_endpoint: `${baseUrl}/gpt/oauth/token`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"],
    code_challenge_methods_supported: ["S256"],
  });
});

server.get("/.well-known/oauth-protected-resource", async (c) => {
  const baseUrl = String(process.env.MCP_URL || `http://localhost:${process.env.PORT || 3000}`);
  return c.json({
    resource: `${baseUrl}/mcp`,
    authorization_servers: [baseUrl],
    bearer_methods_supported: ["header"],
  });
});

// OAuth2 authorize/token endpoints for ChatGPT
server.get("/gpt/oauth/authorize", async (c) => {
  const redirectUri = asString(c.req.query("redirect_uri"));
  const state = asString(c.req.query("state")) ?? "";
  if (!redirectUri) {
    return c.json({ error: "redirect_uri is required" }, 400);
  }
  const code = "maple-auth-code-" + Date.now();
  const separator = redirectUri.includes("?") ? "&" : "?";
  return c.redirect(`${redirectUri}${separator}code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`);
});

server.app.post("/gpt/oauth/token", async (c) => {
  const body = await readJsonBody(c);
  const contentType = c.req.header("content-type") ?? "";
  let clientId = asString(body.client_id);
  let clientSecret = asString(body.client_secret);

  if (!clientId && contentType.includes("application/x-www-form-urlencoded")) {
    try {
      const text = await c.req.text();
      const params = new URLSearchParams(text);
      clientId = params.get("client_id") ?? undefined;
      clientSecret = params.get("client_secret") ?? undefined;
    } catch (_e) { /* ignore */ }
  }

  if (clientId && clientId !== GPT_OAUTH_CLIENT_ID) {
    return c.json({ error: "invalid_client" }, 401);
  }
  if (clientSecret && clientSecret !== GPT_OAUTH_CLIENT_SECRET) {
    return c.json({ error: "invalid_client" }, 401);
  }

  const accessToken = configuredApiKeys[0] || "maple-access-token";
  return c.json({
    access_token: accessToken,
    token_type: "bearer",
    expires_in: 86400,
  });
});

server.get("/.well-known/ai-plugin.json", async (c) => {
  const baseUrl = String(process.env.MCP_URL || `http://localhost:${process.env.PORT || 3000}`);
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

server.get("/gpt/openapi.json", async (c) => {
  const baseUrl = String(process.env.MCP_URL || `http://localhost:${process.env.PORT || 3000}`);

  if (gptOpenApiSpecCache && Date.now() < gptOpenApiSpecCache.expiresAt) {
    return c.json(gptOpenApiSpecCache.spec);
  }

  let allTools: Array<{ name: string; description?: string | null; inputSchema?: unknown }> = [];
  try {
    const appIds = resolveDispatchAppIds({ includeDefaultExecutionOrder: true });
    for (const appId of appIds) {
      try {
        const app = resolveDownstreamApp(appId);
        const listed = await listToolsFromDownstreamCached(app, {});
        allTools = allTools.concat(listed.tools);
      } catch (_appErr) {
        /* skip unavailable apps */
      }
    }
  } catch (_err) {
    /* no apps configured */
  }

  const paths: Record<string, unknown> = {};
  for (const tool of allTools) {
    const schema = tool.inputSchema && typeof tool.inputSchema === "object" ? tool.inputSchema : { type: "object", properties: {} };
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
      description: "REST adapter for Maple MCP gateway tools. Each endpoint dispatches a tool call through Maple's firewall and tracing layer.",
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

server.app.post("/gpt/tools/:toolName", async (c) => {
  const toolName = c.req.param("toolName");
  if (!toolName) {
    return c.json({ ok: false, error: "Tool name is required." }, 400);
  }

  const body = await readJsonBody(c);
  const toolArgs: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    toolArgs[key] = value;
  }

  let appIds: string[];
  try {
    appIds = resolveDispatchAppIds({ includeDefaultExecutionOrder: true });
  } catch (resolutionError) {
    return c.json({ ok: false, error: errorMessage(resolutionError) }, 400);
  }

  try {
    const chainResult = await dispatchDownstreamChainAndLog({
      appIds,
      toolName,
      toolArgs,
      sessionId: "gpt-actions",
      origin: "api",
    });
    const result = chainResult.finalResult;

    if (!chainResult.ok) {
      return c.json({
        ok: false,
        error: result.failure ?? "Tool dispatch failed.",
      }, chainResult.blockedByPolicy ? 403 : 502);
    }

    const textPreview = result.dispatch?.textPreview ?? "";
    const rawResult = result.dispatch?.result as Record<string, unknown> | undefined;
    const structuredData = (rawResult?.structuredContent as Record<string, unknown> | undefined)?.data ?? null;

    return c.json({
      ok: true,
      result: textPreview,
      ...(structuredData ? { data: structuredData } : {}),
    });
  } catch (dispatchError) {
    return c.json({ ok: false, error: errorMessage(dispatchError) }, 500);
  }
});
