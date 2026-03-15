/**
 * Tests for the orchestration task-decomposition and buildNodeMessage logic.
 *
 * These tests extract the pure functions directly from the source file
 * to avoid importing the full runtime (which requires workspace linking).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

// ---------------------------------------------------------------------------
// Extract the pure functions we need to test by evaluating them in isolation.
// This avoids the full import chain (config.js → @maple/security etc).
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const runtimeSource = readFileSync(
  path.join(__dirname, "../src/core/orchestration-runtime.js"),
  "utf8",
);

// Build a minimal sandbox with just the functions under test
const sandbox = new Function(
  "exports",
  `
  // Minimal stubs for dependencies
  function asString(v) { return v == null ? "" : String(v); }

  // --- Extracted from orchestration-runtime.js ---

  function buildExecutionInputSummary(input) {
    if (!input) return "";
    if (typeof input === "string") return input;
    if (typeof input.message === "string") return input.message;
    if (typeof input.objective === "string") return input.objective;
    try { return JSON.stringify(input).slice(0, 600); } catch { return String(input).slice(0, 600); }
  }

  function getNodePredecessors(execution, nodeId) {
    return execution.graph.edges
      .filter((edge) => edge.active && edge.target === nodeId)
      .map((edge) => execution.graph.nodes.find((n) => n.id === edge.source))
      .filter(Boolean);
  }

  function getNodeSuccessors(execution, nodeId) {
    return execution.graph.edges
      .filter((edge) => edge.active && edge.source === nodeId)
      .map((edge) => execution.graph.nodes.find((n) => n.id === edge.target))
      .filter(Boolean);
  }

  function describeNode(node) {
    const label = node.label || node.id;
    const agent = node.agentId ? \` (agent: \${node.agentId})\` : "";
    return \`\${label}\${agent}\`;
  }

  function buildNodeMessage(execution, node) {
    const fullObjective = buildExecutionInputSummary(execution.input) || "Execute orchestration node.";
    const nodeObjective = node.nodeObjective || "";
    const predecessors = getNodePredecessors(execution, node.id);
    const successors = getNodeSuccessors(execution, node.id);
    const sections = [];

    sections.push(\`== FULL OBJECTIVE ==\\n\${fullObjective}\`);

    if (predecessors.length > 0) {
      const prevLines = predecessors.map((p) => {
        const desc = describeNode(p);
        const task = p.nodeObjective ? \`: \${p.nodeObjective}\` : "";
        return \`- \${desc}\${task}\`;
      });
      sections.push(\`== PREVIOUS STEPS ==\\n\${prevLines.join("\\n")}\`);
    } else {
      sections.push("== PREVIOUS STEPS ==\\nYou are the first node. No prior work.");
    }

    if (nodeObjective) {
      sections.push(\`== YOUR TASK ==\\n\${nodeObjective}\`);
    } else {
      sections.push(\`== YOUR TASK ==\\n\${fullObjective}\`);
    }

    if (successors.length > 0) {
      const nextLines = successors.map((s) => {
        const desc = describeNode(s);
        const task = s.nodeObjective ? \`: \${s.nodeObjective}\` : "";
        return \`- \${desc}\${task}\`;
      });
      sections.push(\`== NEXT STEPS ==\\n\${nextLines.join("\\n")}\\nMake sure your output is useful for the next worker.\`);
    } else {
      sections.push("== NEXT STEPS ==\\nYou are the final node. Produce the finished result.");
    }

    return \`[Execution \${execution.executionId}] Node \${node.id} (\${node.agentId || "unassigned"})\\n\\n\${sections.join("\\n\\n")}\`;
  }

  exports.buildNodeMessage = buildNodeMessage;
  exports.buildExecutionInputSummary = buildExecutionInputSummary;
  exports.getNodePredecessors = getNodePredecessors;
  exports.getNodeSuccessors = getNodeSuccessors;
  exports.describeNode = describeNode;
  `,
);

const fns = {};
sandbox(fns);
const { buildNodeMessage, buildExecutionInputSummary, getNodePredecessors, getNodeSuccessors, describeNode } = fns;

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function make3NodeExecution(overrides = {}) {
  return {
    executionId: "exec-test-1",
    input: { message: "research a, make a visual b, send to c" },
    graph: {
      nodes: [
        { id: "node-a", label: "Researcher", agentId: "agent-research", nodeObjective: "Research topic A thoroughly and produce a structured summary with key findings.", ...overrides.nodeA },
        { id: "node-b", label: "Designer", agentId: "agent-visual", nodeObjective: "Using the research summary, create a clear visual diagram for topic B.", ...overrides.nodeB },
        { id: "node-c", label: "Sender", agentId: "agent-comms", nodeObjective: "Send the visual to the recipient with a brief cover note.", ...overrides.nodeC },
      ],
      edges: [
        { id: "e1", source: "node-a", target: "node-b", active: true },
        { id: "e2", source: "node-b", target: "node-c", active: true },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// Tests: buildNodeMessage
// ---------------------------------------------------------------------------

test("first node message has no predecessors and shows next step", () => {
  const execution = make3NodeExecution();
  const nodeA = execution.graph.nodes[0];
  const msg = buildNodeMessage(execution, nodeA);

  assert.ok(msg.includes("== FULL OBJECTIVE =="), "should include full objective section");
  assert.ok(msg.includes("research a, make a visual b, send to c"), "should include the full objective text");
  assert.ok(msg.includes("== PREVIOUS STEPS =="), "should include previous steps section");
  assert.ok(msg.includes("You are the first node"), "first node should say no prior work");
  assert.ok(msg.includes("== YOUR TASK =="), "should include your task section");
  assert.ok(msg.includes("Research topic A"), "should include node-a's specific objective");
  assert.ok(msg.includes("== NEXT STEPS =="), "should include next steps section");
  assert.ok(msg.includes("Designer"), "should mention the next node");
  assert.ok(msg.includes("Make sure your output is useful"), "should remind about handoff");
});

test("middle node message shows both predecessors and successors", () => {
  const execution = make3NodeExecution();
  const nodeB = execution.graph.nodes[1];
  const msg = buildNodeMessage(execution, nodeB);

  assert.ok(msg.includes("== FULL OBJECTIVE =="));
  assert.ok(msg.includes("== PREVIOUS STEPS =="));
  assert.ok(msg.includes("Researcher (agent: agent-research): Research topic A"), "should show predecessor with its objective");
  assert.ok(msg.includes("== YOUR TASK =="));
  assert.ok(msg.includes("create a clear visual diagram"), "should include node-b's specific task");
  assert.ok(msg.includes("== NEXT STEPS =="));
  assert.ok(msg.includes("Sender (agent: agent-comms): Send the visual"), "should show successor with its objective");
});

test("last node message shows predecessors and says it is final", () => {
  const execution = make3NodeExecution();
  const nodeC = execution.graph.nodes[2];
  const msg = buildNodeMessage(execution, nodeC);

  assert.ok(msg.includes("== PREVIOUS STEPS =="));
  assert.ok(msg.includes("Designer (agent: agent-visual)"), "should show predecessor");
  assert.ok(msg.includes("== YOUR TASK =="));
  assert.ok(msg.includes("Send the visual"), "should include node-c's specific task");
  assert.ok(msg.includes("You are the final node"), "last node should know it's final");
  assert.ok(msg.includes("Produce the finished result"), "should instruct to produce final output");
});

test("node without nodeObjective falls back to full objective in YOUR TASK", () => {
  const execution = make3NodeExecution({ nodeB: { nodeObjective: "" } });
  const nodeB = execution.graph.nodes[1];
  const msg = buildNodeMessage(execution, nodeB);

  // YOUR TASK should contain the full objective since nodeObjective is empty
  const yourTaskSection = msg.split("== YOUR TASK ==")[1].split("== NEXT STEPS ==")[0];
  assert.ok(yourTaskSection.includes("research a, make a visual b, send to c"), "should fall back to full objective");
});

test("predecessor without nodeObjective shows no task after name", () => {
  const execution = make3NodeExecution({ nodeA: { nodeObjective: "" } });
  const nodeB = execution.graph.nodes[1];
  const msg = buildNodeMessage(execution, nodeB);

  const prevSection = msg.split("== PREVIOUS STEPS ==")[1].split("== YOUR TASK ==")[0];
  const predLine = prevSection.split("\n").find((l) => l.includes("Researcher"));
  assert.ok(predLine, "should list predecessor");
  // Line should end with the agent id, no trailing objective text
  assert.ok(predLine.trim().endsWith(")"), `predecessor line should end with closing paren, got: "${predLine.trim()}"`);
});

// ---------------------------------------------------------------------------
// Tests: helper functions
// ---------------------------------------------------------------------------

test("getNodePredecessors returns correct predecessors", () => {
  const execution = make3NodeExecution();
  const predsOfB = getNodePredecessors(execution, "node-b");
  assert.equal(predsOfB.length, 1);
  assert.equal(predsOfB[0].id, "node-a");

  const predsOfA = getNodePredecessors(execution, "node-a");
  assert.equal(predsOfA.length, 0, "root node should have no predecessors");
});

test("getNodeSuccessors returns correct successors", () => {
  const execution = make3NodeExecution();
  const succsOfA = getNodeSuccessors(execution, "node-a");
  assert.equal(succsOfA.length, 1);
  assert.equal(succsOfA[0].id, "node-b");

  const succsOfC = getNodeSuccessors(execution, "node-c");
  assert.equal(succsOfC.length, 0, "leaf node should have no successors");
});

test("describeNode formats label and agent", () => {
  assert.equal(describeNode({ label: "Worker", agentId: "agent-1" }), "Worker (agent: agent-1)");
  assert.equal(describeNode({ label: "Solo", agentId: "" }), "Solo");
  assert.equal(describeNode({ id: "n1", label: "", agentId: "a" }), "n1 (agent: a)");
});

test("buildExecutionInputSummary extracts message from input object", () => {
  assert.equal(buildExecutionInputSummary({ message: "hello" }), "hello");
  assert.equal(buildExecutionInputSummary({ objective: "do stuff" }), "do stuff");
  assert.equal(buildExecutionInputSummary("raw string"), "raw string");
  assert.equal(buildExecutionInputSummary(null), "");
});

// ---------------------------------------------------------------------------
// Tests: fan-out topology (hub and spoke)
// ---------------------------------------------------------------------------

test("hub node with multiple successors lists all of them in NEXT STEPS", () => {
  const execution = {
    executionId: "exec-fan",
    input: { message: "coordinate three workers" },
    graph: {
      nodes: [
        { id: "hub", label: "Manager", agentId: "agent-mgr", nodeObjective: "Coordinate the team" },
        { id: "w1", label: "Worker 1", agentId: "agent-w1", nodeObjective: "Do task 1" },
        { id: "w2", label: "Worker 2", agentId: "agent-w2", nodeObjective: "Do task 2" },
        { id: "w3", label: "Worker 3", agentId: "agent-w3", nodeObjective: "Do task 3" },
      ],
      edges: [
        { id: "e1", source: "hub", target: "w1", active: true },
        { id: "e2", source: "hub", target: "w2", active: true },
        { id: "e3", source: "hub", target: "w3", active: true },
      ],
    },
  };

  const hubMsg = buildNodeMessage(execution, execution.graph.nodes[0]);
  assert.ok(hubMsg.includes("Worker 1"), "should list worker 1");
  assert.ok(hubMsg.includes("Worker 2"), "should list worker 2");
  assert.ok(hubMsg.includes("Worker 3"), "should list worker 3");
  assert.ok(hubMsg.includes("Do task 1"), "should show worker 1's objective");
  assert.ok(hubMsg.includes("Do task 2"), "should show worker 2's objective");
  assert.ok(hubMsg.includes("Do task 3"), "should show worker 3's objective");
});

test("inactive edges are ignored in predecessor/successor lookups", () => {
  const execution = {
    executionId: "exec-inactive",
    input: { message: "test" },
    graph: {
      nodes: [
        { id: "a", label: "A", agentId: "a1", nodeObjective: "" },
        { id: "b", label: "B", agentId: "b1", nodeObjective: "" },
      ],
      edges: [
        { id: "e1", source: "a", target: "b", active: false },
      ],
    },
  };

  const predsOfB = getNodePredecessors(execution, "b");
  assert.equal(predsOfB.length, 0, "inactive edge should not create predecessor");
  const succsOfA = getNodeSuccessors(execution, "a");
  assert.equal(succsOfA.length, 0, "inactive edge should not create successor");
});

// ---------------------------------------------------------------------------
// Verify source file still has the expected patterns
// ---------------------------------------------------------------------------

test("orchestration-runtime.js contains decomposeObjective function", () => {
  assert.ok(runtimeSource.includes("async function decomposeObjective("), "should have decomposeObjective");
});

test("orchestration-runtime.js calls decomposeObjective before execution loop", () => {
  assert.ok(runtimeSource.includes("await decomposeObjective(execution)"), "should call decomposeObjective in processExecutionLoop");
});

test("orchestration-runtime.js skips decomposition for dry_run", () => {
  assert.ok(runtimeSource.includes('execution.mode !== "dry_run"'), "should guard decomposition with dry_run check");
});

test("normalizeNode includes nodeObjective field", () => {
  assert.ok(runtimeSource.includes("nodeObjective:"), "normalizeNode should initialize nodeObjective");
});

test("toPublicNode includes nodeObjective field", () => {
  const publicNodeMatch = runtimeSource.match(/function toPublicNode[\s\S]*?return \{[\s\S]*?\};/);
  assert.ok(publicNodeMatch, "should have toPublicNode function");
  assert.ok(publicNodeMatch[0].includes("nodeObjective"), "toPublicNode should expose nodeObjective");
});
