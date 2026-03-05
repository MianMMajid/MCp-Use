import test from "node:test";
import assert from "node:assert/strict";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ── Helpers ──────────────────────────────────────────────────────────────────

async function makeTmpPolicyFile(rules) {
  const dir = await mkdtemp(join(tmpdir(), "maple-policy-test-"));
  const filePath = join(dir, "policy.json");
  await writeFile(filePath, JSON.stringify({ rules }), "utf-8");
  return { filePath, dir };
}

function sampleRules() {
  return [
    {
      name: "block-tool-x",
      action: "deny",
      severity: "high",
      message: "Tool X blocked by policy.",
      recommendation: "Do not use tool X.",
      priority: 10,
      match: { toolGlob: "tool-x*", anyValueRegex: "tool-x" },
    },
    {
      name: "log-large",
      action: "log_only",
      severity: "low",
      message: "Large payload.",
      recommendation: "Review.",
      priority: 50,
      match: { payloadBytesExceeds: 50000 },
    },
  ];
}

// ── Tests ────────────────────────────────────────────────────────────────────

test("Initialize with valid JSON rule file", async () => {
  const { filePath, dir } = await makeTmpPolicyFile(sampleRules());
  try {
    process.env.MAPLE_POLICY_FILE = filePath;
    const { PolicyStore } = await import(`../src/policy-store.js?t=${Date.now()}-init`);
    const store = new PolicyStore();
    await store.initialize();
    const rules = store.getExternalRules();
    assert.ok(rules.length === 2, `Expected 2 rules but got ${rules.length}`);
    store.destroy();
  } finally {
    delete process.env.MAPLE_POLICY_FILE;
    await rm(dir, { recursive: true, force: true });
  }
});

test("getExternalRules returns compiled rules with RegExp", async () => {
  const { filePath, dir } = await makeTmpPolicyFile(sampleRules());
  try {
    process.env.MAPLE_POLICY_FILE = filePath;
    const { PolicyStore } = await import(`../src/policy-store.js?t=${Date.now()}-regexp`);
    const store = new PolicyStore();
    await store.initialize();
    const rules = store.getExternalRules();
    const toolXRule = rules.find((r) => r.name === "block-tool-x");
    assert.ok(toolXRule, "Expected block-tool-x rule");
    assert.ok(toolXRule.match.anyValueRegex instanceof RegExp, "anyValueRegex should be compiled to RegExp");
    store.destroy();
  } finally {
    delete process.env.MAPLE_POLICY_FILE;
    await rm(dir, { recursive: true, force: true });
  }
});

test("Priority sorting (lower priority number comes first)", async () => {
  const rules = [
    {
      name: "rule-low-priority",
      action: "deny",
      severity: "high",
      message: "Low priority.",
      recommendation: "n/a",
      priority: 100,
      match: {},
    },
    {
      name: "rule-high-priority",
      action: "deny",
      severity: "high",
      message: "High priority.",
      recommendation: "n/a",
      priority: 1,
      match: {},
    },
  ];
  const { filePath, dir } = await makeTmpPolicyFile(rules);
  try {
    process.env.MAPLE_POLICY_FILE = filePath;
    const { PolicyStore } = await import(`../src/policy-store.js?t=${Date.now()}-priority`);
    const store = new PolicyStore();
    await store.initialize();
    const compiled = store.getExternalRules();
    assert.equal(compiled[0].name, "rule-high-priority", "Higher priority (lower number) should come first");
    assert.equal(compiled[1].name, "rule-low-priority");
    store.destroy();
  } finally {
    delete process.env.MAPLE_POLICY_FILE;
    await rm(dir, { recursive: true, force: true });
  }
});

