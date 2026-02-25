import assert from "node:assert/strict";
import test from "node:test";

import { database, initializeDatabase, sharedTraceStore, traceStore } from "../src/state.js";

function restoreEnv(key, value) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}

test("initializeDatabase fails closed by default when PostgreSQL initialization fails", async () => {
  const envBackup = process.env.MAPLE_ALLOW_DEGRADED_PERSISTENCE;
  const databaseInit = database.initialize;
  const traceInit = traceStore.init;
  const sharedTraceInit = sharedTraceStore.init;

  try {
    process.env.MAPLE_ALLOW_DEGRADED_PERSISTENCE = "0";
    database.initialize = async () => {
      throw new Error("db down");
    };
    traceStore.init = async () => undefined;
    sharedTraceStore.init = async () => undefined;

    await assert.rejects(initializeDatabase(), /db down/);
  } finally {
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

  try {
    process.env.MAPLE_ALLOW_DEGRADED_PERSISTENCE = "1";
    database.initialize = async () => {
      throw new Error("db down");
    };
    traceStore.init = async () => undefined;
    sharedTraceStore.init = async () => undefined;

    await assert.doesNotReject(initializeDatabase());
  } finally {
    database.initialize = databaseInit;
    traceStore.init = traceInit;
    sharedTraceStore.init = sharedTraceInit;
    restoreEnv("MAPLE_ALLOW_DEGRADED_PERSISTENCE", envBackup);
  }
});
