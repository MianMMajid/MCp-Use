import assert from "node:assert/strict";
import test from "node:test";

import { createModelRouterService } from "../src/service.js";

test("model-router service factory returns a grpc server instance", () => {
  const server = createModelRouterService();

  assert.equal(typeof server.addService, "function");
  assert.equal(typeof server.bindAsync, "function");
  assert.equal(typeof server.forceShutdown, "function");

  server.forceShutdown();
});
