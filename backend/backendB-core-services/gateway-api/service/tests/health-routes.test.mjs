import assert from "node:assert/strict";
import test from "node:test";

import { Hono } from "hono";
import { healthRoutes } from "../src/routes/health.js";

test("gateway health routes return live service metadata", async () => {
  const app = new Hono();
  app.route("/", healthRoutes);

  const health = await app.request("http://localhost/health");
  assert.equal(health.status, 200);
  const healthBody = await health.json();
  assert.equal(healthBody.status, "ok");
  assert.equal(healthBody.service, "gateway-api");
  assert.equal(typeof healthBody.timestamp, "string");

  const ready = await app.request("http://localhost/ready");
  assert.equal(ready.status, 200);
  const readyBody = await ready.json();
  assert.equal(readyBody.ready, true);
  assert.equal(readyBody.service, "gateway-api");
  assert.equal(typeof readyBody.generatedAt, "string");

  const capabilities = await app.request(
    "http://localhost/api/runtime/feature-capabilities"
  );
  assert.equal(capabilities.status, 200);
  const capabilityBody = await capabilities.json();
  assert.equal(capabilityBody.ok, true);
  assert.equal(capabilityBody.service, "gateway-api");
  assert.equal(typeof capabilityBody.features, "object");
});

test("gateway ready fails closed in production when required dependencies are missing", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  const app = new Hono();
  app.route("/", healthRoutes);

  try {
    const ready = await app.request("http://localhost/ready");
    assert.equal(ready.status, 503);
    const payload = await ready.json();
    assert.equal(payload.ready, false);
    assert.equal(Array.isArray(payload.failingDependencies), true);
    assert.equal(payload.failingDependencies.length > 0, true);
  } finally {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  }
});
