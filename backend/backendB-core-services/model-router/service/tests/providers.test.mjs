import assert from "node:assert/strict";
import test from "node:test";

import { generateOpenAI, streamOpenAI } from "../src/providers/openai.js";
import { generateAnthropic, streamAnthropic } from "../src/providers/anthropic.js";

function installFetchMock(t, handler) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = handler;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
}

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

test("generateOpenAI maps request/response fields including tool calls", async (t) => {
  const requests = [];
  installFetchMock(t, async (url, init) => {
    requests.push({ url, init });
    return new Response(
      JSON.stringify({
        choices: [
          {
            finish_reason: "tool_calls",
            message: {
              content: "tool selected",
              tool_calls: [
                {
                  id: "call-1",
                  function: {
                    name: "web_search",
                    arguments: "{\"query\":\"maple\"}",
                  },
                },
              ],
            },
          },
        ],
        usage: {
          prompt_tokens: 11,
          completion_tokens: 7,
          total_tokens: 18,
        },
        model: "gpt-4o-mini",
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  });

  const result = await generateOpenAI("openai-test-key", {
    model: "gpt-4o-mini",
    timeoutMs: 5000,
    maxTokens: 64,
    temperature: 0.2,
    messages: [
      { role: "user", content: "Find docs" },
      { role: "assistant", content: "", tool_call_id: "call-1" },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "web_search",
          description: "Search the web",
          parameters: { type: "object", properties: { query: { type: "string" } } },
        },
      },
    ],
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://api.openai.com/v1/chat/completions");
  assert.equal(requests[0].init?.headers?.Authorization, "Bearer openai-test-key");
  const requestBody = JSON.parse(String(requests[0].init?.body ?? "{}"));
  assert.equal(requestBody.model, "gpt-4o-mini");
  assert.equal(requestBody.max_tokens, 64);
  assert.equal(requestBody.temperature, 0.2);
  assert.equal(Array.isArray(requestBody.tools), true);

  assert.equal(result.content, "tool selected");
  assert.equal(result.finishReason, "tool_calls");
  assert.equal(result.model, "gpt-4o-mini");
  assert.deepEqual(result.usage, {
    promptTokens: 11,
    completionTokens: 7,
    totalTokens: 18,
  });
  assert.equal(result.toolCalls?.length, 1);
  assert.equal(result.toolCalls?.[0]?.function?.name, "web_search");
});

test("generateOpenAI throws on upstream HTTP errors", async (t) => {
  installFetchMock(t, async () => new Response("upstream down", { status: 503 }));

  await assert.rejects(
    generateOpenAI("openai-test-key", {
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "hello" }],
    }),
    /OpenAI API error 503: upstream down/
  );
});

test("streamOpenAI parses deltas/usage and ignores malformed SSE lines", async (t) => {
  installFetchMock(
    t,
    async () =>
      createSseResponse([
        "data: {\"choices\":[{\"delta\":{\"content\":\"hello \"},\"finish_reason\":null}]}\n\n",
        "data: not-json\n\n",
        "data: {\"choices\":[{\"delta\":{\"content\":\"world\"},\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":2,\"completion_tokens\":3,\"total_tokens\":5}}\n\n",
        "data: [DONE]\n\n",
      ])
  );

  const chunks = [];
  for await (const chunk of streamOpenAI("openai-test-key", {
    model: "gpt-4o-mini",
    timeoutMs: 5000,
    messages: [{ role: "user", content: "hello" }],
  })) {
    chunks.push(chunk);
  }

  assert.equal(chunks.length, 2);
  assert.deepEqual(chunks[0], { delta: "hello ", finishReason: "", usage: undefined });
  assert.deepEqual(chunks[1], {
    delta: "world",
    finishReason: "stop",
    usage: { promptTokens: 2, completionTokens: 3, totalTokens: 5 },
  });
});

test("generateAnthropic converts payload and maps text/tool_use blocks", async (t) => {
  const requests = [];
  installFetchMock(t, async (url, init) => {
    requests.push({ url, init });
    return new Response(
      JSON.stringify({
        model: "claude-sonnet-4-6",
        stop_reason: "end_turn",
        content: [
          { type: "text", text: "done" },
          { type: "tool_use", id: "tool-1", name: "lookup", input: { q: "x" } },
        ],
        usage: { input_tokens: 9, output_tokens: 4 },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  });

  const result = await generateAnthropic("anthropic-test-key", {
    model: "claude-sonnet-4-6",
    timeoutMs: 5000,
    messages: [
      { role: "system", content: "system rules" },
      { role: "assistant", content: "prior assistant response" },
      { role: "tool", content: "tool output" },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "lookup",
          description: "Lookup record",
          parameters: { type: "object", properties: { q: { type: "string" } } },
        },
      },
    ],
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://api.anthropic.com/v1/messages");
  assert.equal(requests[0].init?.headers?.["x-api-key"], "anthropic-test-key");
  const requestBody = JSON.parse(String(requests[0].init?.body ?? "{}"));
  assert.equal(requestBody.system, "system rules");
  assert.equal(requestBody.messages[0].role, "user");
  assert.equal(requestBody.messages[0].content, "Hello.");
  assert.equal(requestBody.messages[2].role, "user");
  assert.equal(requestBody.messages[2].content, "tool output");
  assert.equal(Array.isArray(requestBody.tools), true);

  assert.equal(result.content, "done");
  assert.equal(result.finishReason, "stop");
  assert.deepEqual(result.usage, {
    promptTokens: 9,
    completionTokens: 4,
    totalTokens: 13,
  });
  assert.equal(result.toolCalls?.[0]?.function?.name, "lookup");
  assert.equal(result.toolCalls?.[0]?.function?.arguments, "{\"q\":\"x\"}");
});

test("streamAnthropic emits delta and final usage chunk", async (t) => {
  installFetchMock(
    t,
    async () =>
      createSseResponse([
        "data: {\"type\":\"message_start\",\"message\":{\"usage\":{\"input_tokens\":12}}}\n\n",
        "data: {\"type\":\"content_block_delta\",\"delta\":{\"text\":\"partial\"}}\n\n",
        "data: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\"},\"usage\":{\"output_tokens\":5}}\n\n",
        "data: {\"type\":\"message_stop\"}\n\n",
      ])
  );

  const chunks = [];
  for await (const chunk of streamAnthropic("anthropic-test-key", {
    model: "claude-sonnet-4-6",
    timeoutMs: 5000,
    messages: [{ role: "user", content: "hello" }],
  })) {
    chunks.push(chunk);
  }

  assert.equal(chunks.length, 2);
  assert.deepEqual(chunks[0], { delta: "partial", finishReason: "" });
  assert.deepEqual(chunks[1], {
    delta: "",
    finishReason: "stop",
    usage: { promptTokens: 12, completionTokens: 5, totalTokens: 17 },
  });
});
