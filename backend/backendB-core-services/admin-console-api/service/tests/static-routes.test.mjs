import assert from "node:assert/strict";
import test from "node:test";

import { createStaticRoutes } from "../src/static-routes.js";

test("admin static routes redirect root to landing", async () => {
  const app = createStaticRoutes();
  const response = await app.request("http://localhost/", {
    redirect: "manual",
  });

  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "/landing");
});

test("admin static routes require a session cookie for judge", async () => {
  const app = createStaticRoutes();
  const response = await app.request("http://localhost/judge", {
    redirect: "manual",
  });

  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "/landing?next=%2Fjudge");
});

test("admin static routes reject unsupported fruit asset types", async () => {
  const app = createStaticRoutes();
  const response = await app.request("http://localhost/fruits/secrets.txt");

  assert.equal(response.status, 415);
  assert.equal(await response.text(), "Unsupported file type");
});
