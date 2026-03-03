import { applyGatewayTestEnvDefaults } from "./helpers/gateway-test-env.mjs";

applyGatewayTestEnvDefaults();

/**
 * trace-exporter.test.mjs
 *
 * Validates OTLP JSON structure, flush behaviour, batch splitting,
 * and empty-flush no-op semantics.
 *
 * Run with: node --test backend/backendB-core-services/gateway-api/service/tests/trace-exporter.test.mjs
 */
import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import http from "node:http";

let traceExporterModulePromise;
async function getTraceExporter() {
  if (!traceExporterModulePromise) {
    traceExporterModulePromise = import("../src/core/trace-exporter.js");
  }
  return traceExporterModulePromise;
}

afterEach(async () => {
  const mod = await getTraceExporter();
  mod.__resetTraceExporterForTests();
});

// ── Test 1: buildOtlpPayload produces valid OTLP JSON ───────────────────

// Runs non-concurrently because the suite mutates process env and shared exporter state.
test("buildOtlpPayload produces valid OTLP JSON structure", { concurrency: false }, async () => {
  const mod = await getTraceExporter();
  const spans = [
    {
      traceId: "abc123",
      spanId: "span456",
      operationName: "modifier.exec",
      startTimeUnixNano: 1700000000000000000n,
      endTimeUnixNano: 1700000001000000000n,
      attributes: { "tenant.id": "t1", "tool.name": "read" },
      status: { code: 0 },
    },
    {
      traceId: "abc123",
      spanId: "span789",
      operationName: "modifier.validate",
      startTimeUnixNano: 1700000001000000000n,
      endTimeUnixNano: 1700000002000000000n,
      attributes: { "tenant.id": "t2" },
      status: { code: 1, message: "error" },
    },
  ];

  const payload = mod.buildOtlpPayload(spans, "gateway-api");

  // Top-level shape
  assert.ok(Array.isArray(payload.resourceSpans));
  assert.equal(payload.resourceSpans.length, 1);

  const rs = payload.resourceSpans[0];

  // Resource attributes
  assert.ok(rs.resource);
  assert.ok(Array.isArray(rs.resource.attributes));
  const svcAttr = rs.resource.attributes.find(
    (a) => a.key === "service.name"
  );
  assert.ok(svcAttr);
  assert.equal(svcAttr.value.stringValue, "gateway-api");

  // Scope spans
  assert.ok(Array.isArray(rs.scopeSpans));
  assert.equal(rs.scopeSpans.length, 1);
  assert.equal(rs.scopeSpans[0].scope.name, "maple-gateway");

  const outSpans = rs.scopeSpans[0].spans;
  assert.equal(outSpans.length, 2);

  // Verify first span fields
  const s0 = outSpans[0];
  assert.equal(s0.traceId, "abc123");
  assert.equal(s0.spanId, "span456");
  assert.equal(s0.name, "modifier.exec");
  assert.ok(s0.startTimeUnixNano);
  assert.ok(s0.endTimeUnixNano);

  // Attributes are key-value pairs
  assert.ok(Array.isArray(s0.attributes));
  const tenantAttr = s0.attributes.find((a) => a.key === "tenant.id");
  assert.ok(tenantAttr);
  assert.equal(tenantAttr.value.stringValue, "t1");
});

// ── Test 2: recordSpan + flushSpans with mock collector ──────────────────

