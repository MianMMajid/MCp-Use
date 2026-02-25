import assert from "node:assert/strict";
import test from "node:test";

import { Hono } from "hono";
import { createStaticRoutes } from "../src/static-routes.js";

test("admin static routes redirect root to landing", async () => {
  const app = new Hono();
  app.route("/", createStaticRoutes());

  const response = await app.request("http://localhost/");
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "/landing");
});
