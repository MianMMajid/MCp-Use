import assert from "node:assert/strict";
import test from "node:test";

import { Hono } from "hono";
import { createStaticRoutes } from "../src/static-routes.js";

test("admin static routes redirect root to template runtime landing", async () => {
  const app = new Hono();
  app.route("/", createStaticRoutes());

  const response = await app.request("http://localhost/");
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "http://127.0.0.1:4103/");
});

test("admin static routes redirect unauthenticated judge to template login", async () => {
  const app = new Hono();
  app.route("/", createStaticRoutes());

  const response = await app.request("http://localhost/judge");
  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("location"),
    "http://127.0.0.1:4103/login?next=http%3A%2F%2F127.0.0.1%3A4101%2F"
  );
});
