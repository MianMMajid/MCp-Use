// Set required env vars before import (ssrf-guard.js imports cyber-proxy config.js)
process.env.MAPLE_LOG_LEVEL = process.env.MAPLE_LOG_LEVEL || "error";
process.env.MAPLE_LOG_REQUESTS = process.env.MAPLE_LOG_REQUESTS || "0";
process.env.MAPLE_LOG_INCLUDE_BODIES = process.env.MAPLE_LOG_INCLUDE_BODIES || "0";
process.env.MAPLE_LOG_BODY_MAX_CHARS = process.env.MAPLE_LOG_BODY_MAX_CHARS || "4000";
process.env.CYBER_PROXY_PORT = process.env.CYBER_PROXY_PORT || "8080";
process.env.CYBER_PROXY_HOST = process.env.CYBER_PROXY_HOST || "0.0.0.0";
process.env.AUDIT_WRITER_ADDRESS = process.env.AUDIT_WRITER_ADDRESS || "localhost:9400";
process.env.CYBER_ALLOWED_DOMAINS = process.env.CYBER_ALLOWED_DOMAINS || "example.com";
process.env.CYBER_BLOCKED_DOMAINS = process.env.CYBER_BLOCKED_DOMAINS || "evil.com";
process.env.CYBER_TOOL_ALLOWED_DOMAINS_JSON = process.env.CYBER_TOOL_ALLOWED_DOMAINS_JSON || "{}";
process.env.CYBER_MAX_RESPONSE_BYTES = process.env.CYBER_MAX_RESPONSE_BYTES || "10485760";
process.env.CYBER_QUARANTINE_ENABLED = process.env.CYBER_QUARANTINE_ENABLED || "1";

import assert from "node:assert/strict";
import test from "node:test";

// Use dynamic import so env vars are set before config.js is evaluated
const { checkUrl, scanContent } = await import("../src/ssrf-guard.js");

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
