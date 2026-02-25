import assert from "node:assert/strict";
import test from "node:test";

import {
  assertGatewayStartupPolicy,
  database,
  initializeDatabase,
  sharedTraceStore,
  traceStore,
} from "../src/state.js";

function restoreEnv(key, value) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}

function suppressExpectedDbLogs() {
  const originalError = console.error;
  const originalWarn = console.warn;
  let failedInitLogs = 0;
  let degradedModeLogs = 0;

  console.error = (...args) => {
    const message = String(args[0] ?? "");
    if (message.startsWith("[DB] PostgreSQL initialization failed:")) {
      failedInitLogs += 1;
      return;
    }
    originalError(...args);
  };

  console.warn = (...args) => {
    const message = String(args[0] ?? "");
    if (message.startsWith("[DB] Continuing in degraded mode")) {
      degradedModeLogs += 1;
      return;
    }
    originalWarn(...args);
  };

  return {
    restore() {
      console.error = originalError;
      console.warn = originalWarn;
    },
    get failedInitLogs() {
      return failedInitLogs;
    },
    get degradedModeLogs() {
      return degradedModeLogs;
    },
  };
}

test("initializeDatabase fails closed by default when PostgreSQL initialization fails", async () => {
  const envBackup = process.env.MAPLE_ALLOW_DEGRADED_PERSISTENCE;
  const databaseInit = database.initialize;
  const traceInit = traceStore.init;
  const sharedTraceInit = sharedTraceStore.init;
  const logs = suppressExpectedDbLogs();

  try {
    process.env.MAPLE_ALLOW_DEGRADED_PERSISTENCE = "0";
    database.initialize = async () => {
      throw new Error("db down");
    };
    traceStore.init = async () => undefined;
    sharedTraceStore.init = async () => undefined;

    await assert.rejects(initializeDatabase(), /db down/);
    assert.equal(logs.failedInitLogs >= 1, true);
    assert.equal(logs.degradedModeLogs, 0);
  } finally {
    logs.restore();
    database.initialize = databaseInit;
    traceStore.init = traceInit;
    sharedTraceStore.init = sharedTraceInit;
    restoreEnv("MAPLE_ALLOW_DEGRADED_PERSISTENCE", envBackup);
  }
});

test("initializeDatabase allows degraded mode when explicitly enabled", async () => {
  const envBackup = process.env.MAPLE_ALLOW_DEGRADED_PERSISTENCE;
  const databaseInit = database.initialize;
  const traceInit = traceStore.init;
  const sharedTraceInit = sharedTraceStore.init;
  const logs = suppressExpectedDbLogs();

  try {
    process.env.MAPLE_ALLOW_DEGRADED_PERSISTENCE = "1";
    database.initialize = async () => {
      throw new Error("db down");
    };
    traceStore.init = async () => undefined;
    sharedTraceStore.init = async () => undefined;

    await assert.doesNotReject(initializeDatabase());
    assert.equal(logs.failedInitLogs >= 1, true);
    assert.equal(logs.degradedModeLogs >= 1, true);
  } finally {
    logs.restore();
    database.initialize = databaseInit;
    traceStore.init = traceInit;
    sharedTraceStore.init = sharedTraceInit;
    restoreEnv("MAPLE_ALLOW_DEGRADED_PERSISTENCE", envBackup);
  }
});

test("gateway startup policy rejects degraded persistence mode in production", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousAllowDegraded = process.env.MAPLE_ALLOW_DEGRADED_PERSISTENCE;
  process.env.NODE_ENV = "production";
  process.env.MAPLE_ALLOW_DEGRADED_PERSISTENCE = "1";

  try {
    assert.throws(
      () => assertGatewayStartupPolicy(),
      /MAPLE_ALLOW_DEGRADED_PERSISTENCE cannot be enabled in production runtime\./
    );
  } finally {
    restoreEnv("NODE_ENV", previousNodeEnv);
    restoreEnv("MAPLE_ALLOW_DEGRADED_PERSISTENCE", previousAllowDegraded);
  }
});
