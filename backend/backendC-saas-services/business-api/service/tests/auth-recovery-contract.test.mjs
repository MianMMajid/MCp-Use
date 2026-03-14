import assert from "node:assert/strict";
import test from "node:test";

import {
  AuthRecoveryContract,
  parseForgotPasswordRequest,
  parseResetPasswordRequest,
  parseVerifyEmailConfirmRequest,
  parseVerifyEmailRequest,
} from "../src/contracts/auth-recovery-contract.js";

test("parseForgotPasswordRequest normalizes email and accepts https redirect", () => {
  const parsed = parseForgotPasswordRequest({
    email: " User@Example.COM ",
    redirectUrl: "https://app.example.com/reset",
  });

  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.value, {
    email: "user@example.com",
    redirectUrl: "https://app.example.com/reset",
  });
});

test("parseForgotPasswordRequest rejects invalid email or non-https redirect", () => {
  const invalidEmail = parseForgotPasswordRequest({
    email: "not-an-email",
    redirectUrl: "https://app.example.com/reset",
  });
  assert.equal(invalidEmail.ok, false);

  const nonHttpsRedirect = parseForgotPasswordRequest({
    email: "user@example.com",
    redirectUrl: "http://app.example.com/reset",
  });
  assert.equal(nonHttpsRedirect.ok, false);
});

test("parseResetPasswordRequest enforces token and password minimum lengths", () => {
  const tooShort = parseResetPasswordRequest({
    token: "short",
    newPassword: "123",
  });
  assert.equal(tooShort.ok, false);

  const valid = parseResetPasswordRequest({
    token: "x".repeat(AuthRecoveryContract.MIN_TOKEN_LENGTH),
    newPassword: "y".repeat(AuthRecoveryContract.MIN_PASSWORD_LENGTH),
  });
  assert.equal(valid.ok, true);
});

test("parseVerifyEmailRequest validates email", () => {
  const invalid = parseVerifyEmailRequest({ email: "bad" });
  assert.equal(invalid.ok, false);

  const valid = parseVerifyEmailRequest({ email: "admin@example.com" });
  assert.equal(valid.ok, true);
  assert.equal(valid.value.email, "admin@example.com");
});

test("parseVerifyEmailConfirmRequest validates token", () => {
  const invalid = parseVerifyEmailConfirmRequest({ token: "small" });
  assert.equal(invalid.ok, false);

  const valid = parseVerifyEmailConfirmRequest({
    token: "t".repeat(AuthRecoveryContract.MIN_TOKEN_LENGTH),
  });
  assert.equal(valid.ok, true);
});
