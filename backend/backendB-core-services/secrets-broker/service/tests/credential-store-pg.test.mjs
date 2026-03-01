import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { CredentialStorePg } from "../src/credential-store-pg.js";

const DATABASE_URL = process.env.DATABASE_URL;
const skip = !DATABASE_URL;

test("CredentialStorePg: mint stores hashed token, not plaintext", { skip }, async () => {
  const store = new CredentialStorePg();
  await store.initialize(DATABASE_URL);
  try {
    const cred = await store.mint("web_search", "app1", ["execute"], 60, "tester");
    assert.equal(typeof cred.token, "string");
    assert.ok(cred.token.length > 0);

    // Verify token is hashed in the DB
    const result = await store.pool.query(
      "SELECT token_hash FROM credentials WHERE credential_id = $1",
      [cred.credentialId]
    );
    const expectedHash = createHash("sha256").update(cred.token).digest("hex");
    assert.equal(result.rows[0].token_hash, expectedHash);
  } finally {
    await store.destroy();
  }
});

test("CredentialStorePg: mint, get, revoke, listActive", { skip }, async () => {
  const store = new CredentialStorePg();
  await store.initialize(DATABASE_URL);
  try {
    const cred = await store.mint("tool_a", "app2", ["read"], 120, "user1");
    assert.equal(cred.status, "active");

    const loaded = await store.get(cred.credentialId);
    assert.equal(loaded?.credentialId, cred.credentialId);
    assert.equal(loaded?.status, "active");

    const active = await store.listActive("app2", "tool_a");
    assert.ok(active.some((c) => c.credentialId === cred.credentialId));

    const revoked = await store.revoke(cred.credentialId);
    assert.equal(revoked, true);

    const afterRevoke = await store.listActive("app2", "tool_a");
    assert.ok(!afterRevoke.some((c) => c.credentialId === cred.credentialId));

    const loadedRevoked = await store.get(cred.credentialId);
    assert.equal(loadedRevoked?.status, "revoked");
  } finally {
    await store.destroy();
  }
});

test("CredentialStorePg: revoke non-existent returns false", { skip }, async () => {
  const store = new CredentialStorePg();
  await store.initialize(DATABASE_URL);
  try {
    const result = await store.revoke("non-existent-id");
    assert.equal(result, false);
  } finally {
    await store.destroy();
  }
});

test("CredentialStorePg: get returns undefined for missing credential", { skip }, async () => {
  const store = new CredentialStorePg();
  await store.initialize(DATABASE_URL);
  try {
    const result = await store.get("missing-id");
    assert.equal(result, undefined);
  } finally {
    await store.destroy();
  }
});

test("CredentialStorePg: expired credential is marked expired on get", { skip }, async () => {
  const store = new CredentialStorePg();
  await store.initialize(DATABASE_URL);
  try {
    // Mint with 1s TTL
    const cred = await store.mint("tool_b", "app3", [], 1, "user2");

    // Wait for expiry
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const loaded = await store.get(cred.credentialId);
    assert.equal(loaded?.status, "expired");
  } finally {
    await store.destroy();
  }
});
