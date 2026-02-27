import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

function runScenario(env) {
  const moduleUrl = pathToFileURL(
    resolve(
      process.cwd(),
      "backend/backendB-core-services/gateway-api/service/src/core/firewall-chat-ai.js"
    )
  ).href;
  const script = `
    const mod = await import(${JSON.stringify(moduleUrl)});
    const response = await mod.generateFirewallChatReply({
      question: "status",
      context: {
        generatedAt: new Date().toISOString(),
        trace: { id: "trace-1", sessionId: "session-1" },
        firewall: {},
        highlights: [],
        recommendations: [],
        activity: { networkActions: [] }
      },
      messages: [{ role: "user", content: "status" }],
      requestContext: {
        tenantId: "t-1",
        userId: "u-1",
        deviceId: "d-1",
        sessionId: "session-1",
        traceId: "trace-1"
      }
    });
    process.stdout.write(JSON.stringify({ mode: response.mode }));
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", script], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL:
        process.env.DATABASE_URL ||
        "postgresql://maple:maple@127.0.0.1:5432/maple_test",
      MAPLE_FIREWALL_CHAT_PREFER_OPENCLAW: "0",
      OPENAI_API_KEY: "",
      ANTHROPIC_API_KEY: "",
      ...env,
    },
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      `Scenario execution failed: ${result.stderr || result.stdout || "unknown error"}`
    );
  }
  return JSON.parse(String(result.stdout || "{}").trim());
}

test("chat strict mode returns unavailable when providers are missing", () => {
  const outcome = runScenario({
    NODE_ENV: "production",
    MAPLE_FIREWALL_CHAT_STRICT_MODE: "1",
  });
  assert.equal(outcome.mode, "unavailable");
});

test("chat non-strict mode falls back to rules when providers are missing", () => {
  const outcome = runScenario({
    NODE_ENV: "development",
    MAPLE_FIREWALL_CHAT_STRICT_MODE: "0",
  });
  assert.equal(outcome.mode, "rules");
});
