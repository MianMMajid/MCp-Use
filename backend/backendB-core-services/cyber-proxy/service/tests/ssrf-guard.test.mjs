import assert from "node:assert/strict";
import test from "node:test";

import { checkUrl, scanContent } from "../src/ssrf-guard.js";

test("checkUrl blocks invalid URLs and metadata endpoints", async () => {
  const invalid = await checkUrl("not-a-url", [], []);
  assert.equal(invalid.allowed, false);
  assert.equal(invalid.reason, "Invalid URL");

  const metadata = await checkUrl("http://169.254.169.254/latest/meta-data", [], []);
  assert.equal(metadata.allowed, false);
  assert.equal(metadata.reason, "Cloud metadata endpoint blocked");
});

test("checkUrl applies explicit blocklist before downstream dispatch", async () => {
  const blocked = await checkUrl("https://example.com/resource", [], ["example.com"]);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, "Domain on blocklist");
});

test("scanContent quarantines executable-like payloads and sanitizes HTML XSS", () => {
  const quarantined = scanContent(
    Buffer.from("MZ"),
    "application/octet-stream",
    "https://downloads.example.com/installer.exe"
  );
  assert.equal(quarantined.quarantined, true);
  assert.equal(quarantined.safe, false);
  assert.equal(quarantined.sanitized.length, 0);

  const html = scanContent(
    Buffer.from("<div>safe</div><script>alert('x')</script>"),
    "text/html",
    "https://docs.example.com/page"
  );
  assert.equal(html.quarantined, false);
  assert.equal(html.safe, false);
  assert.equal(html.sanitized.toString("utf8").includes("[sanitized]"), true);
});
