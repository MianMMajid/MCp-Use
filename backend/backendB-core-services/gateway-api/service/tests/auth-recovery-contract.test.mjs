import assert from "node:assert/strict";
import test from "node:test";

import { parseForgotPasswordRequest } from "../src/contracts/auth-recovery-contract.js";

test("parseForgotPasswordRequest accepts localhost http redirects for local dev", () => {
  const result = parseForgotPasswordRequest({
    email: "user@example.com",
    redirectUrl: "http://127.0.0.1:4102/reset-password",
  });
  assert.equal(result.ok, true);
});

test("parseForgotPasswordRequest still rejects non-https remote redirects", () => {
  const result = parseForgotPasswordRequest({
    email: "user@example.com",
    redirectUrl: "http://example.com/reset-password",
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /valid redirect URL/i);
});
