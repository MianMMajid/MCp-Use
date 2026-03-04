import assert from "node:assert/strict";
import test from "node:test";
import { collectWarningViolations } from "../../../scripts/lib/frontend-warning-budget.mjs";

test("frontend warning budget parser ignores heading and self-status lines", () => {
  const log = `
# Check frontend warning budget
[frontend-warning-budget] OK: warning budget within allowlist.
`;

  const violations = collectWarningViolations(log);
  assert.equal(violations.length, 0);
});

test("frontend warning budget parser keeps non-allowlisted warnings", () => {
  const log = `
[WebServer] Warning: Unsupported feature gate
[WebServer] [maple] MAPLE_GATEWAY_ORIGIN is not set — defaulting to localhost for local development.
`;

  const violations = collectWarningViolations(log);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /Unsupported feature gate/i);
});
