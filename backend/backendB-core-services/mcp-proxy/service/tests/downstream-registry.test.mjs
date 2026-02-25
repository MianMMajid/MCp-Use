import assert from "node:assert/strict";
import test from "node:test";

import { DownstreamRegistry } from "../src/downstream-registry.js";

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
