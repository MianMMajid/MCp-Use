import assert from "node:assert/strict";
import test from "node:test";

import {
  assertGatewayStartupPolicy,
  database,
  initializeDatabase,
  sharedTraceStore,
  traceStore,
} from "../src/state.js";

function suppressExpectedDbLogs() {
  const originalError = console.error;
  let failedInitLogs = 0;

  console.error = (...args) => {
    const message = String(args[0] ?? "");
    if (message.startsWith("[DB] PostgreSQL initialization failed:")) {
      failedInitLogs += 1;
      return;
    }
    originalError(...args);
  };

  return {
    restore() {
      console.error = originalError;
    },
    get failedInitLogs() {
      return failedInitLogs;
    },
  };
}

test("initializeDatabase fails closed when PostgreSQL initialization fails", async () => {
  const databaseInit = database.initialize;
  const traceInit = traceStore.init;
  const sharedTraceInit = sharedTraceStore.init;
  const logs = suppressExpectedDbLogs();

  try {
    database.initialize = async () => {
      throw new Error("db down");
    };
    traceStore.init = async () => undefined;
    sharedTraceStore.init = async () => undefined;

    await assert.rejects(initializeDatabase(), /db down/);
    assert.equal(logs.failedInitLogs >= 1, true);
  } finally {
    logs.restore();
    database.initialize = databaseInit;
    traceStore.init = traceInit;
    sharedTraceStore.init = sharedTraceInit;
  }
});

test("gateway startup policy remains fail-closed for persistence", () => {
  assert.doesNotThrow(() => assertGatewayStartupPolicy());
});