test("Disabled rules filtered out", async () => {
  const rules = [
    {
      name: "active-rule",
      action: "deny",
      severity: "high",
      message: "Active.",
      recommendation: "n/a",
      match: {},
    },
    {
      name: "disabled-rule",
      action: "deny",
      severity: "high",
      message: "Disabled.",
      recommendation: "n/a",
      enabled: false,
      match: {},
    },
  ];
  const { filePath, dir } = await makeTmpPolicyFile(rules);
  try {
    process.env.MAPLE_POLICY_FILE = filePath;
    const { PolicyStore } = await import(`../src/policy-store.js?t=${Date.now()}-disabled`);
    const store = new PolicyStore();
    await store.initialize();
    const compiled = store.getExternalRules();
    assert.equal(compiled.length, 1);
    assert.equal(compiled[0].name, "active-rule");
    const disabledFound = compiled.find((r) => r.name === "disabled-rule");
    assert.equal(disabledFound, undefined, "Disabled rule should not appear in compiled rules");
    store.destroy();
  } finally {
    delete process.env.MAPLE_POLICY_FILE;
    await rm(dir, { recursive: true, force: true });
  }
});

test("reload() recompiles and notifies callbacks", async () => {
  const initialRules = [
    {
      name: "initial-rule",
      action: "deny",
      severity: "high",
      message: "Initial.",
      recommendation: "n/a",
      match: {},
    },
  ];
  const { filePath, dir } = await makeTmpPolicyFile(initialRules);
  try {
    process.env.MAPLE_POLICY_FILE = filePath;
    const { PolicyStore } = await import(`../src/policy-store.js?t=${Date.now()}-reload`);
    const store = new PolicyStore();
    await store.initialize();
    assert.equal(store.getExternalRules().length, 1);
    assert.equal(store.getExternalRules()[0].name, "initial-rule");

    // Track reload notification
    let notified = false;
    let notifyResult = null;
    store.onReload((result) => {
      notified = true;
      notifyResult = result;
    });

    // Update policy file with additional rule
    const updatedRules = [
      ...initialRules,
      {
        name: "added-rule",
        action: "log_only",
        severity: "low",
        message: "Added.",
        recommendation: "n/a",
        match: {},
      },
    ];
    await writeFile(filePath, JSON.stringify({ rules: updatedRules }), "utf-8");

    const result = await store.reload();
    assert.equal(result.success, true);
    assert.equal(result.ruleCount, 2);
    assert.equal(store.getExternalRules().length, 2);
    assert.ok(notified, "Reload callback should have been called");
    assert.equal(notifyResult.success, true);
    assert.equal(notifyResult.ruleCount, 2);
    store.destroy();
  } finally {
    delete process.env.MAPLE_POLICY_FILE;
    await rm(dir, { recursive: true, force: true });
  }
});

test("destroy() stops watcher and clears callbacks", async () => {
  const { filePath, dir } = await makeTmpPolicyFile(sampleRules());
  try {
    process.env.MAPLE_POLICY_FILE = filePath;
    const { PolicyStore } = await import(`../src/policy-store.js?t=${Date.now()}-destroy`);
    const store = new PolicyStore();
    await store.initialize();

    let callbackCalled = false;
    store.onReload(() => { callbackCalled = true; });
    store.destroy();

    // After destroy, reload should still work but callbacks should not fire
    // because destroy clears the callback array.
    // Re-set the file env to call reload manually:
    const reloadResult = await store.reload();
    assert.equal(callbackCalled, false, "Callback should not fire after destroy");
    store.destroy();
  } finally {
    delete process.env.MAPLE_POLICY_FILE;
    await rm(dir, { recursive: true, force: true });
  }
});

test("Missing file handled gracefully (no error)", async () => {
  process.env.MAPLE_POLICY_FILE = "/tmp/maple-policy-nonexistent-file-12345.json";
  try {
    const { PolicyStore } = await import(`../src/policy-store.js?t=${Date.now()}-missing`);
    const store = new PolicyStore();
    // Should not throw
    await store.initialize();
    const rules = store.getExternalRules();
    assert.deepStrictEqual(rules, []);
    store.destroy();
  } finally {
    delete process.env.MAPLE_POLICY_FILE;
  }
});

test("No MAPLE_POLICY_FILE configured returns empty rules", async () => {
  delete process.env.MAPLE_POLICY_FILE;
  const { PolicyStore } = await import(`../src/policy-store.js?t=${Date.now()}-noenv`);
  const store = new PolicyStore();
  await store.initialize();
  const rules = store.getExternalRules();
  assert.deepStrictEqual(rules, []);
  store.destroy();
});
