import assert from "node:assert/strict";
import test from "node:test";

import { Hono } from "hono";
import { registerHealthRoutes } from "../src/routes/health-routes.js";

test("health and ready endpoints return business-api status", async () => {
  const app = new Hono();
  registerHealthRoutes(app);

  const healthResponse = await app.request("http://localhost/health");
  assert.equal(healthResponse.status, 200);
  const health = await healthResponse.json();
  assert.equal(health.status, "ok");
  assert.equal(health.service, "business-api");

  const readyResponse = await app.request("http://localhost/ready");
  assert.equal(readyResponse.status, 200);
  const ready = await readyResponse.json();
  assert.equal(ready.ready, true);
  assert.equal(ready.service, "business-api");
  assert.equal(typeof ready.generatedAt, "string");
});

test("business ready fails closed in production when required deps are missing", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousStripeSecret = process.env.STRIPE_SECRET_KEY;
  const previousStripeWebhook = process.env.STRIPE_WEBHOOK_SECRET;
  const previousGoogleClientId = process.env.GOOGLE_CLIENT_ID;
  process.env.NODE_ENV = "production";
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.GOOGLE_CLIENT_ID;

  const app = new Hono();
  registerHealthRoutes(app);

  try {
    const readyResponse = await app.request("http://localhost/ready");
    assert.equal(readyResponse.status, 503);
    const ready = await readyResponse.json();
    assert.equal(ready.ready, false);
    assert.equal(Array.isArray(ready.failingDependencies), true);
    assert.equal(ready.failingDependencies.length > 0, true);
  } finally {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
    if (previousStripeSecret === undefined) {
      delete process.env.STRIPE_SECRET_KEY;
    } else {
      process.env.STRIPE_SECRET_KEY = previousStripeSecret;
    }
    if (previousStripeWebhook === undefined) {
      delete process.env.STRIPE_WEBHOOK_SECRET;
    } else {
      process.env.STRIPE_WEBHOOK_SECRET = previousStripeWebhook;
    }
    if (previousGoogleClientId === undefined) {
      delete process.env.GOOGLE_CLIENT_ID;
    } else {
      process.env.GOOGLE_CLIENT_ID = previousGoogleClientId;
    }
  }
});
