// Env setup before imports — required by @maple/common and config.js
process.env.MAPLE_LOG_LEVEL = process.env.MAPLE_LOG_LEVEL || "error";
process.env.MAPLE_LOG_REQUESTS = process.env.MAPLE_LOG_REQUESTS || "0";
process.env.MAPLE_LOG_INCLUDE_BODIES = process.env.MAPLE_LOG_INCLUDE_BODIES || "0";
process.env.MAPLE_LOG_BODY_MAX_CHARS = process.env.MAPLE_LOG_BODY_MAX_CHARS || "4000";
process.env.CYBER_PROXY_PORT = process.env.CYBER_PROXY_PORT || "8080";
process.env.CYBER_PROXY_HOST = process.env.CYBER_PROXY_HOST || "0.0.0.0";
process.env.AUDIT_WRITER_ADDRESS = process.env.AUDIT_WRITER_ADDRESS || "localhost:9400";
process.env.CYBER_ALLOWED_DOMAINS = process.env.CYBER_ALLOWED_DOMAINS || "*";
process.env.CYBER_BLOCKED_DOMAINS = process.env.CYBER_BLOCKED_DOMAINS || "none";
process.env.CYBER_TOOL_ALLOWED_DOMAINS_JSON = process.env.CYBER_TOOL_ALLOWED_DOMAINS_JSON || "{}";
process.env.CYBER_MAX_RESPONSE_BYTES = process.env.CYBER_MAX_RESPONSE_BYTES || "10485760";
process.env.CYBER_QUARANTINE_ENABLED = process.env.CYBER_QUARANTINE_ENABLED || "1";
process.env.NODE_ENV = "development";

import assert from "node:assert/strict";
import test from "node:test";

const { checkUrl, scanContent } = await import(`../src/ssrf-guard.js?t=${Date.now()}`);
const { createCyberProxyService } = await import(`../src/service.js?t=${Date.now()}`);

// ── checkUrl Tests ───────────────────────────────────────────────────────────

test("checkUrl: allows public URLs", async () => {
  const result = await checkUrl("https://example.com", [], []);
  assert.equal(result.allowed, true);
  assert.equal(result.reason, "OK");
});

test("checkUrl: blocks private IPs (10.x.x.x)", async () => {
  const result = await checkUrl("http://10.0.0.1/api", [], []);
  assert.equal(result.allowed, false);
  assert.equal(result.isPrivateIp, true);
});

test("checkUrl: blocks metadata endpoint 169.254.169.254", async () => {
  const result = await checkUrl("http://169.254.169.254/latest/meta-data", [], []);
  assert.equal(result.allowed, false);
  assert.ok(result.reason.includes("metadata"));
});

test("checkUrl: blocks localhost", async () => {
  const result = await checkUrl("http://localhost/api", [], []);
  assert.equal(result.allowed, false);
  assert.equal(result.isPrivateIp, true);
});

test("checkUrl: blocks domain on blocklist", async () => {
  const result = await checkUrl("https://evil.com/payload", [], ["evil.com"]);
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "Domain on blocklist");
});

test("checkUrl: rejects malformed URL", async () => {
  const result = await checkUrl("not-a-url", [], []);
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "Invalid URL");
});

// ── scanContent Tests ────────────────────────────────────────────────────────

test("scanContent: safe text content passes through", () => {
  const result = scanContent(Buffer.from("hello world"), "text/plain");
  assert.equal(result.safe, true);
  assert.equal(result.quarantined, false);
  assert.equal(result.threats.length, 0);
});

test("scanContent: detects XSS in HTML content", () => {
  const result = scanContent(
    Buffer.from("<div>hello</div><script>alert(1)</script>"),
    "text/html"
  );
  assert.equal(result.safe, false);
  assert.ok(result.threats.some(t => t.includes("XSS")));
  assert.equal(result.quarantined, false);
});

test("scanContent: quarantines executable content type", () => {
  const result = scanContent(Buffer.from("binary data"), "application/x-msdownload");
  assert.equal(result.quarantined, true);
  assert.equal(result.safe, false);
});

test("scanContent: detects PE executable magic bytes (MZ)", () => {
  const result = scanContent(
    Buffer.from([0x4d, 0x5a, 0x90, 0x00]),
    "application/octet-stream"
  );
  assert.equal(result.quarantined, true);
  assert.equal(result.safe, false);
});

test("scanContent: detects ZIP archive magic bytes", () => {
  const result = scanContent(
    Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]),
    "application/octet-stream"
  );
  assert.equal(result.quarantined, true);
  assert.equal(result.safe, false);
});

test("scanContent: sanitized output replaces XSS patterns", () => {
  const result = scanContent(
    Buffer.from("before<script>evil()</script>after"),
    "text/html"
  );
  assert.equal(result.safe, false);
  assert.ok(result.sanitized.toString("utf8").includes("[sanitized]"));
  assert.ok(!result.sanitized.toString("utf8").includes("<script>"));
});

// ── createCyberProxyService Test ─────────────────────────────────────────────

test("createCyberProxyService: returns gRPC server with correct interface", () => {
  const server = createCyberProxyService();
  assert.ok(server);
  assert.equal(typeof server.addService, "function");
  assert.equal(typeof server.bindAsync, "function");
  assert.equal(typeof server.forceShutdown, "function");
  server.forceShutdown();
});
