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
process.env.CYBER_ALLOW_LOCAL_TARGETS = process.env.CYBER_ALLOW_LOCAL_TARGETS || "0";
process.env.CYBER_ALLOWED_LOCAL_HOSTS = process.env.CYBER_ALLOWED_LOCAL_HOSTS || "";
process.env.CYBER_MAX_RESPONSE_BYTES = process.env.CYBER_MAX_RESPONSE_BYTES || "10485760";
process.env.CYBER_QUARANTINE_ENABLED = process.env.CYBER_QUARANTINE_ENABLED || "1";
process.env.NODE_ENV = "development";

import assert from "node:assert/strict";
import test from "node:test";

const { checkUrl, scanContent } = await import(`../src/ssrf-guard.js?t=${Date.now()}`);
const { createCyberProxyService, _internal } = await import(`../src/service.js?t=${Date.now()}`);
const {
  buildLocalScanResult,
  scanDownloadedContent,
} = await import(`../../../shared/packages/maple-security/src/download-scan.js?t=${Date.now()}`);

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

test("checkUrl: allows explicitly permitted local targets in dev mode", async () => {
  process.env.CYBER_ALLOW_LOCAL_TARGETS = "1";
  process.env.CYBER_ALLOWED_LOCAL_HOSTS = "localhost,127.0.0.1";
  const { checkUrl: allowLocalCheckUrl } = await import(`../src/ssrf-guard.js?t=${Date.now()}`);
  const result = await allowLocalCheckUrl("http://localhost/api", [], []);
  assert.equal(result.allowed, true);
  assert.equal(result.reason, "Allowed local target");
  process.env.CYBER_ALLOW_LOCAL_TARGETS = "0";
  process.env.CYBER_ALLOWED_LOCAL_HOSTS = "";
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

test("scanDownloadedContent: local provider returns persisted scan metadata", async () => {
  const scan = await scanDownloadedContent({
    provider: "local",
    content: Buffer.from('{"hello":"world"}'),
    contentType: "application/json",
    filename: "payload.json",
    localResult: buildLocalScanResult({
      threats: [],
      quarantined: false,
    }),
  });

  assert.equal(scan.provider, "local");
  assert.equal(scan.status, "completed");
  assert.equal(scan.verdict, "safe");
  assert.equal(scan.blocked, false);
  assert.equal(scan.quarantined, false);
  assert.equal(scan.contentType, "application/json");
  assert.equal(scan.sizeBytes > 0, true);
  assert.match(scan.sha256, /^[a-f0-9]{64}$/);
});

test("scanDownloadedContent: virustotal provider stays hash-only by default on lookup miss", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), method: String(options.method || "GET") });
    if (String(url).includes("/files/") && String(options.method || "GET") === "GET") {
      return new Response(JSON.stringify({ error: { code: "NotFoundError" } }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
    if (String(url).endsWith("/files")) {
      return new Response(JSON.stringify({ data: { id: "analysis-1" } }), {
        status: 202,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch url: ${url}`);
  };

  try {
    const scan = await scanDownloadedContent({
      provider: "virustotal",
      virustotalApiKey: "vt-test-key",
      virustotalApiUrl: "https://vt.example/api/v3",
      content: Buffer.from("download bytes"),
      contentType: "application/octet-stream",
      filename: "download.bin",
      localResult: buildLocalScanResult({
        threats: [],
        quarantined: false,
      }),
    });

    assert.equal(scan.provider, "virustotal");
    assert.equal(scan.status, "completed");
    assert.equal(scan.stage, "final_verdict");
    assert.equal(scan.quarantined, false);
    assert.equal(scan.blocked, false);
    assert.equal(scan.reasons.includes("VirusTotal hash lookup miss; sample upload disabled"), true);
    assert.equal(scan.analysis?.reputation?.lookupMiss, true);
    assert.equal(scan.analysis?.reputation?.uploaded, false);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /^https:\/\/vt\.example\/api\/v3\/files\/[a-f0-9]{64}$/);
    assert.equal(calls[0].method, "GET");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("scanDownloadedContent: virustotal upload fallback can be explicitly enabled", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), method: String(options.method || "GET") });
    if (String(url).includes("/files/") && String(options.method || "GET") === "GET") {
      return new Response(JSON.stringify({ error: { code: "NotFoundError" } }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
    if (String(url).endsWith("/files")) {
      return new Response(JSON.stringify({ data: { id: "analysis-2" } }), {
        status: 202,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch url: ${url}`);
  };

  try {
    const scan = await scanDownloadedContent({
      provider: "virustotal",
      virustotalApiKey: "vt-test-key",
      virustotalApiUrl: "https://vt.example/api/v3",
      virustotalUploadFallback: true,
      content: Buffer.from("eicar-like"),
      contentType: "application/octet-stream",
      filename: "eicar.com.txt",
      localResult: buildLocalScanResult({
        threats: ["eicar_test_file"],
        quarantined: true,
        quarantineReason: "EICAR test signature detected",
      }),
    });

    assert.equal(scan.provider, "virustotal");
    assert.equal(scan.status, "completed");
    assert.equal(scan.stage, "analysis_pending");
    assert.equal(scan.verdict, "quarantined");
    assert.equal(scan.quarantined, true);
    assert.equal(scan.blocked, true);
    assert.equal(scan.reasons.includes("VirusTotal analysis queued"), true);
    assert.equal(scan.reasons.includes("EICAR test signature detected"), true);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].url, "https://vt.example/api/v3/files");
    assert.equal(calls[1].method, "POST");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("scanDownloadedContent: virustotal upload fallback stays disabled for non-allowlisted sources", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), method: String(options.method || "GET") });
    if (String(url).includes("/files/") && String(options.method || "GET") === "GET") {
      return new Response(JSON.stringify({ error: { code: "NotFoundError" } }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch url: ${url}`);
  };

  try {
    const scan = await scanDownloadedContent({
      provider: "virustotal",
      virustotalApiKey: "vt-test-key",
      virustotalApiUrl: "https://vt.example/api/v3",
      virustotalUploadFallback: true,
      virustotalUploadAllowedDomains: ["secure.eicar.org"],
      content: Buffer.from("safe example"),
      contentType: "text/html",
      filename: "example.html",
      sourceUrl: "https://example.com/",
      localResult: buildLocalScanResult({
        threats: [],
        quarantined: false,
      }),
    });

    assert.equal(scan.status, "completed");
    assert.equal(scan.analysis?.reputation?.uploaded, false);
    assert.equal(scan.reasons.includes("VirusTotal hash lookup miss; sample upload not allowed for this source"), true);
    assert.equal(calls.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("scanDownloadedContent: virustotal upload fallback can poll once for an allowlisted demo source", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const method = String(options.method || "GET");
    calls.push({ url: String(url), method });
    if (String(url).includes("/files/") && method === "GET") {
      return new Response(JSON.stringify({ error: { code: "NotFoundError" } }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
    if (String(url).endsWith("/files") && method === "POST") {
      return new Response(JSON.stringify({ data: { id: "analysis-demo-1" } }), {
        status: 202,
        headers: { "content-type": "application/json" },
      });
    }
    if (String(url).endsWith("/analyses/analysis-demo-1") && method === "GET") {
      return new Response(JSON.stringify({
        data: {
          attributes: {
            status: "completed",
            stats: {
              malicious: 12,
              suspicious: 0,
              harmless: 0,
              undetected: 55,
            },
          },
        },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch url: ${url}`);
  };

  try {
    const scan = await scanDownloadedContent({
      provider: "virustotal",
      virustotalApiKey: "vt-test-key",
      virustotalApiUrl: "https://vt.example/api/v3",
      virustotalUploadFallback: true,
      virustotalUploadAllowedDomains: ["secure.eicar.org"],
      virustotalAnalysisPollAttempts: 1,
      virustotalAnalysisPollDelayMs: 1,
      content: Buffer.from("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"),
      contentType: "text/plain",
      filename: "eicar.com.txt",
      sourceUrl: "https://secure.eicar.org/eicar.com.txt",
      localResult: buildLocalScanResult({
        threats: [],
        quarantined: false,
      }),
    });

    assert.equal(scan.provider, "virustotal");
    assert.equal(scan.status, "completed");
    assert.equal(scan.stage, "final_verdict");
    assert.equal(scan.verdict, "malicious");
    assert.equal(scan.blocked, true);
    assert.equal(scan.quarantined, true);
    assert.equal(scan.analysis?.upload?.analysisId, "analysis-demo-1");
    assert.equal(scan.analysis?.reputation?.malicious, 12);
    assert.equal(calls.length, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("scanDownloadedContent: sandbox provider returns queued deeper analysis state", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url) === "https://sandbox.example/analyze") {
      return new Response(JSON.stringify({ analysisId: "sbx-1", status: "pending" }), {
        status: 202,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch url: ${url}`);
  };

  try {
    const scan = await scanDownloadedContent({
      provider: "local",
      malwareSandboxProvider: "http",
      malwareSandboxApiUrl: "https://sandbox.example",
      content: Buffer.from("sandbox bytes"),
      contentType: "application/octet-stream",
      filename: "sample.bin",
      localResult: buildLocalScanResult({
        threats: [],
        quarantined: false,
      }),
    });

    assert.equal(scan.status, "pending");
    assert.equal(scan.stage, "analysis_pending");
    assert.equal(scan.analysis?.sandbox?.status, "pending");
    assert.equal(scan.reasons.includes("Sandbox analysis queued"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("executeMediatedWebFetch fetches original URL bytes and returns tool-compatible JSON-RPC", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    assert.equal(String(url), "https://example.com/");
    return new Response("<html><body><h1>Example Domain</h1><p>demo</p></body></html>", {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  };

  try {
    const result = await _internal.executeMediatedWebFetch({
      effectivePolicyUrl: "https://example.com/",
      requestId: "demo-1",
      maxChars: 5000,
      effectiveMaxBytes: 1024 * 1024,
      scope: { allowFileDownload: true },
      resolvedIp: "93.184.216.34",
      timeout: 5000,
      auditContext: { appId: "default", toolName: "web_fetch" },
    });

    assert.equal(calls.length, 1);
    assert.equal(result.statusCode, 200);
    assert.equal(result.policyReason, "ok");
    const payload = JSON.parse(result.body.toString("utf8"));
    assert.equal(payload.jsonrpc, "2.0");
    assert.equal(payload.id, "demo-1");
    assert.equal(payload.result.structuredContent.tool, "web_fetch");
    assert.equal(payload.result.structuredContent.data.source, "cyber-proxy");
    assert.equal(payload.result.structuredContent.data.url, "https://example.com/");
    assert.match(payload.result.text, /Example Domain/);
    assert.equal(payload.result.structuredContent.data.scan.provider, "local");
    assert.equal(payload.result.structuredContent.data.scan.verdict, "safe");
  } finally {
    globalThis.fetch = originalFetch;
  }
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
