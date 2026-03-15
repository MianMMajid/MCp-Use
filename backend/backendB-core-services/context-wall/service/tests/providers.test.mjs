// Env setup before imports — required by @maple/common
process.env.MAPLE_LOG_LEVEL = process.env.MAPLE_LOG_LEVEL || "error";
process.env.MAPLE_LOG_REQUESTS = process.env.MAPLE_LOG_REQUESTS || "0";
process.env.MAPLE_LOG_INCLUDE_BODIES = process.env.MAPLE_LOG_INCLUDE_BODIES || "0";
process.env.MAPLE_LOG_BODY_MAX_CHARS = process.env.MAPLE_LOG_BODY_MAX_CHARS || "4000";

import assert from "node:assert/strict";
import test from "node:test";

const { generateOpenAI } = await import(`../src/providers/openai.js?t=${Date.now()}`);
const { generateAnthropic } = await import(`../src/providers/anthropic.js?t=${Date.now()}`);

// ── Helpers ──────────────────────────────────────────────────────────────────

function mockFetch(responseBody, status = 200) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, opts });
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(responseBody),
      json: async () => responseBody,
      headers: new Headers(),
    };
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

// ── OpenAI Tests ─────────────────────────────────────────────────────────────

test("generateOpenAI: formats request and parses response", async () => {
  const mock = mockFetch({
    choices: [{ message: { content: "Hello!" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    model: "gpt-4",
  });
  try {
    const result = await generateOpenAI("test-key", {
      model: "gpt-4",
      messages: [{ role: "user", content: "Hi" }],
    });
    assert.equal(result.content, "Hello!");
    assert.equal(result.finishReason, "stop");
    assert.equal(result.usage.totalTokens, 15);
    assert.equal(mock.calls.length, 1);
    const body = JSON.parse(mock.calls[0].opts.body);
    assert.equal(body.model, "gpt-4");
    assert.equal(body.messages[0].role, "user");
  } finally {
    mock.restore();
  }
});

test("generateOpenAI: includes reasoning effort when provided", async () => {
  const mock = mockFetch({
    choices: [{ message: { content: "Hello!" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    model: "gpt-5.4",
  });
  try {
    await generateOpenAI("test-key", {
      model: "gpt-5.4",
      reasoningEffort: "xhigh",
      messages: [{ role: "user", content: "Hi" }],
    });
    const body = JSON.parse(mock.calls[0].opts.body);
    assert.equal(body.reasoning_effort, "xhigh");
  } finally {
    mock.restore();
  }
});

test("generateOpenAI: handles API error", async () => {
  const mock = mockFetch({ error: "bad request" }, 400);
  try {
    await assert.rejects(
      () => generateOpenAI("test-key", { model: "gpt-4", messages: [{ role: "user", content: "Hi" }] }),
      /OpenAI API error 400/
    );
  } finally {
    mock.restore();
  }
});

test("generateOpenAI: includes tool calls when present", async () => {
  const mock = mockFetch({
    choices: [{
      message: {
        content: "",
        tool_calls: [{ id: "tc1", function: { name: "search", arguments: '{"q":"test"}' } }],
      },
      finish_reason: "tool_calls",
    }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    model: "gpt-4",
  });
  try {
    const result = await generateOpenAI("test-key", {
      model: "gpt-4",
      messages: [{ role: "user", content: "Search" }],
      tools: [{ type: "function", function: { name: "search" } }],
    });
    assert.ok(result.toolCalls);
    assert.equal(result.toolCalls.length, 1);
    assert.equal(result.toolCalls[0].function.name, "search");
  } finally {
    mock.restore();
  }
});

// ── Anthropic Tests ──────────────────────────────────────────────────────────

test("generateAnthropic: formats request with system message extraction", async () => {
  const mock = mockFetch({
    content: [{ type: "text", text: "Response" }],
    stop_reason: "end_turn",
    usage: { input_tokens: 8, output_tokens: 3 },
    model: "claude-3-sonnet",
  });
  try {
    const result = await generateAnthropic("test-key", {
      model: "claude-3-sonnet",
      messages: [
        { role: "system", content: "You are helpful." },
        { role: "user", content: "Hello" },
      ],
    });
    assert.equal(result.content, "Response");
    assert.equal(result.finishReason, "stop");
    assert.equal(result.usage.promptTokens, 8);
    const body = JSON.parse(mock.calls[0].opts.body);
    assert.equal(body.system, "You are helpful.");
    assert.ok(body.messages.every(m => m.role !== "system"));
  } finally {
    mock.restore();
  }
});

test("generateAnthropic: prepends user message when first is not user", async () => {
  const mock = mockFetch({
    content: [{ type: "text", text: "OK" }],
    stop_reason: "end_turn",
    usage: { input_tokens: 5, output_tokens: 1 },
    model: "claude-3-sonnet",
  });
  try {
    await generateAnthropic("test-key", {
      model: "claude-3-sonnet",
      messages: [{ role: "assistant", content: "I am ready" }],
    });
    const body = JSON.parse(mock.calls[0].opts.body);
    assert.equal(body.messages[0].role, "user");
    assert.equal(body.messages[0].content, "Hello.");
  } finally {
    mock.restore();
  }
});

test("generateAnthropic: handles API error", async () => {
  const mock = mockFetch({ error: "unauthorized" }, 401);
  try {
    await assert.rejects(
      () => generateAnthropic("bad-key", { model: "claude-3", messages: [{ role: "user", content: "Hi" }] }),
      /Anthropic API error 401/
    );
  } finally {
    mock.restore();
  }
});
