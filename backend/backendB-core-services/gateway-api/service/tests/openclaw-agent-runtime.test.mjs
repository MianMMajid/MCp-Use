import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOpenClawAgentArgs,
  parseOpenClawAgentOutput,
} from "../src/core/openclaw-agent-runtime.js";

test("buildOpenClawAgentArgs builds local mode command with expected flags", () => {
  const args = buildOpenClawAgentArgs({
    mode: "local",
    devProfile: true,
    sessionId: "agent:dev:test",
    message: "summarize logs",
    thinking: "high",
    timeoutSeconds: 90,
    agentId: "ops",
  });

  assert.deepEqual(args.slice(0, 4), ["--dev", "agent", "--local", "--json"]);
  assert.equal(args.includes("--session-id"), true);
  assert.equal(args.includes("agent:dev:test"), true);
  assert.equal(args.includes("--agent"), true);
  assert.equal(args.includes("ops"), true);
  assert.equal(args.includes("--thinking"), true);
  assert.equal(args.includes("high"), true);
  assert.equal(args.includes("--timeout"), true);
  assert.equal(args.includes("90"), true);
  assert.equal(args.includes("--message"), true);
  assert.equal(args.includes("summarize logs"), true);
});

test("parseOpenClawAgentOutput extracts structured reply from JSON output", () => {
  const payload = {
    sessionId: "agent:dev:test",
    response: { text: "Task complete." },
  };
  const parsed = parseOpenClawAgentOutput(JSON.stringify(payload), "");

  assert.equal(parsed.ok, true);
  assert.equal(parsed.reply, "Task complete.");
  assert.equal(parsed.sessionId, "agent:dev:test");
  assert.equal(typeof parsed.parsed, "object");
});

test("parseOpenClawAgentOutput surfaces failover errors from text output", () => {
  const stdout =
    "[diagnostic] lane task error: lane=main durationMs=1 error=\"Error: No API key found\"\n" +
    "FailoverError: No API key found for provider anthropic.";
  const parsed = parseOpenClawAgentOutput(stdout, "");

  assert.equal(parsed.ok, false);
  assert.equal(parsed.error.includes("FailoverError"), true);
});
