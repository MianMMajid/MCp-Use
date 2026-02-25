import assert from "node:assert/strict";
import test from "node:test";

import { evaluateFirewallStepViaGrpc } from "../src/core/firewall-grpc.js";
import { setGrpcClients } from "../src/state.js";

function sampleStep() {
  return {
    index: 1,
    timestamp: new Date().toISOString(),
    actor: "agent",
    type: "tool_call",
    prompt: "run tool",
    output: "",
    command: "",
    externalUrl: "",
    riskScore: 0,
    guardStatus: "pending",
  };
}

test("evaluateFirewallStepViaGrpc denies when context-wall client is unavailable", async () => {
  setGrpcClients(undefined);

  const decision = await evaluateFirewallStepViaGrpc(sampleStep());

  assert.equal(decision.shouldBlock, true);
  assert.equal(decision.action, "deny");
  assert.equal(decision.rule, "context-wall-unavailable");
});

test("evaluateFirewallStepViaGrpc denies when context-wall errors", async () => {
  const failingContextWall = {
    evaluateStep(_request, callback) {
      callback(new Error("context-wall down"));
    },
  };

  setGrpcClients({ contextWall: failingContextWall });

  const decision = await evaluateFirewallStepViaGrpc(sampleStep());

  assert.equal(decision.shouldBlock, true);
  assert.equal(decision.action, "deny");
  assert.equal(decision.rule, "context-wall-unavailable");
  assert.equal(decision.message.includes("Policy service unavailable"), true);
});

test("evaluateFirewallStepViaGrpc returns context-wall policy decision when available", async () => {
  const now = new Date().toISOString();
  const contextWall = {
    evaluateStep(_request, callback) {
      callback(null, {
        decision: {
          action: "FIREWALL_ACTION_ALLOW",
          severity: "RISK_SEVERITY_LOW",
          message: "Allowed by policy",
          recommendation: "Proceed",
          ruleName: "allow-safe",
          redactedPatterns: [],
          evaluatedAt: now,
        },
      });
    },
  };

  setGrpcClients({ contextWall });

  const decision = await evaluateFirewallStepViaGrpc(sampleStep());

  assert.equal(decision.shouldBlock, false);
  assert.equal(decision.action, "allow");
  assert.equal(decision.rule, "allow-safe");
  assert.equal(decision.evaluatedAt, now);
  assert.equal(decision.message, "Allowed by policy");
});
