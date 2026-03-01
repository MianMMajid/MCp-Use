// Set required env vars before import (downstream-registry.js imports mcp-proxy config.js)
process.env.MAPLE_LOG_LEVEL = process.env.MAPLE_LOG_LEVEL || "error";
process.env.MAPLE_LOG_REQUESTS = process.env.MAPLE_LOG_REQUESTS || "0";
process.env.MAPLE_LOG_INCLUDE_BODIES = process.env.MAPLE_LOG_INCLUDE_BODIES || "0";
process.env.MAPLE_LOG_BODY_MAX_CHARS = process.env.MAPLE_LOG_BODY_MAX_CHARS || "4000";
process.env.MCP_PROXY_PORT = process.env.MCP_PROXY_PORT || "9200";
process.env.MCP_PROXY_HOST = process.env.MCP_PROXY_HOST || "0.0.0.0";
process.env.AUDIT_WRITER_ADDRESS = process.env.AUDIT_WRITER_ADDRESS || "localhost:9400";
process.env.CONTEXT_WALL_ADDRESS = process.env.CONTEXT_WALL_ADDRESS || "localhost:9000";
process.env.SECRETS_BROKER_ADDRESS = process.env.SECRETS_BROKER_ADDRESS || "localhost:9300";
process.env.TOOL_RUNNER_ADDRESS = process.env.TOOL_RUNNER_ADDRESS || "localhost:9250";
process.env.CYBER_PROXY_ADDRESS = process.env.CYBER_PROXY_ADDRESS || "localhost:8080";
process.env.DOWNSTREAM_APPS = process.env.DOWNSTREAM_APPS || "none";
process.env.MAPLE_DOWNSTREAM_APPS = process.env.MAPLE_DOWNSTREAM_APPS || "none";
process.env.MAPLE_TOOL_RUNNER_MODE = process.env.MAPLE_TOOL_RUNNER_MODE || "service";
process.env.MAPLE_TOOL_RUNNER_IMAGE = process.env.MAPLE_TOOL_RUNNER_IMAGE || "tool-runner:latest";
process.env.MAPLE_TOOL_RUNNER_JOB_NAMESPACE = process.env.MAPLE_TOOL_RUNNER_JOB_NAMESPACE || "maple-tools";

import assert from "node:assert/strict";
import test from "node:test";

// Use dynamic import so env vars are set before config.js is evaluated
const { DownstreamRegistry } = await import("../src/downstream-registry.js");

test("DownstreamRegistry filters disabled apps and returns normalized public tool map", () => {
  const registry = new DownstreamRegistry();

  registry.register({
    appId: "toolhub",
    name: "Toolhub",
    url: "https://toolhub.local/mcp",
    transport: "streamable-http",
    enabled: true,
    status: "connected",
    tools: [],
  });

  registry.register({
    appId: "disabled-app",
    name: "Disabled",
    url: "https://disabled.local/mcp",
    transport: "streamable-http",
    enabled: false,
    status: "disconnected",
    tools: [
      {
        name: "should_not_appear",
        description: "not listed",
      },
    ],
  });

  registry.setToolsForApp("toolhub", [
    {
      name: "web_search",
      description: "Search the web",
      inputSchema: { type: "object", properties: { query: { type: "string" } } },
    },
    {
      name: "",
      description: "invalid entry should be dropped",
    },
  ]);

  const enabledOnly = registry.list();
  assert.equal(enabledOnly.length, 1);
  assert.equal(enabledOnly[0].appId, "toolhub");

  const allApps = registry.list(true);
  assert.equal(allApps.length, 2);

  const tools = registry.getAllTools();
  assert.equal(tools.length, 1);
  assert.equal(tools[0].name, "web_search");
  assert.equal(tools[0].appId, "toolhub");
  assert.equal(typeof tools[0].inputSchema, "object");
});
