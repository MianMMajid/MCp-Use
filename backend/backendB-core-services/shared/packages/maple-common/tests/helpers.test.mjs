import test from "node:test";
import assert from "node:assert/strict";

import {
  isPrivateOrLocalHost,
  asString,
  asNumber,
  asBoolean,
  asObject,
  asStringArray,
  asStringRecord,
  envValue,
  parseAppIdList,
  dedupeBy,
  jsonRpcErrorPayload,
  truncateText,
  compactUnknown,
  extractFirstUrl,
  extractLikelyCommand,
  sanitizeSessionId,
  withAbortTimeout,
  buildUrlWithQueryParams,
} from "../src/helpers.js";

// ---------------------------------------------------------------------------
// isPrivateOrLocalHost
// ---------------------------------------------------------------------------

test("isPrivateOrLocalHost: 10.0.0.1 is private", () => {
  assert.equal(isPrivateOrLocalHost("10.0.0.1"), true);
});

test("isPrivateOrLocalHost: 127.0.0.1 is loopback", () => {
  assert.equal(isPrivateOrLocalHost("127.0.0.1"), true);
});

test("isPrivateOrLocalHost: 172.16.0.1 is private", () => {
  assert.equal(isPrivateOrLocalHost("172.16.0.1"), true);
});

test("isPrivateOrLocalHost: 172.32.0.1 is public", () => {
  assert.equal(isPrivateOrLocalHost("172.32.0.1"), false);
});

test("isPrivateOrLocalHost: 192.168.1.1 is private", () => {
  assert.equal(isPrivateOrLocalHost("192.168.1.1"), true);
});

test("isPrivateOrLocalHost: 169.254.1.1 is link-local", () => {
  assert.equal(isPrivateOrLocalHost("169.254.1.1"), true);
});

test("isPrivateOrLocalHost: 8.8.8.8 is public", () => {
  assert.equal(isPrivateOrLocalHost("8.8.8.8"), false);
});

test("isPrivateOrLocalHost: ::1 is IPv6 loopback", () => {
  assert.equal(isPrivateOrLocalHost("::1"), true);
});

test("isPrivateOrLocalHost: fe80::1 is IPv6 link-local", () => {
  assert.equal(isPrivateOrLocalHost("fe80::1"), true);
});

test("isPrivateOrLocalHost: fd00::1 is IPv6 unique-local", () => {
  assert.equal(isPrivateOrLocalHost("fd00::1"), true);
});

test("isPrivateOrLocalHost: localhost returns true", () => {
  assert.equal(isPrivateOrLocalHost("localhost"), true);
});

test("isPrivateOrLocalHost: app.local returns true", () => {
  assert.equal(isPrivateOrLocalHost("app.local"), true);
});

test("isPrivateOrLocalHost: example.com is public", () => {
  assert.equal(isPrivateOrLocalHost("example.com"), false);
});

test("isPrivateOrLocalHost: 224.0.0.1 multicast is private", () => {
  assert.equal(isPrivateOrLocalHost("224.0.0.1"), true);
});

// ---------------------------------------------------------------------------
// asString
// ---------------------------------------------------------------------------

test("asString: returns trimmed string", () => {
  assert.equal(asString("hello"), "hello");
});

test("asString: whitespace-only returns undefined", () => {
  assert.equal(asString(" "), undefined);
});

test("asString: number returns undefined", () => {
  assert.equal(asString(123), undefined);
});

test("asString: empty string returns undefined", () => {
  assert.equal(asString(""), undefined);
});

// ---------------------------------------------------------------------------
// asNumber
// ---------------------------------------------------------------------------

test("asNumber: string '42' returns 42", () => {
  assert.equal(asNumber("42"), 42);
});

test("asNumber: string 'abc' returns undefined", () => {
  assert.equal(asNumber("abc"), undefined);
});

test("asNumber: float 3.14 returns 3.14", () => {
  assert.equal(asNumber(3.14), 3.14);
});

test("asNumber: NaN returns undefined", () => {
  assert.equal(asNumber(NaN), undefined);
});

test("asNumber: Infinity returns undefined", () => {
  assert.equal(asNumber(Infinity), undefined);
});

// ---------------------------------------------------------------------------
// asBoolean
// ---------------------------------------------------------------------------

test("asBoolean: true returns true", () => {
  assert.equal(asBoolean(true, false), true);
});

test("asBoolean: false returns false", () => {
  assert.equal(asBoolean(false, true), false);
});

test("asBoolean: non-boolean returns fallback", () => {
  assert.equal(asBoolean("yes", false), false);
});

// ---------------------------------------------------------------------------
// asObject
// ---------------------------------------------------------------------------

test("asObject: plain object returns same", () => {
  assert.deepEqual(asObject({ a: 1 }), { a: 1 });
});

test("asObject: null returns empty object", () => {
  assert.deepEqual(asObject(null), {});
});

test("asObject: array returns empty object", () => {
  assert.deepEqual(asObject([]), {});
});

test("asObject: string returns empty object", () => {
  assert.deepEqual(asObject("str"), {});
});

// ---------------------------------------------------------------------------
// asStringArray
// ---------------------------------------------------------------------------

