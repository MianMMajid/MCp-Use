import assert from "node:assert/strict";
import test from "node:test";

import { createApp } from "../src/app.js";

test("health and ready endpoints return business-api status", async () => {
  const { app } = await createApp({
    database: {
      initialize: async () => {},
      close: async () => {},
      pool: {
        query: async () => ({ rows: [{ "?column?": 1 }] }),
      },
    },
    skipDatabaseInit: true,
    manageDatabaseLifecycle: false,
  });

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
});
