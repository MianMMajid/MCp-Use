import test from "node:test";
import assert from "node:assert/strict";

const { hashPassword, verifyPassword } = await import(
  `../src/password-auth.js?t=${Date.now()}`
);

// ── Hash format ──────────────────────────────────────────────────────────────

test("Hash format starts with 'scrypt:'", async () => {
  const hash = hashPassword("my-secure-password");
  assert.ok(hash.startsWith("scrypt:"), `Expected scrypt: prefix, got: ${hash.slice(0, 20)}`);
});

test("Hash contains three colon-separated parts (scheme:salt:derived)", async () => {
  const hash = hashPassword("test-password");
  const parts = hash.split(":");
  assert.equal(parts.length, 3, "Expected scheme:salt:derived format");
  assert.equal(parts[0], "scrypt");
  assert.ok(parts[1].length > 0, "Salt must be non-empty");
  assert.ok(parts[2].length > 0, "Derived key must be non-empty");
});

// ── Random salt ──────────────────────────────────────────────────────────────

test("Same password hashes differently (random salt)", async () => {
  const hash1 = hashPassword("identical-password");
  const hash2 = hashPassword("identical-password");
  assert.notEqual(hash1, hash2, "Two hashes of the same password must differ due to random salt");
});

// ── Verification ─────────────────────────────────────────────────────────────

test("Correct password verifies true", async () => {
  const password = "correct-horse-battery-staple";
  const hash = hashPassword(password);
  const result = verifyPassword(password, hash);
  assert.equal(result, true);
});

test("Wrong password verifies false", async () => {
  const hash = hashPassword("real-password");
  const result = verifyPassword("wrong-password", hash);
  assert.equal(result, false);
});

test("Verify with empty storedHash returns false", async () => {
  const result = verifyPassword("password", "");
  assert.equal(result, false);
});

test("Verify with malformed storedHash returns false", async () => {
  const result = verifyPassword("password", "not-a-valid-hash");
  assert.equal(result, false);
});

// ── Empty password ───────────────────────────────────────────────────────────

test("Empty password throws", async () => {
  assert.throws(() => hashPassword(""), /Password is required/);
});

test("Whitespace-only password throws", async () => {
  assert.throws(() => hashPassword("   "), /Password is required/);
});