test("asStringArray: filters non-strings and trims", () => {
  assert.deepEqual(asStringArray(["a", " b ", "", 123]), ["a", "b"]);
});

// ---------------------------------------------------------------------------
// asStringRecord
// ---------------------------------------------------------------------------

test("asStringRecord: drops empty values and non-strings", () => {
  assert.deepEqual(asStringRecord({ a: "1", b: " ", c: 3 }), { a: "1" });
});

// ---------------------------------------------------------------------------
// envValue
// ---------------------------------------------------------------------------

test("envValue: strips double quotes", () => {
  assert.equal(envValue('"hello"'), "hello");
});

test("envValue: strips single quotes", () => {
  assert.equal(envValue("'world'"), "world");
});

test("envValue: plain value unchanged", () => {
  assert.equal(envValue("plain"), "plain");
});

// ---------------------------------------------------------------------------
// parseAppIdList
// ---------------------------------------------------------------------------

test("parseAppIdList: comma-separated string deduped", () => {
  assert.deepEqual(parseAppIdList("a,b,a,c"), ["a", "b", "c"]);
});

test("parseAppIdList: array input trimmed", () => {
  assert.deepEqual(parseAppIdList(["x", " y "]), ["x", "y"]);
});

// ---------------------------------------------------------------------------
// dedupeBy
// ---------------------------------------------------------------------------

test("dedupeBy: removes duplicates by key function", () => {
  const input = [{ n: "a" }, { n: "b" }, { n: "a" }];
  const result = dedupeBy(input, (e) => e.n);
  assert.deepEqual(result, [{ n: "a" }, { n: "b" }]);
});

// ---------------------------------------------------------------------------
// jsonRpcErrorPayload
// ---------------------------------------------------------------------------

test("jsonRpcErrorPayload: returns well-formed error object", () => {
  const result = jsonRpcErrorPayload("req-1", -32600, "Invalid request");
  assert.equal(result.jsonrpc, "2.0");
  assert.equal(result.id, "req-1");
  assert.equal(result.error.code, -32600);
  assert.equal(result.error.message, "Invalid request");
});

// ---------------------------------------------------------------------------
// truncateText
// ---------------------------------------------------------------------------

test("truncateText: short string returned as-is", () => {
  assert.equal(truncateText("hello", 100), "hello");
});

test("truncateText: long string truncated with ellipsis", () => {
  const long = "a".repeat(200);
  const result = truncateText(long, 50);
  assert.equal(result.length, 50);
  assert.ok(result.endsWith("..."));
});

// ---------------------------------------------------------------------------
// compactUnknown
// ---------------------------------------------------------------------------

test("compactUnknown: small value returned as-is", () => {
  const value = { key: "val" };
  assert.deepEqual(compactUnknown(value), value);
});

test("compactUnknown: large value returns truncated envelope", () => {
  const large = { data: "x".repeat(30_000) };
  const result = compactUnknown(large, 1000);
  assert.equal(result.truncated, true);
  assert.ok(typeof result.preview === "string");
});

// ---------------------------------------------------------------------------
// extractFirstUrl
// ---------------------------------------------------------------------------

test("extractFirstUrl: extracts URL from text", () => {
  assert.equal(extractFirstUrl("visit https://example.com today"), "https://example.com");
});

test("extractFirstUrl: no links returns undefined", () => {
  assert.equal(extractFirstUrl("no links here"), undefined);
});

// ---------------------------------------------------------------------------
// extractLikelyCommand
// ---------------------------------------------------------------------------

test("extractLikelyCommand: fenced code block", () => {
  const input = "```bash\ncurl https://api.example.com\n```";
  assert.equal(extractLikelyCommand(input), "curl https://api.example.com");
});

test("extractLikelyCommand: bare command line", () => {
  assert.equal(extractLikelyCommand("npm install foo"), "npm install foo");
});

// ---------------------------------------------------------------------------
// sanitizeSessionId
// ---------------------------------------------------------------------------

test("sanitizeSessionId: replaces special chars and collapses dashes", () => {
  const result = sanitizeSessionId("hello world!@#");
  // [^a-zA-Z0-9._:-] → "-", then -+ → "-"
  assert.equal(result, "hello-world-");
});

test("sanitizeSessionId: max 96 chars", () => {
  const long = "a".repeat(200);
  const result = sanitizeSessionId(long);
  assert.ok(result.length <= 96);
});

// ---------------------------------------------------------------------------
// withAbortTimeout
// ---------------------------------------------------------------------------

test("withAbortTimeout: resolves before timeout", async () => {
  const result = await withAbortTimeout(1000, async () => "done");
  assert.equal(result, "done");
});

test("withAbortTimeout: aborts on timeout", async () => {
  await assert.rejects(
    () =>
      withAbortTimeout(50, (signal) => {
        return new Promise((resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")));
        });
      }),
    /aborted/
  );
});

// ---------------------------------------------------------------------------
// buildUrlWithQueryParams
// ---------------------------------------------------------------------------

test("buildUrlWithQueryParams: appends query params", () => {
  const result = buildUrlWithQueryParams("https://example.com", { foo: "bar" });
  assert.equal(result, "https://example.com/?foo=bar");
});
