import test from "node:test";
import assert from "node:assert/strict";
import { MaplePostgresDatabase } from "../src/persistence/pg-db.js";
import { hashPassword, verifyPassword } from "../src/security/password-auth.js";
import type { Trace } from "../src/core/types.js";

// These tests require a running PostgreSQL instance.
// Set DATABASE_URL or MAPLE_TEST_DATABASE_URL to run them.
// They are skipped if no database URL is available.

const testDbUrl =
  process.env.MAPLE_TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "";

const skip = !testDbUrl;

test("MaplePostgresDatabase persists trace payloads", { skip }, async () => {
  const db = new MaplePostgresDatabase(testDbUrl);
  await db.initialize();

  const now = new Date().toISOString();
  const trace: Trace = {
    id: `trace-pg-test-${Date.now()}`,
    sessionId: `session-pg-test-${Date.now()}`,
    source: "manual",
    status: "active",
    startedAt: now,
    updatedAt: now,
    steps: [],
  };

  await db.upsertTrace(trace);
  const loaded = await db.loadTraces(10);
  assert.equal(loaded.some((entry) => entry.id === trace.id), true);

  // Cleanup
  await db.removeTrace(trace.id);
  await db.close();
});

test("MaplePostgresDatabase supports user/session auth records", { skip }, async () => {
  const db = new MaplePostgresDatabase(testDbUrl);
  await db.initialize();

  const uniqueSuffix = Date.now().toString(36);
  const password = "strong-password-123";
  const user = await db.createUser({
    username: `testuser_${uniqueSuffix}`,
    email: `test_${uniqueSuffix}@example.com`,
    passwordHash: hashPassword(password),
  });

  const fetched = await db.findUserByUsername(`TESTUSER_${uniqueSuffix}`);
  assert.ok(fetched);
  assert.equal(verifyPassword(password, fetched.passwordHash), true);

  const session = await db.createSession(user.id, 3600);
  const active = await db.findActiveSession(session.id);
  assert.ok(active);
  assert.equal(active.user.username, `testuser_${uniqueSuffix}`);

  // Cleanup
  await db.revokeSession(session.id);
  await db.close();
});

test("MaplePostgresDatabase syncs admin password by username", { skip }, async () => {
  const db = new MaplePostgresDatabase(testDbUrl);
  await db.initialize();

  const uniqueSuffix = Date.now().toString(36);
  const username = `admin_sync_${uniqueSuffix}`;

  const created = await db.syncUserPasswordByUsername({
    username,
    email: `admin_sync_${uniqueSuffix}@example.com`,
    passwordHash: hashPassword("first-pass"),
  });
  assert.equal(created.username, username);
  assert.equal(verifyPassword("first-pass", created.passwordHash), true);

  const updated = await db.syncUserPasswordByUsername({
    username: username.toUpperCase(),
    passwordHash: hashPassword("second-pass"),
  });
  assert.equal(updated.id, created.id);
  assert.equal(verifyPassword("second-pass", updated.passwordHash), true);

  await db.close();
});
