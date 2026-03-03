// Set required env vars before import (service.js imports model-router config.js)
process.env.MAPLE_LOG_LEVEL = process.env.MAPLE_LOG_LEVEL || "error";
process.env.MAPLE_LOG_REQUESTS = process.env.MAPLE_LOG_REQUESTS || "0";
process.env.MAPLE_LOG_INCLUDE_BODIES = process.env.MAPLE_LOG_INCLUDE_BODIES || "0";
process.env.MAPLE_LOG_BODY_MAX_CHARS = process.env.MAPLE_LOG_BODY_MAX_CHARS || "4000";
process.env.MODEL_ROUTER_PORT = process.env.MODEL_ROUTER_PORT || "9100";
process.env.MODEL_ROUTER_HOST = process.env.MODEL_ROUTER_HOST || "0.0.0.0";
process.env.AUDIT_WRITER_ADDRESS = process.env.AUDIT_WRITER_ADDRESS || "localhost:9400";
process.env.DEFAULT_MODEL = process.env.DEFAULT_MODEL || "gpt-4o";
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || "test-openai-key";
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "test-anthropic-key";
process.env.MAPLE_FIREWALL_CHAT_PRIMARY = process.env.MAPLE_FIREWALL_CHAT_PRIMARY || "openai";
process.env.MAPLE_FIREWALL_CHAT_OPENAI_MODEL = process.env.MAPLE_FIREWALL_CHAT_OPENAI_MODEL || "gpt-4o-mini";
process.env.MAPLE_FIREWALL_CHAT_ANTHROPIC_MODEL = process.env.MAPLE_FIREWALL_CHAT_ANTHROPIC_MODEL || "claude-sonnet-4-6";
process.env.MAPLE_FIREWALL_CHAT_TIMEOUT_MS = process.env.MAPLE_FIREWALL_CHAT_TIMEOUT_MS || "15000";

import assert from "node:assert/strict";
import test from "node:test";

import * as grpc from "@grpc/grpc-js";

function createSseResponse(lines) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(line));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

async function createServiceHarness() {
  const originalAddService = grpc.Server.prototype.addService;
  let capturedImpl;
  grpc.Server.prototype.addService = function addServiceProxy(definition, implementation) {
    capturedImpl = implementation;
    return originalAddService.call(this, definition, implementation);
  };

  try {
    const serviceModule = await import("../src/service.js");
    const configModule = await import("../src/config.js");
    const server = serviceModule.createModelRouterService();
    if (!capturedImpl) {
      throw new Error("Failed to capture model-router service implementation");
    }
    const configSnapshot = { ...configModule.config };
    return {
      impl: capturedImpl,
      config: configModule.config,
      cleanup() {
        Object.assign(configModule.config, configSnapshot);
        try {
          serviceModule.closeModelRouterClients();
        } catch {
          // best effort
        }
        try {
          server.forceShutdown();
        } catch {
          // best effort
        }
      },
    };
  } finally {
    grpc.Server.prototype.addService = originalAddService;
  }
}

function installFetchMock(t, handler) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = handler;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
}

function suppressExpectedModelRouterErrors(t) {
  const originalError = console.error;
  console.error = (...args) => {
    const message = String(args[0] ?? "");
    if (message.includes("\"event\":\"model_router_generate_failed\"")) {
      return;
    }
    if (message.includes("\"event\":\"model_router_stream_all_failed\"")) {
      return;
    }
    originalError(...args);
  };
  t.after(() => {
    console.error = originalError;
  });
}

function callGenerate(impl, request) {
  return new Promise((resolve, reject) => {
    impl.Generate({ request }, (error, response) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(response);
    });
  });
}

