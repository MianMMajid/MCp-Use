import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveMcpSoDeploymentUrl,
  searchMcpSoServers,
  toMcpSoDownstreamAppId,
  type McpSoServer,
} from "../src/integrations/mcpso.js";

test("toMcpSoDownstreamAppId is deterministic and prefixed", () => {
  const a = toMcpSoDownstreamAppId("firecrawl-mcp-server/mendableai");
  const b = toMcpSoDownstreamAppId("firecrawl-mcp-server/mendableai");
  assert.equal(a, b);
  assert.match(a, /^mcpso-[a-z0-9-]+$/);
});

test("resolveMcpSoDeploymentUrl prefers request/response HTTP endpoint over sse_url", () => {
  const server: McpSoServer = {
    sse_url: "https://demo.example.com/sse",
    server_config: "{\"mcpServers\":{\"demo\":{\"url\":\"https://preferred.example.com/mcp\"}}}",
  };
  assert.equal(resolveMcpSoDeploymentUrl(server), "https://preferred.example.com/mcp");
});

test("resolveMcpSoDeploymentUrl returns undefined when only SSE endpoint is available", () => {
  const server: McpSoServer = {
    sse_url: "https://demo.example.com/sse",
  };
  assert.equal(resolveMcpSoDeploymentUrl(server), undefined);
});

test("resolveMcpSoDeploymentUrl extracts URL from server_config", () => {
  const server: McpSoServer = {
    server_config: JSON.stringify({
      mcpServers: {
        epitome: {
          type: "streamable-http",
          url: "https://epitome.fyi/mcp",
        },
      },
    }),
  };
  assert.equal(resolveMcpSoDeploymentUrl(server), "https://epitome.fyi/mcp");
});

test("resolveMcpSoDeploymentUrl extracts URL from server_command", () => {
  const server: McpSoServer = {
    server_command: "npx mcp-remote https://example.com/mcp --allow-http",
  };
  assert.equal(resolveMcpSoDeploymentUrl(server), "https://example.com/mcp");
});

test("searchMcpSoServers parses nested flight payload server objects", async () => {
  const originalFetch = globalThis.fetch;
  const serverRecord = {
    id: 1,
    uuid: "d6a17fbf-b0d5-4f1d-89ff-9ed8f2486127",
    name: "weather-server",
    title: "Weather Server",
    author_name: "demo",
    description: "Live weather",
    tags: "weather,forecast",
    type: null,
    url: "https://example.com/weather",
  };
  const payload = JSON.stringify({
    pageProps: {
      projects: [serverRecord],
    },
  });
  const encoded = JSON.stringify(payload).slice(1, -1);
  const html = `<script>self.__next_f.push([1,\"${encoded}\"])</script>`;

  globalThis.fetch = (async () => new Response(html, { status: 200 })) as typeof fetch;
  try {
    const results = await searchMcpSoServers({
      baseUrl: "https://mcp.so",
      query: "weather",
      limit: 5,
    });
    assert.equal(results.length, 1);
    assert.equal(results[0].title, "Weather Server");
    assert.equal(results[0].slug, "weather-server/demo");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
