import assert from "node:assert/strict";
import test from "node:test";

import {
  OPENCLAW_CLI_TOOL_DEFINITIONS,
  buildOpenClawCliCommandArgs,
  isSupportedOpenClawCliTool,
  listOpenClawCliTools,
  runOpenClawCliTool,
  sanitizeOpenClawCliArgs,
} from "../src/core/openclaw-cli-runtime.js";

test("openclaw cli tool catalog includes documented command groups", () => {
  assert.equal(Array.isArray(OPENCLAW_CLI_TOOL_DEFINITIONS), true);
  assert.equal(OPENCLAW_CLI_TOOL_DEFINITIONS.length >= 40, true);
  assert.equal(isSupportedOpenClawCliTool("agent"), true);
  assert.equal(isSupportedOpenClawCliTool("gateway"), true);
  assert.equal(isSupportedOpenClawCliTool("approvals"), true);
  assert.equal(isSupportedOpenClawCliTool("voicecall"), true);
  assert.equal(isSupportedOpenClawCliTool("unknown-command"), false);

  const tools = listOpenClawCliTools();
  assert.equal(Array.isArray(tools), true);
  assert.equal(
    tools.some((entry) => entry.tool === "agent" && entry.docsUrl.includes("/cli/agent")),
    true
  );
});

test("buildOpenClawCliCommandArgs assembles global flags and command args", () => {
  const args = buildOpenClawCliCommandArgs({
    tool: "gateway",
    args: ["run", "--bind", "127.0.0.1", "--port", "19001"],
    dev: true,
    noColor: true,
    json: true,
    profile: "ops",
  });

  assert.deepEqual(args.slice(0, 2), ["--dev", "--profile"]);
  assert.equal(args.includes("ops"), true);
  assert.equal(args.includes("gateway"), true);
  assert.equal(args.includes("run"), true);
  assert.equal(args.includes("--json"), true);
  assert.equal(args.includes("--no-color"), true);
});

test("sanitizeOpenClawCliArgs rejects invalid payloads", () => {
  assert.throws(() => sanitizeOpenClawCliArgs("not-an-array"), /args must be an array/i);
  assert.throws(() => sanitizeOpenClawCliArgs(["ok", ""]), /cannot be empty/i);
  assert.throws(
    () => sanitizeOpenClawCliArgs(["ok", "bad\narg"]),
    /contains invalid characters/i
  );
});

test("runOpenClawCliTool returns normalized success payload", async () => {
  const result = await runOpenClawCliTool(
    {
      tool: "status",
      args: ["--verbose"],
      json: true,
      parseJson: true,
      timeoutSeconds: 25,
    },
    {
      bootstrapImpl: async () => {},
      execImpl: async (_cmd, args) => {
        assert.equal(args.includes("status"), true);
        return {
          stdout: JSON.stringify({ ok: true, mode: "gateway" }),
          stderr: "",
        };
      },
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.exitCode, 0);
  assert.equal(result.tool, "status");
  assert.equal(result.parsedJson?.ok, true);
});

test("runOpenClawCliTool returns normalized failure payload", async () => {
  const result = await runOpenClawCliTool(
    {
      tool: "approvals",
      args: ["list"],
      timeoutSeconds: 15,
    },
    {
      bootstrapImpl: async () => {},
      execImpl: async () => {
        const error = new Error("CLI failed");
        error.code = 2;
        error.signal = null;
        error.stdout = "partial output";
        error.stderr = "error output";
        throw error;
      },
    }
  );

  assert.equal(result.ok, false);
  assert.equal(result.exitCode, 2);
  assert.equal(result.stdout.includes("partial"), true);
  assert.equal(result.stderr.includes("error"), true);
  assert.equal(result.error.length > 0, true);
});

