import assert from "node:assert/strict";
import { test } from "node:test";
import { startObservation, stepFromBridgeEvent } from "../src/bridge/openclaw-bridge.ts";

test("startObservation source=openclaw returns push-ready empty trace", async () => {
  const trace = await startObservation({
    sessionId: "push-session",
    source: "openclaw",
  });

  assert.equal(trace.source, "openclaw");
  assert.equal(trace.steps.length, 0);
  assert.equal(trace.metadata?.ingestMode, "push");
});

test("startObservation source=auto falls back to pull mode (bridge required)", async () => {
  // source=auto or undefined uses pull mode which requires a running bridge.
  // Without a bridge, startObservation should throw.
  await assert.rejects(
    () =>
      startObservation({
        sessionId: "auto-session",
        source: "auto",
        bridgeUrl: "http://127.0.0.1:19999", // non-existent bridge
      }),
    (error) => {
      assert.ok(error instanceof Error);
      return true;
    }
  );
});

test("stepFromBridgeEvent maps event primitives to trace step fields", () => {
  const step = stepFromBridgeEvent(
    {
      eventId: "evt-1",
      actor: "agent",
      type: "shell",
      command: "echo hello",
      output: "done",
      timestamp: "2026-02-21T00:00:00.000Z",
    },
    3
  );

  assert.equal(step.index, 3);
  assert.equal(step.type, "shell");
  assert.equal(step.command, "echo hello");
  assert.equal(step.metadata?.eventId, "evt-1");
});
