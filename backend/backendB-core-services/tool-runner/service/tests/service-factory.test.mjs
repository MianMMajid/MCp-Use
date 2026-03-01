// Set required env vars before import (service.js imports tool-runner config.js)
process.env.MAPLE_LOG_LEVEL = process.env.MAPLE_LOG_LEVEL || "error";
process.env.MAPLE_LOG_REQUESTS = process.env.MAPLE_LOG_REQUESTS || "0";
process.env.MAPLE_LOG_INCLUDE_BODIES = process.env.MAPLE_LOG_INCLUDE_BODIES || "0";
process.env.MAPLE_LOG_BODY_MAX_CHARS = process.env.MAPLE_LOG_BODY_MAX_CHARS || "4000";
process.env.TOOL_RUNNER_PORT = process.env.TOOL_RUNNER_PORT || "9250";
process.env.TOOL_RUNNER_HOST = process.env.TOOL_RUNNER_HOST || "0.0.0.0";
process.env.CYBER_PROXY_ADDRESS = process.env.CYBER_PROXY_ADDRESS || "localhost:8080";
process.env.AUDIT_WRITER_ADDRESS = process.env.AUDIT_WRITER_ADDRESS || "localhost:9400";

import assert from "node:assert/strict";
import test from "node:test";

// Use dynamic import so env vars are set before config.js is evaluated
const { createToolRunnerService } = await import("../src/service.js");

test("tool-runner service factory returns a grpc server instance", () => {
  const server = createToolRunnerService();

  assert.equal(typeof server.addService, "function");
  assert.equal(typeof server.bindAsync, "function");
  assert.equal(typeof server.forceShutdown, "function");

  server.forceShutdown();
});
