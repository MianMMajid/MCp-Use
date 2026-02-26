import assert from "node:assert/strict";
import test from "node:test";

import { createToolRunnerService } from "../src/service.js";

test("tool-runner service factory returns a grpc server instance", () => {
  const server = createToolRunnerService();

  assert.equal(typeof server.addService, "function");
  assert.equal(typeof server.bindAsync, "function");
  assert.equal(typeof server.forceShutdown, "function");

  server.forceShutdown();
});
