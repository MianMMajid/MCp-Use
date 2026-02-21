import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MapleSqliteDatabase } from "../src/persistence/sqlite-db.js";
import { hashPassword, verifyPassword } from "../src/security/password-auth.js";
import type { Trace } from "../src/core/types.js";

test("MapleSqliteDatabase persists trace payloads", () => {
  const dir = mkdtempSync(join(tmpdir(), "maple-db-test-"));
  const dbPath = join(dir, "maple.sqlite");
  const db = new MapleSqliteDatabase(dbPath);

  const now = new Date().toISOString();
  const trace: Trace = {
    id: "trace-db-1",
    sessionId: "session-db-1",
    source: "manual",
    status: "active",
    startedAt: now,
    updatedAt: now,
    steps: [],
  };

  db.upsertTrace(trace);
  const loaded = db.loadTraces(10);
  assert.equal(loaded.some((entry) => entry.id === trace.id), true);
});

test("MapleSqliteDatabase supports user/session auth records", () => {
  const dir = mkdtempSync(join(tmpdir(), "maple-auth-test-"));
  const dbPath = join(dir, "maple.sqlite");
  const db = new MapleSqliteDatabase(dbPath);

  const password = "strong-password-123";
  const user = db.createUser({
    username: "omar",
    email: "omar@example.com",
    passwordHash: hashPassword(password),
  });

  const fetched = db.findUserByUsername("OMAR");
  assert.ok(fetched);
  assert.equal(verifyPassword(password, fetched.passwordHash), true);

  const session = db.createSession(user.id, 3600);
  const active = db.findActiveSession(session.id);
  assert.ok(active);
  assert.equal(active.user.username, "omar");
});

test("MapleSqliteDatabase syncs admin password by username", () => {
  const dir = mkdtempSync(join(tmpdir(), "maple-auth-sync-test-"));
  const dbPath = join(dir, "maple.sqlite");
  const db = new MapleSqliteDatabase(dbPath);

  const created = db.syncUserPasswordByUsername({
    username: "admin",
    email: "admin@example.com",
    passwordHash: hashPassword("first-pass"),
  });
  assert.equal(created.username, "admin");
  assert.equal(db.countUsers(), 1);
  assert.equal(verifyPassword("first-pass", created.passwordHash), true);

  const updated = db.syncUserPasswordByUsername({
    username: "ADMIN",
    passwordHash: hashPassword("second-pass"),
  });
  assert.equal(updated.id, created.id);
  assert.equal(db.countUsers(), 1);
  assert.equal(verifyPassword("second-pass", updated.passwordHash), true);
});
