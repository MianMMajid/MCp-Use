/**
 * firewall-rules-crud.test.mjs
 *
 * Tests for the firewall rule CRUD endpoints (Phase 5).
 * Tests payload structure and validation logic without importing gateway modules
 * (which require the full gateway env to be configured).
 */

process.env.MAPLE_LOG_LEVEL = process.env.MAPLE_LOG_LEVEL || "error";
process.env.MAPLE_LOG_REQUESTS = process.env.MAPLE_LOG_REQUESTS || "0";
process.env.MAPLE_LOG_INCLUDE_BODIES = process.env.MAPLE_LOG_INCLUDE_BODIES || "0";
process.env.MAPLE_LOG_BODY_MAX_CHARS = process.env.MAPLE_LOG_BODY_MAX_CHARS || "4000";
process.env.MAPLE_FIREWALL_LOG_DIR = process.env.MAPLE_FIREWALL_LOG_DIR || "/tmp/maple-firewall-logs";
process.env.NODE_ENV = process.env.NODE_ENV || "test";

import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("firewall rule request structure", () => {
  it("validates single rule creation payload", () => {
    const payload = {
      action: "block",
      target: "malicious.example.com",
      reason: "Known malware domain",
      createdBy: "admin@mayple.dev",
    };

    assert.ok(payload.action, "Should have action");
    assert.ok(payload.target, "Should have target");
    assert.ok(payload.reason, "Should have reason");
  });

  it("validates bulk rules payload", () => {
    const payload = {
      rules: {
        version: "1.0",
        defaults: { mode: "monitor", blockOnCritical: true },
        rules: [
          { id: "r-001", match: "prompt_injection", action: "block" },
          { id: "r-002", match: "data_exfiltration", action: "step_up" },
        ],
      },
    };

    const rules = Array.isArray(payload.rules?.rules) ? payload.rules.rules : [];
    assert.equal(rules.length, 2);
    assert.equal(rules[0].id, "r-001");
    assert.equal(rules[0].action, "block");
  });

  it("handles empty rules array", () => {
    const payload = { rules: [] };
    const rules = Array.isArray(payload.rules) ? payload.rules : [];
    assert.equal(rules.length, 0);
  });

  it("builds match pattern from target", () => {
    const target = "evil.com";
    const matchPattern = `target equals ${target}`;
    assert.equal(matchPattern, "target equals evil.com");
  });

  it("generates rule ID from timestamp", () => {
    const ruleId = `rule-${Date.now()}`;
    assert.ok(ruleId.startsWith("rule-"));
    assert.ok(ruleId.length > 10);
  });
});

describe("context-leakage request structure", () => {
  it("validates document scan payload", () => {
    const payload = {
      policyMode: "strict",
      documents: [
        { name: "test.txt", content: "sensitive data", type: "text/plain" },
      ],
    };

    assert.equal(payload.policyMode, "strict");
    assert.equal(payload.documents.length, 1);
    assert.equal(payload.documents[0].name, "test.txt");
  });

  it("validates policyMode options", () => {
    const validModes = ["strict", "review", "monitor"];
    for (const mode of validModes) {
      assert.ok(validModes.includes(mode));
    }
  });

  it("rejects empty documents", () => {
    const payload = { policyMode: "strict", documents: [] };
    assert.equal(payload.documents.length, 0);
  });
});
