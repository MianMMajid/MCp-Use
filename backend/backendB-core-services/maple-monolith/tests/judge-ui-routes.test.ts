import assert from "node:assert/strict";
import { test } from "node:test";
import { Hono } from "hono";

import { registerJudgeUiRoutes } from "../src/server/routes/judge-ui-routes.js";

test("judge UI routes serve landing assets and gate judge page by session", async () => {
  const app = new Hono();

  registerJudgeUiRoutes(app as any, {
    enabled: true,
    findRequestSession: (cookieHeader?: string) =>
      cookieHeader?.includes("maple_session=present") ? { id: "session-1" } : undefined,
    readTextAsset: async (filename) => `<html>${filename}</html>`,
    readBinaryAsset: async () => new Uint8Array([1, 2, 3]),
  });

  const landing = await app.request("http://localhost/landing");
  assert.equal(landing.status, 200);
  assert.equal(landing.headers.get("content-type"), "text/html; charset=utf-8");
  const landingBody = await landing.text();
  assert.equal(landingBody.includes("landing.html"), true);

  const redirect = await app.request("http://localhost/judge");
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get("location"), "/landing?next=%2Fjudge");

  const allowed = await app.request("http://localhost/judge", {
    headers: { cookie: "maple_session=present" },
  });
  assert.equal(allowed.status, 200);
  const allowedBody = await allowed.text();
  assert.equal(allowedBody.includes("judges.html"), true);

  const logo = await app.request("http://localhost/logo.png");
  assert.equal(logo.status, 200);
  assert.equal(logo.headers.get("content-type"), "image/png");
});
