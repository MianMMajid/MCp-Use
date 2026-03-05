import test from "node:test";
import assert from "node:assert/strict";

import { wrapExternalLinks } from "../src/safe-redirect.js";

// ---------------------------------------------------------------------------
// wrapExternalLinks
// ---------------------------------------------------------------------------

test("wrapExternalLinks: external URL rewritten through redirect", () => {
  const result = wrapExternalLinks("visit https://evil.com", "https://app.com");
  assert.equal(
    result,
    "visit https://app.com/api/redirect?url=https%3A%2F%2Fevil.com"
  );
});

test("wrapExternalLinks: internal URL preserved", () => {
  const result = wrapExternalLinks("see https://app.com/page", "https://app.com");
  assert.equal(result, "see https://app.com/page");
});

test("wrapExternalLinks: multiple external links rewritten", () => {
  const input = "click https://evil.com and https://bad.org";
  const result = wrapExternalLinks(input, "https://app.com");
  assert.ok(result.includes("https://app.com/api/redirect?url=https%3A%2F%2Fevil.com"));
  assert.ok(result.includes("https://app.com/api/redirect?url=https%3A%2F%2Fbad.org"));
});

test("wrapExternalLinks: no links unchanged", () => {
  assert.equal(wrapExternalLinks("hello world", "https://app.com"), "hello world");
});

test("wrapExternalLinks: malformed base URL returns original text", () => {
  assert.equal(
    wrapExternalLinks("visit https://evil.com", "not-a-url"),
    "visit https://evil.com"
  );
});