test("Generate falls back to secondary provider and reports filtered tools", async (t) => {
  const harness = await createServiceHarness();
  t.after(() => harness.cleanup());

  harness.config.primaryProvider = "openai";
  harness.config.openaiApiKey = "openai-key";
  harness.config.anthropicApiKey = "anthropic-key";
  harness.config.chatTimeoutMs = 5000;

  let openAiCalls = 0;
  let anthropicCalls = 0;
  installFetchMock(t, async (url) => {
    if (String(url).includes("openai.com")) {
      openAiCalls += 1;
      return new Response("openai unavailable", { status: 503 });
    }
    anthropicCalls += 1;
    return new Response(
      JSON.stringify({
        model: "claude-sonnet-4-6",
        stop_reason: "end_turn",
        content: [
          { type: "text", text: "fallback response" },
          { type: "tool_use", id: "tool-1", name: "allowed_tool", input: { q: "abc" } },
        ],
        usage: { input_tokens: 6, output_tokens: 4 },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  });

  const response = await callGenerate(harness.impl, {
    context: { traceId: "trace-123" },
    messages: [{ role: "CHAT_ROLE_USER", content: "hello" }],
    tools: [
      {
        name: "allowed_tool",
        description: "allowed",
        parametersJson: Buffer.from(JSON.stringify({ type: "object" })),
      },
      {
        name: "blocked_tool",
        description: "blocked",
        parametersJson: Buffer.from(JSON.stringify({ type: "object" })),
      },
    ],
    allowedToolNames: ["allowed_tool"],
  });

  assert.equal(openAiCalls, 1);
  assert.equal(anthropicCalls, 1);
  assert.equal(response.message?.content, "fallback response");
  assert.equal(response.finishReason, "stop");
  assert.equal(response.model, "claude-sonnet-4-6");
  assert.deepEqual(response.filteredTools, ["blocked_tool"]);
  assert.equal(response.toolCalls?.length, 1);
  assert.equal(response.toolCalls?.[0]?.name, "allowed_tool");
});

test("Generate returns INTERNAL when all providers are unavailable", async (t) => {
  const harness = await createServiceHarness();
  t.after(() => harness.cleanup());
  suppressExpectedModelRouterErrors(t);

  harness.config.primaryProvider = "openai";
  harness.config.openaiApiKey = "";
  harness.config.anthropicApiKey = "";

  let calledFetch = false;
  installFetchMock(t, async () => {
    calledFetch = true;
    return new Response("should not be called", { status: 500 });
  });

  await assert.rejects(
    callGenerate(harness.impl, {
      context: { traceId: "trace-no-provider" },
      messages: [{ role: "CHAT_ROLE_USER", content: "hello" }],
    }),
    (error) => {
      assert.equal(error.code, grpc.status.INTERNAL);
      assert.match(String(error.message), /No LLM providers available/);
      return true;
    }
  );

  assert.equal(calledFetch, false);
});

test("StreamGenerate streams chunk deltas and usage data", async (t) => {
  const harness = await createServiceHarness();
  t.after(() => harness.cleanup());

  harness.config.primaryProvider = "openai";
  harness.config.openaiApiKey = "openai-key";
  harness.config.anthropicApiKey = "";
  harness.config.chatTimeoutMs = 5000;

  installFetchMock(
    t,
    async () =>
      createSseResponse([
        "data: {\"choices\":[{\"delta\":{\"content\":\"hello\"},\"finish_reason\":null}]}\n\n",
        "data: {\"choices\":[{\"delta\":{\"content\":\" world\"},\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":2,\"completion_tokens\":3,\"total_tokens\":5}}\n\n",
        "data: [DONE]\n\n",
      ])
  );

  const writes = [];
  let ended = false;
  await harness.impl.StreamGenerate({
    request: {
      context: { traceId: "trace-stream" },
      messages: [{ role: "CHAT_ROLE_USER", content: "hello" }],
    },
    write(chunk) {
      writes.push(chunk);
    },
    end() {
      ended = true;
    },
  });

  assert.equal(ended, true);
  assert.equal(writes.length, 2);
  assert.equal(writes[0].deltaContent, "hello");
  assert.equal(writes[0].finishReason, "");
  assert.equal(writes[1].deltaContent, " world");
  assert.equal(writes[1].finishReason, "stop");
  assert.deepEqual(writes[1].usage, {
    promptTokens: 2,
    completionTokens: 3,
    totalTokens: 5,
  });
});

test("StreamGenerate writes terminal error chunk when no providers are configured", async (t) => {
  const harness = await createServiceHarness();
  t.after(() => harness.cleanup());
  suppressExpectedModelRouterErrors(t);

  harness.config.primaryProvider = "openai";
  harness.config.openaiApiKey = "";
  harness.config.anthropicApiKey = "";

  const writes = [];
  let ended = false;
  await harness.impl.StreamGenerate({
    request: {
      context: { traceId: "trace-stream-error" },
      messages: [{ role: "CHAT_ROLE_USER", content: "hello" }],
    },
    write(chunk) {
      writes.push(chunk);
    },
    end() {
      ended = true;
    },
  });

  assert.equal(ended, true);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].finishReason, "error");
  assert.match(String(writes[0].deltaContent ?? ""), /^\[error\]/);
});
