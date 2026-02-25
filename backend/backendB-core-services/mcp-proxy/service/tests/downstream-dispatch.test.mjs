import assert from "node:assert/strict";
import test from "node:test";

import { dispatchJsonRpc } from "../src/downstream-dispatch.js";

test("dispatchJsonRpc returns parsed JSON-RPC payload on success", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ jsonrpc: "2.0", id: "1", result: { ok: true } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  try {
    const payload = await dispatchJsonRpc("https://example.test/mcp", {
      jsonrpc: "2.0",
      id: "1",
      method: "tools/list",
    });

    assert.equal(payload?.jsonrpc, "2.0");
    assert.deepEqual(payload?.result, { ok: true });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("dispatchJsonRpc throws HTTP error details on non-2xx response", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: { message: "bad request" } }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });

  try {
    await assert.rejects(
      () =>
        dispatchJsonRpc("https://example.test/mcp", {
          jsonrpc: "2.0",
          id: "2",
          method: "tools/call",
        }),
      (err) => {
        assert.equal(typeof err.message, "string");
        assert.equal(err.statusCode, 400);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("dispatchJsonRpc maps aborted requests to TIMEOUT errors", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) =>
    new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => {
        const abortError = new Error("aborted");
        abortError.name = "AbortError";
        reject(abortError);
      });
    });

  try {
    await assert.rejects(
      () =>
        dispatchJsonRpc(
          "https://example.test/mcp",
          {
            jsonrpc: "2.0",
            id: "3",
            method: "tools/list",
          },
          { timeoutMs: 10 }
        ),
      (err) => {
        assert.equal(err.code, "TIMEOUT");
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