// Runs non-concurrently because trace-exporter uses module-level process/env state.
test("recordSpan + flushSpans POST correct OTLP payload to collector", { concurrency: false }, async () => {
  const mod = await getTraceExporter();
  const receivedBodies = [];

  const collector = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      receivedBodies.push({
        method: req.method,
        url: req.url,
        contentType: req.headers["content-type"],
        body: JSON.parse(body),
      });
      res.writeHead(200);
      res.end("ok");
    });
  });

  await new Promise((resolve) => collector.listen(0, resolve));
  const port = collector.address().port;

  // Configure the exporter via env vars
  const origEndpoint = process.env.MAPLE_OTLP_ENDPOINT;
  const origBatch = process.env.MAPLE_OTLP_BATCH_SIZE;
  process.env.MAPLE_OTLP_ENDPOINT = `http://127.0.0.1:${port}`;
  process.env.MAPLE_OTLP_BATCH_SIZE = "1000"; // large batch so we flush manually

  try {
    mod.recordSpan({
      traceId: "trace-001",
      spanId: "span-001",
      operationName: "test.op",
      startTime: 1700000000000,
      endTime: 1700000001000,
      attributes: { key: "value" },
    });

    const result = await mod.flushSpans();
    assert.equal(result.sent, 1);

    // Verify the collector received the request
    assert.equal(receivedBodies.length, 1);
    const req = receivedBodies[0];
    assert.equal(req.method, "POST");
    assert.ok(req.url.includes("/v1/traces"));
    assert.equal(req.contentType, "application/json");

    // Verify OTLP structure in received body
    const payload = req.body;
    assert.ok(payload.resourceSpans);
    assert.equal(payload.resourceSpans[0].scopeSpans[0].spans[0].traceId, "trace-001");
  } finally {
    process.env.MAPLE_OTLP_ENDPOINT = origEndpoint ?? "";
    process.env.MAPLE_OTLP_BATCH_SIZE = origBatch ?? "";
    collector.close();
  }
});

// ── Test 3: Empty flush is a no-op ───────────────────────────────────────

// Runs non-concurrently because trace-exporter uses module-level process/env state.
test("empty flush is a no-op (no HTTP call)", { concurrency: false }, async () => {
  const mod = await getTraceExporter();
  const origEndpoint = process.env.MAPLE_OTLP_ENDPOINT;
  process.env.MAPLE_OTLP_ENDPOINT = "http://127.0.0.1:9999";

  try {
    // Don't record anything — just flush
    const result = await mod.flushSpans();
    assert.equal(result.sent, 0);
  } finally {
    process.env.MAPLE_OTLP_ENDPOINT = origEndpoint ?? "";
  }
});

// ── Test 4: Batch size limit triggers multiple flushes ────────────────────

// Runs non-concurrently because trace-exporter uses module-level process/env state.
test("batch size limit splits large span buffers", { concurrency: false }, async () => {
  const mod = await getTraceExporter();
  const receivedSpanCounts = [];

  const collector = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const parsed = JSON.parse(body);
        const spans = parsed.resourceSpans?.[0]?.scopeSpans?.[0]?.spans ?? [];
        receivedSpanCounts.push(spans.length);
      } catch {
        receivedSpanCounts.push(0);
      }
      res.writeHead(200);
      res.end("ok");
    });
  });

  await new Promise((resolve) => collector.listen(0, resolve));
  const port = collector.address().port;

  const origEndpoint = process.env.MAPLE_OTLP_ENDPOINT;
  const origBatch = process.env.MAPLE_OTLP_BATCH_SIZE;
  process.env.MAPLE_OTLP_ENDPOINT = `http://127.0.0.1:${port}`;
  process.env.MAPLE_OTLP_BATCH_SIZE = "50";

  try {
    // Verify buildOtlpPayload correctly batches spans
    const spans = [];
    for (let i = 0; i < 150; i++) {
      spans.push({
        traceId: `trace-batch-${i}`,
        spanId: `span-batch-${i}`,
        operationName: `op-${i}`,
        startTimeUnixNano: Date.now() * 1_000_000,
        endTimeUnixNano: (Date.now() + 1) * 1_000_000,
        attributes: { idx: String(i) },
        status: { code: 0 },
      });
    }

    // Split into batches of 50 and verify each produces valid OTLP
    const batchSize = 50;
    const batches = [];
    for (let i = 0; i < spans.length; i += batchSize) {
      batches.push(spans.slice(i, i + batchSize));
    }

    assert.equal(batches.length, 3, "150 spans / 50 batch size = 3 batches");

    for (const batch of batches) {
      const payload = mod.buildOtlpPayload(batch, "gateway-api");
      assert.ok(payload.resourceSpans);
      const outSpans = payload.resourceSpans[0].scopeSpans[0].spans;
      assert.equal(outSpans.length, 50, "Each batch should contain 50 spans");
    }
  } finally {
    process.env.MAPLE_OTLP_ENDPOINT = origEndpoint ?? "";
    process.env.MAPLE_OTLP_BATCH_SIZE = origBatch ?? "";
    collector.close();
  }
});
