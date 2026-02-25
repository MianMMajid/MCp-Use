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
});
