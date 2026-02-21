import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveSmitheryDeploymentUrl,
  toSmitheryDownstreamAppId,
  type SmitheryServerDetails,
} from "../src/integrations/smithery.js";

test("toSmitheryDownstreamAppId is deterministic and prefixed", () => {
  const a = toSmitheryDownstreamAppId("@upstash/context7-mcp");
  const b = toSmitheryDownstreamAppId("@upstash/context7-mcp");
  assert.equal(a, b);
  assert.match(a, /^smithery-[a-z0-9-]+$/);
});

test("resolveSmitheryDeploymentUrl prefers HTTP connection deploymentUrl", () => {
  const server: SmitheryServerDetails = {
    qualifiedName: "@org/server",
    deploymentUrl: "https://fallback.example.com/mcp",
    connections: [
      { type: "stdio" },
      { type: "http", deploymentUrl: "https://preferred.example.com/mcp" },
    ],
  };
  assert.equal(
    resolveSmitheryDeploymentUrl(server),
    "https://preferred.example.com/mcp"
  );
});

test("resolveSmitheryDeploymentUrl falls back to top-level deploymentUrl", () => {
  const server: SmitheryServerDetails = {
    qualifiedName: "@org/server",
    deploymentUrl: "https://fallback.example.com/mcp",
    connections: [{ type: "stdio" }],
  };
  assert.equal(
    resolveSmitheryDeploymentUrl(server),
    "https://fallback.example.com/mcp"
  );
});
